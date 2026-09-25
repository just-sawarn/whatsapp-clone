/**
 * A small on-device store for images this app has already fetched, built on the Cache Storage API. It survives
 * reloads, so profile photos, group photos, statuses and chat thumbnails are fetched once instead of on every visit
 * (their signed URLs change every time, so the browser's own HTTP cache can never reuse them).
 *
 * Two stores, chosen by what is safe to keep:
 *  - `images`: plaintext profile, group and status pictures (they are shown on screen anyway).
 *  - `cipher`: chat attachments exactly as the server holds them, still encrypted. Decrypting again is cheap and
 *    the key never touches the disk. Only small files are kept, so it cannot grow without bound.
 * Everything is removed on logout. Any failure (private mode, no Cache Storage) just means no caching.
 */
export type StoreName = 'images' | 'cipher'

type Limits = { cacheName: string; maxEntries: number; maxBytes: number }

export const stores: Record<StoreName, Limits> = {
  images: {
    cacheName: 'chatbit-images-v1',
    maxEntries: 400,
    maxBytes: 2 * 1024 * 1024,
  },
  cipher: {
    cacheName: 'chatbit-cipher-v1',
    maxEntries: 150,
    maxBytes: 1024 * 1024,
  },
}

const writesSincePrune: Record<StoreName, number> = { images: 0, cipher: 0 }
const PRUNE_EVERY = 20

/** Cache Storage keys are requests; this address is never fetched, it only names the entry. */
function requestFor(key: string): Request {
  const path = key.split('/').map(encodeURIComponent).join('/')
  return new Request(`https://media.chatbit.invalid/${path}`)
}

async function open(name: StoreName): Promise<Cache | null> {
  try {
    if (typeof caches === 'undefined') return null
    return await caches.open(stores[name].cacheName)
  } catch {
    return null
  }
}

export async function readStored(
  name: StoreName,
  key: string,
): Promise<Blob | null> {
  try {
    const cache = await open(name)
    const hit = await cache?.match(requestFor(key))
    return hit ? await hit.blob() : null
  } catch {
    return null
  }
}

export async function writeStored(
  name: StoreName,
  key: string,
  blob: Blob,
): Promise<void> {
  const { maxBytes } = stores[name]
  if (blob.size === 0 || blob.size > maxBytes) return
  try {
    const cache = await open(name)
    if (!cache) return
    await cache.put(
      requestFor(key),
      new Response(blob, {
        headers: { 'Content-Type': blob.type || 'application/octet-stream' },
      }),
    )
    writesSincePrune[name] += 1
    if (writesSincePrune[name] >= PRUNE_EVERY) {
      writesSincePrune[name] = 0
      await prune(cache, stores[name].maxEntries)
    }
  } catch {
    // Quota exceeded or storage unavailable: the image simply is not cached.
  }
}

/** Cache.keys() lists entries in insertion order, so the oldest go first. */
async function prune(cache: Cache, maxEntries: number): Promise<void> {
  const all = await cache.keys()
  for (const request of all.slice(0, Math.max(0, all.length - maxEntries)))
    await cache.delete(request)
}

/** Forgets every stored picture: called on logout so a shared computer keeps nobody's photos. */
export async function clearStoredMedia(): Promise<void> {
  try {
    if (typeof caches === 'undefined') return
    await Promise.all(
      Object.values(stores).map((limits) => caches.delete(limits.cacheName)),
    )
  } catch {
    // Nothing to clear.
  }
}
