import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  exportPublicKey,
  generateIdentityKeyPair,
  importPublicKey,
  unwrapMessageKey,
  wrapMessageKey,
  generateMessageKey,
} from './crypto'
import {
  exportKeyBackup,
  forgetIdentity,
  forgetRemembered,
  restoreUnlockedIdentity,
  setRememberDeadline,
  getActivePrivateKey,
  getIdentityState,
  getStoredPublicKey,
  importKeyBackup,
  initializeIdentity,
  lockIdentities,
  resetIdentity,
  rewrapIdentity,
  unlockStoredIdentity,
} from './keyStore'

let userId = ''
let counter = 0

beforeEach(() => {
  userId = `user-${counter++}`
  lockIdentities()
})

describe('identity lifecycle', () => {
  it('creates a key on first use, then needs the password after locking', async () => {
    expect(await getIdentityState(userId)).toBe('missing')
    const publicKey = await initializeIdentity(userId, 'pw-1')
    expect(await getIdentityState(userId)).toBe('unlocked')

    lockIdentities()
    expect(getActivePrivateKey(userId)).toBeNull()
    expect(await getIdentityState(userId)).toBe('locked')
    await expect(unlockStoredIdentity(userId, 'wrong')).rejects.toThrow()
    expect(await unlockStoredIdentity(userId, 'pw-1')).toBe(true)
    expect(await getStoredPublicKey(userId)).toEqual(publicKey)
  })

  it('keeps the same identity when the password is rewrapped', async () => {
    const publicKey = await initializeIdentity(userId, 'old')
    await rewrapIdentity(userId, 'old', 'new')
    lockIdentities()
    await expect(unlockStoredIdentity(userId, 'old')).rejects.toThrow()
    await unlockStoredIdentity(userId, 'new')
    expect(await getStoredPublicKey(userId)).toEqual(publicKey)
  })

  it('replaces the identity on reset', async () => {
    const before = await initializeIdentity(userId, 'pw')
    const after = await resetIdentity(userId, 'pw')
    expect(after).not.toEqual(before)
    expect(await getStoredPublicKey(userId)).toEqual(after)
  })
})

describe('key backup', () => {
  it('round-trips through export and import on another device', async () => {
    const publicKey = await initializeIdentity(userId, 'backup-pw')
    const backup = await exportKeyBackup(userId)
    expect(backup).not.toContain('"d"') // the private scalar is never in the file in the clear

    const otherDevice = `${userId}-device-2`
    await expect(importKeyBackup(otherDevice, backup)).rejects.toThrow(
      /different account/,
    )

    const restored = JSON.parse(backup) as { userId: string }
    restored.userId = otherDevice
    await importKeyBackup(otherDevice, JSON.stringify(restored))
    expect(await getIdentityState(otherDevice)).toBe('locked')
    expect(await unlockStoredIdentity(otherDevice, 'backup-pw')).toBe(true)
    expect(await getStoredPublicKey(otherDevice)).toEqual(publicKey)
  })

  it('rejects files that are not key backups', async () => {
    await expect(importKeyBackup(userId, 'nope')).rejects.toThrow(
      /not a valid key backup/,
    )
    await expect(
      importKeyBackup(userId, JSON.stringify({ app: 'other', version: 1 })),
    ).rejects.toThrow(/not a valid key backup/)
  })
})

describe('staying unlocked across page loads', () => {
  const HOUR = 60 * 60 * 1000

  it('brings the key back after a reload until the deadline, and it still decrypts', async () => {
    await setRememberDeadline(userId, Date.now() + HOUR)
    await initializeIdentity(userId, 'pw')

    // A reload empties memory but leaves IndexedDB.
    lockIdentities()
    expect(await getIdentityState(userId)).toBe('locked')
    expect(await restoreUnlockedIdentity(userId)).toBe(true)
    expect(await getIdentityState(userId)).toBe('unlocked')

    // The restored key is a working private key: something sealed to this identity opens with it.
    const sender = await generateIdentityKeyPair()
    const mine = await importPublicKey(
      (await getStoredPublicKey(userId)) as JsonWebKey,
    )
    const messageKey = await generateMessageKey()
    const wrapped = await wrapMessageKey(messageKey, sender.privateKey, mine)
    const restoredKey = getActivePrivateKey(userId) as CryptoKey
    const opened = await unwrapMessageKey(
      wrapped,
      restoredKey,
      await importPublicKey(await exportPublicKey(sender.publicKey)),
    )
    expect(opened).toBeDefined()
    expect(restoredKey.extractable).toBe(false)
  })

  it('does not restore an expired key and removes it', async () => {
    await setRememberDeadline(userId, Date.now() + HOUR)
    await initializeIdentity(userId, 'pw')
    lockIdentities()
    expect(await restoreUnlockedIdentity(userId, Date.now() + 2 * HOUR)).toBe(
      false,
    )
    // The expired entry was deleted, so even "now" no longer restores it.
    expect(await restoreUnlockedIdentity(userId)).toBe(false)
    expect(await getIdentityState(userId)).toBe('locked')
  })

  it('remembers nothing unless a deadline was set', async () => {
    await initializeIdentity(userId, 'pw')
    lockIdentities()
    expect(await restoreUnlockedIdentity(userId)).toBe(false)
  })

  it('forgets on sign-out or opt-out, and when the deadline is cleared', async () => {
    await setRememberDeadline(userId, Date.now() + HOUR)
    await initializeIdentity(userId, 'pw')
    await forgetRemembered(userId)
    lockIdentities()
    expect(await restoreUnlockedIdentity(userId)).toBe(false)

    await setRememberDeadline(userId, Date.now() + HOUR)
    await unlockStoredIdentity(userId, 'pw')
    await setRememberDeadline(userId, null)
    lockIdentities()
    expect(await restoreUnlockedIdentity(userId)).toBe(false)
  })

  it('remembers an already-unlocked key as soon as the setting is turned on', async () => {
    await initializeIdentity(userId, 'pw')
    await setRememberDeadline(userId, Date.now() + HOUR)
    lockIdentities()
    expect(await restoreUnlockedIdentity(userId)).toBe(true)
  })

  it('does not keep using a remembered key after the identity is replaced or deleted', async () => {
    await setRememberDeadline(userId, Date.now() + HOUR)
    await initializeIdentity(userId, 'pw')
    const backup = await exportKeyBackup(userId)
    await importKeyBackup(userId, backup)
    lockIdentities()
    expect(await restoreUnlockedIdentity(userId)).toBe(false)

    await unlockStoredIdentity(userId, 'pw')
    await forgetIdentity(userId)
    lockIdentities()
    expect(await restoreUnlockedIdentity(userId)).toBe(false)
    expect(await getIdentityState(userId)).toBe('missing')
  })

  it('tracks a password change so the remembered key is the current one', async () => {
    await setRememberDeadline(userId, Date.now() + HOUR)
    await initializeIdentity(userId, 'old')
    await rewrapIdentity(userId, 'old', 'new')
    lockIdentities()
    expect(await restoreUnlockedIdentity(userId)).toBe(true)
  })
})
