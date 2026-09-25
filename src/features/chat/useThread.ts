import { useCallback, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cacheMessages } from '../../lib/messageCache'
import { keys } from '../../lib/queryKeys'
import { useCurrentUserId } from '../auth/useCurrentUser'
import { loadMessage, loadMessages } from './messageService'
import {
  emptyThread,
  prependPage,
  removeMessage,
  upsertMessage,
  type Thread,
} from './threadCache'
import type { ChatMessage } from './types'

function toCache(messages: ChatMessage[]) {
  return messages.map((message) => ({
    id: message.id,
    chatId: message.chatId,
    senderId: message.senderId,
    createdAt: message.createdAt,
    text: message.deleted ? '' : message.text,
  }))
}

/** The newest page of a conversation, kept fresh incrementally instead of refetching the whole history. */
export function useThread(chatId: string) {
  const userId = useCurrentUserId()
  const queryClient = useQueryClient()
  const [loadingOlder, setLoadingOlder] = useState(false)

  const query = useQuery({
    queryKey: keys.thread(chatId),
    queryFn: async (): Promise<Thread> => {
      const page = await loadMessages(chatId, userId)
      void cacheMessages(userId, toCache(page.messages))
      return page
    },
    staleTime: Infinity,
  })

  const thread = query.data ?? emptyThread

  const loadOlder = useCallback(async () => {
    const current = queryClient.getQueryData<Thread>(keys.thread(chatId))
    if (!current?.hasMore || !current.cursor || loadingOlder) return
    setLoadingOlder(true)
    try {
      const page = await loadMessages(chatId, userId, current.cursor)
      void cacheMessages(userId, toCache(page.messages))
      queryClient.setQueryData<Thread>(keys.thread(chatId), (existing) =>
        prependPage(existing, page),
      )
    } finally {
      setLoadingOlder(false)
    }
  }, [chatId, loadingOlder, queryClient, userId])

  return { ...query, thread, loadingOlder, loadOlder }
}

/** Fetches one message and merges it into the cached thread (or removes it if it is no longer visible). */
export async function applyMessageToThread(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string,
  chatId: string,
  messageId: string,
): Promise<ChatMessage | null> {
  const message = await loadMessage(messageId, userId)
  if (!queryClient.getQueryData(keys.thread(chatId))) return message
  queryClient.setQueryData<Thread>(keys.thread(chatId), (existing) =>
    message
      ? upsertMessage(existing, message)
      : removeMessage(existing, messageId),
  )
  if (message) void cacheMessages(userId, toCache([message]))
  return message
}
