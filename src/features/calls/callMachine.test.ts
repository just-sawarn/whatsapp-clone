import { describe, expect, it } from 'vitest'
import {
  callReducer,
  dbStatusFor,
  idleCall,
  isActive,
  type CallEvent,
  type CallState,
} from './callMachine'

const target = {
  callId: 'c1',
  chatId: 'chat',
  peerId: 'peer',
  peerName: 'Priya',
  video: false,
}
const run = (events: CallEvent[], from: CallState = idleCall) =>
  events.reduce(callReducer, from)

describe('outgoing call', () => {
  it('rings, connects, and ends with a hangup', () => {
    const connected = run([
      { type: 'START_OUTGOING', ...target },
      { type: 'ACCEPTED' },
      { type: 'CONNECTED', at: 1000 },
    ])
    expect(connected).toMatchObject({
      phase: 'connected',
      direction: 'outgoing',
      connectedAt: 1000,
    })
    expect(run([{ type: 'LOCAL_HANGUP' }], connected)).toMatchObject({
      phase: 'ended',
      endReason: 'local-hangup',
    })
    expect(run([{ type: 'REMOTE_HANGUP' }], connected)).toMatchObject({
      phase: 'ended',
      endReason: 'remote-hangup',
    })
  })

  it('handles the callee declining, the caller cancelling, and no answer', () => {
    const ringing = run([{ type: 'START_OUTGOING', ...target }])
    expect(run([{ type: 'REMOTE_DECLINED' }], ringing).endReason).toBe(
      'declined-by-peer',
    )
    expect(run([{ type: 'LOCAL_HANGUP' }], ringing).endReason).toBe(
      'cancelled-by-me',
    )
    expect(run([{ type: 'RING_TIMEOUT' }], ringing).endReason).toBe('no-answer')
  })

  it('reports blocked media permission', () => {
    expect(
      run([
        { type: 'START_OUTGOING', ...target },
        { type: 'PERMISSION_DENIED' },
      ]).endReason,
    ).toBe('permission-denied')
  })
})

describe('incoming call', () => {
  it('can be accepted, declined, or cancelled by the caller', () => {
    const ringing = run([{ type: 'INCOMING', ...target }])
    expect(ringing).toMatchObject({
      phase: 'incoming-ringing',
      direction: 'incoming',
    })
    expect(run([{ type: 'ACCEPTED' }], ringing).phase).toBe('connecting')
    expect(run([{ type: 'LOCAL_DECLINE' }], ringing).endReason).toBe(
      'declined-by-me',
    )
    expect(run([{ type: 'REMOTE_HANGUP' }], ringing).endReason).toBe(
      'cancelled-by-peer',
    )
  })

  it('goes quiet when another tab answered', () => {
    expect(
      run([{ type: 'INCOMING', ...target }, { type: 'ANSWERED_ELSEWHERE' }]),
    ).toEqual(idleCall)
  })

  it('does not mistake ANSWERED_ELSEWHERE for anything once connected', () => {
    const connected = run([
      { type: 'INCOMING', ...target },
      { type: 'ACCEPTED' },
      { type: 'CONNECTED', at: 5 },
    ])
    expect(callReducer(connected, { type: 'ANSWERED_ELSEWHERE' })).toBe(
      connected,
    )
  })
})

describe('setup problems', () => {
  it('ends the call as failed if it cannot be set up, from either side', () => {
    expect(
      run([{ type: 'START_OUTGOING', ...target }, { type: 'SETUP_FAILED' }])
        .endReason,
    ).toBe('failed')
    expect(
      run([{ type: 'INCOMING', ...target }, { type: 'SETUP_FAILED' }])
        .endReason,
    ).toBe('failed')
    expect(callReducer(idleCall, { type: 'SETUP_FAILED' })).toBe(idleCall)
  })
})

describe('simultaneous calls', () => {
  it('ignores a second incoming or outgoing call while one is active', () => {
    const busy = run([{ type: 'START_OUTGOING', ...target }])
    expect(
      callReducer(busy, { type: 'INCOMING', ...target, callId: 'c2' }),
    ).toBe(busy)
    expect(
      callReducer(busy, { type: 'START_OUTGOING', ...target, callId: 'c3' }),
    ).toBe(busy)
    expect(busy.callId).toBe('c1')
  })
})

describe('network problems', () => {
  const connected = run([
    { type: 'START_OUTGOING', ...target },
    { type: 'ACCEPTED' },
    { type: 'CONNECTED', at: 10 },
  ])

  it('reconnects after a drop without losing the call start time', () => {
    const lost = callReducer(connected, { type: 'CONNECTION_LOST' })
    expect(lost.phase).toBe('reconnecting')
    expect(callReducer(lost, { type: 'CONNECTED', at: 99 })).toMatchObject({
      phase: 'connected',
      connectedAt: 10,
    })
    expect(callReducer(lost, { type: 'CONNECTION_RECOVERED' }).phase).toBe(
      'connected',
    )
  })

  it('fails when recovery is impossible, and only from an active connection', () => {
    expect(
      callReducer(callReducer(connected, { type: 'CONNECTION_LOST' }), {
        type: 'CONNECTION_FAILED',
      }),
    ).toMatchObject({ phase: 'failed', endReason: 'failed' })
    expect(callReducer(idleCall, { type: 'CONNECTION_FAILED' })).toBe(idleCall)
  })

  it('ignores stale events after the call has ended', () => {
    const finished = callReducer(connected, { type: 'LOCAL_HANGUP' })
    expect(callReducer(finished, { type: 'CONNECTED', at: 50 })).toBe(finished)
    expect(callReducer(finished, { type: 'REMOTE_HANGUP' })).toBe(finished)
    expect(isActive(finished.phase)).toBe(false)
    expect(callReducer(finished, { type: 'RESET' })).toEqual(idleCall)
  })
})

describe('database status', () => {
  it('records the outcome the call history should show', () => {
    expect(dbStatusFor('declined-by-me', false)).toBe('declined')
    expect(dbStatusFor('declined-by-peer', false)).toBe('declined')
    expect(dbStatusFor('cancelled-by-me', false)).toBe('missed')
    expect(dbStatusFor('no-answer', false)).toBe('missed')
    expect(dbStatusFor('local-hangup', true)).toBe('ended')
    expect(dbStatusFor('failed', true)).toBe('ended')
  })
})
