import { useQuery } from '@tanstack/react-query'
import { useQueryClient } from '@tanstack/react-query'
import { Ban, FileText, Image as ImageIcon, Mic } from 'lucide-react'
import { Icon } from '../../../components/ui/Icon'
import { keys } from '../../../lib/queryKeys'
import { useCurrentUserId } from '../../auth/useCurrentUser'
import { loadMessage } from '../messageService'
import type { Thread } from '../threadCache'
import type { ChatMessage } from '../types'

type Props = {
  chatId: string
  replyToId: string
  names: ReadonlyMap<string, string>
  onJump: (id: string) => void
}

/** The quoted block inside a reply. Uses the loaded thread when possible, otherwise fetches the original. */
export function ReplyQuote({ chatId, replyToId, names, onJump }: Props) {
  const userId = useCurrentUserId()
  const queryClient = useQueryClient()
  const cached = queryClient
    .getQueryData<Thread>(keys.thread(chatId))
    ?.messages.find((message) => message.id === replyToId)
  const { data: fetched, isPending } = useQuery({
    queryKey: ['reply-target', replyToId],
    queryFn: () => loadMessage(replyToId, userId),
    enabled: !cached,
    staleTime: 5 * 60_000,
  })
  const original: ChatMessage | null | undefined = cached ?? fetched
  const glyph =
    original?.kind === 'image'
      ? ImageIcon
      : original?.kind === 'audio'
        ? Mic
        : original?.kind === 'file'
          ? FileText
          : null
  const label = !original
    ? isPending
      ? 'Loading…'
      : 'Original message unavailable'
    : original.deleted
      ? 'This message was deleted'
      : original.text || original.media?.name || 'Attachment'
  const sender = original
    ? original.isMine
      ? 'You'
      : (names.get(original.senderId) ?? 'Message')
    : ''

  return (
    <button
      type="button"
      onClick={() => original && onJump(original.id)}
      disabled={!original}
      className="mb-1 block w-full rounded-md border-l-4 border-accent bg-black/5 px-2 py-1 text-left text-[13px] dark:bg-white/5"
    >
      {sender && <strong className="block text-link">{sender}</strong>}
      <span className="flex items-center gap-1 text-muted">
        {original?.deleted && <Icon icon={Ban} size={13} />}
        {glyph && <Icon icon={glyph} size={13} />}
        <span className="line-clamp-2">{label}</span>
      </span>
    </button>
  )
}
