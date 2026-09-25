import { useCallback, useState } from 'react'

export type OnboardingStep =
  'profile' | 'username' | 'about' | 'permissions' | 'keys' | 'done'
export const stepOrder: OnboardingStep[] = [
  'profile',
  'username',
  'about',
  'permissions',
  'keys',
  'done',
]

export type OnboardingData = {
  displayName: string
  username: string
  about: string
  avatarPath: string | null
}

type Stored = OnboardingData & { step: OnboardingStep }

const initial: Stored = {
  step: 'profile',
  displayName: '',
  username: '',
  about: 'Hey there! I am using WhatsApp.',
  avatarPath: null,
}
const keyFor = (userId: string) => `wa:onboarding:${userId}`

function read(userId: string): Stored {
  try {
    const raw = localStorage.getItem(keyFor(userId))
    if (!raw) return initial
    const saved = JSON.parse(raw) as Partial<Stored>
    return {
      step:
        stepOrder.includes(saved.step as OnboardingStep) &&
        saved.step !== 'done'
          ? (saved.step as OnboardingStep)
          : 'profile',
      displayName:
        typeof saved.displayName === 'string' ? saved.displayName : '',
      username: typeof saved.username === 'string' ? saved.username : '',
      about: typeof saved.about === 'string' ? saved.about : initial.about,
      avatarPath:
        typeof saved.avatarPath === 'string' ? saved.avatarPath : null,
    }
  } catch {
    return initial
  }
}

/** Progress survives a refresh mid-flow. Only non-sensitive profile fields are stored; never a password. */
export function useOnboardingState(userId: string) {
  const [state, setState] = useState<Stored>(() => read(userId))

  const save = useCallback(
    (patch: Partial<Stored>) => {
      setState((current) => {
        const next = { ...current, ...patch }
        try {
          localStorage.setItem(keyFor(userId), JSON.stringify(next))
        } catch {
          // Progress just will not persist if storage is unavailable.
        }
        return next
      })
    },
    [userId],
  )

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(keyFor(userId))
    } catch {
      // ignore
    }
  }, [userId])

  return { state, save, clear }
}
