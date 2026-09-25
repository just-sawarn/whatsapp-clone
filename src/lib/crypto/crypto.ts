export type MessageMedia = {
  name: string
  mime: string
  size: number
  /** IV used to encrypt the attachment bytes; the AES key is the message key. */
  iv: string
  width?: number
  height?: number
}

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
  media?: MessageMedia
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
  /** PBKDF2 rounds. Absent on records created before this field existed (310,000). */
  iterations?: number
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const cryptoApi = globalThis.crypto

const LEGACY_PBKDF2_ITERATIONS = 310_000
const PBKDF2_ITERATIONS = 600_000

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  let binary = ''
  for (const byte of bytes instanceof Uint8Array
    ? bytes
    : new Uint8Array(bytes))
    binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export async function generateIdentityKeyPair(): Promise<CryptoKeyPair> {
  return cryptoApi.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  )
}

export function exportPublicKey(key: CryptoKey): Promise<JsonWebKey> {
  return cryptoApi.subtle.exportKey('jwk', key)
}

async function derivePasswordKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const baseKey = await cryptoApi.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return cryptoApi.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function sealPrivateJwk(
  publicKey: JsonWebKey,
  privateJwk: JsonWebKey,
  password: string,
): Promise<WrappedPrivateKey> {
  const salt = cryptoApi.getRandomValues(new Uint8Array(16))
  const iv = cryptoApi.getRandomValues(new Uint8Array(12))
  const wrappingKey = await derivePasswordKey(password, salt, PBKDF2_ITERATIONS)
  const ciphertext = await cryptoApi.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    encoder.encode(JSON.stringify(privateJwk)),
  )
  return {
    publicKey,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
    iterations: PBKDF2_ITERATIONS,
  }
}

async function openPrivateJwk(
  record: WrappedPrivateKey,
  password: string,
): Promise<JsonWebKey> {
  const wrappingKey = await derivePasswordKey(
    password,
    fromBase64(record.salt),
    record.iterations ?? LEGACY_PBKDF2_ITERATIONS,
  )
  const plaintext = await cryptoApi.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(record.iv) },
    wrappingKey,
    fromBase64(record.ciphertext),
  )
  return JSON.parse(decoder.decode(plaintext)) as JsonWebKey
}

export async function wrapPrivateKey(
  keyPair: CryptoKeyPair,
  password: string,
): Promise<WrappedPrivateKey> {
  const publicKey = await exportPublicKey(keyPair.publicKey)
  const privateKey = await cryptoApi.subtle.exportKey('jwk', keyPair.privateKey)
  return sealPrivateJwk(publicKey, privateKey, password)
}

/** The unlocked key can only derive shared secrets; it is not exportable from memory. */
export async function unwrapPrivateKey(
  record: WrappedPrivateKey,
  password: string,
): Promise<CryptoKey> {
  const jwk = await openPrivateJwk(record, password)
  return cryptoApi.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits'],
  )
}

/** Re-protects the same identity under a new password without ever importing it as a CryptoKey. */
export async function rewrapPrivateKey(
  record: WrappedPrivateKey,
  oldPassword: string,
  newPassword: string,
): Promise<WrappedPrivateKey> {
  return sealPrivateJwk(
    record.publicKey,
    await openPrivateJwk(record, oldPassword),
    newPassword,
  )
}

export function generateMessageKey(): Promise<CryptoKey> {
  return cryptoApi.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ])
}

export async function encryptPayload(
  payload: MessagePayloadV1,
  existingKey?: CryptoKey,
): Promise<EncryptedPayload> {
  const messageKey = existingKey ?? (await generateMessageKey())
  const iv = cryptoApi.getRandomValues(new Uint8Array(12))
  const ciphertext = await cryptoApi.subtle.encrypt(
    { name: 'AES-GCM', iv },
    messageKey,
    encoder.encode(JSON.stringify(payload)),
  )
  return { ciphertext: toBase64(ciphertext), iv: toBase64(iv), messageKey }
}

export async function decryptPayload(
  ciphertext: string,
  iv: string,
  messageKey: CryptoKey,
): Promise<MessagePayloadV1> {
  const plaintext = await cryptoApi.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) },
    messageKey,
    fromBase64(ciphertext),
  )
  return JSON.parse(decoder.decode(plaintext)) as MessagePayloadV1
}

/** Encrypts attachment bytes with the message key under a fresh IV (never reuse an IV with the same key). */
export async function encryptBytes(
  data: ArrayBuffer,
  messageKey: CryptoKey,
): Promise<{ data: ArrayBuffer; iv: string }> {
  const iv = cryptoApi.getRandomValues(new Uint8Array(12))
  return {
    data: await cryptoApi.subtle.encrypt(
      { name: 'AES-GCM', iv },
      messageKey,
      data,
    ),
    iv: toBase64(iv),
  }
}

export function decryptBytes(
  data: ArrayBuffer,
  iv: string,
  messageKey: CryptoKey,
): Promise<ArrayBuffer> {
  return cryptoApi.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) },
    messageKey,
    data,
  )
}

async function deriveSharedKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
): Promise<CryptoKey> {
  return cryptoApi.subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return cryptoApi.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  )
}

/** Parses a public key stored as a JSON string; throws a user-presentable error when it is malformed. */
export function parsePublicKey(serialized: string): JsonWebKey {
  try {
    const jwk = JSON.parse(serialized) as JsonWebKey
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y)
      throw new Error('not a P-256 key')
    return jwk
  } catch {
    throw new Error(
      'A participant has an invalid encryption key. They need to sign in again.',
    )
  }
}

export async function wrapMessageKey(
  messageKey: CryptoKey,
  senderPrivateKey: CryptoKey,
  recipientPublicKey: CryptoKey,
): Promise<string> {
  const sharedKey = await deriveSharedKey(senderPrivateKey, recipientPublicKey)
  const rawMessageKey = await cryptoApi.subtle.exportKey('raw', messageKey)
  const iv = cryptoApi.getRandomValues(new Uint8Array(12))
  const wrapped = await cryptoApi.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    rawMessageKey,
  )
  const combined = new Uint8Array(iv.byteLength + wrapped.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(wrapped), iv.byteLength)
  return toBase64(combined)
}

export async function unwrapMessageKey(
  wrappedKey: string,
  recipientPrivateKey: CryptoKey,
  senderPublicKey: CryptoKey,
): Promise<CryptoKey> {
  const sharedKey = await deriveSharedKey(recipientPrivateKey, senderPublicKey)
  const combined = fromBase64(wrappedKey)
  const rawMessageKey = await cryptoApi.subtle.decrypt(
    { name: 'AES-GCM', iv: combined.slice(0, 12) },
    sharedKey,
    combined.slice(12),
  )
  return cryptoApi.subtle.importKey(
    'raw',
    rawMessageKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  )
}

// ------------------------------------------------------------------ verification codes

function base64UrlToBytes(value: string): Uint8Array {
  return fromBase64(
    value
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '='),
  )
}

/** SHA-256 over the public point (x || y), hex encoded. Stable for a given key regardless of JWK field order. */
export async function publicKeyFingerprint(jwk: JsonWebKey): Promise<string> {
  const x = base64UrlToBytes(jwk.x ?? '')
  const y = base64UrlToBytes(jwk.y ?? '')
  const point = new Uint8Array(x.length + y.length)
  point.set(x)
  point.set(y, x.length)
  const digest = await cryptoApi.subtle.digest('SHA-256', point)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

/**
 * A 60-digit "security code" for a pair of identities, identical on both devices (the two fingerprints are
 * sorted first). Users compare it out of band to detect a substituted key.
 */
export async function safetyNumber(
  first: JsonWebKey,
  second: JsonWebKey,
): Promise<string> {
  const [low, high] = [
    await publicKeyFingerprint(first),
    await publicKeyFingerprint(second),
  ].sort()
  const digest = new Uint8Array(
    await cryptoApi.subtle.digest('SHA-512', encoder.encode(`${low}${high}`)),
  )
  const groups: string[] = []
  for (let index = 0; index < 60; index += 5) {
    const word = new DataView(digest.buffer, index, 4).getUint32(0)
    groups.push(String(word % 100_000).padStart(5, '0'))
  }
  return groups.join(' ')
}
