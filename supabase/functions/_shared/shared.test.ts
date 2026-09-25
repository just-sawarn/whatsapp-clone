import { describe, expect, it } from 'vitest'
import { parseOpenGraph, decodeEntities } from './og'
import { rateLimited } from './limit'
import { UnsafeUrlError, assertPublicHttpUrl, isPrivateAddress } from './ssrf'

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    '100.64.0.1',
    '224.0.0.1',
    '::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:10.0.0.1',
  ])('blocks %s', (address) => {
    expect(isPrivateAddress(address)).toBe(true)
  })

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34',
    '172.32.0.1',
    '2606:4700:4700::1111',
  ])('allows %s', (address) => {
    expect(isPrivateAddress(address)).toBe(false)
  })
})

describe('assertPublicHttpUrl', () => {
  it('accepts ordinary public URLs', () => {
    expect(assertPublicHttpUrl('https://example.com/a?b=1').hostname).toBe(
      'example.com',
    )
  })

  it.each([
    'file:///etc/passwd',
    'ftp://example.com',
    'javascript:alert(1)',
    'http://localhost:3000',
    'http://127.0.0.1',
    'http://[::1]/',
    'http://169.254.169.254/latest/meta-data',
    'http://10.0.0.5/admin',
    'http://printer.local',
    'http://intranet/',
    'https://user:pass@example.com',
    'not a url',
  ])('rejects %s', (raw) => {
    expect(() => assertPublicHttpUrl(raw)).toThrow(UnsafeUrlError)
  })
})

describe('parseOpenGraph', () => {
  const html = `<html><head>
    <title>Fallback &amp; title</title>
    <meta property="og:title" content="Real &quot;title&quot;">
    <meta name="description" content="plain description">
    <meta property="og:description" content="Open  graph   description">
    <meta property="og:image" content="/img/cover.png">
    <meta property="og:site_name" content="Example">
  </head><body><meta property="og:title" content="ignored in body"></body></html>`

  it('prefers OpenGraph tags and resolves relative image URLs', () => {
    expect(parseOpenGraph(html, 'https://example.com/post/1')).toEqual({
      title: 'Real "title"',
      description: 'Open graph description',
      image: 'https://example.com/img/cover.png',
      siteName: 'Example',
    })
  })

  it('falls back to the title tag and drops non-web image schemes', () => {
    const result = parseOpenGraph(
      '<head><title>Only a title</title><meta property="og:image" content="javascript:alert(1)"></head>',
      'https://example.com',
    )
    expect(result.title).toBe('Only a title')
    expect(result.image).toBeUndefined()
  })

  it('clips long text', () => {
    const result = parseOpenGraph(
      `<head><meta property="og:title" content="${'a'.repeat(400)}"></head>`,
      'https://example.com',
    )
    expect(result.title?.length).toBeLessThanOrEqual(150)
  })

  it('decodes entities', () => {
    expect(decodeEntities('Tom &amp; Jerry &#39;s &#x41;')).toBe(
      "Tom & Jerry 's A",
    )
  })
})

describe('rateLimited', () => {
  it('allows a burst up to the limit, then blocks until the window passes', () => {
    const key = `test-${Math.random()}`
    for (let index = 0; index < 3; index++)
      expect(rateLimited(key, 3, 1000, 1000 + index)).toBe(false)
    expect(rateLimited(key, 3, 1000, 1010)).toBe(true)
    expect(rateLimited(key, 3, 1000, 2500)).toBe(false)
  })
})
