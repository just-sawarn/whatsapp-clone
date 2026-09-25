import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { keys } from '../../lib/queryKeys'
import { useCurrentUserId } from '../auth/useCurrentUser'
import {
  loadCommunities,
  loadCommunityGroups,
  type Community,
} from './communityService'

export function useCommunities() {
  const userId = useCurrentUserId()
  return useQuery({
    queryKey: keys.communities(userId),
    queryFn: loadCommunities,
    staleTime: 15_000,
  })
}

export function useCommunity(communityId: string | undefined): {
  community: Community | undefined
  isPending: boolean
} {
  const { data, isPending } = useCommunities()
  return useMemo(
    () => ({
      community: data?.find((item) => item.id === communityId),
      isPending,
    }),
    [communityId, data, isPending],
  )
}

export function useCommunityGroups(communityId: string | undefined) {
  return useQuery({
    queryKey: keys.communityGroups(communityId ?? ''),
    queryFn: () => loadCommunityGroups(communityId ?? ''),
    enabled: Boolean(communityId),
    staleTime: 15_000,
  })
}
