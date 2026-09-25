import { decryptBytes } from '../../lib/crypto/crypto'
import { readStored, writeStored } from '../../lib/mediaStore'
import { supabase } from '../../lib/supabase'
import { buckets } from '../../lib/storageUrls'
import type { ReceiptRow } from './receipts'
import { thumbPathFor } from './thumbnails'
import type { ChatMessage, ReactionRow } from './types'

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function loadReactions(chatId: string): Promise<ReactionRow[]> {
  const { data, error } = await client()
    .from('message_reactions')
    .select('message_id, user_id, emoji, messages!message_id!inner(chat_id)')
    .eq('messages.chat_id', chatId)
  if (error) throw error
  return (
    data as unknown as Array<{
      message_id: string
      user_id: string
      emoji: string
    }>
  ).map((row) => ({
    messageId: row.message_id,
    userId: row.user_id,
    emoji: row.emoji,
  }))
}

/** One reaction per person per message: a new emoji replaces the old one, `null` removes it. */
export async function setReaction(
  messageId: string,
  userId: string,
  emoji: string | null,
): Promise<void> {
  if (emoji === null) {
    const { error } = await client()
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', userId)
    if (error) throw error
    return
  }
  const { error } = await client()
    .from('message_reactions')
    .upsert(
      { message_id: messageId, user_id: userId, emoji },
      { onConflict: 'message_id,user_id' },
    )
  if (error) throw error
}

/** Receipts other people have recorded against messages I sent in this chat. */
export async function loadReceipts(
  chatId: string,
  userId: string,
): Promise<ReceiptRow[]> {
  const { data, error } = await client()
    .from('message_status')
    .select(
      'message_id, user_id, status, messages!message_id!inner(chat_id, sender_id)',
    )
    .eq('messages.chat_id', chatId)
    .eq('messages.sender_id', userId)
  if (error) throw error
  return (
    data as unknown as Array<{
      message_id: string
      user_id: string
      status: ReceiptRow['status']
    }>
  ).map((row) => ({
    messageId: row.message_id,
    userId: row.user_id,
    status: row.status,
  }))
}

/** Downloads the encrypted attachment and decrypts it in the browser with the message key. */
export type MediaVariant = 'full' | 'thumb'

/** The encrypted bytes for one stored file. Small ones are kept on the device (still encrypted) between visits. */
async function fetchCiphertext(path: string): Promise<ArrayBuffer> {
  const key = `${buckets.chatMedia}/${path}`
  const stored = await readStored('cipher', key)
  if (stored) return stored.arrayBuffer()
  const { data, error } = await client()
    .storage.from(buckets.chatMedia)
    .download(path)
  if (error) throw error
  await writeStored('cipher', key, data)
  return data.arrayBuffer()
}

/**
 * Downloads and decrypts an attachment. `thumb` is the bubble-sized copy of a photo; it falls back to the original
 * for photos sent without one.
 */
export async function downloadMedia(
  message: ChatMessage,
  variant: MediaVariant = 'full',
): Promise<Blob> {
  const media = message.media
  if (!media || !message.messageKey)
    throw new Error('This attachment cannot be decrypted on this device.')
  if (variant === 'thumb' && media.thumb) {
    const bytes = await decryptBytes(
      await fetchCiphertext(thumbPathFor(media.path)),
      media.thumb.iv,
      message.messageKey,
    )
    return new Blob([bytes], { type: 'image/jpeg' })
  }
  const bytes = await decryptBytes(
    await fetchCiphertext(media.path),
    media.iv,
    message.messageKey,
  )
  return new Blob([bytes], { type: media.mime })
}

export async function loadStarredIds(userId: string): Promise<string[]> {
  const { data, error } = await client()
    .from('starred_messages')
    .select('message_id')
    .eq('user_id', userId)
  if (error) throw error
  return (data as unknown as Array<{ message_id: string }>).map(
    (row) => row.message_id,
  )
}

export async function setStarred(
  userId: string,
  messageId: string,
  starred: boolean,
): Promise<void> {
  if (starred) {
    const { error } = await client()
      .from('starred_messages')
      .upsert(
        { user_id: userId, message_id: messageId },
        { onConflict: 'user_id,message_id' },
      )
    if (error) throw error
    return
  }
  const { error } = await client()
    .from('starred_messages')
    .delete()
    .eq('user_id', userId)
    .eq('message_id', messageId)
  if (error) throw error
}
