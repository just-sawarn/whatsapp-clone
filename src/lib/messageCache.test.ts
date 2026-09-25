import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import {
  cacheMessages,
  cacheStats,
  clearCache,
  makeSnippet,
  removeCachedMessage,
  searchCache,
} from './messageCache'

const message = (
  id: string,
  chatId: string,
  text: string,
  createdAt: string,
) => ({ id, chatId, senderId: 's', createdAt, text })

describe('message cache', () => {
  it('searches newest first, optionally within one chat', async () => {
    await cacheMessages('u1', [
      message('1', 'a', 'Lunch at noon?', '2026-01-01T10:00:00Z'),
      message('2', 'b', 'lunch tomorrow', '2026-01-02T10:00:00Z'),
      message('3', 'a', 'Dinner plans', '2026-01-03T10:00:00Z'),
    ])
    expect((await searchCache('u1', 'LUNCH')).map((m) => m.id)).toEqual([
      '2',
      '1',
    ])
    expect(
      (await searchCache('u1', 'lunch', { chatId: 'a' })).map((m) => m.id),
    ).toEqual(['1'])
    expect(await searchCache('u1', '   ')).toEqual([])
  })

  it('keeps accounts separate and can forget a message or everything', async () => {
    await cacheMessages('u2', [
      message('x', 'a', 'secret', '2026-01-01T00:00:00Z'),
    ])
    expect(await searchCache('u3', 'secret')).toEqual([])
    await removeCachedMessage('u2', 'x')
    expect(await searchCache('u2', 'secret')).toEqual([])

    await cacheMessages('u2', [
      message('y', 'a', 'again', '2026-01-01T00:00:00Z'),
    ])
    expect((await cacheStats('u2')).count).toBe(1)
    await clearCache('u2')
    expect((await cacheStats('u2')).count).toBe(0)
  })

  it('does not index media-only messages', async () => {
    await cacheMessages('u4', [message('m', 'a', '', '2026-01-01T00:00:00Z')])
    expect((await cacheStats('u4')).count).toBe(0)
  })
})

describe('makeSnippet', () => {
  it('centres on the match with ellipses', () => {
    const snippet = makeSnippet(
      'a'.repeat(60) + 'NEEDLE' + 'b'.repeat(60),
      'needle',
      10,
    )
    expect(snippet.match).toBe('NEEDLE')
    expect(snippet.before.startsWith('…')).toBe(true)
    expect(snippet.after.endsWith('…')).toBe(true)
  })

  it('falls back to the start of the text when there is no match', () => {
    expect(makeSnippet('hello world', 'zzz', 4)).toEqual({
      before: '',
      match: '',
      after: 'hello wo',
    })
  })
})
