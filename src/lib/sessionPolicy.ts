/**
 * How long a login lasts on this device. The clock starts when the user actually signs in and is not extended
 * by activity. Supabase keeps refreshing the access token behind the scenes, so the app enforces this limit
 * itself; also set "Time-box user sessions" to 7 days in the Supabase Auth settings if your plan allows it, so
 * the server enforces the same limit.
 */
export const LOGIN_TTL_MS = 7 * 24 * 60 * 60 * 1000

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const keyFor = (userId: string) => `wa:login-at:${userId}`

function defaultStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** Marks now as the start of a login (an explicit sign-in or sign-up). */
export function recordLogin(
  userId: string,
  now = Date.now(),
  store: Store | null = defaultStore(),
): number {
  try {
    store?.setItem(keyFor(userId), String(now))
  } catch {
    // Without storage the limit cannot be tracked across reloads; the in-memory session still ends on sign-out.
  }
  return now
}

export function loginStartedAt(
  userId: string,
  store: Store | null = defaultStore(),
): number | null {
  try {
    const value = Number(store?.getItem(keyFor(userId)))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

/**
 * The start of the current login. Sessions that pre-date this feature, or arrive through an emailed link, have no
 * record yet, so their 7 days start the first time the app sees them.
 */
export function ensureLoginRecorded(
  userId: string,
  now = Date.now(),
  store: Store | null = defaultStore(),
): number {
  return loginStartedAt(userId, store) ?? recordLogin(userId, now, store)
}

export function clearLogin(
  userId: string,
  store: Store | null = defaultStore(),
): void {
  try {
    store?.removeItem(keyFor(userId))
  } catch {
    // ignore
  }
}

export const loginExpiresAt = (startedAt: number): number =>
  startedAt + LOGIN_TTL_MS

export const isLoginExpired = (startedAt: number, now = Date.now()): boolean =>
  now >= loginExpiresAt(startedAt)
