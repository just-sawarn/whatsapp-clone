import { useAuth } from './AuthContext'

/** For screens rendered only behind ProtectedRoute, where a user is guaranteed. */
export function useCurrentUserId(): string {
  const { user } = useAuth()
  if (!user) throw new Error('This screen requires a signed-in user.')
  return user.id
}
