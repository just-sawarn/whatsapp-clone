import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, KeyRound } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import { Input } from '../../../components/ui/Input'
import { Spinner } from '../../../components/ui/Spinner'
import { errorMessage } from '../../../lib/errors'
import { createProfile } from '../../../lib/profile'
import { useAuth } from '../../auth/AuthContext'
import type { OnboardingData } from '../useOnboardingState'

const phases = [
  'Generating your private key',
  'Protecting it with your password',
  'Publishing your public key',
  'Creating your profile',
]
const pause = (ms: number) =>
  new Promise((resolve) => window.setTimeout(resolve, ms))

type Props = {
  data: OnboardingData
  onDone: () => void
  onUsernameTaken: () => void
  back: () => void
}

/**
 * Generates the ECDH key pair on this device, wraps it with the account password, and publishes only the
 * public half. The short pauses keep each phase visible instead of flashing past behind a spinner.
 */
export function EncryptionStep({ data, onDone, onUsernameTaken, back }: Props) {
  const {
    user,
    identityState,
    initializeEncryption,
    unlockEncryption,
    authError,
  } = useAuth()
  const [password, setPassword] = useState('')
  const [phase, setPhase] = useState(-1)
  const [error, setError] = useState<string | null>(null)
  const [needPassword, setNeedPassword] = useState(false)
  const started = useRef(false)

  const run = useCallback(
    async (secret?: string) => {
      if (!user) return
      setError(null)
      setNeedPassword(false)
      try {
        setPhase(0)
        await pause(700)
        if (identityState !== 'unlocked') {
          if (!secret) {
            setNeedPassword(true)
            setPhase(-1)
            return
          }
          if (identityState === 'locked') await unlockEncryption(secret)
          else if (!(await initializeEncryption(secret)))
            throw new Error(
              authError ?? 'Could not set up encryption on this device.',
            )
        }
        setPhase(1)
        await pause(700)
        setPhase(2)
        await pause(700)
        setPhase(3)
        await createProfile({
          id: user.id,
          username: data.username,
          displayName: data.displayName,
          about: data.about,
          avatarPath: data.avatarPath,
        })
        await pause(500)
        setPhase(4)
        await pause(600)
        onDone()
      } catch (failure) {
        const message = errorMessage(
          failure,
          'Something went wrong while setting up.',
        )
        if (/duplicate|unique|already exists/i.test(message)) {
          onUsernameTaken()
          return
        }
        setError(message)
        setPhase(-1)
      }
    },
    [
      authError,
      data,
      identityState,
      initializeEncryption,
      onDone,
      onUsernameTaken,
      unlockEncryption,
      user,
    ],
  )

  useEffect(() => {
    if (started.current) return
    started.current = true
    void run()
  }, [run])

  return (
    <div className="grid gap-5">
      <div>
        <h1
          tabIndex={-1}
          data-step-heading
          className="text-2xl font-semibold outline-none"
        >
          Setting up your private keys
        </h1>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">
          Your messages are encrypted on this device. Only you and the people
          you message can read them.
        </p>
      </div>

      {needPassword ? (
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void run(password)
          }}
        >
          <Input
            label="Account password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            hint="Used only on this device to protect your private key. It is never stored."
            required
          />
          <Button type="submit">Continue</Button>
        </form>
      ) : (
        <ol className="grid gap-3" aria-live="polite">
          {phases.map((label, index) => {
            const done = phase > index
            const active = phase === index
            return (
              <motion.li
                key={label}
                initial={{ opacity: 0.4 }}
                animate={{ opacity: done || active ? 1 : 0.4 }}
                className="flex items-center gap-3 text-[14.5px]"
              >
                <span
                  className={`grid h-7 w-7 place-items-center rounded-full ${done ? 'bg-primary text-white' : 'bg-panel text-muted'}`}
                >
                  {done ? (
                    <Icon icon={Check} size={15} />
                  ) : active ? (
                    <Spinner size={14} />
                  ) : (
                    <Icon icon={KeyRound} size={14} />
                  )}
                </span>
                {label}
              </motion.li>
            )
          })}
        </ol>
      )}

      {error && (
        <div className="grid gap-3">
          <p
            role="alert"
            className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger"
          >
            {error}
          </p>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={back}>
              Back
            </Button>
            <Button
              onClick={() => {
                started.current = true
                void run()
              }}
            >
              Try again
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
