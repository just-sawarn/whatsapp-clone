import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/lib/supabase', async () => {
  const helpers = await import('./helpers')
  return {
    get supabase() {
      return helpers.currentClient()
    },
    isSupabaseConfigured: true,
  }
})

import { initializeIdentity } from '../../src/lib/crypto/keyStore'
import { createProfile } from '../../src/lib/profile'
import { openDirectChat } from '../../src/features/chat/chatService'
import { downloadMedia } from '../../src/features/chat/messageExtras'
import {
  deleteForEveryone,
  loadMessage,
  sendMessage,
} from '../../src/features/chat/messageService'
import { signedUrl } from '../../src/lib/signedUrls'
import {
  actAs,
  closePool,
  createUser,
  currentClient,
  type TestUser,
} from './helpers'

async function stored(): Promise<
  Array<{ key: string; size: number; head: string }>
> {
  const response = await fetch(
    `http://localhost:${process.env.TEST_PROXY_PORT ?? 54332}/__test/storage`,
  )
  return (await response.json()) as Array<{
    key: string
    size: number
    head: string
  }>
}
const chatMediaCount = async () =>
  (await stored()).filter((file) => file.key.startsWith('chat-media/')).length

const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer())
const original = new Uint8Array(4000).map((_, index) => index % 251)
const preview = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7, 6, 5, 4])

let alice: TestUser
let bob: TestUser
let chatId = ''

beforeAll(async () => {
  ;[alice, bob] = await Promise.all([
    createUser('media_alice'),
    createUser('media_bob'),
  ])
  for (const user of [alice, bob]) {
    actAs(user)
    await initializeIdentity(user.id, 'password-123')
    await createProfile({
      id: user.id,
      username: user.name,
      displayName: user.name,
      about: '',
    })
  }
  actAs(alice)
  chatId = await openDirectChat(bob.id)
})

afterAll(closePool)

describe('photo thumbnails', () => {
  it('stores an encrypted thumbnail beside the photo that only members can decrypt', async () => {
    const before = await chatMediaCount()
    actAs(alice)
    const sent = await sendMessage({
      chatId,
      senderId: alice.id,
      attachment: {
        blob: new Blob([original], { type: 'image/jpeg' }),
        name: 'trip.jpg',
        mime: 'image/jpeg',
        width: 2000,
        height: 1500,
        thumb: {
          blob: new Blob([preview], { type: 'image/jpeg' }),
          width: 640,
          height: 480,
        },
        tiny: 'data:image/jpeg;base64,/9j/4AAQ',
      },
    })
    expect(await chatMediaCount()).toBe(before + 2)
    const files = (await stored()).filter((file) =>
      file.key.startsWith('chat-media/'),
    )
    const [photoFile, thumbFile] = files.slice(-2)
    expect(thumbFile?.key).toBe(`${photoFile?.key}.t`)
    // What the server holds is ciphertext: neither starts with JPEG magic bytes, and each is the plaintext plus a tag.
    expect(photoFile?.head.startsWith('ffd8ff')).toBe(false)
    expect(thumbFile?.head.startsWith('ffd8ff')).toBe(false)
    expect(photoFile?.size).toBe(original.length + 16)
    expect(thumbFile?.size).toBe(preview.length + 16)

    actAs(bob)
    const received = await loadMessage(sent.id, bob.id)
    expect(received?.media).toMatchObject({
      name: 'trip.jpg',
      width: 2000,
      tiny: 'data:image/jpeg;base64,/9j/4AAQ',
      thumb: { width: 640, height: 480 },
    })
    if (!received) throw new Error('message missing')
    expect(await bytesOf(await downloadMedia(received, 'thumb'))).toEqual(
      preview,
    )
    expect(await bytesOf(await downloadMedia(received, 'full'))).toEqual(
      original,
    )
  })

  it('falls back to the photo itself when a message has no thumbnail', async () => {
    actAs(alice)
    const before = await chatMediaCount()
    const sent = await sendMessage({
      chatId,
      senderId: alice.id,
      attachment: {
        blob: new Blob([original], { type: 'image/jpeg' }),
        name: 'small.jpg',
        mime: 'image/jpeg',
        width: 300,
        height: 200,
      },
    })
    expect(await chatMediaCount()).toBe(before + 1)
    const message = await loadMessage(sent.id, alice.id)
    if (!message) throw new Error('message missing')
    expect(message.media?.thumb).toBeUndefined()
    expect(await bytesOf(await downloadMedia(message, 'thumb'))).toEqual(
      original,
    )
  })

  it('removes the thumbnail together with the photo when deleted for everyone', async () => {
    actAs(alice)
    const before = await chatMediaCount()
    const sent = await sendMessage({
      chatId,
      senderId: alice.id,
      attachment: {
        blob: new Blob([original], { type: 'image/jpeg' }),
        name: 'gone.jpg',
        mime: 'image/jpeg',
        thumb: { blob: new Blob([preview]), width: 640, height: 480 },
      },
    })
    expect(await chatMediaCount()).toBe(before + 2)
    const message = await loadMessage(sent.id, alice.id)
    if (!message) throw new Error('message missing')
    await deleteForEveryone(message)
    expect(await chatMediaCount()).toBe(before)
  })
})

describe('batched signed URLs', () => {
  it('signs several files in one call and reports a missing one on its own', async () => {
    const storage = currentClient().storage.from('avatars')
    actAs(alice)
    const paths = [`${alice.id}/one.jpg`, `${alice.id}/two.jpg`]
    for (const [index, path] of paths.entries()) {
      const { error } = await storage.upload(
        path,
        new Blob([new Uint8Array([index + 1, 2, 3])], { type: 'image/jpeg' }),
        { contentType: 'image/jpeg' },
      )
      if (error) throw error
    }
    const [first, second, missing] = await Promise.allSettled([
      signedUrl('avatars', paths[0] ?? ''),
      signedUrl('avatars', paths[1] ?? ''),
      signedUrl('avatars', `${alice.id}/none.jpg`),
    ])
    expect(missing.status).toBe('rejected')
    if (first.status !== 'fulfilled' || second.status !== 'fulfilled')
      throw new Error('expected both signed URLs')
    expect([
      ...new Uint8Array(await (await fetch(first.value)).arrayBuffer()),
    ]).toEqual([1, 2, 3])
    expect([
      ...new Uint8Array(await (await fetch(second.value)).arrayBuffer()),
    ]).toEqual([2, 2, 3])
  })
})
