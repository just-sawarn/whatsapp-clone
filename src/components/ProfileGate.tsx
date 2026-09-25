import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthContext'
import { getProfile } from '../lib/profile'

export function ProfileGate({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    let active = true
    void getProfile(user.id)
      .then((profile) => {
        if (!active) return
        if (!profile) navigate('/onboarding', { replace: true })
        setChecking(false)
      })
      .catch((profileError: unknown) => {
        if (!active) return
        setError(profileError instanceof Error ? profileError.message : 'Unable to load your profile.')
        setChecking(false)
      })
    return () => {
      active = false
    }
  }, [navigate, user])

  if (checking) return <div className="route-loading">Loading your profile...</div>
  if (error) return <div className="route-loading"><div className="profile-gate-error">{error}</div></div>
  return children
}
