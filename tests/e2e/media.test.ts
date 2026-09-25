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

/** Width and height from a JPEG's start-of-frame marker, so a test can tell a 640 px copy from the 1400 px original. */
function jpegSize(bytes: Buffer): { width: number; height: number } | null {
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null
    const marker = bytes[offset + 1] ?? 0
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7)
    )
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      }
    offset += 2 + bytes.readUInt16BE(offset + 2)
  }
  return null
}

async function readDownload(download: import('playwright-core').Download) {
  const { readFileSync } = await import('node:fs')
  return readFileSync(await download.path())
}

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
    await page
      .getByRole('dialog', { name: 'Send attachment' })
      .waitFor({ state: 'detached' })
    await page.getByRole('button', { name: /notes\.txt/ }).waitFor()

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

    const download = bob.page.waitForEvent('download')
    await bob.page
      .getByRole('button', { name: 'Download voice message' })
      .click()
    const saved = await download
    expect(saved.suggestedFilename()).toMatch(/\.webm$/)
    // The saved file is the decrypted recording, not the ciphertext in storage.
    expect((await readDownload(saved)).subarray(0, 4).toString('hex')).toBe(
      WEBM,
    )
    expect(alice.errors).toEqual([])
    expect(bob.errors).toEqual([])
  })
})

describe('large photos and downloads', () => {
  it('sends a bubble-sized copy alongside a big photo and downloads the original from the chat', async () => {
    const { page } = alice
    const before = (await chatMedia()).length
    await page.locator('input[type=file][multiple]').setInputFiles({
      name: 'big.png',
      mimeType: 'image/png',
      buffer: makePng(1400, 900, [40, 120, 200]),
    })
    await page
      .getByRole('dialog', { name: 'Send attachment' })
      .getByRole('button', { name: 'Send', exact: true })
      .click()
    await page.locator('img[alt="big.jpg"]').waitFor()
    // The photo and its thumbnail are two separate encrypted files.
    await expect.poll(async () => (await chatMedia()).length).toBe(before + 2)
    const [photo, thumb] = (await chatMedia()).slice(-2)
    expect(thumb?.key).toBe(`${photo?.key}.t`)
    expect(thumb?.head.startsWith(JPEG)).toBe(false)
    expect(thumb?.size).toBeLessThan(photo?.size ?? 0)

    await openBobsChat()
    const bubble = bob.page.locator('img[alt="big.jpg"]')
    await bubble.waitFor()
    await expect.poll(() => imageLoaded(bubble)).toBe(true)
    // The bubble shows the small copy, not the 1400 px original.
    const shown = await bubble.evaluate(
      (element) => (element as HTMLImageElement).naturalWidth,
    )
    expect(shown).toBeLessThanOrEqual(640)

    // Opening it swaps in the full photo.
    await bubble.click()
    const viewer = bob.page.getByRole('dialog', { name: 'big.jpg' })
    const full = viewer.locator('img')
    await expect
      .poll(() =>
        full.evaluate((element) => (element as HTMLImageElement).naturalWidth),
      )
      .toBe(1400)
    await shot(bob.page, '44-photo-viewer')

    // Download from the lightbox: the real decrypted 1400 px JPEG under its own name.
    const fromViewer = bob.page.waitForEvent('download')
    await viewer.getByRole('button', { name: 'Download photo' }).click()
    const viewerFile = await fromViewer
    expect(viewerFile.suggestedFilename()).toBe('big.jpg')
    const viewerBytes = await readDownload(viewerFile)
    expect(viewerBytes.subarray(0, 3).toString('hex')).toBe(JPEG)
    expect(jpegSize(viewerBytes)).toEqual({ width: 1400, height: 900 })
    await viewer.getByRole('button', { name: 'Close photo' }).click()
    await viewer.waitFor({ state: 'detached' })

    // Download button on the photo itself.
    await bubble.hover()
    const fromBubble = bob.page.waitForEvent('download')
    await bob.page.getByRole('button', { name: 'Download big.jpg' }).click()
    const bubbleFile = await fromBubble
    expect(bubbleFile.suggestedFilename()).toBe('big.jpg')
    expect(jpegSize(await readDownload(bubbleFile))).toEqual({
      width: 1400,
      height: 900,
    })

    // And from the message menu.
    await bubble.click({ button: 'right' })
    const fromMenu = bob.page.waitForEvent('download')
    await bob.page.getByRole('menuitem', { name: 'Download' }).click()
    expect((await fromMenu).suggestedFilename()).toBe('big.jpg')
    expect(alice.errors).toEqual([])
    expect(bob.errors).toEqual([])
  })

  it('reopens a chat from the on-device store without downloading the photos again', async () => {
    const downloads: string[] = []
    bob.page.on('request', (request) => {
      if (
        /\/object\/sign\/chat-media|\/object\/authenticated\/chat-media/.test(
          request.url(),
        )
      )
        downloads.push(request.url())
    })
    await openBobsChat()
    const bubble = bob.page.locator('img[alt="big.jpg"]')
    await bubble.waitFor()
    await expect.poll(() => imageLoaded(bubble)).toBe(true)
    expect(downloads).toEqual([])
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
      buffer: makePng(600, 600, [90, 60, 200]),
    })
    await page.getByText('Profile photo updated.').waitFor()
    const rail = page.getByRole('link', { name: 'Your profile' }).locator('img')
    await rail.waitFor()
    await expect.poll(() => imageLoaded(rail)).toBe(true)
    const stored = (await storedFiles()).filter((file) =>
      file.key.startsWith('avatars/'),
    )
    expect(stored.at(-1)?.head.startsWith(JPEG)).toBe(true)
    // Lists and the nav rail use a 128 px copy stored beside the 512 px photo.
    expect(stored.length).toBeGreaterThanOrEqual(2)
    expect(
      await rail.evaluate(
        (element) => (element as HTMLImageElement).naturalWidth,
      ),
    ).toBe(128)
    expect(alice.errors).toEqual([])
  })

  it('shows the profile photo after a reload without asking storage again', async () => {
    const { page } = alice
    const signs: string[] = []
    page.on('request', (request) => {
      if (/\/object\/sign\/avatars/.test(request.url()))
        signs.push(request.url())
    })
    const rail = page.getByRole('link', { name: 'Your profile' }).locator('img')
    await reload(alice)
    await rail.waitFor()
    await expect.poll(() => imageLoaded(rail)).toBe(true)
    expect(signs).toEqual([])

    // With the on-device store emptied the same reload has to ask, so the check above can fail.
    await page.evaluate(async () => {
      for (const name of await caches.keys()) await caches.delete(name)
    })
    await reload(alice)
    await rail.waitFor()
    await expect.poll(() => imageLoaded(rail)).toBe(true)
    expect(signs.length).toBeGreaterThan(0)
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

  it('has the next status photo ready before it is tapped', async () => {
    const { page } = alice
    await page.getByRole('button', { name: 'Close status' }).click()
    await page.getByRole('button', { name: 'Add status' }).click()
    await page.getByRole('menuitem', { name: 'Photo status' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'second.png',
      mimeType: 'image/png',
      buffer: makePng(160, 100, [200, 80, 60]),
    })
    await dialog.getByLabel('Caption').fill('Second view')
    await dialog.getByRole('button', { name: 'Post status' }).click()
    await page
      .getByText('Status posted. It disappears after 24 hours.')
      .waitFor()

    const signs: string[] = []
    page.on('request', (request) => {
      if (
        /\/object\/sign\/status-media/.test(request.url()) &&
        request.method() === 'POST'
      )
        signs.push(request.url())
    })
    await page.getByRole('button', { name: /My status/ }).click()
    const viewer = page.getByRole('dialog', { name: /Alice Adams's status/ })
    const first = viewer.locator('img[alt="Nice view"]')
    await first.waitFor()
    await expect.poll(() => imageLoaded(first)).toBe(true)
    // Let the background fetch of the following photo finish, then move on.
    await page.waitForTimeout(600)
    const asked = signs.length
    await viewer.getByRole('button', { name: 'Next update' }).click()
    const second = viewer.locator('img[alt="Second view"]')
    await second.waitFor()
    await expect.poll(() => imageLoaded(second)).toBe(true)
    expect(signs.length).toBe(asked)
    expect(alice.errors).toEqual([])
  })
})
