import type { TickStatus } from '../../components/ui/Ticks'

export type ReceiptRow = {
  messageId: string
  userId: string
  status: 'sent' | 'delivered' | 'read'
}

const rank = { sent: 1, delivered: 2, read: 3 } as const

/**
 * Tick for one of my messages. It is "read" only when every other participant has read it, and "delivered"
 * only when every other participant has at least received it; otherwise it stays "sent".
 */
export function aggregateStatus(
  rows: ReceiptRow[],
  recipientCount: number,
): TickStatus {
  if (recipientCount <= 0) return 'sent'
  const best = new Map<string, number>()
  for (const row of rows)
    best.set(row.userId, Math.max(best.get(row.userId) ?? 0, rank[row.status]))
  const levels = Array.from(best.values())
  if (levels.filter((level) => level >= rank.read).length >= recipientCount)
    return 'read'
  if (
    levels.filter((level) => level >= rank.delivered).length >= recipientCount
  )
    return 'delivered'
  return 'sent'
}

export function statusByMessage(
  rows: ReceiptRow[],
  recipientCount: number,
): Record<string, TickStatus> {
  const grouped = new Map<string, ReceiptRow[]>()
  for (const row of rows)
    grouped.set(row.messageId, [...(grouped.get(row.messageId) ?? []), row])
  return Object.fromEntries(
    Array.from(grouped, ([messageId, list]) => [
      messageId,
      aggregateStatus(list, recipientCount),
    ]),
  )
}
