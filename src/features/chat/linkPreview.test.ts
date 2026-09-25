import { describe, expect, it } from 'vitest'
import { firstUrl, segmentText } from './linkPreview'

describe('firstUrl', () => {
  it('finds a URL and drops trailing punctuation', () => {
    expect(firstUrl('see https://example.com/a?b=1, thanks')).toBe(
      'https://example.com/a?b=1',
    )
    expect(firstUrl('(https://example.com/x)')).toBe('https://example.com/x')
  })

  it('ignores text without a web URL', () => {
    expect(firstUrl('no links here')).toBeNull()
    expect(firstUrl('javascript:alert(1)')).toBeNull()
    expect(firstUrl('ftp://example.com')).toBeNull()
  })
})

describe('segmentText', () => {
  it('keeps text around links and marks the links', () => {
    expect(segmentText('go to https://a.example/x. Now')).toEqual([
      { text: 'go to ' },
      { text: 'https://a.example/x', href: 'https://a.example/x' },
      { text: '. Now' },
    ])
  })

  it('returns plain text unchanged', () => {
    expect(segmentText('hello')).toEqual([{ text: 'hello' }])
    expect(segmentText('')).toEqual([])
  })
})
