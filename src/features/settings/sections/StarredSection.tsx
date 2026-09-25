import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Star } from 'lucide-react'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Icon } from '../../../components/ui/Icon'
import { IconButton } from '../../../components/ui/IconButton'
import { ChatListSkeleton } from '../../../components/ui/Skeleton'
import { errorMessage } from '../../../lib/errors'
import { formatChatTime } from '../../../lib/format'
import { keys } from '../../../lib/queryKeys'
import { useCurrentUserId } from '../../auth/useCurrentUser'
import { setStarred } from '../../chat/messageExtras'
import { loadStarredMessages } from '../../chat/messageService'
import { useChatOverview } from '../../chat/useChats'
import { SettingsPanel } from '../SettingsPanel'

export function StarredSection() {
  const userId = useCurrentUserId()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: chats = [] } = useChatOverview()
  const {
    data: messages,
    isPending,
    error,
  } = useQuery({
    queryKey: keys.starred(userId),
    queryFn: () => loadStarredMessages(userId),
    staleTime: 30_000,
  })
  const names = useMemo(
    () => new Map(chats.map((chat) => [chat.id, chat.name])),
    [chats],
  )

  const unstar = async (messageId: string) => {
    await setStarred(userId, messageId, false)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.starred(userId) }),
      queryClient.invalidateQueries({ queryKey: keys.starredIds(userId) }),
    ])
  }

  return (
    <SettingsPanel title="Starred messages">
      {isPending ? (
        <ChatListSkeleton rows={4} />
      ) : error ? (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(error)}
        </p>
      ) : messages.length === 0 ? (
        <EmptyState
          icon={Star}
          title="No starred messages"
          description="Open a message's menu and choose Star to keep it here for later."
        />
      ) : (
        <ul className="grid gap-2">
          {messages.map((message) => (
            <li
              key={message.id}
              className="flex items-start gap-2 rounded-xl bg-surface p-3 shadow-bubble"
            >
              <button
                type="button"
                onClick={() =>
                  navigate(`/chat/${message.chatId}?m=${message.id}`)
                }
                className="min-w-0 flex-1 text-left"
              >
                <span className="flex items-baseline justify-between gap-2 text-[13px] text-muted">
                  <strong className="truncate font-medium text-link">
                    {names.get(message.chatId) ?? 'Chat'}
                  </strong>
                  <time>{formatChatTime(message.createdAt)}</time>
                </span>
                <span className="mt-1 block whitespace-pre-wrap break-words text-[14.5px]">
                  {message.deleted
                    ? 'This message was deleted'
                    : message.text || message.media?.name || 'Attachment'}
                </span>
              </button>
              <IconButton
                icon={Star}
                label="Remove star"
                size={18}
                className="text-link"
                onClick={() => void unstar(message.id)}
              />
            </li>
          ))}
        </ul>
      )}
      <p className="flex items-center gap-2 text-[12.5px] text-muted">
        <Icon icon={Star} size={13} /> Starred messages are private to you.
      </p>
    </SettingsPanel>
  )
}
