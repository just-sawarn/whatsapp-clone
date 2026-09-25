import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { getProfile } from '../lib/profile'
import { errorMessage } from '../lib/errors'
import { keys } from '../lib/queryKeys'
import { Button } from './ui/Button'
import { Spinner } from './ui/Spinner'

/** Sends signed-in users without a profile to onboarding; renders children once a profile exists. */
export function ProfileGate({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const { data, isPending, error, refetch } = useQuery({
    queryKey: keys.profile(userId),
    queryFn: () => getProfile(userId),
    enabled: Boolean(user),
    staleTime: 60_000,
  })

  if (isPending) {
    return (
      <div className="grid min-h-dvh place-items-center gap-2 bg-app-bg text-muted">
        <span className="flex items-center gap-2 text-sm">
          <Spinner /> Loading your profile…
        </span>
      </div>
    )
  }
  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center bg-app-bg p-4">
        <div className="grid max-w-sm justify-items-center gap-3 rounded-xl bg-surface p-6 text-center shadow-popover">
          <p role="alert" className="text-[14px] text-danger">
            {errorMessage(error, 'Unable to load your profile.')}
          </p>
          <Button onClick={() => void refetch()}>Try again</Button>
        </div>
      </div>
    )
  }
  if (data === null) return <Navigate to="/onboarding" replace />
  return children
}
