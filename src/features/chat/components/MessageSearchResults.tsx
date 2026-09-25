import { useQuery } from '@tanstack/react-query'
import { MessageSquareText } from 'lucide-react'
import { Icon } from '../../../components/ui/Icon'
import { formatChatTime } from '../../../lib/format'
import { makeSnippet, searchCache } from '../../../lib/messageCache'
import { useCurrentUserId } from '../../auth/useCurrentUser'
import type { ChatSummary } from '../types'

type Props = {
  term: string
  chats: ChatSummary[]
  onOpen: (chatId: string, messageId: string) => void
}

/** Matches from the on-device decrypted cache; the server cannot search ciphertext. */
export function MessageSearchResults({ term, chats, onOpen }: Props) {
  const userId = useCurrentUserId()
  const { data = [] } = useQuery({
    queryKey: ['message-search', userId, term],
    queryFn: () => searchCache(userId, term, { limit: 30 }),
    enabled: term.trim().length >= 2,
  })
  const names = new Map(chats.map((chat) => [chat.id, chat.name]))
  const results = data.filter((message) => names.has(message.chatId))

  return (
    <section aria-label="Message matches" className="border-t border-divider">
      <h3 className="px-4 pb-1 pt-4 text-sm font-medium text-link">Messages</h3>
      {results.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-3 text-[13px] text-muted">
          <Icon icon={MessageSquareText} size={16} /> No messages found. Search
          covers messages available on this device.
        </p>
      ) : (
        <ul>
          {results.map((message) => {
            const snippet = makeSnippet(message.text, term)
            return (
              <li key={message.id}>
                <button
                  type="button"
                  onClick={() => onOpen(message.chatId, message.id)}
                  className="block w-full px-4 py-2.5 text-left hover:bg-surface-hover"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <strong className="truncate text-[15px] font-normal">
                      {names.get(message.chatId)}
                    </strong>
                    <time className="shrink-0 text-xs text-muted">
                      {formatChatTime(message.createdAt)}
                    </time>
                  </span>
                  <span className="mt-0.5 block truncate text-[13.5px] text-muted">
                    {snippet.before}
                    <mark className="rounded bg-accent/25 px-0.5 text-text">
                      {snippet.match}
                    </mark>
                    {snippet.after}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
