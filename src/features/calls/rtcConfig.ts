/**
 * ICE servers for WebRTC. Public STUN discovers each side's address, which is enough on most home networks.
 * Symmetric NATs, corporate firewalls and some mobile carriers need a TURN relay to carry the media; the
 * server is configured through VITE_TURN_* so credentials never live in source control.
 */
export function rtcConfiguration(): RTCConfiguration {
  const servers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ]
  const url = import.meta.env.VITE_TURN_URL
  if (url) {
    servers.push({
      urls: url,
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    })
  }
  return { iceServers: servers }
}

export const turnConfigured = Boolean(import.meta.env.VITE_TURN_URL)

export type SignalMessage =
  | { kind: 'accept' }
  | { kind: 'offer'; description: RTCSessionDescriptionInit }
  | { kind: 'answer'; description: RTCSessionDescriptionInit }
  | { kind: 'ice'; candidate: RTCIceCandidateInit }
  | { kind: 'hangup' }

export function isSignal(value: unknown): value is SignalMessage {
  if (typeof value !== 'object' || value === null || !('kind' in value))
    return false
  const { kind } = value as { kind: unknown }
  return (
    kind === 'accept' ||
    kind === 'offer' ||
    kind === 'answer' ||
    kind === 'ice' ||
    kind === 'hangup'
  )
}
