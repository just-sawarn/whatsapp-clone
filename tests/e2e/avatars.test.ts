import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Browser } from 'playwright-core'
import { closePool } from '../integration/helpers'
import {
  imageLoaded,
  launch,
  makePng,
  newPerson,
  onboard,
  reload,
  shot,
  storedFiles,
  type Person,
} from './helpers'

let browser: Browser
let alice: Person
let bob: Person

beforeAll(async () => {
  browser = await launch()
  ;[alice, bob] = await Promise.all([
    newPerson(browser, 'alice'),
    newPerson(browser, 'bob'),
  ])
  await onboard(alice, 'Alice Adams')
  await onboard(bob, 'Bob Brown')
})

afterAll(async () => {
  await browser?.close()
  await closePool()
})

const chatPhotos = async () =>
  (await storedFiles()).filter((file) => file.key.startsWith('chat-avatars/'))
const png = (colour: [number, number, number] = [30, 144, 255]) => ({
  name: 'photo.png',
  mimeType: 'image/png',
  buffer: makePng(96, 96, colour),
})

describe('group photos', () => {
  it('lets the creator pick a photo while creating a group', async () => {
    const { page } = alice
    await page.getByRole('button', { name: 'New chat', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: /New group/ }).click()
    await dialog
      .getByLabel('Search contacts, username or email')
      .fill(`@${bob.username}`)
    await dialog.getByRole('button', { name: /Bob Brown/ }).click()
    await dialog.locator('input[type=file]').setInputFiles(png())
    await dialog.getByLabel('Group name').fill('Team')
    await dialog.getByRole('button', { name: 'Create group' }).click()

    const headerPhoto = page
      .getByRole('button', { name: 'Team, view info' })
      .locator('img')
    await headerPhoto.waitFor()
    await expect.poll(() => imageLoaded(headerPhoto)).toBe(true)
    // What reached storage is a JPEG that the browser re-encoded, in the group's own folder.
    const [file] = await chatPhotos()
    expect(file?.head.startsWith('ffd8ff')).toBe(true)
    await shot(page, '30-group-photo')
    expect(alice.errors).toEqual([])
  })

  it('shows the photo to members, who cannot change it', async () => {
    const { page } = bob
    await reload(bob)
    const row = page
      .locator('button', { hasText: 'Team' })
      .locator('img')
      .first()
    await row.waitFor()
    await expect.poll(() => imageLoaded(row)).toBe(true)
    await page.locator('button', { hasText: 'Team' }).first().click()
    await page.getByRole('button', { name: 'Team, view info' }).click()
    const panel = page.getByRole('complementary', { name: 'Chat info' })
    await panel.getByRole('button', { name: 'Change photo' }).waitFor()
    expect(
      await panel.getByRole('button', { name: 'Change photo' }).isDisabled(),
    ).toBe(true)
    expect(
      await panel.getByRole('button', { name: 'Remove photo' }).count(),
    ).toBe(0)
    expect(bob.errors).toEqual([])
  })

  it('lets an admin replace and then remove the photo', async () => {
    const { page } = alice
    await page.getByRole('button', { name: 'Team, view info' }).click()
    const panel = page.getByRole('complementary', { name: 'Chat info' })
    const before = (await chatPhotos()).length

    await panel.locator('input[type=file]').setInputFiles(png([220, 60, 60]))
    await page.getByText('Photo updated.').waitFor()
    // One file in, the old one out.
    await expect.poll(async () => (await chatPhotos()).length).toBe(before)
    await shot(page, '31-group-info-photo')

    await panel.getByRole('button', { name: 'Remove photo' }).click()
    await expect.poll(async () => (await chatPhotos()).length).toBe(before - 1)
    await expect
      .poll(() =>
        page
          .getByRole('button', { name: 'Team, view info' })
          .locator('img')
          .count(),
      )
      .toBe(0)
    expect(alice.errors).toEqual([])
  })

  it('rejects something that is not a photo without uploading', async () => {
    const { page } = alice
    const panel = page.getByRole('complementary', { name: 'Chat info' })
    const before = (await chatPhotos()).length
    await panel.locator('input[type=file]').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not an image'),
    })
    await page.getByText('Choose a photo (JPEG, PNG or WebP).').waitFor()
    expect((await chatPhotos()).length).toBe(before)
  })
})

describe('community photos', () => {
  it('lets the creator pick a photo, which admins and members see', async () => {
    const { page } = alice
    await page.getByRole('link', { name: 'Communities', exact: true }).click()
    await page
      .getByRole('button', { name: 'New community', exact: true })
      .first()
      .click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('input[type=file]').setInputFiles(png([40, 160, 90]))
    await dialog.getByLabel('Community name').fill('Photo Co')
    await dialog
      .getByLabel('Search contacts, username or email')
      .fill(`@${bob.username}`)
    await dialog.getByRole('button', { name: /Bob Brown/ }).click()
    await dialog.getByRole('button', { name: 'Create community' }).click()
    // The dialog fades out; its own photo button must be gone before the page's is unambiguous.
    await dialog.waitFor({ state: 'detached' })

    await page.getByRole('heading', { name: 'Photo Co', level: 2 }).waitFor()
    const detail = page
      .getByRole('button', { name: 'Change photo' })
      .locator('img')
    await detail.waitFor()
    await expect.poll(() => imageLoaded(detail)).toBe(true)
    const listPhoto = page
      .getByRole('button', { name: /Photo Co/ })
      .locator('img')
      .first()
    await expect.poll(() => imageLoaded(listPhoto)).toBe(true)
    await shot(page, '32-community-photo')
    expect(alice.errors).toEqual([])

    await reload(bob)
    await bob.page
      .getByRole('link', { name: 'Communities', exact: true })
      .click()
    const bobRow = bob.page
      .getByRole('button', { name: /Photo Co/ })
      .locator('img')
      .first()
    await bobRow.waitFor()
    await expect.poll(() => imageLoaded(bobRow)).toBe(true)
    await bob.page.getByRole('button', { name: /Photo Co/ }).click()
    await bob.page
      .getByRole('heading', { name: 'Photo Co', level: 2 })
      .waitFor()
    // A member sees the picture but has no controls to change it.
    expect(
      await bob.page.getByRole('button', { name: 'Change photo' }).count(),
    ).toBe(0)
    expect(bob.errors).toEqual([])
  })

  it('lets an admin change the photo from the edit dialog and from the header', async () => {
    const { page } = alice
    const before = (await chatPhotos()).length
    await page.getByRole('button', { name: 'Community options' }).click()
    await page.getByRole('menuitem', { name: 'Edit community' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('input[type=file]').setInputFiles(png([160, 40, 160]))
    await page.getByText('Photo updated.').waitFor()
    await expect.poll(async () => (await chatPhotos()).length).toBe(before)
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })

    await page.getByRole('button', { name: 'Remove photo' }).click()
    await expect.poll(async () => (await chatPhotos()).length).toBe(before - 1)
    expect(alice.errors).toEqual([])
  })

  it('gives a new group inside the community its own photo, visible in the list', async () => {
    const { page } = alice
    await page.getByRole('button', { name: 'New group' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('input[type=file]').setInputFiles(png([250, 170, 30]))
    await dialog.getByLabel('Group name').fill('Garden club')
    await dialog.getByRole('button', { name: 'Create group' }).click()
    await page.getByRole('button', { name: 'Garden club, view info' }).waitFor()

    await page.getByRole('link', { name: 'Communities', exact: true }).click()
    await page.getByRole('button', { name: /Photo Co/ }).click()
    const groupPhoto = page
      .getByRole('list', { name: 'Groups' })
      .or(page.getByLabel('Groups'))
      .locator('li', { hasText: 'Garden club' })
      .locator('img')
    await groupPhoto.waitFor()
    await expect.poll(() => imageLoaded(groupPhoto)).toBe(true)

    // Bob is a community member but not in the group: he still recognises it by its photo.
    await reload(bob)
    await bob.page
      .getByRole('link', { name: 'Communities', exact: true })
      .click()
    await bob.page.getByRole('button', { name: /Photo Co/ }).click()
    const bobGroupPhoto = bob.page
      .getByLabel('Groups')
      .locator('li', { hasText: 'Garden club' })
      .locator('img')
    await bobGroupPhoto.waitFor()
    await expect.poll(() => imageLoaded(bobGroupPhoto)).toBe(true)
    expect(alice.errors).toEqual([])
    expect(bob.errors).toEqual([])
  })
})
