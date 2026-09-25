import { decryptPayload, encryptPayload, importPublicKey, unwrapMessageKey, wrapMessageKey, type MessagePayloadV1 } from '../../lib/crypto/crypto'
import { getActivePrivateKey } from '../../lib/crypto/keyStore'
import { supabase } from '../../lib/supabase'

export type ChatSummary = {
  id: string
  name: string
  isGroup: boolean
  initials: string
  color: string
  preview: string
  time: string
}

export type DecryptedMessage = {
  id: string
  senderId: string
  text: string
  createdAt: string
  isMine: boolean
}

export type ProfileSearchResult = {
  id: string
  username: string
  displayName: string
}

type ParticipantRow = { chat_id: string; chats: { id: string; name: string | null; is_group: boolean } | null }
type MessageRow = { id: string; chat_id: string; sender_id: string; ciphertext: string; iv: string; encrypted_keys: Record<string, string>; created_at: string; profiles: { public_key: string } | null }
type ChatParticipantRow = { user_id: string; profiles: { public_key: string } | null }

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

function initials(name: string): string {
  return name.split(' ').map((part) => part[0] ?? '').join('').slice(0, 2).toUpperCase() || 'C'
}

export async function loadChats(): Promise<ChatSummary[]> {
  const client = requireSupabase()
  const { data, error } = await client.from('chat_participants').select('chat_id, chats(id, name, is_group)').order('joined_at', { ascending: false })
  if (error) throw error
  const rows = data as unknown as ParticipantRow[]
  return rows.flatMap((row) => {
    if (!row.chats) return []
    const name = row.chats.name ?? 'Conversation'
    return [{ id: row.chats.id, name, isGroup: row.chats.is_group, initials: initials(name), color: '#d7f8ef', preview: 'No messages yet', time: '' }]
  })
}

export async function findProfileByUsername(username: string, currentUserId: string): Promise<ProfileSearchResult | null> {
  const client = requireSupabase()
  const normalized = username.trim().replace(/^@/, '').toLowerCase()
  const { data, error } = await client.from('profiles').select('id, username, display_name').eq('username', normalized).neq('id', currentUserId).maybeSingle()
  if (error) throw error
  if (!data) return null
  return { id: data.id, username: data.username, displayName: data.display_name }
}

export async function createDirectChat(currentUserId: string, otherUserId: string): Promise<string> {
  const client = requireSupabase()
  const { data: chat, error: chatError } = await client.from('chats').insert({ is_group: false, created_by: currentUserId }).select('id').single()
  if (chatError) throw chatError
  const { error: creatorError } = await client.from('chat_participants').insert({ chat_id: chat.id, user_id: currentUserId, role: 'admin' })
  if (creatorError) {
    await client.from('chats').delete().eq('id', chat.id)
    throw creatorError
  }
  const { error: participantError } = await client.from('chat_participants').insert({ chat_id: chat.id, user_id: otherUserId, role: 'member' })
  if (participantError) {
    await client.from('chats').delete().eq('id', chat.id)
    throw participantError
  }
  return chat.id
}

async function loadParticipantKeys(chatId: string): Promise<ChatParticipantRow[]> {
  const client = requireSupabase()
  const { data, error } = await client.from('chat_participants').select('user_id, profiles(public_key)').eq('chat_id', chatId)
  if (error) throw error
  return data as unknown as ChatParticipantRow[]
}

async function loadMessageRows(chatId: string): Promise<MessageRow[]> {
  const client = requireSupabase()
  const { data, error } = await client.from('messages').select('id, chat_id, sender_id, ciphertext, iv, encrypted_keys, created_at, profiles(public_key)').eq('chat_id', chatId).order('created_at', { ascending: true })
  if (error) throw error
  return data as unknown as MessageRow[]
}

export async function loadDecryptedMessages(chatId: string, userId: string): Promise<DecryptedMessage[]> {
  const privateKey = getActivePrivateKey(userId)
  if (!privateKey) throw new Error('Unlock your local encryption identity by signing in again.')
  const rows = await loadMessageRows(chatId)
  const messages: DecryptedMessage[] = []
  for (const row of rows) {
    const senderPublicKey = row.profiles?.public_key
    const wrappedKey = row.encrypted_keys[userId]
    if (!senderPublicKey || !wrappedKey) continue
    try {
      const senderKey = await importPublicKey(JSON.parse(senderPublicKey) as JsonWebKey)
      const messageKey = await unwrapMessageKey(wrappedKey, privateKey, senderKey)
      const payload = await decryptPayload(row.ciphertext, row.iv, messageKey)
      messages.push({ id: row.id, senderId: row.sender_id, text: payload.text ?? '', createdAt: row.created_at, isMine: row.sender_id === userId })
    } catch {
      messages.push({ id: row.id, senderId: row.sender_id, text: 'Unable to decrypt this message on this device.', createdAt: row.created_at, isMine: row.sender_id === userId })
    }
  }
  return messages
}

export async function sendEncryptedMessage(chatId: string, senderId: string, text: string): Promise<void> {
  const client = requireSupabase()
  const privateKey = getActivePrivateKey(senderId)
  if (!privateKey) throw new Error('Unlock your local encryption identity by signing in again.')
  const participants = await loadParticipantKeys(chatId)
  const encrypted = await encryptPayload({ v: 1, text })
  const encryptedKeys: Record<string, string> = {}
  for (const participant of participants) {
    if (!participant.profiles?.public_key) throw new Error('A participant is missing an encryption key.')
    const publicKey = await importPublicKey(JSON.parse(participant.profiles.public_key) as JsonWebKey)
    encryptedKeys[participant.user_id] = await wrapMessageKey(encrypted.messageKey, privateKey, publicKey)
  }
  const { error } = await client.from('messages').insert({ chat_id: chatId, sender_id: senderId, ciphertext: encrypted.ciphertext, iv: encrypted.iv, encrypted_keys: encryptedKeys, message_type: 'text' })
  if (error) throw error
}

export function subscribeToChat(chatId: string, onChange: () => void): () => void {
  const client = requireSupabase()
  const channel = client.channel(`messages:${chatId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, onChange).subscribe()
  return () => { void client.removeChannel(channel) }
}

export function payloadForSearch(message: DecryptedMessage): MessagePayloadV1 {
  return { v: 1, text: message.text }
}
