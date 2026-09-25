import { describe, expect, it } from 'vitest'
import { describeCall } from './callDisplay'
import type { CallRecord } from './callService'

const base: CallRecord = {
  id: 'c',
  chatId: 'chat',
  callerId: 'me',
  type: 'voice',
  status: 'ended',
  startedAt: '2026-01-01T10:00:00Z',
  endedAt: '2026-01-01T10:02:05Z',
}

describe('describeCall', () => {
  it('describes a completed call with its length', () => {
    expect(describeCall(base, 'me')).toMatchObject({
      direction: 'outgoing',
      outcome: 'completed',
      label: 'Outgoing voice call',
      duration: '2:05',
    })
    expect(
      describeCall({ ...base, callerId: 'them', type: 'video' }, 'me'),
    ).toMatchObject({ direction: 'incoming', label: 'Incoming video call' })
  })

  it('tells a missed incoming call from an unanswered outgoing one', () => {
    expect(
      describeCall({ ...base, callerId: 'them', status: 'missed' }, 'me'),
    ).toMatchObject({
      outcome: 'missed',
      label: 'Missed voice call',
      duration: null,
    })
    expect(describeCall({ ...base, status: 'missed' }, 'me')).toMatchObject({
      outcome: 'unanswered',
      label: 'No answer',
    })
  })

  it('labels declines from each side', () => {
    expect(
      describeCall({ ...base, callerId: 'them', status: 'declined' }, 'me')
        .label,
    ).toBe('You declined')
    expect(describeCall({ ...base, status: 'declined' }, 'me').label).toBe(
      'Declined',
    )
  })
})
