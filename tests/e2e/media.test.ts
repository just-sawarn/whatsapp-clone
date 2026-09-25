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
  startChatWith,
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
  await startChatWith(alice.page, bob.username, 'Bob Brown')
})

afterAll(async () => {
  await browser?.close()
  await closePool()
})

const chatMedia = async () =>
  (await storedFiles()).filter((file) => file.key.startsWith('chat-media/'))
const JPEG = 'ffd8ff'
const PNG = '89504e47'
const WEBM = '1a45dfa3'

async function openBobsChat() {
  await reload(bob)
  await bob.page.locator('button', { hasText: 'Alice Adams' }).first().click()
}

describe('encrypted attachments', () => {
  it('sends a photo that is unreadable in storage but decrypts for the recipient', async () => {
    const { page } = alice
    const before = (await chatMedia()).length
    await page.locator('input[type=file][multiple]').setInputFiles({
      name: 'holiday.png',
      mimeType: 'image/png',
      buffer: makePng(200, 120, [220, 90, 40]),
    })
    const dialog = page.getByRole('dialog', { name: 'Send attachment' })
    await dialog.getByLabel('Caption').fill('From the trip')
    await dialog.getByRole('button', { name: 'Send', exact: true }).click()

    const sent = page.locator('img[alt="holiday.jpg"]')
    await sent.waitFor()
    await expect.poll(() => imageLoaded(sent)).toBe(true)
    await page.getByText('From the trip').last().waitFor()

    await expect.poll(async () => (await chatMedia()).length).toBe(before + 1)
    const stored = (await chatMedia()).at(-1)
    // A server operator sees ciphertext: neither JPEG nor PNG magic bytes.
    expect(stored?.head.startsWith(JPEG)).toBe(false)
    expect(stored?.head.startsWith(PNG)).toBe(false)
    await shot(page, '40-photo-sent')
    expect(alice.errors).toEqual([])

    await openBobsChat()
    const received = bob.page.locator('img[alt="holiday.jpg"]')
    await received.waitFor()
    await expect.poll(() => imageLoaded(received)).toBe(true)
    await bob.page.getByText('From the trip').last().waitFor()
    await shot(bob.page, '41-photo-received')
    expect(bob.errors).toEqual([])
  })

  it('sends a file whose contents only the recipient can read', async () => {
    const { page } = alice
    const plaintext = 'the secret plan'
    const before = (await chatMedia()).length
    await page.locator('input[type=file][multiple]').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(plaintext),
    })
    await page
      .getByRole('dialog', { name: 'Send attachment' })
      .getByRole('button', { name: 'Send', exact: true })
      .click()
    await page.getByText('notes.txt').waitFor()

    await expect.poll(async () => (await chatMedia()).length).toBe(before + 1)
    const stored = (await chatMedia()).at(-1)
    // Ciphertext is the plaintext plus a 16-byte authentication tag, and it does not start with the plaintext.
    expect(stored?.size).toBe(plaintext.length + 16)
    expect(stored?.head).not.toBe(
      Buffer.from(plaintext).subarray(0, 4).toString('hex'),
    )

    await openBobsChat()
    const download = bob.page.waitForEvent('download')
    await bob.page.getByRole('button', { name: /notes\.txt/ }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe('notes.txt')
    const path = await file.path()
    const { readFileSync } = await import('node:fs')
    expect(readFileSync(path, 'utf8')).toBe(plaintext)
    expect(alice.errors).toEqual([])
    expect(bob.errors).toEqual([])
  })

  it('records a voice note, encrypted in storage, playable by the recipient', async () => {
    const { page } = alice
    const before = (await chatMedia()).length
    await page.getByRole('button', { name: 'Record voice message' }).click()
    await page
      .getByRole('status', { name: 'Recording voice message' })
      .waitFor()
    await page.waitForTimeout(1800)
    await shot(page, '42-recording')
    await page.getByRole('button', { name: 'Send voice message' }).click()
    await page.getByRole('button', { name: 'Play voice message' }).waitFor()

    await expect.poll(async () => (await chatMedia()).length).toBe(before + 1)
    expect((await chatMedia()).at(-1)?.head.startsWith(WEBM)).toBe(false)

    await openBobsChat()
    await bob.page.getByRole('button', { name: 'Play voice message' }).waitFor()
    // The seek bar only becomes usable once the audio has been downloaded and decrypted.
    await expect
      .poll(() => bob.page.getByLabel('Seek voice message').isEnabled())
      .toBe(true)
    expect(alice.errors).toEqual([])
    expect(bob.errors).toEqual([])
  })
})

describe('profile and status photos', () => {
  it('changes the profile photo from settings', async () => {
    const { page } = alice
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: /^Profile/ }).click()
    await page.locator('input[type=file]').setInputFiles({
      name: 'me.png',
      mimeType: 'image/png',
      buffer: makePng(120, 120, [90, 60, 200]),
    })
    await page.getByText('Profile photo updated.').waitFor()
    const rail = page.getByRole('link', { name: 'Your profile' }).locator('img')
    await rail.waitFor()
    await expect.poll(() => imageLoaded(rail)).toBe(true)
    const stored = (await storedFiles()).filter((file) =>
      file.key.startsWith('avatars/'),
    )
    expect(stored.at(-1)?.head.startsWith(JPEG)).toBe(true)
    expect(alice.errors).toEqual([])
  })

  it('posts a photo status and views it', async () => {
    const { page } = alice
    await page.getByRole('link', { name: 'Status', exact: true }).click()
    await page.getByRole('button', { name: 'Add status' }).click()
    await page.getByRole('menuitem', { name: 'Photo status' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'view.png',
      mimeType: 'image/png',
      buffer: makePng(160, 100, [30, 150, 120]),
    })
    await dialog.getByLabel('Caption').fill('Nice view')
    await dialog.getByRole('button', { name: 'Post status' }).click()
    await page
      .getByText('Status posted. It disappears after 24 hours.')
      .waitFor()
    await page.getByRole('button', { name: /My status/ }).click()
    const photo = page
      .getByRole('dialog', { name: /Alice Adams's status/ })
      .locator('img[alt="Nice view"]')
    await photo.waitFor()
    await expect.poll(() => imageLoaded(photo)).toBe(true)
    expect(
      (await storedFiles()).some((file) =>
        file.key.startsWith('status-media/'),
      ),
    ).toBe(true)
    await shot(page, '43-photo-status')
    expect(alice.errors).toEqual([])
  })
})
