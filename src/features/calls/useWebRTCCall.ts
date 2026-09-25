import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

type CallSignal = { kind: 'offer' | 'answer' | 'ice-candidate' | 'hangup'; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }

type CallState = 'idle' | 'calling' | 'connecting' | 'connected' | 'ended' | 'failed'

const iceServers: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    // Add TURN credentials for NAT traversal reliability.
  ],
}

export function useWebRTCCall(userId: string | undefined) {
  const [callState, setCallState] = useState<CallState>('idle')
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null)
  const callIdRef = useRef<string | null>(null)

  const cleanup = useCallback(async () => {
    peerRef.current?.close()
    peerRef.current = null
    if (channelRef.current && supabase) await supabase.removeChannel(channelRef.current)
    channelRef.current = null
    localStream?.getTracks().forEach((track) => track.stop())
    setLocalStream(null)
    setRemoteStream(null)
    callIdRef.current = null
  }, [localStream])

  const finish = useCallback(async (state: CallState = 'ended') => {
    if (channelRef.current) await channelRef.current.send({ type: 'broadcast', event: 'signal', payload: { kind: 'hangup' } satisfies CallSignal })
    setCallState(state)
    await cleanup()
  }, [cleanup])

  const startCall = useCallback(async (callId: string, video: boolean) => {
    if (!supabase || !userId) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video })
      const peer = new RTCPeerConnection(iceServers)
      const channel = supabase.channel(`call:${callId}`)
      peer.onicecandidate = (event) => { if (event.candidate) void channel.send({ type: 'broadcast', event: 'signal', payload: { kind: 'ice-candidate', candidate: event.candidate.toJSON() } satisfies CallSignal }) }
      peer.ontrack = (event) => setRemoteStream(event.streams[0] ?? null)
      peer.onconnectionstatechange = () => { if (peer.connectionState === 'connected') setCallState('connected'); if (peer.connectionState === 'failed') void finish('failed') }
      stream.getTracks().forEach((track) => peer.addTrack(track, stream))
      channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
        const signal = payload as CallSignal
        if (signal.kind === 'answer' && signal.description) void peer.setRemoteDescription(signal.description)
        if (signal.kind === 'ice-candidate' && signal.candidate) void peer.addIceCandidate(signal.candidate)
        if (signal.kind === 'hangup') void finish()
      })
      await channel.subscribe()
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      await channel.send({ type: 'broadcast', event: 'signal', payload: { kind: 'offer', description: offer } satisfies CallSignal })
      peerRef.current = peer
      channelRef.current = channel
      callIdRef.current = callId
      setLocalStream(stream)
      setCallState('calling')
    } catch {
      setCallState('failed')
      await cleanup()
    }
  }, [cleanup, finish, userId])

  const toggleMute = useCallback(() => {
    localStream?.getAudioTracks().forEach((track) => { track.enabled = muted })
    setMuted((current) => !current)
  }, [localStream, muted])

  const toggleCamera = useCallback(() => {
    localStream?.getVideoTracks().forEach((track) => { track.enabled = cameraOff })
    setCameraOff((current) => !current)
  }, [cameraOff, localStream])

  useEffect(() => () => { void cleanup() }, [cleanup])

  return { callState, localStream, remoteStream, muted, cameraOff, startCall, toggleMute, toggleCamera, endCall: () => finish() }
}
