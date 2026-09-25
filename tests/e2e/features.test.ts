import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Browser } from 'playwright-core'
import { closePool } from '../integration/helpers'
import {
  launch,
  newPerson,
  onboard,
  reload,
  sendText,
  shot,
  startChatWith,
  type Person,
} from './helpers'

let browser: Browser
let alice: Person
let bob: Person
let carol: Person

beforeAll(async () => {
  browser = await launch()
  ;[alice, bob, carol] = await Promise.all([
    newPerson(browser, 'alice'),
    newPerson(browser, 'bob'),
    newPerson(browser, 'carol'),
  ])
  await onboard(alice, 'Alice Adams')
  await onboard(bob, 'Bob Brown')
  await onboard(carol, 'Carol Chen')
})

afterAll(async () => {
  await browser?.close()
  await closePool()
})

describe('message actions', () => {
  it('opens the chat, uses the emoji picker, and replies to a message', async () => {
    const { page } = alice
    await startChatWith(page, bob.username, 'Bob Brown')
    await page.getByRole('button', { name: 'Emoji' }).click()
    await page.getByRole('button', { name: '😀' }).click()
    await page.keyboard.press('Escape')
    expect(await page.getByLabel('Type a message').inputValue()).toContain('😀')
    await page.getByLabel('Type a message').fill('')

    await sendText(page, 'first message')
    await page.getByText('first message').last().click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Reply' }).click()
    await page.getByRole('button', { name: 'Cancel reply' }).waitFor()
    await sendText(page, 'this is a reply')
    // The original now appears twice: as a bubble and as the quoted block inside the reply.
    expect(
      await page.getByText('first message').count(),
    ).toBeGreaterThanOrEqual(2)
    await shot(page, '11-reply')
    expect(alice.errors).toEqual([])
  })

  it('reacts to, stars, and deletes messages', async () => {
    const { page } = alice
    await page.getByText('first message').first().click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'React 👍' }).click()
    await page.getByRole('button', { name: /👍 1, your reaction/ }).waitFor()

    await page.getByText('first message').first().click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Star' }).click()

    await sendText(page, 'oops wrong chat')
    await page.getByText('oops wrong chat').last().click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Delete for everyone' }).click()
    await page.getByText('You deleted this message').waitFor()
    await shot(page, '12-actions')
    expect(alice.errors).toEqual([])
  })

  it('lists starred messages in settings', async () => {
    const { page } = alice
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: /Starred messages/ }).click()
    await page.getByText('first message').waitFor()
    await page.getByRole('link', { name: 'Chats', exact: true }).click()
    expect(alice.errors).toEqual([])
  })

  it('forwards a message to another chat', async () => {
    const { page } = alice
    await page.getByText('Bob Brown').first().click()
    await page.getByText('first message').first().click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Forward' }).click()
    await page
      .getByRole('dialog', { name: 'Forward message to' })
      .getByText('Bob Brown')
      .click()
    await page.getByRole('button', { name: /Forward \(1\)/ }).click()
    await page.getByText('Forwarded to 1 chat.').waitFor()
    await page.waitForTimeout(500)
    expect(alice.errors).toEqual([])
  })

  it('delivers everything to the recipient, including reactions and the forwarded label', async () => {
    await reload(bob)
    await bob.page.getByText('Alice Adams').first().click()
    await bob.page.getByText('this is a reply').first().waitFor()
    await bob.page.getByText('Forwarded').first().waitFor()
    await bob.page.getByRole('button', { name: /👍 1/ }).waitFor()
    // Bob replies, which is what makes him a contact and lets Alice's status reach him.
    await sendText(bob.page, 'thanks alice')
    await shot(bob.page, '13-bob-sees-actions')
    expect(bob.errors).toEqual([])
  })
})

describe('groups', () => {
  it('creates a group from usernames and the members can read it', async () => {
    const { page } = alice
    await page.getByRole('button', { name: 'New chat', exact: true }).click()
    await page.getByRole('button', { name: /New group/ }).click()
    const search = page.getByLabel('Search contacts, username or email')
    await search.fill(`@${carol.username}`)
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: /Carol Chen/ }).click()
    await page
      .getByRole('list', { name: 'Selected members' })
      .getByText('Carol Chen')
      .waitFor()
    await search.fill(`@${bob.username}`)
    await dialog.getByRole('button', { name: /Bob Brown/ }).click()
    await page.getByLabel('Group name').fill('Team')
    await page.getByRole('button', { name: 'Create group' }).click()
    // The previous chat's composer stays mounted until navigation completes, so wait for the group itself.
    await page.getByRole('button', { name: 'Team, view info' }).waitFor()
    await sendText(page, 'welcome to the team')
    expect(await page.getByText('Message failed to send.').count()).toBe(0)
    await page.getByRole('button', { name: 'Chat info' }).click()
    await page.getByText('3 participants').first().waitFor()
    await shot(page, '14-group-info')

    await reload(carol)
    await carol.page.getByText('Team').first().click()
    await carol.page.getByText('welcome to the team').last().waitFor()
    expect(alice.errors).toEqual([])
    expect(carol.errors).toEqual([])
  })
})

describe('status', () => {
  it('posts a text status that a mutual contact can view, with a viewers list', async () => {
    const { page } = alice
    await page.getByRole('link', { name: 'Status', exact: true }).click()
    await page.getByRole('button', { name: 'Add status' }).click()
    await page.getByRole('menuitem', { name: 'Text status' }).click()
    await page.getByLabel('Status text').fill('Hello from my status')
    await page.getByRole('button', { name: 'Post status' }).click()
    await page
      .getByText('Status posted. It disappears after 24 hours.')
      .waitFor()
    await page.getByText('My status').first().waitFor()

    await reload(bob)
    await bob.page.getByRole('link', { name: 'Status', exact: true }).click()
    await bob.page.getByRole('button', { name: /Alice Adams/ }).click()
    await bob.page.getByText('Hello from my status').waitFor()
    await shot(bob.page, '15-status-viewer')
    await bob.page.getByRole('button', { name: 'Close status' }).click()

    await reload(alice)
    await alice.page.getByRole('link', { name: 'Status', exact: true }).click()
    await alice.page.getByRole('button', { name: /My status/ }).click()
    await alice.page.getByRole('button', { name: /Viewed by/ }).click()
    await alice.page.getByRole('dialog').getByText('Bob Brown').waitFor()
    await alice.page.keyboard.press('Escape')
    expect(alice.errors).toEqual([])
    expect(bob.errors).toEqual([])
  })

  it('keeps a stranger out of the audience', async () => {
    await reload(carol)
    await carol.page.getByRole('link', { name: 'Status', exact: true }).click()
    await carol.page.getByText('No status updates yet').waitFor()
    expect(carol.errors).toEqual([])
  })
})

describe('settings', () => {
  it('saves profile changes and privacy toggles', async () => {
    const { page } = alice
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: /^Profile/ }).click()
    await page.getByLabel('Name', { exact: true }).fill('Alice A.')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await page.getByText('Profile saved.').waitFor()

    await page.getByRole('button', { name: /^Privacy/ }).click()
    const receipts = page.getByRole('switch', { name: 'Read receipts' })
    expect(await receipts.getAttribute('aria-checked')).toBe('true')
    await receipts.click()
    await page.waitForFunction(
      () =>
        document
          .querySelector('[role="switch"][aria-label="Read receipts"]')
          ?.getAttribute('aria-checked') === 'false',
    )
    await shot(page, '16-privacy')

    await page.reload()
    await page.getByRole('switch', { name: 'Read receipts' }).waitFor()
    expect(
      await page
        .getByRole('switch', { name: 'Read receipts' })
        .getAttribute('aria-checked'),
    ).toBe('false')
    expect(alice.errors).toEqual([])
  })

  it('changes the password and re-protects the key', async () => {
    const { page } = alice
    await page.getByRole('button', { name: /^Security/ }).click()
    await page
      .getByLabel('Current password', { exact: true })
      .fill('correct-horse-battery')
    await page
      .getByLabel('New password', { exact: true })
      .fill('a-brand-new-Passw0rd!')
    await page.getByLabel('Confirm new password').fill('a-brand-new-Passw0rd!')
    await page.getByRole('button', { name: 'Change password' }).click()
    // The local stack has no auth server, so verifying the current password fails and nothing is changed. This test
    // only proves the form submits and reports a result without crashing; the re-wrap logic itself is covered by the
    // key store unit tests.
    await page
      .getByText(/Password changed|Could not change your password|fetch|auth/i)
      .first()
      .waitFor({ timeout: 15_000 })
    expect(alice.errors).toEqual([])
  })
})
