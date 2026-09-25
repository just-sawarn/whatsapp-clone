import { describe, expect, it } from 'vitest'
import {
  LOGIN_TTL_MS,
  clearLogin,
  ensureLoginRecorded,
  isLoginExpired,
  loginExpiresAt,
  loginStartedAt,
  recordLogin,
} from './sessionPolicy'

function memoryStore() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

describe('login lifetime', () => {
  it('lasts seven days from sign-in', () => {
    expect(LOGIN_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000)
    const start = Date.UTC(2026, 0, 1)
    expect(loginExpiresAt(start)).toBe(Date.UTC(2026, 0, 8))
    expect(isLoginExpired(start, Date.UTC(2026, 0, 7, 23, 59))).toBe(false)
    expect(isLoginExpired(start, Date.UTC(2026, 0, 8))).toBe(true)
  })

  it('an explicit sign-in restarts the clock, while a re-check does not extend it', () => {
    const store = memoryStore()
    recordLogin('u', 1000, store)
    expect(ensureLoginRecorded('u', 999_999, store)).toBe(1000)
    recordLogin('u', 5000, store)
    expect(loginStartedAt('u', store)).toBe(5000)
  })

  it('starts the clock for sessions that have no record yet', () => {
    const store = memoryStore()
    expect(loginStartedAt('u', store)).toBeNull()
    expect(ensureLoginRecorded('u', 2000, store)).toBe(2000)
    expect(loginStartedAt('u', store)).toBe(2000)
  })

  it('keeps accounts separate, forgets on sign-out, and ignores corrupt values', () => {
    const store = memoryStore()
    recordLogin('a', 1, store)
    expect(loginStartedAt('b', store)).toBeNull()
    clearLogin('a', store)
    expect(loginStartedAt('a', store)).toBeNull()
    store.setItem('wa:login-at:c', 'not a number')
    expect(loginStartedAt('c', store)).toBeNull()
  })

  it('works without any storage', () => {
    expect(ensureLoginRecorded('u', 3000, null)).toBe(3000)
    expect(loginStartedAt('u', null)).toBeNull()
  })
})
