import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../features/auth/AuthContext'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <div className="route-loading">Restoring your session...</div>
  if (!user) return <Navigate to="/auth" replace state={{ from: location.pathname }} />
  return children
}
