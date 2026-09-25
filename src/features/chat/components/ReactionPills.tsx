import { motion } from 'framer-motion'
import type { ReactionRow } from '../types'

type Props = {
  reactions: ReactionRow[]
  me: string
  onToggle: (emoji: string | null) => void
}

/** Emoji pills on the bubble corner: one per distinct emoji with a count, pop-in on change. */
export function ReactionPills({ reactions, me, onToggle }: Props) {
  if (reactions.length === 0) return null
  const counts = new Map<string, number>()
  for (const reaction of reactions)
    counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1)
  const mine = reactions.find((reaction) => reaction.userId === me)?.emoji
  return (
    <div className="-mt-2 flex gap-1 px-1">
      {Array.from(counts, ([emoji, count]) => (
        <motion.button
          key={emoji}
          layout
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 700, damping: 22 }}
          type="button"
          aria-label={`${emoji} ${count}${mine === emoji ? ', your reaction' : ''}`}
          onClick={() => onToggle(mine === emoji ? null : emoji)}
          className={`flex items-center gap-1 rounded-full border bg-surface px-1.5 py-0.5 text-[13px] shadow-bubble ${mine === emoji ? 'border-primary' : 'border-divider'}`}
        >
          <span>{emoji}</span>
          {count > 1 && <span className="text-xs text-muted">{count}</span>}
        </motion.button>
      ))}
    </div>
  )
}
