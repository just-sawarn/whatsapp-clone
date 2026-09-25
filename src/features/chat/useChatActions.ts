import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../../components/ui/ToastContext'
import { errorMessage } from '../../lib/errors'
import { keys } from '../../lib/queryKeys'
import { useCurrentUserId } from '../auth/useCurrentUser'
import {
  clearDirectChat,
  leaveChat,
  muteChat,
  updateChatFlags,
  type MuteDuration,
} from './chatService'
import type { ChatSummary } from './types'

/** List-level chat management: pin, archive, mute, mark unread, delete. */
export function useChatActions() {
  const userId = useCurrentUserId()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { notify } = useToast()

  const run = useCallback(
    async (task: () => Promise<void>, failure: string) => {
      try {
        await task()
        await queryClient.invalidateQueries({ queryKey: keys.chats(userId) })
      } catch (error) {
        notify(errorMessage(error, failure), 'error')
      }
    },
    [notify, queryClient, userId],
  )

  return {
    togglePin: (chat: ChatSummary) =>
      run(
        () => updateChatFlags(chat.id, userId, { is_pinned: !chat.isPinned }),
        'Could not pin the chat.',
      ),
    toggleArchive: (chat: ChatSummary) =>
      run(
        () =>
          updateChatFlags(chat.id, userId, { is_archived: !chat.isArchived }),
        'Could not archive the chat.',
      ),
    mute: (chat: ChatSummary, duration: MuteDuration | null) =>
      run(
        () => muteChat(chat.id, userId, duration),
        'Could not change mute settings.',
      ),
    markUnread: (chat: ChatSummary) =>
      run(
        () => updateChatFlags(chat.id, userId, { marked_unread: true }),
        'Could not mark the chat as unread.',
      ),
    deleteChat: (chat: ChatSummary) =>
      run(
        async () => {
          if (chat.isGroup) await leaveChat(chat.id, userId)
          else await clearDirectChat(chat.id, userId)
          navigate('/', { replace: true })
        },
        chat.isGroup
          ? 'Could not leave the group.'
          : 'Could not delete the chat.',
      ),
  }
}
