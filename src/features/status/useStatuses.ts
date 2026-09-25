import { useQuery } from '@tanstack/react-query'
import { keys } from '../../lib/queryKeys'
import { useCurrentUserId } from '../auth/useCurrentUser'
import { loadStatuses } from './statusService'

/** Refetched every minute so expired statuses drop out without a reload. */
export function useStatuses() {
  const userId = useCurrentUserId()
  return useQuery({
    queryKey: keys.statuses(userId),
    queryFn: () => loadStatuses(userId),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}
