import { supabase } from './supabase'

type Waiter = {
  path: string
  resolve: (url: string) => void
  reject: (error: Error) => void
}

const SIGNED_URL_SECONDS = 3600
const BATCH_DELAY_MS = 8
const MAX_BATCH = 100

const queues = new Map<string, Waiter[]>()
let timer: ReturnType<typeof setTimeout> | undefined

async function flushBucket(bucket: string, waiters: Waiter[]): Promise<void> {
  if (!supabase) {
    for (const waiter of waiters)
      waiter.reject(new Error('Supabase is not configured.'))
    return
  }
  const paths = [...new Set(waiters.map((waiter) => waiter.path))]
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, SIGNED_URL_SECONDS)
  if (error || !data) {
    for (const waiter of waiters)
      waiter.reject(new Error(error?.message ?? 'Could not sign the link.'))
    return
  }
  const results = new Map(data.map((entry) => [entry.path, entry]))
  for (const waiter of waiters) {
    const entry = results.get(waiter.path)
    if (entry?.signedUrl) waiter.resolve(entry.signedUrl)
    else waiter.reject(new Error(entry?.error ?? 'File not found.'))
  }
}

function flush(): void {
  timer = undefined
  const pending = [...queues]
  queues.clear()
  for (const [bucket, waiters] of pending)
    for (let start = 0; start < waiters.length; start += MAX_BATCH)
      void flushBucket(bucket, waiters.slice(start, start + MAX_BATCH))
}

/**
 * A signed URL for one private object. Requests made within a few milliseconds of each other (a chat list drawing
 * thirty avatars) are sent to Storage as a single call, instead of one round trip per picture.
 */
export function signedUrl(bucket: string, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const waiters = queues.get(bucket) ?? []
    waiters.push({ path, resolve, reject })
    queues.set(bucket, waiters)
    timer ??= setTimeout(flush, BATCH_DELAY_MS)
  })
}
