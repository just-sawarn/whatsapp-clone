import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useMatch } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { debounce } from '../../lib/debounce'
import { keys } from '../../lib/queryKeys'
import { playMessageSound } from '../../lib/sounds'
import { showNotification } from '../../lib/notifications'
import { touchLastSeen } from '../../lib/profile'
import { supabase } from '../../lib/supabase'
import { useCurrentUserId } from '../auth/useCurrentUser'
import { markMessagesDelivered } from '../chat/chatService'
import { applyMessageToThread } from '../chat/useThread'
import { toPreview } from '../chat/preview'
import type { ChatSummary } from '../chat/types'
import { usePreferences } from '../preferences/PreferencesContext'
import { useMyProfile } from '../profile/useProfile'
import { RealtimeContext, type RealtimeValue } from './RealtimeContext'

type MessageChange = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: { id?: string; chat_id?: string; sender_id?: string }
}

/**
 * One socket-level subscription set for the whole signed-in app: incoming messages (RLS decides which ones
 * this user receives), receipts, reactions, group changes, and presence. Bursts are coalesced with debouncing.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const userId = useCurrentUserId()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const openChatId = useMatch('/chat/:chatId')?.params.chatId
  const preferences = usePreferences()
  const { data: profile } = useMyProfile()
  const [online, setOnline] = useState<ReadonlySet<string>>(new Set())

  // Handlers read the latest values through refs so the subscription is created once per user.
  const latest = useRef({ openChatId, preferences, navigate })
  useEffect(() => {
    latest.current = { openChatId, preferences, navigate }
  })

  useEffect(() => {
    const client = supabase
    if (!client) return
    const refreshChats = debounce(
      () =>
        void queryClient.invalidateQueries({ queryKey: keys.chats(userId) }),
      400,
    )
    const refreshReceipts = debounce(
      () => void queryClient.invalidateQueries({ queryKey: ['receipts'] }),
      400,
    )
    const refreshReactions = debounce(
      () => void queryClient.invalidateQueries({ queryKey: ['reactions'] }),
      300,
    )
    const refreshParticipants = debounce(
      () => void queryClient.invalidateQueries({ queryKey: ['participants'] }),
      300,
    )
    const refreshStatuses = debounce(
      () => void queryClient.invalidateQueries({ queryKey: ['statuses'] }),
      500,
    )
    const refreshCommunities = debounce(() => {
      void queryClient.invalidateQueries({ queryKey: ['communities'] })
      void queryClient.invalidateQueries({ queryKey: ['community-groups'] })
    }, 400)
    const deliver = debounce(
      () => void markMessagesDelivered().catch(() => undefined),
      800,
    )
    void markMessagesDelivered().catch(() => undefined)

    const onMessage = async (change: MessageChange) => {
      const { id, chat_id: chatId, sender_id: senderId } = change.new
      refreshChats()
      if (!id || !chatId) return
      const isOpen = latest.current.openChatId === chatId
      const incoming = change.eventType === 'INSERT' && senderId !== userId
      if (incoming) deliver()
      try {
        const message = await applyMessageToThread(
          queryClient,
          userId,
          chatId,
          id,
        )
        if (!incoming || !message) return
        const chat = queryClient
          .getQueryData<ChatSummary[]>(keys.chats(userId))
          ?.find((candidate) => candidate.id === chatId)
        if (chat?.isMuted || (isOpen && document.visibilityState === 'visible'))
          return
        playMessageSound(latest.current.preferences.messageSound)
        showNotification(
          chat?.name ?? 'New message',
          toPreview(message).text,
          `chat-${chatId}`,
          () => latest.current.navigate(`/chat/${chatId}`),
        )
      } catch {
        // Locked identity or a transient error: the chat list refresh above still updates counts.
      }
    }

    const feed = client
      .channel(`feed:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        (payload) => void onMessage(payload as unknown as MessageChange),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_status' },
        refreshReceipts,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        refreshReactions,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_participants' },
        () => {
          refreshChats()
          refreshParticipants()
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chats' },
        () => {
          refreshChats()
          refreshCommunities()
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'statuses' },
        refreshStatuses,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'communities' },
        refreshCommunities,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'community_groups' },
        refreshCommunities,
      )
      .subscribe()

    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshChats()
      else touchLastSeen(userId)
    }
    const onPageHide = () => touchLastSeen(userId)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pagehide', onPageHide)

    return () => {
      for (const task of [
        refreshChats,
        refreshReceipts,
        refreshReactions,
        refreshParticipants,
        refreshStatuses,
        refreshCommunities,
        deliver,
      ])
        task.cancel()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pagehide', onPageHide)
      void client.removeChannel(feed)
    }
  }, [queryClient, userId])

  const showPresence = profile?.show_last_seen ?? false
  useEffect(() => {
    const client = supabase
    if (!client || !profile) return
    const channel = client.channel('presence:online', {
      config: { presence: { key: userId } },
    })
    channel.on('presence', { event: 'sync' }, () =>
      setOnline(new Set(Object.keys(channel.presenceState()))),
    )
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED' && showPresence)
        void channel.track({ online_at: new Date().toISOString() })
    })
    return () => {
      void client.removeChannel(channel)
    }
  }, [profile, showPresence, userId])

  const value = useMemo<RealtimeValue>(
    () => ({ onlineUserIds: showPresence ? online : new Set(), openChatId }),
    [online, openChatId, showPresence],
  )
  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  )
}
