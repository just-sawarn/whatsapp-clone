import { formatDuration } from '../../lib/format'
import type { CallRecord } from './callService'

export type CallOutcome =
  'completed' | 'missed' | 'declined' | 'unanswered' | 'in-progress'

export type CallDescription = {
  direction: 'incoming' | 'outgoing'
  outcome: CallOutcome
  label: string
  duration: string | null
}

/** How a history row reads from the current user's point of view. */
export function describeCall(call: CallRecord, me: string): CallDescription {
  const direction = call.callerId === me ? 'outgoing' : 'incoming'
  const kind = call.type === 'video' ? 'video' : 'voice'
  let outcome: CallOutcome
  switch (call.status) {
    case 'ended':
      outcome = 'completed'
      break
    case 'declined':
      outcome = 'declined'
      break
    case 'missed':
      outcome = direction === 'incoming' ? 'missed' : 'unanswered'
      break
    default:
      outcome = 'in-progress'
  }
  const label =
    outcome === 'missed'
      ? `Missed ${kind} call`
      : outcome === 'unanswered'
        ? `No answer`
        : outcome === 'declined'
          ? direction === 'incoming'
            ? 'You declined'
            : 'Declined'
          : outcome === 'in-progress'
            ? 'Ringing'
            : `${direction === 'incoming' ? 'Incoming' : 'Outgoing'} ${kind} call`
  const seconds = call.endedAt
    ? (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) /
      1000
    : 0
  return {
    direction,
    outcome,
    label,
    duration:
      outcome === 'completed' && seconds > 0 ? formatDuration(seconds) : null,
  }
}
