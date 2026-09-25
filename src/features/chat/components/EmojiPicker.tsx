import { useRef, useState } from 'react'
import { useDismiss } from '../../../lib/useDismiss'
import { cn } from '../../../lib/cn'
import { emojiGroups } from '../emoji'

type Props = { onPick: (emoji: string) => void; onClose: () => void }

export function EmojiPicker({ onPick, onClose }: Props) {
  const root = useRef<HTMLDivElement>(null)
  const [group, setGroup] = useState(0)
  useDismiss(root, onClose)
  return (
    <div
      ref={root}
      role="dialog"
      aria-label="Emoji picker"
      className="absolute bottom-full left-2 z-30 mb-2 w-[min(340px,92vw)] rounded-xl bg-surface p-2 shadow-popover"
    >
      <div
        role="tablist"
        className="mb-1 flex gap-1 border-b border-divider pb-1"
      >
        {emojiGroups.map((item, index) => (
          <button
            key={item.label}
            type="button"
            role="tab"
            aria-selected={group === index}
            onClick={() => setGroup(index)}
            className={cn(
              'rounded-full px-3 py-1 text-[13px]',
              group === index
                ? 'bg-primary/15 text-link'
                : 'text-muted hover:bg-surface-hover',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto">
        {emojiGroups[group]?.emoji.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={emoji}
            onClick={() => onPick(emoji)}
            className="grid h-9 w-9 place-items-center rounded-md text-[22px] hover:bg-surface-hover"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
