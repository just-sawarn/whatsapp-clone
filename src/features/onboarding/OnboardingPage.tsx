import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Logo } from '../../components/ui/Logo'
import { getProfile } from '../../lib/profile'
import { keys } from '../../lib/queryKeys'
import { useAuth } from '../auth/AuthContext'
import { useCurrentUserId } from '../auth/useCurrentUser'
import { AboutStep } from './steps/AboutStep'
import { DoneStep } from './steps/DoneStep'
import { EncryptionStep } from './steps/EncryptionStep'
import { PermissionsStep } from './steps/PermissionsStep'
import { ProfileStep } from './steps/ProfileStep'
import { UsernameStep } from './steps/UsernameStep'
import {
  stepOrder,
  useOnboardingState,
  type OnboardingStep,
} from './useOnboardingState'

const LABELS: Record<OnboardingStep, string> = {
  profile: 'Profile',
  username: 'Username',
  about: 'About',
  permissions: 'Permissions',
  keys: 'Encryption',
  done: 'Done',
}

/** Multi-step, keyboard-navigable setup. Progress is persisted so a refresh does not lose it. */
export default function OnboardingPage() {
  const userId = useCurrentUserId()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { state, save, clear } = useOnboardingState(userId)
  const [direction, setDirection] = useState(1)
  const [notice, setNotice] = useState<string | null>(null)
  const container = useRef<HTMLDivElement>(null)
  const { data: existingProfile } = useQuery({
    queryKey: keys.profile(userId),
    queryFn: () => getProfile(userId),
    staleTime: 60_000,
  })
  const index = stepOrder.indexOf(state.step)
  const progress =
    ((index + (state.step === 'done' ? 1 : 0)) / (stepOrder.length - 1)) * 100

  const goTo = (step: OnboardingStep) => {
    setDirection(stepOrder.indexOf(step) >= index ? 1 : -1)
    save({ step })
  }
  const move = (delta: 1 | -1) =>
    goTo(
      stepOrder[Math.max(0, Math.min(stepOrder.length - 1, index + delta))] ??
        'profile',
    )

  // Someone who already has a profile has nothing to set up (except while finishing the last two steps).
  useEffect(() => {
    if (existingProfile && state.step !== 'keys' && state.step !== 'done')
      navigate('/', { replace: true })
  }, [existingProfile, navigate, state.step])

  // Move focus to the new step's heading so keyboard and screen-reader users land in the right place.
  useEffect(() => {
    container.current
      ?.querySelector<HTMLElement>('[data-step-heading]')
      ?.focus()
  }, [state.step])

  const finish = async () => {
    clear()
    queryClient.removeQueries({ queryKey: keys.profile(userId) })
    navigate('/', { replace: true })
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-app-bg px-4 py-8 text-text">
      <section
        aria-label="Account setup"
        className="w-full max-w-[460px] overflow-hidden rounded-2xl bg-surface p-7 shadow-popover sm:p-9"
      >
        <div className="mb-6 flex items-center justify-between">
          <span className="flex items-center gap-2.5">
            <Logo size={32} />
            <strong className="text-[15px]">Set up your account</strong>
          </span>
          <span className="text-xs text-muted" aria-live="polite">
            {state.step === 'done'
              ? 'Complete'
              : `Step ${index + 1} of ${stepOrder.length - 1}: ${LABELS[state.step]}`}
          </span>
        </div>
        <div
          className="mb-7 h-1.5 overflow-hidden rounded-full bg-divider"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <motion.div
            className="h-full rounded-full bg-primary"
            animate={{ width: `${progress}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 26 }}
          />
        </div>
        <div ref={container}>
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={state.step}
              initial={{ opacity: 0, x: 32 * direction }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -32 * direction }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            >
              {state.step === 'profile' && (
                <ProfileStep data={state} save={save} next={() => move(1)} />
              )}
              {state.step === 'username' && (
                <UsernameStep
                  data={state}
                  save={save}
                  next={() => {
                    setNotice(null)
                    move(1)
                  }}
                  back={() => move(-1)}
                  notice={notice}
                />
              )}
              {state.step === 'about' && (
                <AboutStep
                  data={state}
                  save={save}
                  next={() => move(1)}
                  back={() => move(-1)}
                />
              )}
              {state.step === 'permissions' && (
                <PermissionsStep next={() => move(1)} back={() => move(-1)} />
              )}
              {state.step === 'keys' && (
                <EncryptionStep
                  data={state}
                  back={() => move(-1)}
                  onDone={() => goTo('done')}
                  onUsernameTaken={() => {
                    setNotice(
                      'That username was just taken. Please choose another.',
                    )
                    goTo('username')
                  }}
                />
              )}
              {state.step === 'done' && (
                <DoneStep
                  name={state.displayName}
                  onFinish={() => void finish()}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        {state.step !== 'done' && (
          <button
            type="button"
            onClick={() => void signOut()}
            className="mx-auto mt-7 block text-[13px] text-muted hover:text-text hover:underline"
          >
            Sign out
          </button>
        )}
      </section>
    </main>
  )
}
