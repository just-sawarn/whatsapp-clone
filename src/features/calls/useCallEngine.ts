import { useCallback, useEffect, useRef, useState } from 'react'
import {
  callReducer,
  dbStatusFor,
  idleCall,
  isActive,
  type CallEndReason,
  type CallEvent,
  type CallPhase,
  type CallState,
} from './callMachine'
import { CallSession, type SessionHandlers } from './CallSession'
import {
  createCall,
  finishCall,
  joinCall,
  markAccepted,
  type CallRecord,
} from './callService'

export type CallTarget = { chatId: string; peerId: string; peerName: string }

const RING_TIMEOUT_MS = 45_000
/** Outcomes this client is responsible for recording; the other side records the rest. */
const WRITER_REASONS = new Set<CallEndReason>([
  'local-hangup',
  'cancelled-by-me',
  'no-answer',
  'declined-by-me',
  'failed',
  'permission-denied',
])
const SHOW_ENDED_FOR_MS: Partial<Record<CallEndReason, number>> = {
  'declined-by-me': 0,
  'local-hangup': 700,
  'cancelled-by-me': 500,
}

function getMedia(video: boolean): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: video
      ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
      : false,
  })
}

/**
 * Owns the lifecycle of at most one call: the pure state machine decides what is allowed, a CallSession does
 * the WebRTC work, and the calls table records the outcome for the history.
 */
export function useCallEngine(
  userId: string,
  notify: (message: string, kind: 'error' | 'info') => void,
) {
  const [state, setState] = useState<CallState>(idleCall)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [speakerMuted, setSpeakerMuted] = useState(false)
  const stateRef = useRef<CallState>(idleCall)
  const session = useRef<CallSession | null>(null)
  const ringTimer = useRef<number | undefined>(undefined)
  const accepting = useRef(false)

  // Read through a function so TypeScript does not narrow the ref's phase across an await.
  const phaseNow = useCallback((): CallPhase => stateRef.current.phase, [])

  const dispatch = useCallback((event: CallEvent): CallState => {
    const next = callReducer(stateRef.current, event)
    if (next !== stateRef.current) {
      stateRef.current = next
      setState(next)
    }
    return next
  }, [])

  const handlers = useCallback(
    (): SessionHandlers => ({
      onRemoteStream: setRemoteStream,
      onPeerHealth: (health) =>
        dispatch(
          health === 'connected'
            ? { type: 'CONNECTED', at: Date.now() }
            : health === 'lost'
              ? { type: 'CONNECTION_LOST' }
              : { type: 'CONNECTION_FAILED' },
        ),
      onAccept: () => {
        if (stateRef.current.phase !== 'outgoing-ringing') return
        window.clearTimeout(ringTimer.current)
        dispatch({ type: 'ACCEPTED' })
        void session.current
          ?.beginOffer()
          .catch(() => dispatch({ type: 'SETUP_FAILED' }))
      },
      onHangup: () => dispatch({ type: 'REMOTE_HANGUP' }),
    }),
    [dispatch],
  )

  const startCall = useCallback(
    async (target: CallTarget, video: boolean) => {
      if (stateRef.current.phase !== 'idle') return
      const callId = crypto.randomUUID()
      dispatch({ type: 'START_OUTGOING', callId, video, ...target })
      let stream: MediaStream
      try {
        stream = await getMedia(video)
      } catch {
        dispatch({ type: 'PERMISSION_DENIED' })
        return
      }
      if (
        stateRef.current.callId !== callId ||
        phaseNow() !== 'outgoing-ringing'
      ) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      setLocalStream(stream)
      const next = new CallSession(callId, true, stream, handlers())
      session.current = next
      try {
        await next.open()
        await createCall(callId, target.chatId, userId, video)
        await joinCall(callId, userId)
      } catch {
        notify(
          'Could not place the call. Check your connection and try again.',
          'error',
        )
        dispatch({ type: 'SETUP_FAILED' })
        return
      }
      ringTimer.current = window.setTimeout(
        () => dispatch({ type: 'RING_TIMEOUT' }),
        RING_TIMEOUT_MS,
      )
    },
    [dispatch, handlers, notify, phaseNow, userId],
  )

  const acceptCall = useCallback(async () => {
    const current = stateRef.current
    if (current.phase !== 'incoming-ringing' || !current.callId) return
    const callId = current.callId
    let stream: MediaStream
    try {
      stream = await getMedia(current.video)
    } catch {
      notify(
        'Microphone or camera access is blocked, so the call was declined.',
        'error',
      )
      dispatch({ type: 'LOCAL_DECLINE' })
      return
    }
    if (
      stateRef.current.callId !== callId ||
      phaseNow() !== 'incoming-ringing'
    ) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }
    accepting.current = true
    setLocalStream(stream)
    const next = new CallSession(callId, false, stream, handlers())
    session.current = next
    try {
      await next.open()
      await joinCall(callId, userId)
      await markAccepted(callId)
      dispatch({ type: 'ACCEPTED' })
      next.send({ kind: 'accept' })
    } catch {
      notify('The call is no longer available.', 'info')
      dispatch({ type: 'SETUP_FAILED' })
    } finally {
      accepting.current = false
    }
  }, [dispatch, handlers, notify, phaseNow, userId])

  const declineCall = useCallback(
    () => dispatch({ type: 'LOCAL_DECLINE' }),
    [dispatch],
  )
  const hangUp = useCallback(
    () => dispatch({ type: 'LOCAL_HANGUP' }),
    [dispatch],
  )

  /** A call row addressed to me appeared. Returns false when I am already busy (and declines it). */
  const receiveIncoming = useCallback(
    (call: CallRecord, target: CallTarget): boolean => {
      if (stateRef.current.phase !== 'idle') {
        void finishCall(call.id, userId, 'declined').catch(() => undefined)
        return false
      }
      dispatch({
        type: 'INCOMING',
        callId: call.id,
        video: call.type === 'video',
        ...target,
      })
      return true
    },
    [dispatch, userId],
  )

  /** Reacts to the database row changing, which is how declines, cancels and other-tab answers reach me. */
  const onCallUpdate = useCallback(
    (call: CallRecord) => {
      const current = stateRef.current
      if (call.id !== current.callId) return
      if (
        call.status === 'accepted' &&
        current.phase === 'incoming-ringing' &&
        !accepting.current
      )
        dispatch({ type: 'ANSWERED_ELSEWHERE' })
      else if (
        call.status === 'declined' &&
        current.phase === 'outgoing-ringing'
      )
        dispatch({ type: 'REMOTE_DECLINED' })
      else if (
        (call.status === 'missed' || call.status === 'ended') &&
        isActive(current.phase) &&
        current.phase !== 'outgoing-ringing'
      )
        dispatch({ type: 'REMOTE_HANGUP' })
    },
    [dispatch],
  )

  // When a call ends: tell the peer, record the outcome, release camera and microphone, then clear the screen.
  useEffect(() => {
    if (state.phase !== 'ended' && state.phase !== 'failed') return
    const reason = state.endReason ?? 'failed'
    const active = session.current
    if (
      active &&
      (reason === 'local-hangup' ||
        reason === 'cancelled-by-me' ||
        reason === 'failed')
    )
      active.send({ kind: 'hangup' })
    active?.close()
    session.current = null
    window.clearTimeout(ringTimer.current)
    setLocalStream(null)
    setRemoteStream(null)
    const status = dbStatusFor(reason, state.connectedAt !== null)
    if (state.callId && status && WRITER_REASONS.has(reason))
      void finishCall(state.callId, userId, status).catch(() => undefined)
    const timer = window.setTimeout(() => {
      setMuted(false)
      setCameraOff(false)
      setSpeakerMuted(false)
      dispatch({ type: 'RESET' })
    }, SHOW_ENDED_FOR_MS[reason] ?? 2500)
    return () => window.clearTimeout(timer)
  }, [
    dispatch,
    state.callId,
    state.connectedAt,
    state.endReason,
    state.phase,
    userId,
  ])

  // Leaving the page mid-call hangs up so the other person is not left ringing into the void.
  useEffect(() => {
    const leave = () => {
      const current = stateRef.current
      if (!isActive(current.phase)) return
      session.current?.send({ kind: 'hangup' })
      if (current.callId)
        void finishCall(
          current.callId,
          userId,
          current.phase === 'incoming-ringing'
            ? 'missed'
            : current.connectedAt
              ? 'ended'
              : 'missed',
        ).catch(() => undefined)
    }
    window.addEventListener('pagehide', leave)
    return () => {
      window.removeEventListener('pagehide', leave)
      leave()
      session.current?.close()
    }
  }, [userId])

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      localStream?.getAudioTracks().forEach((track) => {
        track.enabled = current
      })
      return !current
    })
  }, [localStream])

  const toggleCamera = useCallback(() => {
    setCameraOff((current) => {
      localStream?.getVideoTracks().forEach((track) => {
        track.enabled = current
      })
      return !current
    })
  }, [localStream])

  return {
    state,
    localStream,
    remoteStream,
    muted,
    cameraOff,
    speakerMuted,
    startCall,
    acceptCall,
    declineCall,
    hangUp,
    receiveIncoming,
    onCallUpdate,
    toggleMute,
    toggleCamera,
    toggleSpeaker: () => setSpeakerMuted((value) => !value),
  }
}
