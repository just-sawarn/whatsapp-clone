import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  exportKeyBackup,
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
