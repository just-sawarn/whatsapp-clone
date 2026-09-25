import { describe, expect, it } from 'vitest'
import {
  decryptBytes,
  decryptPayload,
  encryptBytes,
  encryptPayload,
  exportPublicKey,
  generateIdentityKeyPair,
  generateMessageKey,
  importPublicKey,
  parsePublicKey,
  rewrapPrivateKey,
  safetyNumber,
  unwrapMessageKey,
  unwrapPrivateKey,
  wrapMessageKey,
  wrapPrivateKey,
} from './crypto'

describe('message encryption', () => {
  it('encrypts and decrypts a versioned payload', async () => {
    const payload = {
      v: 1 as const,
      text: 'A private hello',
      replyToId: 'message-1',
    }
    const encrypted = await encryptPayload(payload)
    await expect(
      decryptPayload(encrypted.ciphertext, encrypted.iv, encrypted.messageKey),
    ).resolves.toEqual(payload)
  })

  it('rejects tampered ciphertext', async () => {
    const encrypted = await encryptPayload({ v: 1, text: 'Do not alter me' })
    const tampered = `${encrypted.ciphertext.slice(0, -2)}AA`
    await expect(
      decryptPayload(tampered, encrypted.iv, encrypted.messageKey),
    ).rejects.toThrow()
  })

  it('wraps a message key for another identity', async () => {
    const sender = await generateIdentityKeyPair()
    const recipient = await generateIdentityKeyPair()
    const encrypted = await encryptPayload({
      v: 1,
      text: 'Only the recipient can read this',
    })
    const wrapped = await wrapMessageKey(
      encrypted.messageKey,
      sender.privateKey,
      recipient.publicKey,
    )
    const senderPublic = await exportPublicKey(sender.publicKey)
    const recipientMessageKey = await unwrapMessageKey(
      wrapped,
      recipient.privateKey,
      await importPublicKey(senderPublic),
    )
    await expect(
      decryptPayload(encrypted.ciphertext, encrypted.iv, recipientMessageKey),
    ).resolves.toEqual({ v: 1, text: 'Only the recipient can read this' })
  })

  it('recovers a private identity key with the password', async () => {
    const identity = await generateIdentityKeyPair()
    const record = await wrapPrivateKey(
      identity,
      'correct horse battery staple',
    )
    const recovered = await unwrapPrivateKey(
      record,
      'correct horse battery staple',
    )
    const recipient = await generateIdentityKeyPair()
    const encrypted = await encryptPayload({ v: 1, text: 'Recovered locally' })
    const wrapped = await wrapMessageKey(
      encrypted.messageKey,
      recovered,
      recipient.publicKey,
    )
    const publicKey = await importPublicKey(
      await exportPublicKey(identity.publicKey),
    )
    const recoveredMessageKey = await unwrapMessageKey(
      wrapped,
      recipient.privateKey,
      publicKey,
    )
    await expect(
      decryptPayload(encrypted.ciphertext, encrypted.iv, recoveredMessageKey),
    ).resolves.toEqual({ v: 1, text: 'Recovered locally' })
  })
})

describe('attachments', () => {
  it('encrypts bytes under the message key and rejects tampering', async () => {
    const key = await generateMessageKey()
    const bytes = new TextEncoder().encode('binary attachment').buffer
    const sealed = await encryptBytes(bytes, key)
    expect(
      new TextDecoder().decode(await decryptBytes(sealed.data, sealed.iv, key)),
    ).toBe('binary attachment')

    const flipped = new Uint8Array(sealed.data.slice(0))
    flipped[0] = (flipped[0] ?? 0) ^ 1
    await expect(decryptBytes(flipped.buffer, sealed.iv, key)).rejects.toThrow()
  })

  it('can encrypt the payload with an existing message key', async () => {
    const key = await generateMessageKey()
    const encrypted = await encryptPayload(
      {
        v: 1,
        text: 'caption',
        media: { name: 'a.png', mime: 'image/png', size: 3, iv: 'x' },
      },
      key,
    )
    expect(encrypted.messageKey).toBe(key)
    await expect(
      decryptPayload(encrypted.ciphertext, encrypted.iv, key),
    ).resolves.toMatchObject({ text: 'caption', media: { name: 'a.png' } })
  })
})

describe('key protection', () => {
  it('rewraps under a new password and rejects the old one', async () => {
    const identity = await generateIdentityKeyPair()
    const record = await wrapPrivateKey(identity, 'old password')
    const rewrapped = await rewrapPrivateKey(
      record,
      'old password',
      'new password',
    )
    expect(rewrapped.publicKey).toEqual(record.publicKey)
    await expect(unwrapPrivateKey(rewrapped, 'old password')).rejects.toThrow()
    await expect(
      unwrapPrivateKey(rewrapped, 'new password'),
    ).resolves.toBeDefined()
  })

  it('still opens records written before the iterations field existed', async () => {
    const identity = await generateIdentityKeyPair()
    const { iterations, ...withoutIterations } = await wrapPrivateKey(
      identity,
      'pw',
    )
    expect(iterations).toBe(600_000)
    // A legacy record used 310k rounds, so it is not decryptable with the new default.
    await expect(unwrapPrivateKey(withoutIterations, 'pw')).rejects.toThrow()
  })

  it('keeps unlocked private keys non-extractable', async () => {
    const identity = await generateIdentityKeyPair()
    const unlocked = await unwrapPrivateKey(
      await wrapPrivateKey(identity, 'pw'),
      'pw',
    )
    expect(unlocked.extractable).toBe(false)
  })
})

describe('verification codes', () => {
  it('produces the same safety number on both sides, whatever the argument order', async () => {
    const alice = await exportPublicKey(
      (await generateIdentityKeyPair()).publicKey,
    )
    const bob = await exportPublicKey(
      (await generateIdentityKeyPair()).publicKey,
    )
    const forward = await safetyNumber(alice, bob)
    expect(forward).toBe(await safetyNumber(bob, alice))
    expect(forward).toMatch(/^(\d{5} ){11}\d{5}$/)
  })

  it('changes when a key is substituted', async () => {
    const alice = await exportPublicKey(
      (await generateIdentityKeyPair()).publicKey,
    )
    const bob = await exportPublicKey(
      (await generateIdentityKeyPair()).publicKey,
    )
    const mallory = await exportPublicKey(
      (await generateIdentityKeyPair()).publicKey,
    )
    expect(await safetyNumber(alice, bob)).not.toBe(
      await safetyNumber(alice, mallory),
    )
  })

  it('rejects malformed public keys with a friendly error', () => {
    expect(() => parsePublicKey('not json')).toThrow(/invalid encryption key/)
    expect(() => parsePublicKey('{"kty":"RSA"}')).toThrow(
      /invalid encryption key/,
    )
  })
})
