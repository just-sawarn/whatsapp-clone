import { describe, expect, it } from 'vitest'
import { normalizeAppUrl } from './appUrl'

const fallback = 'http://localhost:5173'

describe('normalizeAppUrl', () => {
  it('uses a configured https address, reduced to its origin', () => {
    expect(normalizeAppUrl('https://codespaces.online', fallback)).toBe(
      'https://codespaces.online',
    )
    expect(normalizeAppUrl('  https://codespaces.online/  ', fallback)).toBe(
      'https://codespaces.online',
    )
    expect(
      normalizeAppUrl('https://codespaces.online/some/path?x=1#top', fallback),
    ).toBe('https://codespaces.online')
  })

  it('falls back to the current address when nothing usable is configured', () => {
    expect(normalizeAppUrl(undefined, fallback)).toBe(fallback)
    expect(normalizeAppUrl('', fallback)).toBe(fallback)
    expect(normalizeAppUrl('   ', fallback)).toBe(fallback)
    expect(normalizeAppUrl('not a url', fallback)).toBe(fallback)
    expect(normalizeAppUrl('codespaces.online', fallback)).toBe(fallback)
  })

  it('refuses unencrypted or non-web addresses outside localhost', () => {
    expect(normalizeAppUrl('http://codespaces.online', fallback)).toBe(fallback)
    expect(normalizeAppUrl('javascript:alert(1)', fallback)).toBe(fallback)
    expect(normalizeAppUrl('ftp://codespaces.online', fallback)).toBe(fallback)
  })

  it('allows plain http for local development', () => {
    expect(normalizeAppUrl('http://localhost:5173/', 'https://x.test')).toBe(
      'http://localhost:5173',
    )
    expect(normalizeAppUrl('http://127.0.0.1:3000', 'https://x.test')).toBe(
      'http://127.0.0.1:3000',
    )
  })
})
