/**
 * Guards for a function that fetches user-supplied URLs. Without these, a link preview endpoint can be used to
 * reach internal services (cloud metadata, localhost, private networks). Pure and dependency-free so it is
 * unit-tested from the app's test suite.
 */

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    value = value * 256 + octet
  }
  return value
}

const blockedV4: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]

function inRange(value: number, base: string, bits: number): boolean {
  const start = ipv4ToNumber(base) ?? 0
  const size = 2 ** (32 - bits)
  return value >= start && value < start + size
}

/** True for any address that must never be fetched: private, loopback, link-local, multicast, reserved. */
export function isPrivateAddress(address: string): boolean {
  const ip = address
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
  const asV4 = ipv4ToNumber(ip)
  if (asV4 !== null)
    return blockedV4.some(([base, bits]) => inRange(asV4, base, bits))
  if (!ip.includes(':')) return false
  if (ip === '::' || ip === '::1') return true
  const mapped = /^(?:0{0,4}:){0,5}(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(
    ip,
  )
  if (mapped?.[1]) return isPrivateAddress(mapped[1])
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ip)
  if (mappedHex?.[1] && mappedHex[2]) {
    const high = parseInt(mappedHex[1], 16)
    const low = parseInt(mappedHex[2], 16)
    return isPrivateAddress(
      `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`,
    )
  }
  const first = parseInt(ip.split(':')[0] || '0', 16)
  if ((first & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
  if ((first & 0xffc0) === 0xfe80) return true // fe80::/10 link local
  if ((first & 0xff00) === 0xff00) return true // ff00::/8 multicast
  return false
}

const blockedHostSuffixes = [
  '.localhost',
  '.local',
  '.internal',
  '.lan',
  '.home',
  '.corp',
  '.intranet',
]

export class UnsafeUrlError extends Error {}

/** Parses a URL and rejects anything that is not a plain public http(s) address. DNS results are checked separately. */
export function assertPublicHttpUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new UnsafeUrlError('That is not a valid URL.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new UnsafeUrlError('Only http and https links can be previewed.')
  if (url.username || url.password)
    throw new UnsafeUrlError('Links with credentials cannot be previewed.')
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (
    host === 'localhost' ||
    blockedHostSuffixes.some((suffix) => host.endsWith(suffix)) ||
    (!host.includes('.') && !host.includes(':'))
  ) {
    throw new UnsafeUrlError('That address cannot be previewed.')
  }
  if (isPrivateAddress(host))
    throw new UnsafeUrlError('That address cannot be previewed.')
  return url
}
