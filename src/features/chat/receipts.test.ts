import { describe, expect, it } from 'vitest'
import { aggregateStatus, statusByMessage, type ReceiptRow } from './receipts'

const row = (
  userId: string,
  status: ReceiptRow['status'],
  messageId = 'm',
): ReceiptRow => ({ messageId, userId, status })

describe('aggregateStatus', () => {
  it('is sent until a recipient reports back', () => {
    expect(aggregateStatus([], 1)).toBe('sent')
    expect(aggregateStatus([], 0)).toBe('sent')
  })

  it('follows the single recipient in a direct chat', () => {
    expect(aggregateStatus([row('b', 'delivered')], 1)).toBe('delivered')
    expect(aggregateStatus([row('b', 'delivered'), row('b', 'read')], 1)).toBe(
      'read',
    )
  })

  it('needs every group member to advance before the tick does', () => {
    expect(aggregateStatus([row('b', 'read'), row('c', 'delivered')], 2)).toBe(
      'delivered',
    )
    expect(aggregateStatus([row('b', 'read')], 2)).toBe('sent')
    expect(aggregateStatus([row('b', 'read'), row('c', 'read')], 2)).toBe(
      'read',
    )
  })
})

describe('statusByMessage', () => {
  it('groups rows per message', () => {
    expect(
      statusByMessage(
        [row('b', 'read', 'one'), row('b', 'delivered', 'two')],
        1,
      ),
    ).toEqual({ one: 'read', two: 'delivered' })
  })
})
