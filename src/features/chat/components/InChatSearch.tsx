import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import { Icon } from '../../../components/ui/Icon'
import { IconButton } from '../../../components/ui/IconButton'
import { searchCache } from '../../../lib/messageCache'
import { useDebouncedValue } from '../../../lib/useDebouncedValue'
import { useCurrentUserId } from '../../auth/useCurrentUser'

type Props = {
  chatId: string
  onJump: (messageId: string) => void
  onClose: () => void
}

/** Searches the on-device decrypted cache for this chat; results are limited to messages this device has seen. */
export function InChatSearch({ chatId, onJump, onClose }: Props) {
  const userId = useCurrentUserId()
  const [text, setText] = useState('')
  const [index, setIndex] = useState(0)
  const term = useDebouncedValue(text.trim(), 250)
  const { data: results = [] } = useQuery({
    queryKey: ['chat-search', userId, chatId, term],
    queryFn: () => searchCache(userId, term, { chatId, limit: 200 }),
    enabled: term.length > 0,
  })

  useEffect(() => setIndex(0), [term])
  useEffect(() => {
    const target = results[index]
    if (target) onJump(target.id)
  }, [index, onJump, results])

  const step = (direction: 1 | -1) =>
    results.length > 0 &&
    setIndex(
      (current) => (current + direction + results.length) % results.length,
    )

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-divider bg-surface px-3 py-2">
      <Icon icon={Search} size={18} className="text-muted" />
      <input
        data-autofocus
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') step(event.shiftKey ? -1 : 1)
          if (event.key === 'Escape') onClose()
        }}
        placeholder="Search in this chat"
        aria-label="Search in this chat"
        className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted"
      />
      <span className="text-[12.5px] text-muted" aria-live="polite">
        {term
          ? results.length
            ? `${index + 1} of ${results.length}`
            : 'No matches'
          : ''}
      </span>
      <IconButton
        icon={ChevronUp}
        label="Previous match"
        size={18}
        onClick={() => step(-1)}
        disabled={results.length === 0}
      />
      <IconButton
        icon={ChevronDown}
        label="Next match"
        size={18}
        onClick={() => step(1)}
        disabled={results.length === 0}
      />
      <IconButton icon={X} label="Close search" size={18} onClick={onClose} />
      <p className="sr-only">
        Search results are limited to messages available on this device.
      </p>
    </div>
  )
}
