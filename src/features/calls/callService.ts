import { supabase } from '../../lib/supabase'
import type { CallDbStatus } from './callMachine'

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export type CallRecord = {
  id: string
  chatId: string
  callerId: string
  type: 'voice' | 'video'
  status: 'ringing' | 'accepted' | 'declined' | 'ended' | 'missed'
  startedAt: string
  endedAt: string | null
}

type CallRow = {
  id: string
  chat_id: string
  caller_id: string
  call_type: 'voice' | 'video'
  status: CallRecord['status']
  started_at: string
  ended_at: string | null
}

const toRecord = (row: CallRow): CallRecord => ({
  id: row.id,
  chatId: row.chat_id,
  callerId: row.caller_id,
  type: row.call_type,
  status: row.status,
  startedAt: row.started_at,
  endedAt: row.ended_at,
})

/** Inserts the ringing call. The id is chosen by the client so signalling can start before the round trip ends. */
export async function createCall(
  callId: string,
  chatId: string,
  callerId: string,
  video: boolean,
): Promise<void> {
  const { error } = await client()
    .from('calls')
    .insert({
      id: callId,
      chat_id: chatId,
      caller_id: callerId,
      call_type: video ? 'video' : 'voice',
    })
  if (error) throw error
}

export async function joinCall(callId: string, userId: string): Promise<void> {
  const { error } = await client()
    .from('call_participants')
    .upsert(
      { call_id: callId, user_id: userId, joined_at: new Date().toISOString() },
      { onConflict: 'call_id,user_id' },
    )
  if (error) throw error
}

export async function markAccepted(callId: string): Promise<void> {
  const { error } = await client()
    .from('calls')
    .update({ status: 'accepted' })
    .eq('id', callId)
    .eq('status', 'ringing')
  if (error) throw error
}

/** Writes the final outcome once. Finished calls are immutable in the database, so a late duplicate is harmless. */
export async function finishCall(
  callId: string,
  userId: string,
  status: CallDbStatus,
): Promise<void> {
  const { error } = await client()
    .from('calls')
    .update({ status, ended_at: new Date().toISOString() })
    .eq('id', callId)
    .in('status', ['ringing', 'accepted'])
  if (error && !/already finished/i.test(error.message)) throw error
  await client()
    .from('call_participants')
    .update({ left_at: new Date().toISOString() })
    .eq('call_id', callId)
    .eq('user_id', userId)
}

export async function loadCallHistory(limit = 100): Promise<CallRecord[]> {
  const { data, error } = await client()
    .from('calls')
    .select('id, chat_id, caller_id, call_type, status, started_at, ended_at')
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data as unknown as CallRow[]).map(toRecord)
}

export { toRecord }
export type { CallRow }
