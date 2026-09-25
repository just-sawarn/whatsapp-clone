import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { keys } from '../../lib/queryKeys'
import { useCurrentUserId } from '../auth/useCurrentUser'
import { loadChatOverview } from './chatService'
import type { ChatSummary } from './types'

export function useChatOverview() {
  const userId = useCurrentUserId()
  return useQuery({
    queryKey: keys.chats(userId),
    queryFn: () => loadChatOverview(userId),
    staleTime: 15_000,
  })
}

export function useChat(chatId: string | undefined): ChatSummary | undefined {
  const { data } = useChatOverview()
  return useMemo(() => data?.find((chat) => chat.id === chatId), [data, chatId])
}

/** Total unread across chats that are not muted, for the tab title and navigation badge. */
export function useUnreadTotal(): number {
  const { data } = useChatOverview()
  return useMemo(
    () =>
      (data ?? [])
        .filter((chat) => !chat.isMuted)
        .reduce(
          (total, chat) =>
            total +
            chat.unreadCount +
            (chat.markedUnread && chat.unreadCount === 0 ? 1 : 0),
          0,
        ),
    [data],
  )
}
