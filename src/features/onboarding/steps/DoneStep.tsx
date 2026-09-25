import { motion } from 'framer-motion'
import { Button } from '../../../components/ui/Button'

export function DoneStep({
  name,
  onFinish,
}: {
  name: string
  onFinish: () => void
}) {
  return (
    <div className="grid justify-items-center gap-5 py-4 text-center">
      <motion.svg
        width="96"
        height="96"
        viewBox="0 0 96 96"
        aria-hidden="true"
        initial="hidden"
        animate="visible"
      >
        <motion.circle
          cx="48"
          cy="48"
          r="42"
          fill="none"
          strokeWidth="5"
          className="stroke-primary"
          variants={{ hidden: { pathLength: 0 }, visible: { pathLength: 1 } }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
        <motion.path
          d="M28 50 L43 64 L69 35"
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-accent"
          variants={{ hidden: { pathLength: 0 }, visible: { pathLength: 1 } }}
          transition={{ delay: 0.5, duration: 0.5, ease: 'easeOut' }}
        />
      </motion.svg>
      <motion.div
        initial={{ y: 14, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.9, type: 'spring', stiffness: 240, damping: 22 }}
      >
        <h1
          tabIndex={-1}
          data-step-heading
          className="text-2xl font-semibold outline-none"
        >
          You are all set{name ? `, ${name.split(' ')[0]}` : ''}!
        </h1>
        <p className="mt-2 text-[14.5px] text-muted">
          Your account and encryption keys are ready.
        </p>
      </motion.div>
      <motion.div
        className="w-full"
        initial={{ y: 14, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 1.1, type: 'spring', stiffness: 240, damping: 22 }}
      >
        <Button className="h-12 w-full text-[15px]" onClick={onFinish}>
          Open messages
        </Button>
      </motion.div>
    </div>
  )
}
