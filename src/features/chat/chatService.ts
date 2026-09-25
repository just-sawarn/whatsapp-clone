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
  isPinned: boolean
  isArchived: boolean
  isMuted: boolean
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

type ParticipantRow = { chat_id: string; is_pinned: boolean; is_archived: boolean; is_muted: boolean; chats: { id: string; name: string | null; is_group: boolean } | null }
type MessageRow = { id: string; chat_id: string; sender_id: string; ciphertext: string; iv: string; encrypted_keys: Record<string, string>; created_at: string; profiles: { public_key: string } | null }
type ChatParticipantRow = { user_id: string; profiles: { public_key: string } | null }

function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

function initials(name: string): string {
  return name.split(' ').map((part) => part[0] ?? '').join('').slice(0, 2).toUpperCase() || 'C'
}

export async function loadChats(currentUserId: string): Promise<ChatSummary[]> {
  const client = requireSupabase()
  // RLS exposes every participant row of chats the user belongs to, so filter to the user's own
  // membership rows; otherwise each chat is returned once per participant.
  const { data, error } = await client.from('chat_participants').select('chat_id, is_pinned, is_archived, is_muted, chats(id, name, is_group)').eq('user_id', currentUserId).order('is_pinned', { ascending: false }).order('joined_at', { ascending: false })
  if (error) throw error
  const rows = data as unknown as ParticipantRow[]
  const seen = new Set<string>()
  return rows.flatMap((row) => {
    if (!row.chats || seen.has(row.chats.id)) return []
    seen.add(row.chats.id)
    const name = row.chats.name ?? 'Conversation'
    return [{ id: row.chats.id, name, isGroup: row.chats.is_group, initials: initials(name), color: '#d7f8ef', preview: 'No messages yet', time: '', isPinned: row.is_pinned, isArchived: row.is_archived, isMuted: row.is_muted }]
  })
}

export async function updateChatSetting(chatId: string, setting: 'is_pinned' | 'is_archived' | 'is_muted', value: boolean): Promise<void> {
  const client = requireSupabase()
  const { data: authData, error: authError } = await client.auth.getUser()
  if (authError || !authData.user) throw authError ?? new Error('Your session has expired.')
  const { error } = await client.from('chat_participants').update({ [setting]: value }).eq('chat_id', chatId).eq('user_id', authData.user.id)
  if (error) throw error
}

export async function findProfileByUsername(username: string, currentUserId: string): Promise<ProfileSearchResult | null> {
  const client = requireSupabase()
  const normalized = username.trim().replace(/^@/, '').toLowerCase()
  const { data, error } = await client.from('profiles').select('id, username, display_name').eq('username', normalized).neq('id', currentUserId).maybeSingle()
  if (error) throw error
  if (!data) return null
  return { id: data.id, username: data.username, displayName: data.display_name }
}

export async function createDirectChat(otherUserId: string): Promise<string> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('get_or_create_direct_chat', { other_user_id: otherUserId })
  if (error) throw error
  return data as string
}

export async function createGroupChat(name: string, memberIds: string[]): Promise<string> {
  const client = requireSupabase()
  const { data, error } = await client.rpc('get_or_create_group_chat', { group_name: name.trim(), member_ids: memberIds })
  if (error) throw error
  return data as string
}

async function loadParticipantKeys(chatId: string): Promise<ChatParticipantRow[]> {
  const client = requireSupabase()
  const { data, error } = await client.from('chat_participants').select('user_id, profiles(public_key)').eq('chat_id', chatId)
  if (error) throw error
  return data as unknown as ChatParticipantRow[]
}

const messageColumns = 'id, chat_id, sender_id, ciphertext, iv, encrypted_keys, created_at, profiles(public_key)'
const senderKeyCache = new Map<string, Promise<CryptoKey>>()

function importSenderKey(serialized: string): Promise<CryptoKey> {
  let key = senderKeyCache.get(serialized)
  if (!key) {
    let publicKey: JsonWebKey
    try {
      publicKey = JSON.parse(serialized) as JsonWebKey
    } catch {
      throw new Error('A participant has an invalid encryption key. They need to sign in again.')
    }
    key = importPublicKey(publicKey)
    senderKeyCache.set(serialized, key)
  }
  return key
}

async function decryptRow(row: MessageRow, userId: string, privateKey: CryptoKey): Promise<DecryptedMessage | null> {
  const senderPublicKey = row.profiles?.public_key
  const wrappedKey = row.encrypted_keys[userId]
  if (!senderPublicKey || !wrappedKey) return null
  const base = { id: row.id, senderId: row.sender_id, createdAt: row.created_at, isMine: row.sender_id === userId }
  try {
    const messageKey = await unwrapMessageKey(wrappedKey, privateKey, await importSenderKey(senderPublicKey))
    const payload = await decryptPayload(row.ciphertext, row.iv, messageKey)
    return { ...base, text: payload.text ?? '' }
  } catch {
    return { ...base, text: 'Unable to decrypt this message on this device.' }
  }
}

function requirePrivateKey(userId: string): CryptoKey {
  const privateKey = getActivePrivateKey(userId)
  if (!privateKey) throw new Error('Unlock your local encryption identity by signing in again.')
  return privateKey
}

export async function loadDecryptedMessages(chatId: string, userId: string): Promise<DecryptedMessage[]> {
  const privateKey = requirePrivateKey(userId)
  const { data, error } = await requireSupabase().from('messages').select(messageColumns).eq('chat_id', chatId).order('created_at', { ascending: true })
  if (error) throw error
  const decrypted = await Promise.all((data as unknown as MessageRow[]).map((row) => decryptRow(row, userId, privateKey)))
  return decrypted.flatMap((message) => message ? [message] : [])
}

/** Fetches one message by id; null when it is not visible to this user (e.g. hidden or deleted). */
export async function loadDecryptedMessage(messageId: string, userId: string): Promise<DecryptedMessage | null> {
  const privateKey = requirePrivateKey(userId)
  const { data, error } = await requireSupabase().from('messages').select(messageColumns).eq('id', messageId).maybeSingle()
  if (error) throw error
  return data ? decryptRow(data as unknown as MessageRow, userId, privateKey) : null
}

export async function sendEncryptedMessage(chatId: string, senderId: string, text: string): Promise<string> {
  const client = requireSupabase()
  const privateKey = getActivePrivateKey(senderId)
  if (!privateKey) throw new Error('Unlock your local encryption identity by signing in again.')
  const participants = await loadParticipantKeys(chatId)
  const encrypted = await encryptPayload({ v: 1, text })
  const encryptedKeys: Record<string, string> = {}
  for (const participant of participants) {
    if (!participant.profiles?.public_key) throw new Error('A participant is missing an encryption key.')
    let publicKeyJwk: JsonWebKey
    try {
      publicKeyJwk = JSON.parse(participant.profiles.public_key) as JsonWebKey
    } catch {
      throw new Error('A participant has an invalid encryption key. They need to sign in again.')
    }
    const publicKey = await importPublicKey(publicKeyJwk)
    encryptedKeys[participant.user_id] = await wrapMessageKey(encrypted.messageKey, privateKey, publicKey)
  }
  const { data, error } = await client.from('messages').insert({ chat_id: chatId, sender_id: senderId, ciphertext: encrypted.ciphertext, iv: encrypted.iv, encrypted_keys: encryptedKeys, message_type: 'text' }).select('id').single()
  if (error) throw error
  return (data as { id: string }).id
}

/** Calls onMessage with the id of each inserted or updated message so callers can refetch just that row. */
export function subscribeToChat(chatId: string, onMessage: (messageId: string) => void): () => void {
  const client = requireSupabase()
  const channel = client
    .channel(`messages:${chatId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, (payload) => {
      const id = (payload.new as { id?: string }).id
      if (id) onMessage(id)
    })
    .subscribe()
  return () => { void client.removeChannel(channel) }
}

export function payloadForSearch(message: DecryptedMessage): MessagePayloadV1 {
  return { v: 1, text: message.text }
}
