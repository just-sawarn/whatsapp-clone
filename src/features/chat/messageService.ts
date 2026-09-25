import type { MessagePayloadV1 } from '../../lib/crypto/crypto'
import { encryptBytes } from '../../lib/crypto/crypto'
import { getStoredPublicKey } from '../../lib/crypto/keyStore'
import type { ResizedImage } from '../../lib/image'
import { supabase } from '../../lib/supabase'
import { buckets } from '../../lib/storageUrls'
import type { LinkPreview } from './linkPreview'
import {
  decryptRow,
  generateMessageKey,
  requirePrivateKey,
  sealMessage,
  type MessageRow,
  type Recipient,
} from './messageCrypto'
import { downloadMedia } from './messageExtras'
import { makeThumbnails, thumbPathFor } from './thumbnails'
import type { ChatMessage, MessageKind } from './types'

export const MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024
export const DELETE_FOR_EVERYONE_WINDOW_MS = 60 * 60 * 1000
const PAGE_SIZE = 40
const rasterImages = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export type MessagePage = {
  messages: ChatMessage[]
  hasMore: boolean
  cursor: string | null
}

/** Newest page first from the server, returned oldest-first for rendering. `before` pages further back. */
export async function loadMessages(
  chatId: string,
  userId: string,
  before?: string | null,
): Promise<MessagePage> {
  const privateKey = requirePrivateKey(userId)
  let query = client()
    .from('message_view')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)
  if (before) query = query.lt('created_at', before)
  const { data, error } = await query
  if (error) throw error
  const rows = data as unknown as MessageRow[]
  const decrypted = await Promise.all(
    rows.map((row) => decryptRow(row, userId, privateKey)),
  )
  return {
    messages: decrypted
      .flatMap((message) => (message ? [message] : []))
      .reverse(),
    hasMore: rows.length === PAGE_SIZE,
    cursor: rows.at(-1)?.created_at ?? null,
  }
}

/** One message by id; null when it is not visible to this user (hidden, blocked, or removed). */
export async function loadMessage(
  messageId: string,
  userId: string,
): Promise<ChatMessage | null> {
  const privateKey = requirePrivateKey(userId)
  const { data, error } = await client()
    .from('message_view')
    .select('*')
    .eq('id', messageId)
    .maybeSingle()
  if (error) throw error
  return data
    ? decryptRow(data as unknown as MessageRow, userId, privateKey)
    : null
}

export type Attachment = {
  blob: Blob
  name: string
  mime: string
  width?: number
  height?: number
  durationSeconds?: number
  /** Bubble-sized copy of a photo and a tiny placeholder, made before sending (see `makeThumbnails`). */
  thumb?: ResizedImage
  tiny?: string
}

export type OutgoingMessage = {
  /** Client-generated id, so an optimistic bubble and the realtime echo are the same message. */
  id?: string
  chatId: string
  senderId: string
  text?: string
  replyToId?: string | null
  linkPreview?: LinkPreview | null
  attachment?: Attachment
  isForwarded?: boolean
  forwardOriginChatId?: string | null
}

export function kindOfMime(mime: string): Exclude<MessageKind, 'text'> {
  if (rasterImages.has(mime)) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  return 'file'
}

type RecipientRow = { user_id: string; profiles: { public_key: string } | null }

async function loadRecipients(chatId: string): Promise<Recipient[]> {
  const { data, error } = await client()
    .from('chat_participants')
    .select('user_id, profiles!user_id(public_key)')
    .eq('chat_id', chatId)
  if (error) throw error
  return (data as unknown as RecipientRow[]).map((row) => {
    if (!row.profiles?.public_key)
      throw new Error('A participant is missing an encryption key.')
    return { userId: row.user_id, publicKey: row.profiles.public_key }
  })
}

/** Encrypts (payload, attachment and per-recipient keys), uploads the ciphertext, and inserts the message. */
export async function sendMessage(
  outgoing: OutgoingMessage,
): Promise<{ id: string; createdAt: string }> {
  const { chatId, senderId, attachment } = outgoing
  const privateKey = requirePrivateKey(senderId)
  const senderPublicKey = await getStoredPublicKey(senderId)
  if (!senderPublicKey)
    throw new Error('Your local encryption identity is missing.')
  if (attachment && attachment.blob.size > MAX_ATTACHMENT_BYTES)
    throw new Error('Attachments can be at most 16 MB.')

  const recipients = await loadRecipients(chatId)
  const messageKey = await generateMessageKey()

  let uploadedPath: string | null = null
  const payload: MessagePayloadV1 = { v: 1 }
  if (outgoing.text) payload.text = outgoing.text
  if (outgoing.replyToId) payload.replyToId = outgoing.replyToId
  if (outgoing.linkPreview) payload.linkPreview = outgoing.linkPreview

  try {
    if (attachment) {
      const sealed = await encryptBytes(
        await attachment.blob.arrayBuffer(),
        messageKey,
      )
      uploadedPath = `${chatId}/${senderId}/${crypto.randomUUID()}`
      const { error: uploadError } = await client()
        .storage.from(buckets.chatMedia)
        .upload(
          uploadedPath,
          new Blob([sealed.data], { type: 'application/octet-stream' }),
          { contentType: 'application/octet-stream', upsert: false },
        )
      if (uploadError) throw uploadError
      payload.media = {
        name: attachment.name,
        mime: attachment.mime,
        size: attachment.blob.size,
        iv: sealed.iv,
        width: attachment.width,
        height: attachment.height,
      }
      if (attachment.thumb) {
        // Same message key, its own IV: the thumbnail is as private as the photo.
        const sealedThumb = await encryptBytes(
          await attachment.thumb.blob.arrayBuffer(),
          messageKey,
        )
        const { error: thumbError } = await client()
          .storage.from(buckets.chatMedia)
          .upload(
            thumbPathFor(uploadedPath),
            new Blob([sealedThumb.data], { type: 'application/octet-stream' }),
            { contentType: 'application/octet-stream', upsert: false },
          )
        // Best effort: without a thumbnail the bubble simply loads the original.
        if (!thumbError) {
          payload.media.thumb = {
            iv: sealedThumb.iv,
            width: attachment.thumb.width,
            height: attachment.thumb.height,
          }
          if (attachment.tiny) payload.media.tiny = attachment.tiny
        }
      }
    }

    const sealed = await sealMessage(
      payload,
      privateKey,
      recipients,
      messageKey,
    )
    const { data, error } = await client()
      .from('messages')
      .insert({
        ...(outgoing.id ? { id: outgoing.id } : {}),
        chat_id: chatId,
        sender_id: senderId,
        ciphertext: sealed.ciphertext,
        iv: sealed.iv,
        encrypted_keys: sealed.encryptedKeys,
        sender_public_key: JSON.stringify(senderPublicKey),
        message_type: attachment ? kindOfMime(attachment.mime) : 'text',
        media_path: uploadedPath,
        duration_seconds: attachment?.durationSeconds
          ? Math.round(attachment.durationSeconds)
          : null,
        reply_to_id: outgoing.replyToId ?? null,
        is_forwarded: outgoing.isForwarded ?? false,
        forward_origin_chat_id: outgoing.forwardOriginChatId ?? null,
      })
      .select('id, created_at')
      .single()
    if (error) throw error
    const row = data as { id: string; created_at: string }
    return { id: row.id, createdAt: row.created_at }
  } catch (error) {
    if (uploadedPath)
      await client()
        .storage.from(buckets.chatMedia)
        .remove([uploadedPath, thumbPathFor(uploadedPath)])
        .catch(() => undefined)
    throw error
  }
}

/**
 * Forwarding is not a server-side copy (the new recipients hold no key for the original). The content is
 * decrypted here and run back through the normal encrypt-and-send path for the target chat.
 */
export async function forwardMessage(
  message: ChatMessage,
  targetChatId: string,
  userId: string,
): Promise<void> {
  let attachment: Attachment | undefined
  if (message.media) {
    const blob = await downloadMedia(message)
    const previews =
      message.kind === 'image'
        ? await makeThumbnails(blob, message.media)
        : null
    attachment = {
      blob,
      name: message.media.name,
      mime: message.media.mime,
      width: message.media.width,
      height: message.media.height,
      durationSeconds: message.media.durationSeconds ?? undefined,
      thumb: previews?.thumb,
      tiny: previews?.tiny,
    }
  }
  await sendMessage({
    chatId: targetChatId,
    senderId: userId,
    text: message.text || undefined,
    linkPreview: message.linkPreview,
    attachment,
    isForwarded: true,
    forwardOriginChatId: message.chatId,
  })
}

export async function deleteForMe(messageId: string): Promise<void> {
  const { error } = await client().rpc('hide_message_for_me', {
    target_message_id: messageId,
  })
  if (error) throw error
}

export function canDeleteForEveryone(
  message: ChatMessage,
  now = Date.now(),
): boolean {
  return (
    message.isMine &&
    !message.deleted &&
    message.sendState === 'sent' &&
    now - new Date(message.createdAt).getTime() < DELETE_FOR_EVERYONE_WINDOW_MS
  )
}

/** The row is wiped as well as flagged, so the ciphertext no longer exists on the server. */
export async function deleteForEveryone(message: ChatMessage): Promise<void> {
  if (!canDeleteForEveryone(message))
    throw new Error(
      'Messages can only be deleted for everyone within one hour.',
    )
  const { error } = await client()
    .from('messages')
    .update({
      deleted_at: new Date().toISOString(),
      ciphertext: '',
      iv: '',
      encrypted_keys: {},
      media_path: null,
    })
    .eq('id', message.id)
  if (error) throw error
  if (message.media)
    await client()
      .storage.from(buckets.chatMedia)
      .remove([message.media.path, thumbPathFor(message.media.path)])
      .catch(() => undefined)
}

/** My starred messages (newest star first), decrypted. Capped so the id list stays within URL limits. */
export async function loadStarredMessages(
  userId: string,
  limit = 100,
): Promise<ChatMessage[]> {
  const privateKey = requirePrivateKey(userId)
  const { data: stars, error } = await client()
    .from('starred_messages')
    .select('message_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  const order = (stars as unknown as Array<{ message_id: string }>).map(
    (star) => star.message_id,
  )
  if (order.length === 0) return []
  const { data, error: messagesError } = await client()
    .from('message_view')
    .select('*')
    .in('id', order)
  if (messagesError) throw messagesError
  const decrypted = await Promise.all(
    (data as unknown as MessageRow[]).map((row) =>
      decryptRow(row, userId, privateKey),
    ),
  )
  const byId = new Map(
    decrypted.flatMap((message) =>
      message ? [[message.id, message] as const] : [],
    ),
  )
  return order.flatMap((id) =>
    byId.has(id) ? [byId.get(id) as ChatMessage] : [],
  )
}
