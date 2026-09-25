import { describe, expect, it } from 'vitest'
import { photoRejection } from './image'

const file = (type: string, size = 1000) => ({ type, size }) as File

describe('photoRejection', () => {
  it('accepts ordinary photos', () => {
    expect(photoRejection(file('image/jpeg'))).toBeNull()
    expect(photoRejection(file('image/png'))).toBeNull()
    expect(photoRejection(file('image/webp'))).toBeNull()
  })

  it('rejects non-images, SVG (it can carry script) and oversized files', () => {
    expect(photoRejection(file('application/pdf'))).toMatch(/Choose a photo/)
    expect(photoRejection(file('image/svg+xml'))).toMatch(/Choose a photo/)
    expect(photoRejection(file('image/jpeg', 9 * 1024 * 1024))).toMatch(/8 MB/)
  })
})
