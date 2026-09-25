import { useEffect, useMemo, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../components/ui/ToastContext'
import { keys } from '../../lib/queryKeys'
import { showNotification } from '../../lib/notifications'
import { startRingtone } from '../../lib/sounds'
import { supabase } from '../../lib/supabase'
import { useCurrentUserId } from '../auth/useCurrentUser'
import { loadChatOverview } from '../chat/chatService'
import type { ChatSummary } from '../chat/types'
import { usePreferences } from '../preferences/PreferencesContext'
import { CallContext, type CallContextValue } from './CallContext'
import { isActive } from './callMachine'
import { toRecord, type CallRow } from './callService'
import { useCallEngine } from './useCallEngine'

const FRESH_CALL_MS = 60_000

/** Provides call state to the app and turns database call rows into ringing, updates and history refreshes. */
export function CallProvider({ children }: { children: ReactNode }) {
  const userId = useCurrentUserId()
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const { ringtone } = usePreferences()
  const engine = useCallEngine(userId, notify)
  const { startCall, receiveIncoming, onCallUpdate, state } = engine

  useEffect(() => {
    const client = supabase
    if (!client) return
    const handleInsert = async (row: CallRow) => {
      if (row.caller_id === userId || row.status !== 'ringing') return
      if (Date.now() - new Date(row.started_at).getTime() > FRESH_CALL_MS)
        return
      const chats = await queryClient.ensureQueryData({
        queryKey: keys.chats(userId),
        queryFn: () => loadChatOverview(userId),
      })
      const chat = chats.find((candidate) => candidate.id === row.chat_id)
      if (!chat || chat.isGroup || !chat.peerId) return
      if (
        receiveIncoming(toRecord(row), {
          chatId: chat.id,
          peerId: chat.peerId,
          peerName: chat.name,
        })
      ) {
        showNotification(
          `Incoming ${row.call_type} call`,
          chat.name,
          `call-${row.id}`,
        )
      }
    }
    const channel = client
      .channel(`calls-feed:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'calls' },
        (payload) => void handleInsert(payload.new as CallRow),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'calls' },
        (payload) => {
          onCallUpdate(toRecord(payload.new as CallRow))
          void queryClient.invalidateQueries({ queryKey: keys.calls(userId) })
        },
      )
      .subscribe()
    return () => {
      void client.removeChannel(channel)
    }
  }, [onCallUpdate, queryClient, receiveIncoming, userId])

  // Ring while an incoming call is waiting, if the user has ringtones on.
  useEffect(() => {
    if (state.phase !== 'incoming-ringing' || !ringtone) return
    return startRingtone()
  }, [ringtone, state.phase])

  useEffect(() => {
    if (state.phase === 'ended')
      void queryClient.invalidateQueries({ queryKey: keys.calls(userId) })
  }, [queryClient, state.phase, userId])

  const value = useMemo<CallContextValue>(
    () => ({
      ...engine,
      startCall: (chat: ChatSummary, video: boolean) => {
        if (chat.isGroup || !chat.peerId) return
        void startCall(
          { chatId: chat.id, peerId: chat.peerId, peerName: chat.name },
          video,
        )
      },
      callBlockedReason: (chat: ChatSummary) =>
        chat.isGroup
          ? 'Group calls are not available yet'
          : isActive(state.phase)
            ? 'You are already in a call'
            : null,
    }),
    [engine, startCall, state.phase],
  )

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>
}
