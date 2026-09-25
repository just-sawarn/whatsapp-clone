import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, Check, CheckCheck, Clock } from 'lucide-react'
import { Icon } from './Icon'

export type TickStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed'

const labels: Record<TickStatus, string> = {
  sending: 'Sending',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Failed to send',
}

/** Gray single tick → gray double tick → blue double tick; each change briefly fades in. */
export function Ticks({ status }: { status: TickStatus }) {
  return (
    <span
      role="img"
      aria-label={labels[status]}
      className="inline-flex h-4 items-center"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={status}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className={
            status === 'read'
              ? 'text-tick-blue'
              : status === 'failed'
                ? 'text-danger'
                : 'text-muted'
          }
        >
          <Icon
            icon={
              status === 'sending'
                ? Clock
                : status === 'sent'
                  ? Check
                  : status === 'failed'
                    ? AlertCircle
                    : CheckCheck
            }
            size={16}
          />
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
