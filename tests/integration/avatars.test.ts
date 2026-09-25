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

// Canvas is a browser API; the real resize is covered by the browser tests. Here the file passes through.
vi.mock('../../src/lib/image', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/image')>()
  return {
    ...actual,
    resizeImage: async (file: File) => ({
      blob: new Blob([await file.arrayBuffer()], { type: 'image/jpeg' }),
      width: 1,
      height: 1,
    }),
  }
})

import { initializeIdentity } from '../../src/lib/crypto/keyStore'
import { createProfile } from '../../src/lib/profile'
import {
  createGroupChat,
  loadChatOverview,
} from '../../src/features/chat/chatService'
import {
  removeChatAvatar,
  uploadChatAvatar,
} from '../../src/features/chat/chatAvatarService'
import {
  addGroupToCommunity,
  createCommunity,
  loadCommunities,
  loadCommunityGroups,
} from '../../src/features/communities/communityService'
import {
  actAs,
  closePool,
  createUser,
  currentClient,
  type TestUser,
} from './helpers'

// The storage stand-in lives in the proxy (another process), so read it over HTTP.
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

const jpeg = (marker: number) =>
  new File(
    [new Uint8Array([0xff, 0xd8, 0xff, 0xe0, marker, 1, 2, 3])],
    'photo.jpg',
    { type: 'image/jpeg' },
  )

let alice: TestUser
let bob: TestUser
let carol: TestUser
let groupId = ''

async function signUp(user: TestUser) {
  actAs(user)
  await initializeIdentity(user.id, 'password-123')
  await createProfile({
    id: user.id,
    username: user.name,
    displayName: user.name,
    about: '',
  })
}

beforeAll(async () => {
  ;[alice, bob, carol] = await Promise.all([
    createUser('av_alice'),
    createUser('av_bob'),
    createUser('av_carol'),
  ])
  for (const user of [alice, bob, carol]) await signUp(user)
  actAs(alice)
  groupId = await createGroupChat('Photo group', [bob.id])
})

afterAll(closePool)

describe('group photos', () => {
  it('lets an admin upload one, and members see the same path in their chat list', async () => {
    actAs(alice)
    const path = await uploadChatAvatar(groupId, jpeg(1), null)
    expect(path.startsWith(`${groupId}/`)).toBe(true)

    for (const user of [alice, bob]) {
      actAs(user)
      const chat = (await loadChatOverview(user.id)).find(
        (item) => item.id === groupId,
      )
      expect(chat).toMatchObject({
        avatarPath: path,
        avatarBucket: 'chat-avatars',
      })
    }
    const objects = await stored()
    expect(objects.map((item) => item.key)).toContain(`chat-avatars/${path}`)
  })

  it('replaces the photo and deletes the old file', async () => {
    actAs(alice)
    const first =
      (await loadChatOverview(alice.id)).find((item) => item.id === groupId)
        ?.avatarPath ?? null
    const second = await uploadChatAvatar(groupId, jpeg(2), first)
    expect(second).not.toBe(first)
    const keys = (await stored()).map((item) => item.key)
    expect(keys).toContain(`chat-avatars/${second}`)
    expect(keys).not.toContain(`chat-avatars/${first}`)
  })

  it('does not let a member change it, and cleans up the file it uploaded', async () => {
    actAs(bob)
    const before = (await stored()).length
    await expect(uploadChatAvatar(groupId, jpeg(3), null)).rejects.toThrow(
      /Only group admins/,
    )
    expect((await stored()).length).toBe(before)
  })

  it('refuses to point a chat at a file in another chat’s folder', async () => {
    actAs(alice)
    const { error } = await currentClient()
      .from('chats')
      .update({ avatar_url: `${crypto.randomUUID()}/steal.jpg` })
      .eq('id', groupId)
    expect(error?.message).toMatch(/own folder/)
  })

  it('removes the photo', async () => {
    actAs(alice)
    const current = (await loadChatOverview(alice.id)).find(
      (item) => item.id === groupId,
    )?.avatarPath
    if (!current) throw new Error('expected a photo')
    await removeChatAvatar(groupId, current)
    expect(
      (await loadChatOverview(alice.id)).find((item) => item.id === groupId)
        ?.avatarPath,
    ).toBeNull()
    expect((await stored()).map((item) => item.key)).not.toContain(
      `chat-avatars/${current}`,
    )
  })

  it('rejects files that are not photos before uploading anything', async () => {
    actAs(alice)
    const before = (await stored()).length
    await expect(
      uploadChatAvatar(
        groupId,
        new File(['x'], 'a.pdf', { type: 'application/pdf' }),
        null,
      ),
    ).rejects.toThrow(/Choose a photo/)
    await expect(
      uploadChatAvatar(
        groupId,
        new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' }),
        null,
      ),
    ).rejects.toThrow(/Choose a photo/)
    expect((await stored()).length).toBe(before)
  })
})

describe('community photos', () => {
  it('uses the announcements group photo, visible to members and in the group list', async () => {
    actAs(alice)
    const communityId = await createCommunity('Photo community', '', [bob.id])
    const community = (await loadCommunities()).find(
      (item) => item.id === communityId,
    )
    if (!community) throw new Error('community missing')
    expect(community.avatarPath).toBeNull()

    const path = await uploadChatAvatar(
      community.announcementChatId,
      jpeg(4),
      null,
    )
    expect(
      (await loadCommunities()).find((item) => item.id === communityId)
        ?.avatarPath,
    ).toBe(path)

    actAs(bob)
    expect(
      (await loadCommunities()).find((item) => item.id === communityId)
        ?.avatarPath,
    ).toBe(path)

    // A photo on a linked group is visible in the community's group list, before anyone joins it.
    actAs(alice)
    await uploadChatAvatar(groupId, jpeg(5), null)
    await addGroupToCommunity(communityId, groupId)
    const listed = (await loadCommunityGroups(communityId)).find(
      (group) => group.chatId === groupId,
    )
    expect(listed?.avatarPath).toMatch(new RegExp(`^${groupId}/`))

    actAs(carol)
    expect(await loadCommunities()).toEqual([])
  })

  it('only lets a community admin change the community photo', async () => {
    actAs(bob)
    const community = (await loadCommunities())[0]
    if (!community) throw new Error('community missing')
    await expect(
      uploadChatAvatar(community.announcementChatId, jpeg(6), null),
    ).rejects.toThrow(/Only group admins/)
  })
})
