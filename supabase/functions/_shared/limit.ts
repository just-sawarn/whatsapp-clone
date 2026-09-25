/**
 * Best-effort per-user rate limit held in memory. Each function instance keeps its own counters, so this
 * blunts casual abuse rather than providing a hard global quota; back it with a database counter if you need one.
 */
const hits = new Map<string, number[]>()

export function rateLimited(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): boolean {
  const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs)
  if (recent.length >= limit) {
    hits.set(key, recent)
    return true
  }
  recent.push(now)
  hits.set(key, recent)
  return false
}
