import { describe, expect, it } from 'vitest'
import { smallVariantPath } from './bucketImage'

describe('smallVariantPath', () => {
  it('puts the marker before the extension', () => {
    expect(smallVariantPath('user/abc.jpg')).toBe('user/abc.s.jpg')
    expect(smallVariantPath('chat/abc-123.png')).toBe('chat/abc-123.s.png')
  })

  it('handles paths without an extension', () => {
    expect(smallVariantPath('user/abc')).toBe('user/abc.s.jpg')
  })

  it('only touches the file name, not folders with dots', () => {
    expect(smallVariantPath('a.b/c.d/file.jpg')).toBe('a.b/c.d/file.s.jpg')
  })
})
