import { motion } from 'framer-motion'
import { quickReactions } from '../emoji'

type Props = {
  current: string | undefined
  onPick: (emoji: string | null) => void
}

/** Small popover with quick reactions; picking your current one removes it. */
export function ReactionPicker({ current, onPick }: Props) {
  return (
    <motion.div
      role="menu"
      aria-label="React to message"
      initial={{ opacity: 0, scale: 0.7, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 600, damping: 28 }}
      className="flex gap-1 rounded-full bg-surface px-2 py-1.5 shadow-popover"
    >
      {quickReactions.map((emoji) => (
        <button
          key={emoji}
          type="button"
          role="menuitem"
          aria-label={`React ${emoji}`}
          aria-pressed={current === emoji}
          onClick={() => onPick(current === emoji ? null : emoji)}
          className={`grid h-9 w-9 place-items-center rounded-full text-[22px] transition-transform hover:scale-125 ${current === emoji ? 'bg-primary/15' : ''}`}
        >
          {emoji}
        </button>
      ))}
    </motion.div>
  )
}
