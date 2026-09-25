import { getActivePrivateKey } from '../../lib/crypto/keyStore'
import { MIGRATIONS_HINT, isMissingFunctionError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import { decryptRow, type MessageRow } from './messageCrypto'
import { toPreview } from './preview'
import type { ChatSummary, MessageKind } from './types'

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

type LastMessageJson = {
  id: string
  sender_id: string
  ciphertext: string
  iv: string
  wrapped_key: string | null
  sender_public_key: string | null
  created_at: string
  deleted_at: string | null
  message_type: MessageKind
}

type OverviewRow = {
  chat_id: string
  name: string | null
  is_group: boolean
  avatar_url: string | null
  is_pinned: boolean
  is_archived: boolean
  is_muted: boolean
  marked_unread: boolean
  peer_id: string | null
  peer_display_name: string | null
  peer_username: string | null
  peer_avatar_url: string | null
  peer_last_seen: string | null
  participant_count: number
  unread_count: number
  last_message: LastMessageJson | null
}

async function previewOf(
  row: OverviewRow,
  userId: string,
): Promise<ChatSummary['lastMessage']> {
  const last = row.last_message
  if (!last) return null
  const privateKey = getActivePrivateKey(userId)
  if (!privateKey) {
    return {
      kind: 'text',
      text: 'Encrypted message',
      deleted: false,
      isMine: last.sender_id === userId,
      senderId: last.sender_id,
      createdAt: last.created_at,
    }
  }
  const messageRow: MessageRow = {
    ...last,
    chat_id: row.chat_id,
    media_path: null,
    duration_seconds: null,
    reply_to_id: null,
    is_forwarded: false,
  }
  const message = await decryptRow(messageRow, userId, privateKey)
  return message ? toPreview(message) : null
}

/** Every chat the user is in, with decrypted last-message previews, unread counts, and per-user flags. */
export async function loadChatOverview(userId: string): Promise<ChatSummary[]> {
  const { data, error } = await client().rpc('chat_overview')
  if (error)
    throw isMissingFunctionError(error) ? new Error(MIGRATIONS_HINT) : error
  const rows = (data ?? []) as unknown as OverviewRow[]
  return Promise.all(
    rows.map(async (row) => ({
      id: row.chat_id,
      isGroup: row.is_group,
      name:
        (row.is_group ? row.name : row.peer_display_name) ??
        (row.is_group ? 'Group' : 'Deleted account'),
      peerId: row.peer_id,
      peerUsername: row.peer_username,
      avatarPath: row.is_group ? row.avatar_url : row.peer_avatar_url,
      isPinned: row.is_pinned,
      isArchived: row.is_archived,
      isMuted: row.is_muted,
      markedUnread: row.marked_unread,
      unreadCount: Number(row.unread_count),
      participantCount: Number(row.participant_count),
      peerLastSeen: row.peer_last_seen,
      lastMessage: await previewOf(row, userId),
    })),
  )
}

export async function openDirectChat(otherUserId: string): Promise<string> {
  const { data, error } = await client().rpc('get_or_create_direct_chat', {
    other_user_id: otherUserId,
  })
  if (error) throw error
  return data as string
}

export async function createGroupChat(
  name: string,
  memberIds: string[],
): Promise<string> {
  const { data, error } = await client().rpc('get_or_create_group_chat', {
    group_name: name.trim(),
    member_ids: memberIds,
  })
  if (error) throw error
  return data as string
}

export type ChatFlags = Partial<{
  is_pinned: boolean
  is_archived: boolean
  is_muted: boolean
  muted_until: string | null
  marked_unread: boolean
}>

export async function updateChatFlags(
  chatId: string,
  userId: string,
  patch: ChatFlags,
): Promise<void> {
  const { error } = await client()
    .from('chat_participants')
    .update(patch)
    .eq('chat_id', chatId)
    .eq('user_id', userId)
  if (error) throw error
}

export type MuteDuration = '8h' | '1w' | 'always'

export function muteUntil(
  duration: MuteDuration,
  now = new Date(),
): string | null {
  if (duration === 'always') return null
  const hours = duration === '8h' ? 8 : 24 * 7
  return new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString()
}

export async function muteChat(
  chatId: string,
  userId: string,
  duration: MuteDuration | null,
): Promise<void> {
  await updateChatFlags(
    chatId,
    userId,
    duration
      ? { is_muted: true, muted_until: muteUntil(duration) }
      : { is_muted: false, muted_until: null },
  )
}

export async function leaveChat(chatId: string, userId: string): Promise<void> {
  const { error } = await client()
    .from('chat_participants')
    .delete()
    .eq('chat_id', chatId)
    .eq('user_id', userId)
  if (error) throw error
}

/** Direct chats: hide the history for me and archive; the next message from the other person restores it. */
export async function clearDirectChat(
  chatId: string,
  userId: string,
): Promise<void> {
  const { error } = await client().rpc('clear_chat_for_me', {
    target_chat_id: chatId,
  })
  if (error) throw error
  await updateChatFlags(chatId, userId, { is_archived: true })
}

export async function markChatRead(chatId: string): Promise<void> {
  const { error } = await client().rpc('mark_chat_read', {
    target_chat_id: chatId,
  })
  if (error) throw error
}

export async function markMessagesDelivered(): Promise<void> {
  const { error } = await client().rpc('mark_messages_delivered')
  if (error) throw error
}
