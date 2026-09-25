import { openDB, type DBSchema } from 'idb'
import { exportPublicKey, generateIdentityKeyPair, unwrapPrivateKey, wrapPrivateKey, type WrappedPrivateKey } from './crypto'

type IdentityRecord = WrappedPrivateKey & { userId: string }

interface CryptoDatabase extends DBSchema {
  identities: { key: string; value: IdentityRecord }
}

const database = openDB<CryptoDatabase>('whatsapp-clone-crypto', 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('identities')) db.createObjectStore('identities')
  },
})

const activePrivateKeys = new Map<string, CryptoKey>()

export async function initializeIdentity(userId: string, password: string): Promise<JsonWebKey> {
  const db = await database
  const existing = await db.get('identities', userId)
  if (existing) {
    activePrivateKeys.set(userId, await unwrapPrivateKey(existing, password))
    return existing.publicKey
  }
  const keyPair = await generateIdentityKeyPair()
  const wrapped = await wrapPrivateKey(keyPair, password)
  await db.put('identities', { userId, ...wrapped }, userId)
  activePrivateKeys.set(userId, keyPair.privateKey)
  return wrapped.publicKey
}

export async function getStoredPublicKey(userId: string): Promise<JsonWebKey | null> {
  const db = await database
  const record = await db.get('identities', userId)
  return record?.publicKey ?? null
}

export async function unlockIdentity(userId: string, password: string): Promise<CryptoKey | null> {
  const db = await database
  const record = await db.get('identities', userId)
  if (!record) return null
  return unwrapPrivateKey(record, password)
}

export async function hasStoredIdentity(userId: string): Promise<boolean> {
  const db = await database
  return (await db.get('identities', userId)) !== undefined
}

export async function unlockStoredIdentity(userId: string, password: string): Promise<boolean> {
  const db = await database
  const record = await db.get('identities', userId)
  if (!record) return false
  const privateKey = await unwrapPrivateKey(record, password)
  activePrivateKeys.set(userId, privateKey)
  return true
}

export function getActivePrivateKey(userId: string): CryptoKey | null {
  return activePrivateKeys.get(userId) ?? null
}

export { exportPublicKey }
