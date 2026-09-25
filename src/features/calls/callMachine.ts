export type CallPhase =
  | 'idle'
  | 'outgoing-ringing'
  | 'incoming-ringing'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'ended'
  | 'failed'

export type CallEndReason =
  | 'local-hangup'
  | 'remote-hangup'
  | 'declined-by-peer'
  | 'declined-by-me'
  | 'cancelled-by-me'
  | 'cancelled-by-peer'
  | 'no-answer'
  | 'permission-denied'
  | 'failed'

export type CallState = {
  phase: CallPhase
  callId: string | null
  chatId: string | null
  peerId: string | null
  peerName: string
  video: boolean
  direction: 'outgoing' | 'incoming' | null
  connectedAt: number | null
  endReason: CallEndReason | null
}

export const idleCall: CallState = {
  phase: 'idle',
  callId: null,
  chatId: null,
  peerId: null,
  peerName: '',
  video: false,
  direction: null,
  connectedAt: null,
  endReason: null,
}

type CallTarget = {
  callId: string
  chatId: string
  peerId: string
  peerName: string
  video: boolean
}

export type CallEvent =
  | ({ type: 'START_OUTGOING' } & CallTarget)
  | ({ type: 'INCOMING' } & CallTarget)
  | { type: 'ACCEPTED' }
  | { type: 'CONNECTED'; at: number }
  | { type: 'CONNECTION_LOST' }
  | { type: 'CONNECTION_RECOVERED' }
  | { type: 'CONNECTION_FAILED' }
  | { type: 'LOCAL_HANGUP' }
  | { type: 'LOCAL_DECLINE' }
  | { type: 'REMOTE_HANGUP' }
  | { type: 'REMOTE_DECLINED' }
  | { type: 'RING_TIMEOUT' }
  | { type: 'PERMISSION_DENIED' }
  | { type: 'ANSWERED_ELSEWHERE' }
  | { type: 'SETUP_FAILED' }
  | { type: 'RESET' }

const active: CallPhase[] = [
  'outgoing-ringing',
  'incoming-ringing',
  'connecting',
  'connected',
  'reconnecting',
]

export const isActive = (phase: CallPhase): boolean => active.includes(phase)

const end = (state: CallState, endReason: CallEndReason): CallState => ({
  ...state,
  phase: 'ended',
  endReason,
})

/**
 * Pure transition function for one call. Events that make no sense in the current phase are ignored, which is
 * what makes duplicated or late network messages harmless. Concurrent calls are refused by the caller (an
 * INCOMING event while a call is active leaves the state untouched).
 */
export function callReducer(state: CallState, event: CallEvent): CallState {
  switch (event.type) {
    case 'START_OUTGOING':
      return state.phase === 'idle'
        ? {
            ...idleCall,
            phase: 'outgoing-ringing',
            callId: event.callId,
            chatId: event.chatId,
            peerId: event.peerId,
            peerName: event.peerName,
            video: event.video,
            direction: 'outgoing',
          }
        : state
    case 'INCOMING':
      return state.phase === 'idle'
        ? {
            ...idleCall,
            phase: 'incoming-ringing',
            callId: event.callId,
            chatId: event.chatId,
            peerId: event.peerId,
            peerName: event.peerName,
            video: event.video,
            direction: 'incoming',
          }
        : state
    case 'ACCEPTED':
      return state.phase === 'outgoing-ringing' ||
        state.phase === 'incoming-ringing'
        ? { ...state, phase: 'connecting' }
        : state
    case 'CONNECTED':
      return state.phase === 'connecting' || state.phase === 'reconnecting'
        ? {
            ...state,
            phase: 'connected',
            connectedAt: state.connectedAt ?? event.at,
          }
        : state
    case 'CONNECTION_LOST':
      return state.phase === 'connected'
        ? { ...state, phase: 'reconnecting' }
        : state
    case 'CONNECTION_RECOVERED':
      return state.phase === 'reconnecting'
        ? { ...state, phase: 'connected' }
        : state
    case 'CONNECTION_FAILED':
      return state.phase === 'connecting' ||
        state.phase === 'connected' ||
        state.phase === 'reconnecting'
        ? { ...state, phase: 'failed', endReason: 'failed' }
        : state
    case 'LOCAL_HANGUP':
      if (state.phase === 'outgoing-ringing')
        return end(state, 'cancelled-by-me')
      return isActive(state.phase) ? end(state, 'local-hangup') : state
    case 'LOCAL_DECLINE':
      return state.phase === 'incoming-ringing'
        ? end(state, 'declined-by-me')
        : state
    case 'REMOTE_HANGUP':
      if (state.phase === 'incoming-ringing')
        return end(state, 'cancelled-by-peer')
      return isActive(state.phase) ? end(state, 'remote-hangup') : state
    case 'REMOTE_DECLINED':
      return state.phase === 'outgoing-ringing'
        ? end(state, 'declined-by-peer')
        : state
    case 'RING_TIMEOUT':
      return state.phase === 'outgoing-ringing'
        ? end(state, 'no-answer')
        : state
    case 'PERMISSION_DENIED':
      return isActive(state.phase) ? end(state, 'permission-denied') : state
    case 'SETUP_FAILED':
      return isActive(state.phase) ? end(state, 'failed') : state
    case 'ANSWERED_ELSEWHERE':
      return state.phase === 'incoming-ringing' ? idleCall : state
    case 'RESET':
      return idleCall
  }
}

export type CallDbStatus = 'declined' | 'missed' | 'ended'

/** What to write to `calls.status` when a call ends, or null when nothing should be written. */
export function dbStatusFor(
  reason: CallEndReason,
  wasConnected: boolean,
): CallDbStatus | null {
  switch (reason) {
    case 'declined-by-me':
    case 'declined-by-peer':
      return 'declined'
    case 'cancelled-by-me':
    case 'no-answer':
    case 'cancelled-by-peer':
      return 'missed'
    case 'permission-denied':
      return wasConnected ? 'ended' : 'missed'
    case 'local-hangup':
    case 'remote-hangup':
    case 'failed':
      return 'ended'
  }
}

export function endMessage(reason: CallEndReason | null): string {
  switch (reason) {
    case 'declined-by-peer':
      return 'Call declined'
    case 'no-answer':
      return 'No answer'
    case 'cancelled-by-peer':
      return 'Missed call'
    case 'permission-denied':
      return 'Microphone or camera access was blocked'
    case 'failed':
      return 'Call failed'
    default:
      return 'Call ended'
  }
}
