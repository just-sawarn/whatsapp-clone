import { useQuery } from '@tanstack/react-query'
import { keys } from '../../lib/queryKeys'
import { useCurrentUserId } from '../auth/useCurrentUser'
import { loadContacts } from './contactsService'

export function useContacts() {
  const userId = useCurrentUserId()
  return useQuery({
    queryKey: keys.contacts(userId),
    queryFn: () => loadContacts(userId),
    staleTime: 60_000,
  })
}
