import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearStoredMedia, readStored, stores, writeStored } from './mediaStore'

/** Just enough of the Cache Storage API for the store: put, match, delete, keys. */
function fakeCaches() {
  const all = new Map<string, Map<string, Response>>()
  const open = async (name: string) => {
    const entries = all.get(name) ?? new Map<string, Response>()
    all.set(name, entries)
    return {
      put: async (request: Request, response: Response) =>
        void entries.set(request.url, response),
      match: async (request: Request) => entries.get(request.url)?.clone(),
      delete: async (request: Request) => entries.delete(request.url),
      keys: async () => [...entries.keys()].map((url) => new Request(url)),
    }
  }
  return { all, open, delete: async (name: string) => all.delete(name) }
}

let fake: ReturnType<typeof fakeCaches>

beforeEach(() => {
  fake = fakeCaches()
  vi.stubGlobal('caches', fake)
})
afterEach(() => vi.unstubAllGlobals())

const blob = (size: number, type = 'image/jpeg') =>
  new Blob([new Uint8Array(size)], { type })

describe('media store', () => {
  it('round-trips a blob with its type', async () => {
    await writeStored('images', 'avatars/u/1.jpg', blob(10))
    const back = await readStored('images', 'avatars/u/1.jpg')
    expect(back?.size).toBe(10)
    expect(back?.type).toBe('image/jpeg')
    expect(await readStored('images', 'avatars/u/other.jpg')).toBeNull()
  })

  it('keeps the two stores apart', async () => {
    await writeStored('images', 'k', blob(5))
    expect(await readStored('cipher', 'k')).toBeNull()
  })

  it('skips empty and oversized files', async () => {
    await writeStored('cipher', 'empty', blob(0))
    await writeStored('cipher', 'big', blob(stores.cipher.maxBytes + 1))
    expect(await readStored('cipher', 'empty')).toBeNull()
    expect(await readStored('cipher', 'big')).toBeNull()
  })

  it('drops the oldest entries past the limit', async () => {
    const total = stores.cipher.maxEntries + 25
    for (let index = 0; index < total; index++)
      await writeStored('cipher', `f/${index}`, blob(1))
    expect(await readStored('cipher', 'f/0')).toBeNull()
    expect(await readStored('cipher', `f/${total - 1}`)).not.toBeNull()
    const remaining = fake.all.get(stores.cipher.cacheName)?.size ?? 0
    expect(remaining).toBeLessThanOrEqual(stores.cipher.maxEntries + 20)
  })

  it('forgets everything on clear', async () => {
    await writeStored('images', 'a', blob(3))
    await writeStored('cipher', 'b', blob(3))
    await clearStoredMedia()
    expect(await readStored('images', 'a')).toBeNull()
    expect(await readStored('cipher', 'b')).toBeNull()
  })

  it('does nothing, without throwing, when Cache Storage is unavailable', async () => {
    vi.stubGlobal('caches', undefined)
    await expect(writeStored('images', 'a', blob(3))).resolves.toBeUndefined()
    expect(await readStored('images', 'a')).toBeNull()
    await expect(clearStoredMedia()).resolves.toBeUndefined()
  })

  it('does nothing, without throwing, when the cache rejects', async () => {
    vi.stubGlobal('caches', {
      open: async () => {
        throw new Error('denied')
      },
      delete: async () => {
        throw new Error('denied')
      },
    })
    await expect(writeStored('images', 'a', blob(3))).resolves.toBeUndefined()
    expect(await readStored('images', 'a')).toBeNull()
    await expect(clearStoredMedia()).resolves.toBeUndefined()
  })
})
