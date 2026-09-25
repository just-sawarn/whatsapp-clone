import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { MailCheck } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import { useToast } from '../../../components/ui/ToastContext'
import { useAuth } from '../AuthContext'

const COOLDOWN_SECONDS = 30

type Props = { email: string; onBack: () => void }

export function VerifyPendingScreen({ email, onBack }: Props) {
  const { resendVerification, authError } = useAuth()
  const { notify } = useToast()
  const [cooldown, setCooldown] = useState(COOLDOWN_SECONDS)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(
      () => setCooldown((value) => value - 1),
      1000,
    )
    return () => window.clearTimeout(timer)
  }, [cooldown])

  const resend = async () => {
    setBusy(true)
    if (await resendVerification(email)) {
      notify('Confirmation email sent again.', 'success')
      setCooldown(COOLDOWN_SECONDS)
    }
    setBusy(false)
  }

  return (
    <div className="grid justify-items-center gap-4 text-center">
      <motion.span
        aria-hidden="true"
        className="grid h-20 w-20 place-items-center rounded-full bg-primary/15 text-link"
        animate={{ y: [0, -8, 0], rotate: [0, -4, 4, 0] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Icon icon={MailCheck} size={38} />
      </motion.span>
      <h1 className="text-2xl font-semibold">Check your email</h1>
      <p className="max-w-xs text-[14.5px] leading-relaxed text-muted">
        We sent a confirmation link to{' '}
        <strong className="text-text">{email}</strong>. Open it to finish
        creating your account, then come back here.
      </p>
      {authError && (
        <p role="alert" className="text-[13px] text-danger">
          {authError}
        </p>
      )}
      <Button
        variant="secondary"
        loading={busy}
        disabled={cooldown > 0}
        onClick={() => void resend()}
      >
        {cooldown > 0 ? `Resend email in ${cooldown}s` : 'Resend email'}
      </Button>
      <button
        type="button"
        onClick={onBack}
        className="text-[13.5px] text-link hover:underline"
      >
        Use a different email
      </button>
    </div>
  )
}
