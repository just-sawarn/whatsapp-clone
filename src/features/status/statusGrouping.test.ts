import { describe, expect, it } from 'vitest'
import {
  firstUnviewedIndex,
  groupStatuses,
  type StatusItem,
  type StatusOwner,
} from './statusGrouping'

const owner = (userId: string): StatusOwner => ({
  userId,
  displayName: userId,
  avatarPath: null,
})
const item = (
  id: string,
  userId: string,
  createdAt: string,
  viewed = false,
  expiresAt = '2099-01-01T00:00:00Z',
): StatusItem & { owner: StatusOwner } => ({
  id,
  userId,
  caption: id,
  mediaPath: null,
  bgColor: null,
  createdAt,
  expiresAt,
  viewed,
  owner: owner(userId),
})

describe('groupStatuses', () => {
  const now = Date.parse('2026-06-01T12:00:00Z')

  it('separates mine, unseen and seen, newest activity first', () => {
    const result = groupStatuses(
      [
        item('m1', 'me', '2026-06-01T10:00:00Z'),
        item('a1', 'ann', '2026-06-01T09:00:00Z', true),
        item('b1', 'bob', '2026-06-01T08:00:00Z'),
        item('c1', 'cat', '2026-06-01T11:00:00Z'),
      ],
      'me',
      now,
    )
    expect(result.mine?.items).toHaveLength(1)
    expect(result.recent.map((group) => group.userId)).toEqual(['cat', 'bob'])
    expect(result.viewed.map((group) => group.userId)).toEqual(['ann'])
  })

  it('keeps a person in recent updates until every status is seen', () => {
    const result = groupStatuses(
      [
        item('a1', 'ann', '2026-06-01T09:00:00Z', true),
        item('a2', 'ann', '2026-06-01T10:00:00Z', false),
      ],
      'me',
      now,
    )
    expect(result.recent[0]?.viewedCount).toBe(1)
    expect(result.viewed).toHaveLength(0)
  })

  it('plays oldest first and resumes at the first unseen one', () => {
    const [group] = groupStatuses(
      [
        item('a2', 'ann', '2026-06-01T10:00:00Z'),
        item('a1', 'ann', '2026-06-01T09:00:00Z', true),
      ],
      'me',
      now,
    ).recent
    expect(group?.items.map((status) => status.id)).toEqual(['a1', 'a2'])
    expect(group && firstUnviewedIndex(group)).toBe(1)
  })

  it('drops expired statuses', () => {
    const result = groupStatuses(
      [
        item(
          'old',
          'ann',
          '2026-05-30T00:00:00Z',
          false,
          '2026-05-31T00:00:00Z',
        ),
      ],
      'me',
      now,
    )
    expect(result.recent).toHaveLength(0)
  })
})
