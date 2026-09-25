import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import {
  exportPublicKey,
  generateIdentityKeyPair,
  rewrapPrivateKey,
  unwrapPrivateKey,
  wrapPrivateKey,
  type WrappedPrivateKey,
} from './crypto'

type IdentityRecord = WrappedPrivateKey & { userId: string }

interface CryptoDatabase extends DBSchema {
  identities: { key: string; value: IdentityRecord }
}

/** unlocked: usable now · locked: a local key exists but needs its password · missing: no key on this device */
export type IdentityState = 'unlocked' | 'locked' | 'missing'

const BACKUP_APP = 'whatsapp-clone-key-backup'

let database: Promise<IDBPDatabase<CryptoDatabase>> | null = null

function getDatabase(): Promise<IDBPDatabase<CryptoDatabase>> {
  database ??= openDB<CryptoDatabase>('whatsapp-clone-crypto', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('identities'))
        db.createObjectStore('identities')
    },
  })
  return database
}

const activePrivateKeys = new Map<string, CryptoKey>()

async function readRecord(userId: string): Promise<IdentityRecord | undefined> {
  return (await getDatabase()).get('identities', userId)
}

async function writeRecord(record: IdentityRecord): Promise<void> {
  await (await getDatabase()).put('identities', record, record.userId)
}

/** Unlocks the stored identity, or creates one when this account has never had a key on this device. */
export async function initializeIdentity(
  userId: string,
  password: string,
): Promise<JsonWebKey> {
  const existing = await readRecord(userId)
  if (existing) {
    activePrivateKeys.set(userId, await unwrapPrivateKey(existing, password))
    return existing.publicKey
  }
  return createIdentity(userId, password)
}

async function createIdentity(
  userId: string,
  password: string,
): Promise<JsonWebKey> {
  const keyPair = await generateIdentityKeyPair()
  const wrapped = await wrapPrivateKey(keyPair, password)
  await writeRecord({ ...wrapped, userId })
  // Re-import from the wrapped form so the in-memory key is the same non-extractable kind as after an unlock.
  activePrivateKeys.set(userId, await unwrapPrivateKey(wrapped, password))
  return wrapped.publicKey
}

export async function getIdentityState(userId: string): Promise<IdentityState> {
  if (activePrivateKeys.has(userId)) return 'unlocked'
  return (await readRecord(userId)) ? 'locked' : 'missing'
}

export async function getStoredPublicKey(
  userId: string,
): Promise<JsonWebKey | null> {
  return (await readRecord(userId))?.publicKey ?? null
}

export async function hasStoredIdentity(userId: string): Promise<boolean> {
  return (await readRecord(userId)) !== undefined
}

/** Returns false when there is no local key; throws when the password is wrong. */
export async function unlockStoredIdentity(
  userId: string,
  password: string,
): Promise<boolean> {
  const record = await readRecord(userId)
  if (!record) return false
  activePrivateKeys.set(userId, await unwrapPrivateKey(record, password))
  return true
}

export function getActivePrivateKey(userId: string): CryptoKey | null {
  return activePrivateKeys.get(userId) ?? null
}

/** Deletes this account's key from the device entirely (used when the account itself is deleted). */
export async function forgetIdentity(userId: string): Promise<void> {
  activePrivateKeys.delete(userId)
  await (await getDatabase()).delete('identities', userId)
}

/** Drops every unlocked key from memory (sign-out). The password-wrapped copy stays on disk. */
export function lockIdentities(): void {
  activePrivateKeys.clear()
}

/**
 * Re-protects the local key under a new password (for example after the account password changes).
 * `currentKeyPassword` is whatever protects the key today, which may differ from the account password.
 */
export async function rewrapIdentity(
  userId: string,
  currentKeyPassword: string,
  newPassword: string,
): Promise<void> {
  const record = await readRecord(userId)
  if (!record)
    throw new Error('There is no encryption key on this device to re-protect.')
  const rewrapped = await rewrapPrivateKey(
    record,
    currentKeyPassword,
    newPassword,
  )
  await writeRecord({ ...rewrapped, userId })
  activePrivateKeys.set(userId, await unwrapPrivateKey(rewrapped, newPassword))
}

/** Replaces the identity with a fresh key pair. Messages sealed to the old key become unreadable on this account. */
export async function resetIdentity(
  userId: string,
  password: string,
): Promise<JsonWebKey> {
  return createIdentity(userId, password)
}

/** A password-protected copy of the identity, safe to store anywhere; useful for moving to a new device. */
export async function exportKeyBackup(userId: string): Promise<string> {
  const record = await readRecord(userId)
  if (!record)
    throw new Error('There is no encryption key on this device to back up.')
  const wrapped: WrappedPrivateKey = {
    publicKey: record.publicKey,
    salt: record.salt,
    iv: record.iv,
    ciphertext: record.ciphertext,
    iterations: record.iterations,
  }
  return JSON.stringify(
    { app: BACKUP_APP, version: 1, userId, record: wrapped },
    null,
    2,
  )
}

function isWrappedRecord(value: unknown): value is WrappedPrivateKey {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  const publicKey = record.publicKey as Record<string, unknown> | undefined
  return (
    typeof record.salt === 'string' &&
    typeof record.iv === 'string' &&
    typeof record.ciphertext === 'string' &&
    typeof publicKey === 'object' &&
    publicKey !== null &&
    publicKey.kty === 'EC' &&
    typeof publicKey.x === 'string' &&
    typeof publicKey.y === 'string'
  )
}

/** Stores a backup made by exportKeyBackup. It still has to be unlocked with the password that protected it. */
export async function importKeyBackup(
  userId: string,
  json: string,
): Promise<JsonWebKey> {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('That file is not a valid key backup.')
  }
  const backup = parsed as {
    app?: unknown
    version?: unknown
    userId?: unknown
    record?: unknown
  }
  if (
    backup.app !== BACKUP_APP ||
    backup.version !== 1 ||
    !isWrappedRecord(backup.record)
  ) {
    throw new Error('That file is not a valid key backup.')
  }
  if (backup.userId !== userId)
    throw new Error('This backup belongs to a different account.')
  await writeRecord({ ...backup.record, userId })
  return backup.record.publicKey
}

export { exportPublicKey }
