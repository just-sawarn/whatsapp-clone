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
import {
  leaveChat,
  loadChatOverview,
} from '../../src/features/chat/chatService'
import {
  loadMessages,
  sendMessage,
} from '../../src/features/chat/messageService'
import {
  addParticipants,
  loadParticipants,
  setParticipantRole,
} from '../../src/features/chat/groupService'
import {
  addGroupToCommunity,
  createCommunity,
  createGroupInCommunity,
  deactivateCommunity,
  getInviteCode,
  joinByInvite,
  joinCommunityGroup,
  loadCommunities,
  loadCommunityGroups,
  previewInvite,
  removeGroupFromCommunity,
  resetInviteCode,
  updateCommunity,
} from '../../src/features/communities/communityService'
import { createGroupChat } from '../../src/features/chat/chatService'
import { actAs, closePool, createUser, type TestUser } from './helpers'

let alice: TestUser
let bob: TestUser
let carol: TestUser
let communityId = ''
let announcements = ''
let generalId = ''

/** Usernames are unique across the whole test database, so this suite uses its own. */
const display = (user: TestUser) =>
  user.name[0]?.toUpperCase() + user.name.slice(1)

async function signUp(user: TestUser) {
  actAs(user)
  await initializeIdentity(user.id, 'password-123')
  await createProfile({
    id: user.id,
    username: user.name,
    displayName: display(user),
    about: '',
  })
}

beforeAll(async () => {
  ;[alice, bob, carol] = await Promise.all([
    createUser('cm_alice'),
    createUser('cm_bob'),
    createUser('cm_carol'),
  ])
  for (const user of [alice, bob, carol]) await signUp(user)
})

afterAll(closePool)

describe('creating a community', () => {
  it('makes the creator an admin and invited people members', async () => {
    actAs(alice)
    communityId = await createCommunity(
      'Neighbourhood',
      'Everything for the street',
      [bob.id],
    )
    const [mine] = await loadCommunities()
    expect(mine).toMatchObject({
      id: communityId,
      name: 'Neighbourhood',
      description: 'Everything for the street',
      memberCount: 2,
      groupCount: 0,
      myRole: 'admin',
    })
    announcements = mine?.announcementChatId ?? ''

    actAs(bob)
    expect((await loadCommunities())[0]).toMatchObject({
      id: communityId,
      myRole: 'member',
    })
    actAs(carol)
    expect(await loadCommunities()).toEqual([])
  })

  it('validates the details', async () => {
    actAs(alice)
    await expect(createCommunity('   ', '', [])).rejects.toMatchObject({
      message: expect.stringMatching(/name must be/),
    })
    await expect(createCommunity('x', 'd'.repeat(501), [])).rejects.toBeTruthy()
  })
})

describe('announcements are admin-only and still end-to-end encrypted', () => {
  it('lets an admin post and members read (decrypted), but not post', async () => {
    actAs(alice)
    await sendMessage({
      chatId: announcements,
      senderId: alice.id,
      text: 'Bins go out on Tuesday',
    })

    actAs(bob)
    const overview = (await loadChatOverview(bob.id)).find(
      (chat) => chat.id === announcements,
    )
    expect(overview).toMatchObject({
      isAnnouncement: true,
      canPost: false,
      communityId,
      communityName: 'Neighbourhood',
      isGroup: true,
    })
    expect(overview?.lastMessage?.text).toBe('Bins go out on Tuesday')
    expect(
      (await loadMessages(announcements, bob.id)).messages.map(
        (message) => message.text,
      ),
    ).toEqual(['Bins go out on Tuesday'])
    await expect(
      sendMessage({ chatId: announcements, senderId: bob.id, text: 'me too' }),
    ).rejects.toBeTruthy()

    actAs(alice)
    expect(
      (await loadChatOverview(alice.id)).find(
        (chat) => chat.id === announcements,
      )?.canPost,
    ).toBe(true)
  })

  it('lets an admin promote another member to post', async () => {
    actAs(alice)
    await setParticipantRole(announcements, bob.id, 'admin')
    actAs(bob)
    await sendMessage({
      chatId: announcements,
      senderId: bob.id,
      text: 'Now I can post',
    })
    expect((await loadMessages(announcements, bob.id)).messages).toHaveLength(2)
    actAs(alice)
    await setParticipantRole(announcements, bob.id, 'member')
  })

  it('keeps outsiders out', async () => {
    actAs(carol)
    expect((await loadMessages(announcements, carol.id)).messages).toEqual([])
    expect(
      (await loadChatOverview(carol.id)).find(
        (chat) => chat.id === announcements,
      ),
    ).toBeUndefined()
  })
})

describe('groups inside a community', () => {
  it('creates a group, links an existing one, and lists both to members', async () => {
    actAs(alice)
    generalId = await createGroupInCommunity(communityId, 'General')
    const existing = await createGroupChat('Existing', [carol.id])
    await addGroupToCommunity(communityId, existing)

    actAs(bob)
    const groups = await loadCommunityGroups(communityId)
    expect(groups.map((group) => group.name).sort()).toEqual([
      'Existing',
      'General',
    ])
    expect(groups.find((group) => group.name === 'General')).toMatchObject({
      isMember: false,
      memberCount: 1,
    })
    // Carol was in the linked group, so she became a community member.
    actAs(carol)
    expect((await loadCommunities()).map((community) => community.id)).toEqual([
      communityId,
    ])
  })

  it('lets a member join a group and talk in it', async () => {
    actAs(bob)
    await joinCommunityGroup(generalId)
    await sendMessage({
      chatId: generalId,
      senderId: bob.id,
      text: 'hello general',
    })
    actAs(alice)
    expect(
      (await loadMessages(generalId, alice.id)).messages.map(
        (message) => message.text,
      ),
    ).toEqual(['hello general'])
    expect(
      (await loadChatOverview(alice.id)).find((chat) => chat.id === generalId),
    ).toMatchObject({ communityId, isAnnouncement: false, canPost: true })
  })

  it('stops non-admins from managing groups or the community', async () => {
    actAs(bob)
    await expect(
      createGroupInCommunity(communityId, 'Sneaky'),
    ).rejects.toBeTruthy()
    await expect(
      removeGroupFromCommunity(communityId, generalId),
    ).rejects.toBeTruthy()
    await expect(
      updateCommunity(communityId, 'Renamed', ''),
    ).rejects.toBeTruthy()
    await expect(deactivateCommunity(communityId)).rejects.toBeTruthy()
    await expect(getInviteCode(communityId)).rejects.toBeTruthy()
  })
})

describe('invite links', () => {
  it('previews and joins with a code, and a reset invalidates the old code', async () => {
    actAs(alice)
    const code = await getInviteCode(communityId)
    expect(await getInviteCode(communityId)).toBe(code)

    const dave = await createUser('cm_dave')
    await signUp(dave)
    actAs(dave)
    expect(await previewInvite(code)).toMatchObject({
      name: 'Neighbourhood',
      groupCount: 2,
      alreadyMember: false,
    })
    expect(await previewInvite('not-a-real-code-at-all')).toBeNull()
    expect(await joinByInvite(code)).toBe(communityId)
    expect((await loadCommunities())[0]).toMatchObject({
      id: communityId,
      myRole: 'member',
    })
    expect((await previewInvite(code))?.alreadyMember).toBe(true)

    actAs(alice)
    const fresh = await resetInviteCode(communityId)
    expect(fresh).not.toBe(code)
    actAs(carol)
    expect(await previewInvite(code)).toBeNull()
    await expect(joinByInvite(code)).rejects.toBeTruthy()
    expect(await previewInvite(fresh)).not.toBeNull()
  })
})

describe('membership changes', () => {
  it('lists members through the announcements chat and lets admins add people', async () => {
    actAs(alice)
    const eve = await createUser('cm_eve')
    await signUp(eve)
    actAs(alice)
    await addParticipants(announcements, [eve.id])
    const names = (await loadParticipants(announcements))
      .map((member) => member.displayName)
      .sort()
    expect(names).toContain(display(eve))
    expect((await loadCommunities())[0]?.memberCount).toBe(names.length)
  })

  it('removes a leaver from the community and from its groups', async () => {
    actAs(bob)
    await leaveChat(announcements, bob.id)
    expect(await loadCommunities()).toEqual([])
    expect(
      (await loadChatOverview(bob.id)).find((chat) => chat.id === generalId),
    ).toBeUndefined()
  })
})

describe('editing and ending a community', () => {
  it('renames the community and keeps the announcements chat in step', async () => {
    actAs(alice)
    await updateCommunity(
      communityId,
      'Neighbourhood Watch',
      'Updated description',
    )
    expect((await loadCommunities())[0]).toMatchObject({
      name: 'Neighbourhood Watch',
      description: 'Updated description',
    })
    expect(
      (await loadChatOverview(alice.id)).find(
        (chat) => chat.id === announcements,
      )?.name,
    ).toBe('Neighbourhood Watch')
  })

  it('unlinks a group without deleting it', async () => {
    actAs(alice)
    await removeGroupFromCommunity(communityId, generalId)
    expect((await loadCommunities())[0]?.groupCount).toBe(1)
    expect(
      (await loadChatOverview(alice.id)).find((chat) => chat.id === generalId),
    ).toMatchObject({ communityId: null })
  })

  it('deactivates: the community and announcements go, the groups stay', async () => {
    actAs(alice)
    await deactivateCommunity(communityId)
    expect(await loadCommunities()).toEqual([])
    const chats = await loadChatOverview(alice.id)
    expect(chats.find((chat) => chat.id === announcements)).toBeUndefined()
    expect(chats.find((chat) => chat.id === generalId)).toBeDefined()
  })
})
