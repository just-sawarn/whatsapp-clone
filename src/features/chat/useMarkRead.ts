import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { keys } from '../../lib/queryKeys'
import { useCurrentUserId } from '../auth/useCurrentUser'
import { markChatRead } from './chatService'
import type { ChatMessage } from './types'

/**
 * Records read receipts (and clears the unread badge) while the chat is open and the tab is visible.
 * Whether the peer sees "read" depends on the user's read-receipt setting, enforced in the database.
 */
export function useMarkRead(
  chatId: string,
  messages: ChatMessage[],
  hasUnread: boolean,
) {
  const userId = useCurrentUserId()
  const queryClient = useQueryClient()
  const newestIncoming = [...messages]
    .reverse()
    .find((message) => !message.isMine && message.sendState === 'sent')?.id

  useEffect(() => {
    if (!newestIncoming && !hasUnread) return
    let timer: number | undefined
    const run = () => {
      if (document.visibilityState !== 'visible') return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void markChatRead(chatId)
          .then(() =>
            queryClient.invalidateQueries({ queryKey: keys.chats(userId) }),
          )
          .catch(() => undefined)
      }, 600)
    }
    run()
    document.addEventListener('visibilitychange', run)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', run)
    }
  }, [chatId, hasUnread, newestIncoming, queryClient, userId])
}
