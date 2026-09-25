import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { Icon } from '../../../components/ui/Icon'
import { Spinner } from '../../../components/ui/Spinner'
import { cn } from '../../../lib/cn'
import { isUsernameAvailable } from '../../../lib/profile'
import { useDebouncedValue } from '../../../lib/useDebouncedValue'
import { normalizeUsername, usernameRule } from '../onboardingSchemas'
import type { OnboardingData } from '../useOnboardingState'
import { StepFrame } from './StepFrame'

type Availability =
  'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error'
type Props = {
  data: OnboardingData
  save: (patch: Partial<OnboardingData>) => void
  next: () => void
  back: () => void
  notice?: string | null
}

export function UsernameStep({ data, save, next, back, notice }: Props) {
  const [value, setValue] = useState(data.username)
  const [availability, setAvailability] = useState<Availability>('idle')
  const debounced = useDebouncedValue(value, 400)

  useEffect(() => {
    let active = true
    if (!debounced) {
      setAvailability('idle')
      return
    }
    if (!usernameRule.test(debounced)) {
      setAvailability('invalid')
      return
    }
    setAvailability('checking')
    isUsernameAvailable(debounced)
      .then((free) => active && setAvailability(free ? 'available' : 'taken'))
      .catch(() => active && setAvailability('error'))
    return () => {
      active = false
    }
  }, [debounced])

  const ready = availability === 'available' && debounced === value
  const message: Record<Availability, string> = {
    idle: 'People can find you by this handle. It cannot be changed casually later.',
    checking: 'Checking availability…',
    available: `@${value} is available`,
    taken: `@${value} is taken, try another`,
    invalid: 'Use 3 to 20 lowercase letters, numbers or underscores.',
    error: 'Could not check availability. You can still try to continue.',
  }

  return (
    <StepFrame
      title="Pick a username"
      description="Your @username is how friends find you."
      onBack={back}
      onSubmit={() => {
        save({ username: value })
        next()
      }}
      submitDisabled={!ready && availability !== 'error'}
      error={notice}
    >
      <div className="grid gap-1.5">
        <label
          htmlFor="username"
          className="text-[13px] font-medium text-muted"
        >
          Username
        </label>
        <div
          className={cn(
            'flex h-11 items-center rounded-lg border bg-surface px-3 focus-within:ring-2 focus-within:ring-primary/20',
            availability === 'taken' || availability === 'invalid'
              ? 'border-danger'
              : availability === 'available'
                ? 'border-primary'
                : 'border-divider focus-within:border-primary',
          )}
        >
          <span className="text-muted" aria-hidden="true">
            @
          </span>
          <input
            id="username"
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={value}
            onChange={(event) =>
              setValue(normalizeUsername(event.target.value))
            }
            aria-describedby="username-status"
            className="ml-1 w-full bg-transparent text-[15px] outline-none"
          />
          {availability === 'checking' && <Spinner size={16} />}
          {availability === 'available' && (
            <Icon icon={Check} size={18} className="text-primary" />
          )}
          {(availability === 'taken' || availability === 'invalid') && (
            <Icon icon={X} size={18} className="text-danger" />
          )}
        </div>
        <p
          id="username-status"
          role="status"
          className={cn(
            'text-xs',
            availability === 'available'
              ? 'text-link'
              : availability === 'taken' || availability === 'invalid'
                ? 'text-danger'
                : 'text-muted',
          )}
        >
          {message[availability]}
        </p>
      </div>
    </StepFrame>
  )
}
