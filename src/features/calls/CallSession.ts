import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { isSignal, rtcConfiguration, type SignalMessage } from './rtcConfig'

export type PeerHealth = 'connected' | 'lost' | 'failed'

export type SessionHandlers = {
  onRemoteStream: (stream: MediaStream) => void
  onPeerHealth: (health: PeerHealth) => void
  /** The callee joined the signalling channel and is ready for an offer (caller side). */
  onAccept: () => void
  onHangup: () => void
}

const RESTART_DELAY_MS = 3000
const FAIL_AFTER_MS = 12000

/**
 * One WebRTC call over a Supabase Realtime broadcast channel used purely for signalling (offer, answer, ICE
 * candidates). The audio and video travel peer to peer. This class is deliberately free of React so the
 * lifecycle is easy to follow: open() → send/receive signals → close().
 *
 * Signalling channels are named by an unguessable call id that only chat members learn from the `calls` row;
 * the SDP carries no message keys, and media is protected by DTLS-SRTP. It is not tied to the users'
 * identity keys, which is a known limit documented in the README.
 */
export class CallSession {
  private pc: RTCPeerConnection | null = null
  private channel: RealtimeChannel | null = null
  private pendingCandidates: RTCIceCandidateInit[] = []
  private restartTimer: number | undefined
  private failTimer: number | undefined
  private restarted = false
  private closed = false

  constructor(
    readonly callId: string,
    private readonly isCaller: boolean,
    private readonly local: MediaStream,
    private readonly on: SessionHandlers,
  ) {}

  async open(): Promise<void> {
    if (!supabase) throw new Error('Supabase is not configured.')
    const channel = supabase.channel(`call:${this.callId}`)
    channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
      if (isSignal(payload)) void this.receive(payload)
    })
    this.channel = channel
    await new Promise<void>((resolve, reject) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve()
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')
          reject(new Error('Could not reach the call service.'))
      })
    })
  }

  send(message: SignalMessage): void {
    void this.channel?.send({
      type: 'broadcast',
      event: 'signal',
      payload: message,
    })
  }

  /** Caller: create the peer connection and offer once the callee has accepted. */
  async beginOffer(): Promise<void> {
    await this.negotiate(false)
  }

  private peer(): RTCPeerConnection {
    if (this.pc) return this.pc
    const pc = new RTCPeerConnection(rtcConfiguration())
    for (const track of this.local.getTracks()) pc.addTrack(track, this.local)
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.send({ kind: 'ice', candidate: candidate.toJSON() })
    }
    pc.ontrack = ({ streams }) => {
      if (streams[0]) this.on.onRemoteStream(streams[0])
    }
    pc.onconnectionstatechange = () =>
      this.onConnectionState(pc.connectionState)
    this.pc = pc
    return pc
  }

  private async negotiate(iceRestart: boolean): Promise<void> {
    const pc = this.peer()
    const offer = await pc.createOffer({ iceRestart })
    await pc.setLocalDescription(offer)
    this.send({ kind: 'offer', description: offer })
  }

  private onConnectionState(state: RTCPeerConnectionState): void {
    if (this.closed) return
    if (state === 'connected') {
      window.clearTimeout(this.restartTimer)
      window.clearTimeout(this.failTimer)
      this.restarted = false
      this.on.onPeerHealth('connected')
    } else if (state === 'disconnected') {
      this.on.onPeerHealth('lost')
      this.armFailTimer()
      // Only the caller drives renegotiation, so an ICE restart cannot be started by both sides at once.
      if (this.isCaller)
        this.restartTimer = window.setTimeout(
          () => void this.restartIce(),
          RESTART_DELAY_MS,
        )
    } else if (state === 'failed') {
      this.on.onPeerHealth('lost')
      if (this.isCaller && !this.restarted) void this.restartIce()
      this.armFailTimer()
    }
  }

  private armFailTimer(): void {
    window.clearTimeout(this.failTimer)
    this.failTimer = window.setTimeout(() => {
      if (!this.closed && this.pc?.connectionState !== 'connected')
        this.on.onPeerHealth('failed')
    }, FAIL_AFTER_MS)
  }

  private async restartIce(): Promise<void> {
    if (this.closed || !this.pc || this.pc.connectionState === 'connected')
      return
    this.restarted = true
    try {
      await this.negotiate(true)
    } catch {
      this.on.onPeerHealth('failed')
    }
  }

  private async flushCandidates(pc: RTCPeerConnection): Promise<void> {
    const queued = this.pendingCandidates
    this.pendingCandidates = []
    for (const candidate of queued)
      await pc.addIceCandidate(candidate).catch(() => undefined)
  }

  private async receive(message: SignalMessage): Promise<void> {
    if (this.closed) return
    try {
      switch (message.kind) {
        case 'accept':
          this.on.onAccept()
          break
        case 'offer': {
          const pc = this.peer()
          await pc.setRemoteDescription(message.description)
          await this.flushCandidates(pc)
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          this.send({ kind: 'answer', description: answer })
          break
        }
        case 'answer':
          if (this.pc) {
            await this.pc.setRemoteDescription(message.description)
            await this.flushCandidates(this.pc)
          }
          break
        case 'ice':
          if (this.pc?.remoteDescription)
            await this.pc
              .addIceCandidate(message.candidate)
              .catch(() => undefined)
          else this.pendingCandidates.push(message.candidate)
          break
        case 'hangup':
          this.on.onHangup()
          break
      }
    } catch {
      this.on.onPeerHealth('failed')
    }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    window.clearTimeout(this.restartTimer)
    window.clearTimeout(this.failTimer)
    this.pc?.close()
    this.pc = null
    for (const track of this.local.getTracks()) track.stop()
    if (this.channel && supabase) void supabase.removeChannel(this.channel)
    this.channel = null
  }
}
