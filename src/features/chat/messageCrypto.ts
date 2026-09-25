import {
  decryptPayload,
  encryptPayload,
  generateMessageKey,
  importPublicKey,
  parsePublicKey,
  unwrapMessageKey,
  wrapMessageKey,
  type MessagePayloadV1,
} from '../../lib/crypto/crypto'
import { getActivePrivateKey } from '../../lib/crypto/keyStore'
import type { ChatMessage, MessageKind } from './types'

export class EncryptionLockedError extends Error {
  constructor() {
    super('Unlock your local encryption identity to read and send messages.')
    this.name = 'EncryptionLockedError'
  }
}

export function requirePrivateKey(userId: string): CryptoKey {
  const key = getActivePrivateKey(userId)
  if (!key) throw new EncryptionLockedError()
  return key
}

/** A row of `message_view` (or the last-message JSON returned by `chat_overview`). */
export type MessageRow = {
  id: string
  chat_id: string
  sender_id: string
  ciphertext: string
  iv: string
  wrapped_key: string | null
  sender_public_key: string | null
  message_type: MessageKind
  media_path: string | null
  duration_seconds: number | null
  reply_to_id: string | null
  is_forwarded: boolean
  created_at: string
  deleted_at: string | null
}

const publicKeyCache = new Map<string, Promise<CryptoKey>>()

function cachedPublicKey(serialized: string): Promise<CryptoKey> {
  let key = publicKeyCache.get(serialized)
  if (!key) {
    key = importPublicKey(parsePublicKey(serialized))
    publicKeyCache.set(serialized, key)
  }
  return key
}

/**
 * Decrypts one row. Returns null when the row was never sealed for this user (for example it predates their
 * joining a group); returns a placeholder message when decryption is attempted and fails.
 */
export async function decryptRow(
  row: MessageRow,
  userId: string,
  privateKey: CryptoKey,
): Promise<ChatMessage | null> {
  const base = {
    id: row.id,
    chatId: row.chat_id,
    senderId: row.sender_id,
    createdAt: row.created_at,
    isMine: row.sender_id === userId,
    kind: row.message_type,
    replyToId: row.reply_to_id,
    isForwarded: row.is_forwarded,
    sendState: 'sent' as const,
    messageKey: null,
    linkPreview: null,
    media: null,
  }
  if (row.deleted_at)
    return { ...base, text: '', deleted: true, undecryptable: false }
  if (!row.wrapped_key) return null
  if (!row.sender_public_key)
    return { ...base, text: '', deleted: false, undecryptable: true }
  try {
    const messageKey = await unwrapMessageKey(
      row.wrapped_key,
      privateKey,
      await cachedPublicKey(row.sender_public_key),
    )
    const payload = await decryptPayload(row.ciphertext, row.iv, messageKey)
    return {
      ...base,
      text: payload.text ?? '',
      deleted: false,
      undecryptable: false,
      messageKey,
      replyToId: row.reply_to_id ?? payload.replyToId ?? null,
      linkPreview: payload.linkPreview ?? null,
      media:
        payload.media && row.media_path
          ? {
              ...payload.media,
              path: row.media_path,
              durationSeconds: row.duration_seconds,
            }
          : null,
    }
  } catch {
    return { ...base, text: '', deleted: false, undecryptable: true }
  }
}

export type Recipient = { userId: string; publicKey: string }

export type SealedMessage = {
  ciphertext: string
  iv: string
  encryptedKeys: Record<string, string>
  messageKey: CryptoKey
}

/** Encrypts the payload once and wraps the message key separately for every recipient (including the sender). */
export async function sealMessage(
  payload: MessagePayloadV1,
  senderKey: CryptoKey,
  recipients: Recipient[],
  existingKey?: CryptoKey,
): Promise<SealedMessage> {
  const messageKey = existingKey ?? (await generateMessageKey())
  const encrypted = await encryptPayload(payload, messageKey)
  const entries = await Promise.all(
    recipients.map(
      async (recipient) =>
        [
          recipient.userId,
          await wrapMessageKey(
            messageKey,
            senderKey,
            await cachedPublicKey(recipient.publicKey),
          ),
        ] as const,
    ),
  )
  return {
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    encryptedKeys: Object.fromEntries(entries),
    messageKey,
  }
}

export { generateMessageKey }
