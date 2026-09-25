import { useEffect, useState } from 'react'

type Entry = {
  url: string
  holders: number
  timer?: ReturnType<typeof setTimeout>
}

/** How long an unused object URL is kept, so scrolling back or re-opening a screen does not rebuild it. */
export const REVOKE_DELAY_MS = 20_000

const entries = new WeakMap<Blob, Entry>()

/** Object URL for `blob`, shared by everything that shows it. Pair every call with `releaseObjectUrl`. */
export function acquireObjectUrl(blob: Blob): string {
  let entry = entries.get(blob)
  if (!entry) {
    entry = { url: URL.createObjectURL(blob), holders: 0 }
    entries.set(blob, entry)
  }
  entry.holders += 1
  clearTimeout(entry.timer)
  entry.timer = undefined
  return entry.url
}

/**
 * Object URLs pin their blob in memory until revoked, so a chat full of photos would keep every one alive for the
 * whole session. The URL is revoked shortly after the last holder lets go.
 */
export function releaseObjectUrl(blob: Blob): void {
  const entry = entries.get(blob)
  if (!entry) return
  entry.holders = Math.max(0, entry.holders - 1)
  if (entry.holders > 0) return
  entry.timer = setTimeout(() => {
    if (entry.holders > 0) return
    URL.revokeObjectURL(entry.url)
    entries.delete(blob)
  }, REVOKE_DELAY_MS)
}

/** An object URL for a blob that lives exactly as long as the component shows it. */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [held, setHeld] = useState<{ blob: Blob; url: string } | null>(null)
  useEffect(() => {
    if (!blob) {
      setHeld(null)
      return
    }
    setHeld({ blob, url: acquireObjectUrl(blob) })
    return () => releaseObjectUrl(blob)
  }, [blob])
  return held && held.blob === blob ? held.url : null
}
