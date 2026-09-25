import { motion } from 'framer-motion'
import { Logo } from '../../../components/ui/Logo'
import { Button } from '../../../components/ui/Button'

type Props = { onCreate: () => void; onLogin: () => void }

export function WelcomeScreen({ onCreate, onLogin }: Props) {
  return (
    <div className="grid justify-items-center gap-6 text-center">
      <div className="relative">
        {[0, 1].map((ring) => (
          <motion.span
            key={ring}
            aria-hidden="true"
            className="absolute inset-0 rounded-2xl border-2 border-accent"
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: 1.9, opacity: 0 }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              delay: ring * 1.2,
              ease: 'easeOut',
            }}
          />
        ))}
        <motion.div
          initial={{ scale: 0.3, rotate: -20, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16 }}
        >
          <Logo size={88} />
        </motion.div>
      </div>
      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 220, damping: 22 }}
      >
        <h1 className="text-[28px] font-semibold">Welcome to ChatBit</h1>
        <p className="mx-auto mt-2 max-w-xs text-[14.5px] leading-relaxed text-muted">
          Private messaging with end-to-end encryption, voice and video calls,
          and status updates.
        </p>
      </motion.div>
      <motion.div
        className="grid w-full gap-3"
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{
          delay: 0.35,
          type: 'spring',
          stiffness: 220,
          damping: 22,
        }}
      >
        <Button className="h-12 text-[15px]" onClick={onCreate}>
          Create account
        </Button>
        <Button
          variant="secondary"
          className="h-12 text-[15px]"
          onClick={onLogin}
        >
          Log in
        </Button>
      </motion.div>
    </div>
  )
}
