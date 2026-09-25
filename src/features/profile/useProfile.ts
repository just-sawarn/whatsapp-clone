import { useQuery } from '@tanstack/react-query'
import { getProfile } from '../../lib/profile'
import { keys } from '../../lib/queryKeys'
import { useCurrentUserId } from '../auth/useCurrentUser'

export function useMyProfile() {
  const userId = useCurrentUserId()
  return useQuery({
    queryKey: keys.profile(userId),
    queryFn: () => getProfile(userId),
    staleTime: 60_000,
  })
}
