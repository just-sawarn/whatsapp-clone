import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createSignedUrls = vi.fn()
const from = vi.fn(() => ({ createSignedUrls }))

vi.mock('./supabase', () => ({ supabase: { storage: { from } } }))

const { signedUrl } = await import('./signedUrls')

beforeEach(() => {
  createSignedUrls.mockReset()
  from.mockClear()
  createSignedUrls.mockImplementation(async (paths: string[]) => ({
    data: paths.map((path) =>
      path.startsWith('missing')
        ? { path, signedUrl: null, error: 'Object not found' }
        : { path, signedUrl: `https://files/${path}?t=1`, error: null },
    ),
    error: null,
  }))
})

afterEach(() => vi.unstubAllGlobals())

describe('signedUrl', () => {
  it('sends requests made together as one call per bucket', async () => {
    const urls = await Promise.all([
      signedUrl('avatars', 'a/1.jpg'),
      signedUrl('avatars', 'b/2.jpg'),
      signedUrl('avatars', 'a/1.jpg'),
      signedUrl('status-media', 'c/3.jpg'),
    ])
    expect(urls).toEqual([
      'https://files/a/1.jpg?t=1',
      'https://files/b/2.jpg?t=1',
      'https://files/a/1.jpg?t=1',
      'https://files/c/3.jpg?t=1',
    ])
    expect(createSignedUrls).toHaveBeenCalledTimes(2)
    // Duplicates in a batch are sent once.
    expect(createSignedUrls).toHaveBeenCalledWith(['a/1.jpg', 'b/2.jpg'], 3600)
    expect(createSignedUrls).toHaveBeenCalledWith(['c/3.jpg'], 3600)
  })

  it('fails only the file that is missing', async () => {
    const [good, bad] = await Promise.allSettled([
      signedUrl('avatars', 'a/1.jpg'),
      signedUrl('avatars', 'missing/2.jpg'),
    ])
    expect(good.status).toBe('fulfilled')
    expect(bad.status).toBe('rejected')
    expect(createSignedUrls).toHaveBeenCalledTimes(1)
  })

  it('fails everything in the batch when the call itself fails', async () => {
    createSignedUrls.mockResolvedValueOnce({
      data: null,
      error: { message: 'offline' },
    })
    const results = await Promise.allSettled([
      signedUrl('avatars', 'a.jpg'),
      signedUrl('avatars', 'b.jpg'),
    ])
    expect(results.map((result) => result.status)).toEqual([
      'rejected',
      'rejected',
    ])
  })

  it('splits very large batches', async () => {
    await Promise.all(
      Array.from({ length: 250 }, (_, index) =>
        signedUrl('avatars', `p/${index}.jpg`),
      ),
    )
    expect(createSignedUrls.mock.calls.map(([paths]) => paths.length)).toEqual([
      100, 100, 50,
    ])
  })
})
