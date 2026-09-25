const localHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Turns a configured address into a clean origin (no path, no trailing slash), or returns the fallback when it is
 * empty or unusable. Anything other than https is rejected outside localhost, so a typo cannot send verification
 * emails pointing at an unencrypted address.
 */
export function normalizeAppUrl(
  value: string | undefined,
  fallback: string,
): string {
  const trimmed = value?.trim()
  if (!trimmed) return fallback
  try {
    const url = new URL(trimmed)
    if (url.protocol === 'https:') return url.origin
    if (url.protocol === 'http:' && localHosts.has(url.hostname))
      return url.origin
    return fallback
  } catch {
    return fallback
  }
}

/**
 * The public address of this app, used for links that leave it: email verification and password-reset redirects
 * and community invite links. Set VITE_APP_URL for production; without it the address the app is open on is used.
 */
export function appUrl(): string {
  return normalizeAppUrl(import.meta.env.VITE_APP_URL, window.location.origin)
}
