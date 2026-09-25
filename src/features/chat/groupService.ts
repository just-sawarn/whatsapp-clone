import { supabase } from '../../lib/supabase'

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export type Participant = {
  userId: string
  role: 'admin' | 'member'
  joinedAt: string
  displayName: string
  username: string
  avatarPath: string | null
}

type ParticipantRow = {
  user_id: string
  role: 'admin' | 'member'
  joined_at: string
  profiles: {
    display_name: string
    username: string
    avatar_url: string | null
  } | null
}

export async function loadParticipants(chatId: string): Promise<Participant[]> {
  const { data, error } = await client()
    .from('chat_participants')
    .select(
      'user_id, role, joined_at, profiles!user_id(display_name, username, avatar_url)',
    )
    .eq('chat_id', chatId)
    .order('joined_at', { ascending: true })
  if (error) throw error
  return (data as unknown as ParticipantRow[]).map((row) => ({
    userId: row.user_id,
    role: row.role,
    joinedAt: row.joined_at,
    displayName: row.profiles?.display_name ?? 'Unknown',
    username: row.profiles?.username ?? '',
    avatarPath: row.profiles?.avatar_url ?? null,
  }))
}

export async function addParticipants(
  chatId: string,
  userIds: string[],
): Promise<void> {
  if (userIds.length === 0) return
  const { error } = await client()
    .from('chat_participants')
    .insert(
      userIds.map((userId) => ({
        chat_id: chatId,
        user_id: userId,
        role: 'member',
      })),
    )
  if (error) throw error
}

export async function removeParticipant(
  chatId: string,
  userId: string,
): Promise<void> {
  const { error } = await client()
    .from('chat_participants')
    .delete()
    .eq('chat_id', chatId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function setParticipantRole(
  chatId: string,
  userId: string,
  role: 'admin' | 'member',
): Promise<void> {
  const { error } = await client()
    .from('chat_participants')
    .update({ role })
    .eq('chat_id', chatId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function renameGroup(chatId: string, name: string): Promise<void> {
  const trimmed = name.trim()
  if (trimmed.length < 1 || trimmed.length > 100)
    throw new Error('A group name must be 1 to 100 characters.')
  const { error } = await client()
    .from('chats')
    .update({ name: trimmed })
    .eq('id', chatId)
  if (error) throw error
}
