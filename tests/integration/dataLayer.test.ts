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
import {
  createProfile,
  findProfile,
  getProfile,
  updateProfile,
} from '../../src/lib/profile'
import {
  addContact,
  loadContacts,
  setBlocked,
} from '../../src/features/contacts/contactsService'
import {
  clearDirectChat,
  createGroupChat,
  loadChatOverview,
  markChatRead,
  openDirectChat,
  updateChatFlags,
} from '../../src/features/chat/chatService'
import {
  addParticipants,
  loadParticipants,
  removeParticipant,
  renameGroup,
  setParticipantRole,
} from '../../src/features/chat/groupService'
import {
  loadReactions,
  loadReceipts,
  loadStarredIds,
  setReaction,
  setStarred,
} from '../../src/features/chat/messageExtras'
import {
  deleteForEveryone,
  deleteForMe,
  loadMessage,
  loadMessages,
  loadStarredMessages,
  sendMessage,
} from '../../src/features/chat/messageService'
import { statusByMessage } from '../../src/features/chat/receipts'
import {
  deleteStatus,
  loadStatuses,
  loadViewers,
  markStatusViewed,
  postTextStatus,
} from '../../src/features/status/statusService'
import { actAs, closePool, createUser, sql, type TestUser } from './helpers'

let alice: TestUser
let bob: TestUser
let carol: TestUser
let directChat = ''
let firstMessage = ''

async function signUp(
  user: TestUser,
  discoverable: 'username' | 'username_and_email' | 'nobody' = 'username',
) {
  actAs(user)
  await initializeIdentity(user.id, 'password-123')
  await createProfile({
    id: user.id,
    username: user.name,
    displayName: user.name[0]?.toUpperCase() + user.name.slice(1),
    about: `about ${user.name}`,
  })
  if (discoverable !== 'username')
    await updateProfile(user.id, { discoverable_by: discoverable })
}

beforeAll(async () => {
  ;[alice, bob, carol] = await Promise.all([
    createUser('alice'),
    createUser('bob'),
    createUser('carol'),
  ])
  await signUp(alice)
  await signUp(bob, 'username_and_email')
  await signUp(carol, 'nobody')
})

afterAll(closePool)

describe('discovery and privacy', () => {
  it('finds people by exact username, honouring their setting', async () => {
    actAs(alice)
    expect(
      (await findProfile('@bob')).map((person) => person.username),
    ).toEqual(['bob'])
    expect(await findProfile('@carol')).toEqual([])
    expect(
      (await findProfile(bob.email)).map((person) => person.username),
    ).toEqual(['bob'])
    expect(await findProfile(alice.email)).toEqual([])
  })

  it('does not let strangers read each other’s profiles', async () => {
    actAs(alice)
    expect(await getProfile(bob.id)).toBeNull()
    expect(await getProfile(alice.id)).not.toBeNull()
  })
})

describe('a direct conversation, end to end', () => {
  it('opens one chat for the pair, from either side', async () => {
    actAs(alice)
    directChat = await openDirectChat(bob.id)
    expect(await openDirectChat(bob.id)).toBe(directChat)
    actAs(bob)
    expect(await openDirectChat(alice.id)).toBe(directChat)
  })

  it('delivers an encrypted message the recipient can read, with a preview and an unread count', async () => {
    actAs(alice)
    firstMessage = (
      await sendMessage({
        chatId: directChat,
        senderId: alice.id,
        text: 'hello bob',
      })
    ).id

    // The server only ever holds ciphertext.
    const { rows } = await sql(
      'select ciphertext, encrypted_keys from public.messages where id = $1',
      [firstMessage],
    )
    expect(rows[0]?.ciphertext).not.toContain('hello')
    expect(Object.keys(rows[0]?.encrypted_keys ?? {}).sort()).toEqual(
      [alice.id, bob.id].sort(),
    )

    actAs(bob)
    const chats = await loadChatOverview(bob.id)
    expect(chats).toHaveLength(1)
    expect(chats[0]).toMatchObject({
      name: 'Alice',
      unreadCount: 1,
      isGroup: false,
      peerId: alice.id,
    })
    expect(chats[0]?.lastMessage?.text).toBe('hello bob')
    const page = await loadMessages(directChat, bob.id)
    expect(page.messages.map((message) => message.text)).toEqual(['hello bob'])
    expect(page.messages[0]).toMatchObject({
      isMine: false,
      undecryptable: false,
    })
  })

  it('lets the sender read their own message and shows blue ticks once it is read', async () => {
    actAs(alice)
    expect(
      (await loadMessages(directChat, alice.id)).messages[0],
    ).toMatchObject({ text: 'hello bob', isMine: true })

    actAs(bob)
    await markChatRead(directChat)
    expect((await loadChatOverview(bob.id))[0]?.unreadCount).toBe(0)

    actAs(alice)
    expect(
      statusByMessage(await loadReceipts(directChat, alice.id), 1)[
        firstMessage
      ],
    ).toBe('read')
  })

  it('supports replies, reactions, stars, and paging', async () => {
    actAs(bob)
    const reply = await sendMessage({
      chatId: directChat,
      senderId: bob.id,
      text: 'hi alice',
      replyToId: firstMessage,
    })
    await setReaction(firstMessage, bob.id, '👍')
    await setStarred(bob.id, reply.id, true)
    expect(await loadStarredIds(bob.id)).toEqual([reply.id])
    expect(
      (await loadStarredMessages(bob.id)).map((message) => message.text),
    ).toEqual(['hi alice'])

    actAs(alice)
    const messages = (await loadMessages(directChat, alice.id)).messages
    expect(messages.map((message) => message.text)).toEqual([
      'hello bob',
      'hi alice',
    ])
    expect(messages[1]?.replyToId).toBe(firstMessage)
    expect(await loadReactions(directChat)).toEqual([
      { messageId: firstMessage, userId: bob.id, emoji: '👍' },
    ])

    for (let index = 0; index < 45; index++)
      await sendMessage({
        chatId: directChat,
        senderId: alice.id,
        text: `bulk ${index}`,
      })
    const newest = await loadMessages(directChat, alice.id)
    expect(newest.messages).toHaveLength(40)
    expect(newest.hasMore).toBe(true)
    const older = await loadMessages(directChat, alice.id, newest.cursor)
    expect(older.messages.length).toBe(7)
    expect(older.messages[0]?.text).toBe('hello bob')
  })

  it('hides a message for one person and deletes another for everyone', async () => {
    actAs(alice)
    const mine = await sendMessage({
      chatId: directChat,
      senderId: alice.id,
      text: 'oops',
    })
    const message = await loadMessage(mine.id, alice.id)
    if (!message) throw new Error('message missing')

    actAs(bob)
    await deleteForMe(mine.id)
    expect(await loadMessage(mine.id, bob.id)).toBeNull()

    actAs(alice)
    expect(await loadMessage(mine.id, alice.id)).not.toBeNull()
    await deleteForEveryone(message)
    expect(await loadMessage(mine.id, alice.id)).toMatchObject({
      deleted: true,
      text: '',
    })
    const { rows } = await sql(
      'select ciphertext, encrypted_keys from public.messages where id = $1',
      [mine.id],
    )
    expect(rows[0]).toMatchObject({ ciphertext: '', encrypted_keys: {} })
  })

  it('keeps an outsider out of the conversation entirely', async () => {
    actAs(carol)
    expect((await loadMessages(directChat, carol.id)).messages).toEqual([])
    expect(await loadChatOverview(carol.id)).toEqual([])
    await expect(
      sendMessage({
        chatId: directChat,
        senderId: carol.id,
        text: 'let me in',
      }),
    ).rejects.toBeTruthy()
  })
})

describe('contacts, chat settings and blocking', () => {
  it('lists contacts (the replier became a contact) and lets you add and block', async () => {
    actAs(bob)
    expect(
      (await loadContacts(bob.id)).map((contact) => contact.username),
    ).toEqual(['alice'])
    actAs(alice)
    expect(
      (await loadContacts(alice.id)).map((contact) => contact.username),
    ).toEqual(['bob'])
    await addContact(alice.id, bob.id)
    await setBlocked(alice.id, bob.id, true)
    expect((await loadContacts(alice.id))[0]?.isBlocked).toBe(true)
    await setBlocked(alice.id, bob.id, false)
  })

  it('pins, mutes and archives, and caps pins at three', async () => {
    actAs(alice)
    await updateChatFlags(directChat, alice.id, {
      is_pinned: true,
      is_muted: true,
    })
    expect((await loadChatOverview(alice.id))[0]).toMatchObject({
      isPinned: true,
      isMuted: true,
    })
    await updateChatFlags(directChat, alice.id, {
      is_pinned: false,
      is_muted: false,
    })
  })
})

describe('groups', () => {
  let group = ''

  it('creates a group everyone can read, and manages membership', async () => {
    actAs(alice)
    group = await createGroupChat('Team', [bob.id, carol.id])
    await sendMessage({
      chatId: group,
      senderId: alice.id,
      text: 'welcome team',
    })

    for (const person of [bob, carol]) {
      actAs(person)
      expect(
        (await loadMessages(group, person.id)).messages.map(
          (message) => message.text,
        ),
      ).toEqual(['welcome team'])
    }

    actAs(alice)
    const members = await loadParticipants(group)
    expect(members.map((member) => member.displayName).sort()).toEqual([
      'Alice',
      'Bob',
      'Carol',
    ])
    expect(members.find((member) => member.userId === alice.id)?.role).toBe(
      'admin',
    )

    await renameGroup(group, 'Core team')
    await setParticipantRole(group, bob.id, 'admin')
    await removeParticipant(group, carol.id)
    expect(
      (await loadParticipants(group))
        .map((member) => member.displayName)
        .sort(),
    ).toEqual(['Alice', 'Bob'])
    await addParticipants(group, [carol.id])

    actAs(carol)
    // Carol rejoined: the earlier message was never sealed for her new membership, so it is simply not shown.
    expect(
      (await loadChatOverview(carol.id)).find((chat) => chat.id === group)
        ?.name,
    ).toBe('Core team')
  })

  it('rejects the wrong people from changing a group', async () => {
    actAs(carol)
    await expect(addParticipants(group, [alice.id])).rejects.toBeTruthy()
    await expect(
      setParticipantRole(group, carol.id, 'admin'),
    ).rejects.toBeTruthy()
  })
})

describe('status updates', () => {
  it('shows a status to a mutual contact, tracks views, and deletes cleanly', async () => {
    actAs(alice)
    await postTextStatus(alice.id, 'hello from alice', '#128C7E')

    actAs(bob)
    const seen = await loadStatuses(bob.id)
    expect(seen.recent).toHaveLength(1)
    expect(seen.recent[0]).toMatchObject({
      displayName: 'Alice',
      viewedCount: 0,
    })
    const item = seen.recent[0]?.items[0]
    if (!item) throw new Error('status missing')
    await markStatusViewed(item.id, bob.id)
    expect((await loadStatuses(bob.id)).viewed).toHaveLength(1)

    actAs(alice)
    expect(
      (await loadViewers(item.id)).map((viewer) => viewer.displayName),
    ).toEqual(['Bob'])
    const mine = (await loadStatuses(alice.id)).mine
    expect(mine?.items).toHaveLength(1)

    actAs(carol)
    expect((await loadStatuses(carol.id)).recent).toHaveLength(0)

    actAs(alice)
    if (mine?.items[0]) await deleteStatus(mine.items[0])
    expect((await loadStatuses(alice.id)).mine).toBeNull()
  })
})

describe('deleting a direct chat', () => {
  it('clears my history and archives it, without touching the other person', async () => {
    actAs(bob)
    await clearDirectChat(directChat, bob.id)
    expect((await loadMessages(directChat, bob.id)).messages).toEqual([])
    expect(
      (await loadChatOverview(bob.id)).find((chat) => chat.id === directChat)
        ?.isArchived,
    ).toBe(true)
    actAs(alice)
    expect(
      (await loadMessages(directChat, alice.id)).messages.length,
    ).toBeGreaterThan(0)
  })
})
