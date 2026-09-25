import { describe, expect, it } from 'vitest'
import {
  encryptBytes,
  decryptBytes,
  exportPublicKey,
  generateIdentityKeyPair,
} from '../../lib/crypto/crypto'
import { decryptRow, sealMessage, type MessageRow } from './messageCrypto'
import { canDeleteForEveryone, kindOfMime } from './messageService'
import { toPreview } from './preview'
import type { ChatMessage } from './types'

async function identity() {
  const pair = await generateIdentityKeyPair()
  return {
    pair,
    serialized: JSON.stringify(await exportPublicKey(pair.publicKey)),
  }
}

async function rowFor(
  sealed: Awaited<ReturnType<typeof sealMessage>>,
  sender: { serialized: string },
  senderId: string,
  viewerId: string,
  extra: Partial<MessageRow> = {},
): Promise<MessageRow> {
  return {
    id: 'm1',
    chat_id: 'c1',
    sender_id: senderId,
    ciphertext: sealed.ciphertext,
    iv: sealed.iv,
    wrapped_key: sealed.encryptedKeys[viewerId] ?? null,
    sender_public_key: sender.serialized,
    message_type: 'text',
    media_path: null,
    duration_seconds: null,
    reply_to_id: null,
    is_forwarded: false,
    created_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...extra,
  }
}

describe('sealing and opening messages', () => {
  it('lets every participant, and only participants, read a group message', async () => {
    const [alice, bob, carol, mallory] = await Promise.all([
      identity(),
      identity(),
      identity(),
      identity(),
    ])
    const recipients = [
      { userId: 'alice', publicKey: alice.serialized },
      { userId: 'bob', publicKey: bob.serialized },
      { userId: 'carol', publicKey: carol.serialized },
    ]
    const sealed = await sealMessage(
      { v: 1, text: 'meet at 6', replyToId: 'earlier' },
      alice.pair.privateKey,
      recipients,
    )

    for (const [name, person] of [
      ['alice', alice],
      ['bob', bob],
      ['carol', carol],
    ] as const) {
      const message = await decryptRow(
        await rowFor(sealed, alice, 'alice', name),
        name,
        person.pair.privateKey,
      )
      expect(message).toMatchObject({
        text: 'meet at 6',
        replyToId: 'earlier',
        isMine: name === 'alice',
        undecryptable: false,
      })
    }

    // Mallory is not a recipient: no wrapped key means the row is not for her at all.
    expect(
      await decryptRow(
        await rowFor(sealed, alice, 'alice', 'mallory'),
        'mallory',
        mallory.pair.privateKey,
      ),
    ).toBeNull()
    // Even handed Bob's wrapped key she cannot open it.
    const stolen = await rowFor(sealed, alice, 'alice', 'bob')
    expect(
      await decryptRow(stolen, 'mallory', mallory.pair.privateKey),
    ).toMatchObject({ undecryptable: true, text: '' })
  })

  it('flags a tampered ciphertext instead of showing garbage', async () => {
    const [alice, bob] = await Promise.all([identity(), identity()])
    const sealed = await sealMessage(
      { v: 1, text: 'original' },
      alice.pair.privateKey,
      [{ userId: 'bob', publicKey: bob.serialized }],
    )
    const row = await rowFor(sealed, alice, 'alice', 'bob')
    row.ciphertext = `${row.ciphertext.slice(0, -4)}AAAA`
    expect(await decryptRow(row, 'bob', bob.pair.privateKey)).toMatchObject({
      undecryptable: true,
    })
  })

  it('rejects a message whose sender key was substituted', async () => {
    const [alice, bob, mallory] = await Promise.all([
      identity(),
      identity(),
      identity(),
    ])
    const sealed = await sealMessage(
      { v: 1, text: 'hi' },
      alice.pair.privateKey,
      [{ userId: 'bob', publicKey: bob.serialized }],
    )
    const forged = await rowFor(sealed, mallory, 'alice', 'bob')
    expect(await decryptRow(forged, 'bob', bob.pair.privateKey)).toMatchObject({
      undecryptable: true,
    })
  })

  it('carries attachment metadata and decrypts the file with the same key', async () => {
    const [alice, bob] = await Promise.all([identity(), identity()])
    const file = new TextEncoder().encode('pretend jpeg bytes')
    const seal = await sealMessage({ v: 1 }, alice.pair.privateKey, [
      { userId: 'bob', publicKey: bob.serialized },
    ])
    const encryptedFile = await encryptBytes(file.buffer, seal.messageKey)
    const withMedia = await sealMessage(
      {
        v: 1,
        media: {
          name: 'a.jpg',
          mime: 'image/jpeg',
          size: file.length,
          iv: encryptedFile.iv,
        },
      },
      alice.pair.privateKey,
      [{ userId: 'bob', publicKey: bob.serialized }],
      seal.messageKey,
    )
    const message = await decryptRow(
      await rowFor(withMedia, alice, 'alice', 'bob', {
        message_type: 'image',
        media_path: 'c1/alice/x',
      }),
      'bob',
      bob.pair.privateKey,
    )
    expect(message?.media).toMatchObject({ name: 'a.jpg', path: 'c1/alice/x' })
    if (!message?.media || !message.messageKey) throw new Error('media missing')
    const plain = await decryptBytes(
      encryptedFile.data,
      message.media.iv,
      message.messageKey,
    )
    expect(new TextDecoder().decode(plain)).toBe('pretend jpeg bytes')
  })

  it('shows a placeholder for messages deleted for everyone without needing a key', async () => {
    const [alice] = await Promise.all([identity()])
    const row = await rowFor(
      await sealMessage({ v: 1, text: 'gone' }, alice.pair.privateKey, [
        { userId: 'alice', publicKey: alice.serialized },
      ]),
      alice,
      'alice',
      'alice',
      {
        deleted_at: '2026-01-01T00:01:00Z',
        ciphertext: '',
        iv: '',
        wrapped_key: null,
      },
    )
    expect(await decryptRow(row, 'alice', alice.pair.privateKey)).toMatchObject(
      { deleted: true, text: '' },
    )
  })
})

describe('message rules', () => {
  const base: ChatMessage = {
    id: 'm',
    chatId: 'c',
    senderId: 'me',
    createdAt: new Date().toISOString(),
    isMine: true,
    kind: 'text',
    text: 'hi',
    replyToId: null,
    isForwarded: false,
    deleted: false,
    undecryptable: false,
    media: null,
    linkPreview: null,
    messageKey: null,
    sendState: 'sent',
  }

  it('allows delete-for-everyone only for my own recent messages', () => {
    expect(canDeleteForEveryone(base)).toBe(true)
    expect(canDeleteForEveryone({ ...base, isMine: false })).toBe(false)
    expect(
      canDeleteForEveryone({
        ...base,
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      }),
    ).toBe(false)
    expect(canDeleteForEveryone({ ...base, deleted: true })).toBe(false)
  })

  it('classifies attachments and never treats SVG as an inline image', () => {
    expect(kindOfMime('image/png')).toBe('image')
    expect(kindOfMime('image/svg+xml')).toBe('file')
    expect(kindOfMime('audio/webm')).toBe('audio')
    expect(kindOfMime('application/pdf')).toBe('file')
  })

  it('builds previews for each kind', () => {
    expect(toPreview({ ...base, deleted: true }).text).toBe(
      'This message was deleted',
    )
    expect(toPreview({ ...base, kind: 'image', text: '' }).text).toBe('Photo')
    expect(toPreview({ ...base, kind: 'audio', text: '' }).text).toBe(
      'Voice message',
    )
    expect(toPreview({ ...base, kind: 'image', text: 'holiday' }).text).toBe(
      'holiday',
    )
  })
})
