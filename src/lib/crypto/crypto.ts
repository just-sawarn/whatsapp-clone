export type MessagePayloadV1 = {
  v: 1
  text?: string
  replyToId?: string
  linkPreview?: {
    url: string
    title?: string
    description?: string
    imageUrl?: string
    domain: string
  }
}

export type EncryptedPayload = {
  ciphertext: string
  iv: string
  messageKey: CryptoKey
}

export type WrappedPrivateKey = {
  publicKey: JsonWebKey
  salt: string
  iv: string
  ciphertext: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const cryptoApi = globalThis.crypto

function toBase64(bytes: ArrayBuffer): string {
  let binary = ''
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export async function generateIdentityKeyPair(): Promise<CryptoKeyPair> {
  return cryptoApi.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits'])
}

export function exportPublicKey(key: CryptoKey): Promise<JsonWebKey> {
  return cryptoApi.subtle.exportKey('jwk', key)
}

async function derivePasswordKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await cryptoApi.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey'])
  return cryptoApi.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function wrapPrivateKey(keyPair: CryptoKeyPair, password: string): Promise<WrappedPrivateKey> {
  const publicKey = await exportPublicKey(keyPair.publicKey)
  const privateKey = await cryptoApi.subtle.exportKey('jwk', keyPair.privateKey)
  const salt = cryptoApi.getRandomValues(new Uint8Array(16))
  const iv = cryptoApi.getRandomValues(new Uint8Array(12))
  const wrappingKey = await derivePasswordKey(password, salt)
  const ciphertext = await cryptoApi.subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, encoder.encode(JSON.stringify(privateKey)))
  return { publicKey, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(ciphertext) }
}

export async function unwrapPrivateKey(record: WrappedPrivateKey, password: string): Promise<CryptoKey> {
  const wrappingKey = await derivePasswordKey(password, fromBase64(record.salt))
  const plaintext = await cryptoApi.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(record.iv) }, wrappingKey, fromBase64(record.ciphertext))
  return cryptoApi.subtle.importKey('jwk', JSON.parse(decoder.decode(plaintext)) as JsonWebKey, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits'])
}

export async function encryptPayload(payload: MessagePayloadV1): Promise<EncryptedPayload> {
  const messageKey = await cryptoApi.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const iv = cryptoApi.getRandomValues(new Uint8Array(12))
  const ciphertext = await cryptoApi.subtle.encrypt({ name: 'AES-GCM', iv }, messageKey, encoder.encode(JSON.stringify(payload)))
  return { ciphertext: toBase64(ciphertext), iv: toBase64(iv), messageKey }
}

export async function decryptPayload(ciphertext: string, iv: string, messageKey: CryptoKey): Promise<MessagePayloadV1> {
  const plaintext = await cryptoApi.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, messageKey, fromBase64(ciphertext))
  return JSON.parse(decoder.decode(plaintext)) as MessagePayloadV1
}

async function deriveSharedKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  return cryptoApi.subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return cryptoApi.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, [])
}

export async function wrapMessageKey(messageKey: CryptoKey, senderPrivateKey: CryptoKey, recipientPublicKey: CryptoKey): Promise<string> {
  const sharedKey = await deriveSharedKey(senderPrivateKey, recipientPublicKey)
  const rawMessageKey = await cryptoApi.subtle.exportKey('raw', messageKey)
  const iv = cryptoApi.getRandomValues(new Uint8Array(12))
  const wrapped = await cryptoApi.subtle.encrypt({ name: 'AES-GCM', iv }, sharedKey, rawMessageKey)
  const combined = new Uint8Array(iv.byteLength + wrapped.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(wrapped), iv.byteLength)
  return toBase64(combined)
}

export async function unwrapMessageKey(wrappedKey: string, recipientPrivateKey: CryptoKey, senderPublicKey: CryptoKey): Promise<CryptoKey> {
  const sharedKey = await deriveSharedKey(recipientPrivateKey, senderPublicKey)
  const combined = fromBase64(wrappedKey)
  const rawMessageKey = await cryptoApi.subtle.decrypt({ name: 'AES-GCM', iv: combined.slice(0, 12) }, sharedKey, combined.slice(12))
  return cryptoApi.subtle.importKey('raw', rawMessageKey, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}
