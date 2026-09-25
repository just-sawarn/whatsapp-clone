import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { keys } from '../../lib/queryKeys'
import { useCurrentUserId } from '../auth/useCurrentUser'
import { loadParticipants } from './groupService'
import { loadReactions, loadReceipts, loadStarredIds } from './messageExtras'
import { statusByMessage } from './receipts'
import type { MessageStatusMap, ReactionRow } from './types'

export function useReactions(chatId: string): Record<string, ReactionRow[]> {
  const { data } = useQuery({
    queryKey: keys.reactions(chatId),
    queryFn: () => loadReactions(chatId),
    staleTime: 30_000,
  })
  return useMemo(() => {
    const grouped: Record<string, ReactionRow[]> = {}
    for (const reaction of data ?? [])
      (grouped[reaction.messageId] ??= []).push(reaction)
    return grouped
  }, [data])
}

/** Ticks for my messages; `recipientCount` is everyone else in the chat. */
export function useReceiptStatuses(
  chatId: string,
  recipientCount: number,
): MessageStatusMap {
  const userId = useCurrentUserId()
  const { data } = useQuery({
    queryKey: keys.receipts(chatId),
    queryFn: () => loadReceipts(chatId, userId),
    staleTime: 30_000,
  })
  return useMemo(
    () => statusByMessage(data ?? [], recipientCount),
    [data, recipientCount],
  )
}

export function useStarredIds(): ReadonlySet<string> {
  const userId = useCurrentUserId()
  const { data } = useQuery({
    queryKey: keys.starredIds(userId),
    queryFn: () => loadStarredIds(userId),
    staleTime: 60_000,
  })
  return useMemo(() => new Set(data ?? []), [data])
}

export function useParticipants(chatId: string, enabled = true) {
  return useQuery({
    queryKey: keys.participants(chatId),
    queryFn: () => loadParticipants(chatId),
    enabled,
    staleTime: 30_000,
  })
}
