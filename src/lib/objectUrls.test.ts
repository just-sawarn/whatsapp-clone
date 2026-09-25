import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  REVOKE_DELAY_MS,
  acquireObjectUrl,
  releaseObjectUrl,
} from './objectUrls'

let created = 0
const revoked: string[] = []

beforeEach(() => {
  vi.useFakeTimers()
  created = 0
  revoked.length = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation(
    () => `blob:test/${++created}`,
  )
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(
    (url) => void revoked.push(url),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('object URLs', () => {
  it('gives every holder of one blob the same URL', () => {
    const blob = new Blob(['a'])
    expect(acquireObjectUrl(blob)).toBe(acquireObjectUrl(blob))
    expect(created).toBe(1)
  })

  it('revokes only after the last holder lets go, and after a delay', () => {
    const blob = new Blob(['a'])
    const url = acquireObjectUrl(blob)
    acquireObjectUrl(blob)
    releaseObjectUrl(blob)
    vi.advanceTimersByTime(REVOKE_DELAY_MS * 2)
    expect(revoked).toEqual([])
    releaseObjectUrl(blob)
    vi.advanceTimersByTime(REVOKE_DELAY_MS - 1)
    expect(revoked).toEqual([])
    vi.advanceTimersByTime(1)
    expect(revoked).toEqual([url])
  })

  it('keeps the URL when something shows the blob again during the delay', () => {
    const blob = new Blob(['a'])
    const url = acquireObjectUrl(blob)
    releaseObjectUrl(blob)
    vi.advanceTimersByTime(REVOKE_DELAY_MS / 2)
    expect(acquireObjectUrl(blob)).toBe(url)
    vi.advanceTimersByTime(REVOKE_DELAY_MS * 2)
    expect(revoked).toEqual([])
    releaseObjectUrl(blob)
    vi.advanceTimersByTime(REVOKE_DELAY_MS)
    expect(revoked).toEqual([url])
  })

  it('makes a fresh URL once the old one was revoked', () => {
    const blob = new Blob(['a'])
    acquireObjectUrl(blob)
    releaseObjectUrl(blob)
    vi.advanceTimersByTime(REVOKE_DELAY_MS)
    expect(acquireObjectUrl(blob)).toBe('blob:test/2')
  })
})
