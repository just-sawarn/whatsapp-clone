import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Browser } from 'playwright-core'
import { closePool } from '../integration/helpers'
import {
  APP,
  launch,
  newPerson,
  onboard,
  reload,
  sendText,
  shot,
  type Person,
} from './helpers'

const expectedOrigin =
  process.env.E2E_MODE === 'prod' ? 'https://codespaces.online' : APP

let browser: Browser
let alice: Person
let bob: Person
let carol: Person
let inviteLink = ''

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

const openCommunities = async ({ page }: Person) => {
  await page.getByRole('link', { name: 'Communities', exact: true }).click()
  await page
    .getByRole('heading', { name: 'Communities', exact: true })
    .first()
    .waitFor()
}

describe('communities', () => {
  it('starts empty and lets an admin create a community and invite someone', async () => {
    const { page } = alice
    await openCommunities(alice)
    await shot(page, '20-communities-empty')

    await page
      .getByRole('button', { name: 'New community', exact: true })
      .first()
      .click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Community name').fill('Neighbourhood')
    await dialog
      .getByLabel('Description (optional)')
      .fill('Everything for our street')
    await dialog
      .getByLabel('Search contacts, username or email')
      .fill(`@${bob.username}`)
    await dialog.getByRole('button', { name: /Bob Brown/ }).click()
    await dialog
      .getByRole('list', { name: 'People to invite' })
      .getByText('Bob Brown')
      .waitFor()
    await dialog.getByRole('button', { name: 'Create community' }).click()

    await page
      .getByRole('heading', { name: 'Neighbourhood', level: 2 })
      .waitFor()
    await page.getByText('Everything for our street').waitFor()
    await page.getByText(/Community · 0 groups/).waitFor()
    await shot(page, '21-community-detail')
    expect(alice.errors).toEqual([])
  })

  it('creates a group inside the community and posts an announcement', async () => {
    const { page } = alice
    await page.getByRole('button', { name: 'New group' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Group name').fill('General')
    await dialog.getByRole('button', { name: 'Create group' }).click()
    await page.getByRole('button', { name: 'General, view info' }).waitFor()

    await openCommunities(alice)
    await page.getByRole('button', { name: /Neighbourhood/ }).click()
    await page.getByText('General').first().waitFor()
    await page.getByRole('button', { name: /Announcements/ }).click()
    await page
      .getByRole('button', { name: /Neighbourhood, view info/ })
      .waitFor()
    await page.getByText('Announcements · Neighbourhood').waitFor()
    await sendText(page, 'Welcome to the street')
    await shot(page, '22-announcements-admin')
    expect(alice.errors).toEqual([])
  })

  it("shows a group's menu in full instead of clipping it inside the card", async () => {
    const { page } = alice
    await openCommunities(alice)
    await page.getByRole('button', { name: /Neighbourhood/ }).click()
    await page.getByRole('button', { name: 'Manage General' }).click()
    const item = page.getByRole('menuitem', { name: 'Remove from community' })
    await item.waitFor()
    await page.waitForTimeout(200)
    const visible = await item.evaluate((element) => {
      const box = element.getBoundingClientRect()
      const centre = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      )
      return {
        // Nothing (an overflow-hidden ancestor, another card) may cover or cut off the menu item.
        reachable: centre === element || element.contains(centre),
        inViewport:
          box.top >= 0 &&
          box.left >= 0 &&
          box.bottom <= window.innerHeight &&
          box.right <= window.innerWidth,
      }
    })
    expect(visible).toEqual({ reachable: true, inViewport: true })
    await shot(page, '27-group-menu')
    await page.keyboard.press('Escape')
    await item.waitFor({ state: 'detached' })
    expect(alice.errors).toEqual([])
  })

  it('gives a member read-only announcements and lets them join a group', async () => {
    const { page } = bob
    await reload(bob)
    await openCommunities(bob)
    await page.getByRole('button', { name: /Neighbourhood/ }).click()
    await page.getByText(/Community · 1 group/).waitFor()

    await page.getByRole('button', { name: /Announcements/ }).click()
    await page.getByText('Welcome to the street').last().waitFor()
    await page
      .getByText('Only community admins can send messages in announcements.')
      .waitFor()
    expect(await page.getByLabel('Type a message').count()).toBe(0)
    await shot(page, '23-announcements-member')

    await openCommunities(bob)
    await page.getByRole('button', { name: /Neighbourhood/ }).click()
    await page.getByRole('button', { name: 'Join', exact: true }).click()
    await page.getByRole('button', { name: 'General, view info' }).waitFor()
    await sendText(page, 'hi from bob')
    expect(bob.errors).toEqual([])
  })

  it('shows the admin an invite link', async () => {
    const { page } = alice
    await openCommunities(alice)
    await page.getByRole('button', { name: /Neighbourhood/ }).click()
    await page.getByRole('button', { name: 'Community options' }).click()
    await page.getByRole('menuitem', { name: 'Invite link' }).click()
    inviteLink = await page.getByLabel('Invite link').inputValue()
    // Invite links use the configured public address in production builds, and the current one in development.
    expect(inviteLink.startsWith(`${expectedOrigin}/communities/join/`)).toBe(
      true,
    )
    expect(inviteLink).toMatch(/\/communities\/join\/[0-9a-f]{24}$/)
    await shot(page, '24-invite')
    await page.keyboard.press('Escape')
    expect(alice.errors).toEqual([])
  })

  it('lets someone join from the link after seeing what it is', async () => {
    const { page } = carol
    await page.goto(new URL(inviteLink).pathname.replace(/^/, APP))
    await page
      .getByRole('heading', { name: 'Neighbourhood', level: 1 })
      .waitFor()
    await page.getByText(/2 members · 1 group/).waitFor()
    await shot(page, '25-join-page')
    await page.getByRole('button', { name: 'Join community' }).click()
    await page
      .getByRole('heading', { name: 'Neighbourhood', level: 2 })
      .waitFor()
    await page
      .getByText(/3 members/)
      .first()
      .waitFor()
    expect(carol.errors).toEqual([])
  })

  it('rejects a link that does not work', async () => {
    const { page } = carol
    await page.goto(`${APP}/communities/join/000000000000000000000000`)
    await page.getByText('This invite link does not work').waitFor()
    expect(carol.errors).toEqual([])
  })

  it('lets an admin manage members', async () => {
    const { page } = alice
    await reload(alice)
    await openCommunities(alice)
    await page.getByRole('button', { name: /Neighbourhood/ }).click()
    await page.getByRole('button', { name: 'Community options' }).click()
    await page.getByRole('menuitem', { name: 'Members' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByText('Bob Brown').waitFor()
    await dialog.getByText('Carol Chen').waitFor()
    await shot(page, '26-members')
    await dialog.getByRole('button', { name: 'Manage Bob Brown' }).click()
    await page.getByRole('menuitem', { name: 'Remove from community' }).click()
    await dialog.getByText('Bob Brown').waitFor({ state: 'detached' })
    await page.keyboard.press('Escape')
    expect(alice.errors).toEqual([])
  })

  it('lets a member leave, after which the community is gone for them', async () => {
    const { page } = carol
    await openCommunities(carol)
    await page.getByRole('button', { name: /Neighbourhood/ }).click()
    await page.getByRole('button', { name: 'Community options' }).click()
    await page.getByRole('menuitem', { name: 'Leave community' }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Leave community' })
      .click()
    await page
      .getByRole('heading', { name: 'Bring your groups together' })
      .waitFor()
    expect(carol.errors).toEqual([])
  })

  it('shows the removed member that the community is gone', async () => {
    const { page } = bob
    await reload(bob)
    await openCommunities(bob)
    await page
      .getByRole('heading', { name: 'Bring your groups together' })
      .waitFor()
    expect(bob.errors).toEqual([])
  })

  it('lets an admin deactivate the community', async () => {
    const { page } = alice
    await openCommunities(alice)
    await page.getByRole('button', { name: /Neighbourhood/ }).click()
    await page.getByRole('button', { name: 'Community options' }).click()
    await page.getByRole('menuitem', { name: 'Deactivate community' }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Deactivate' })
      .click()
    await page
      .getByRole('heading', { name: 'Bring your groups together' })
      .waitFor()
    // The group survives as an ordinary group in the chat list.
    await page.getByRole('link', { name: 'Chats', exact: true }).click()
    await page.getByText('General').first().waitFor()
    expect(alice.errors).toEqual([])
  })
})
