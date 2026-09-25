const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Whole calendar days from `date` to `now` (0 = today, 1 = yesterday). */
export function daysAgo(date: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS)
}

export function formatClock(iso: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}

/** Chat-list timestamp: time today, "Yesterday", weekday within the week, otherwise a short date. */
export function formatChatTime(
  iso: string,
  now = new Date(),
  locale?: string,
): string {
  const date = new Date(iso)
  const age = daysAgo(date, now)
  if (age <= 0) return formatClock(iso, locale)
  if (age === 1) return 'Yesterday'
  if (age < 7)
    return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date)
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

/** Divider label between days in a conversation. */
export function formatDayLabel(
  iso: string,
  now = new Date(),
  locale?: string,
): string {
  const date = new Date(iso)
  const age = daysAgo(date, now)
  if (age <= 0) return 'Today'
  if (age === 1) return 'Yesterday'
  if (age < 7)
    return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date)
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

export function formatLastSeen(
  iso: string,
  now = new Date(),
  locale?: string,
): string {
  const age = daysAgo(new Date(iso), now)
  if (age <= 0) return `last seen today at ${formatClock(iso, locale)}`
  if (age === 1) return `last seen yesterday at ${formatClock(iso, locale)}`
  return `last seen ${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(iso))}`
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function sameDay(a: Date, b: Date): boolean {
  return startOfDay(a) === startOfDay(b)
}
