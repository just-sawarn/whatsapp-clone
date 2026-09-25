import { describe, expect, it } from 'vitest'
import { decryptPayload, encryptPayload, exportPublicKey, generateIdentityKeyPair, importPublicKey, unwrapMessageKey, unwrapPrivateKey, wrapMessageKey, wrapPrivateKey } from './crypto'

describe('message encryption', () => {
  it('encrypts and decrypts a versioned payload', async () => {
    const payload = { v: 1 as const, text: 'A private hello', replyToId: 'message-1' }
    const encrypted = await encryptPayload(payload)
    await expect(decryptPayload(encrypted.ciphertext, encrypted.iv, encrypted.messageKey)).resolves.toEqual(payload)
  })

  it('rejects tampered ciphertext', async () => {
    const encrypted = await encryptPayload({ v: 1, text: 'Do not alter me' })
    const tampered = `${encrypted.ciphertext.slice(0, -2)}AA`
    await expect(decryptPayload(tampered, encrypted.iv, encrypted.messageKey)).rejects.toThrow()
  })

  it('wraps a message key for another identity', async () => {
    const sender = await generateIdentityKeyPair()
    const recipient = await generateIdentityKeyPair()
    const encrypted = await encryptPayload({ v: 1, text: 'Only the recipient can read this' })
    const wrapped = await wrapMessageKey(encrypted.messageKey, sender.privateKey, recipient.publicKey)
    const senderPublic = await exportPublicKey(sender.publicKey)
    const recipientMessageKey = await unwrapMessageKey(wrapped, recipient.privateKey, await importPublicKey(senderPublic))
    await expect(decryptPayload(encrypted.ciphertext, encrypted.iv, recipientMessageKey)).resolves.toEqual({ v: 1, text: 'Only the recipient can read this' })
  })

  it('recovers a private identity key with the password', async () => {
    const identity = await generateIdentityKeyPair()
    const record = await wrapPrivateKey(identity, 'correct horse battery staple')
    const recovered = await unwrapPrivateKey(record, 'correct horse battery staple')
    const recipient = await generateIdentityKeyPair()
    const encrypted = await encryptPayload({ v: 1, text: 'Recovered locally' })
    const wrapped = await wrapMessageKey(encrypted.messageKey, recovered, recipient.publicKey)
    const publicKey = await importPublicKey(await exportPublicKey(identity.publicKey))
    const recoveredMessageKey = await unwrapMessageKey(wrapped, recipient.privateKey, publicKey)
    await expect(decryptPayload(encrypted.ciphertext, encrypted.iv, recoveredMessageKey)).resolves.toEqual({ v: 1, text: 'Recovered locally' })
  })
})
