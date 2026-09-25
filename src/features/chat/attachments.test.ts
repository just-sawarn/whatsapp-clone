import { describe, expect, it } from 'vitest'
import { rejectionFor } from './attachments'

const file = (size: number, type: string, name = 'f') =>
  ({ size, type, name }) as File

describe('rejectionFor', () => {
  it('accepts ordinary files', () => {
    expect(rejectionFor(file(1024, 'application/pdf', 'a.pdf'))).toBeNull()
  })

  it('rejects empty and oversized files', () => {
    expect(rejectionFor(file(0, 'text/plain', 'e.txt'))).toMatch(/empty/)
    expect(
      rejectionFor(file(17 * 1024 * 1024, 'application/pdf', 'big.pdf')),
    ).toMatch(/16 MB/)
  })

  it('lets large photos through because they are compressed before upload', () => {
    expect(
      rejectionFor(file(20 * 1024 * 1024, 'image/jpeg', 'p.jpg')),
    ).toBeNull()
    expect(rejectionFor(file(40 * 1024 * 1024, 'image/jpeg', 'p.jpg'))).toMatch(
      /16 MB/,
    )
  })
})
