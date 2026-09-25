import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../components/ui/ToastContext'
import { keys } from '../../lib/queryKeys'
import { removeCachedMessage } from '../../lib/messageCache'
import { useCurrentUserId } from '../auth/useCurrentUser'
import {
  deleteForEveryone,
  deleteForMe,
  forwardMessage,
} from './messageService'
import { setReaction, setStarred } from './messageExtras'
import { removeMessage, type Thread } from './threadCache'
import { applyMessageToThread } from './useThread'
import type { ChatMessage } from './types'

export const MAX_FORWARD_TARGETS = 5

/** Thin wrappers over the message services that keep caches in sync and surface failures as toasts. */
export function useMessageActions(chatId: string) {
  const userId = useCurrentUserId()
  const queryClient = useQueryClient()
  const { notify } = useToast()

  const fail = useCallback(
    (error: unknown, fallback: string) =>
      notify(error instanceof Error ? error.message : fallback, 'error'),
    [notify],
  )

  const react = useCallback(
    async (messageId: string, emoji: string | null) => {
      try {
        await setReaction(messageId, userId, emoji)
        await queryClient.invalidateQueries({
          queryKey: keys.reactions(chatId),
        })
      } catch (error) {
        fail(error, 'Could not save your reaction.')
      }
    },
    [chatId, fail, queryClient, userId],
  )

  const star = useCallback(
    async (messageId: string, starred: boolean) => {
      try {
        await setStarred(userId, messageId, starred)
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: keys.starredIds(userId) }),
          queryClient.invalidateQueries({ queryKey: keys.starred(userId) }),
        ])
      } catch (error) {
        fail(error, 'Could not update starred messages.')
      }
    },
    [fail, queryClient, userId],
  )

  const removeForMe = useCallback(
    async (message: ChatMessage) => {
      try {
        await deleteForMe(message.id)
        queryClient.setQueryData<Thread>(keys.thread(chatId), (thread) =>
          removeMessage(thread, message.id),
        )
        void removeCachedMessage(userId, message.id)
        void queryClient.invalidateQueries({ queryKey: keys.chats(userId) })
      } catch (error) {
        fail(error, 'Could not delete the message.')
      }
    },
    [chatId, fail, queryClient, userId],
  )

  const removeForEveryone = useCallback(
    async (message: ChatMessage) => {
      try {
        await deleteForEveryone(message)
        await applyMessageToThread(queryClient, userId, chatId, message.id)
        void removeCachedMessage(userId, message.id)
        void queryClient.invalidateQueries({ queryKey: keys.chats(userId) })
      } catch (error) {
        fail(error, 'Could not delete the message for everyone.')
      }
    },
    [chatId, fail, queryClient, userId],
  )

  const forward = useCallback(
    async (message: ChatMessage, targetChatIds: string[]) => {
      const targets = targetChatIds.slice(0, MAX_FORWARD_TARGETS)
      const results = await Promise.allSettled(
        targets.map((target) => forwardMessage(message, target, userId)),
      )
      const failed = results.filter(
        (result) => result.status === 'rejected',
      ).length
      void queryClient.invalidateQueries({ queryKey: keys.chats(userId) })
      if (failed > 0)
        notify(
          `Could not forward to ${failed} chat${failed === 1 ? '' : 's'}.`,
          'error',
        )
      else
        notify(
          `Forwarded to ${targets.length} chat${targets.length === 1 ? '' : 's'}.`,
          'success',
        )
    },
    [notify, queryClient, userId],
  )

  return { react, star, removeForMe, removeForEveryone, forward }
}
