import { mkdirSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'
import { join } from 'node:path'
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright-core'
import { createUser, signJwt, type TestUser } from '../integration/helpers'

export const CHROME =
  process.env.CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export const APP = `http://localhost:${process.env.TEST_APP_PORT ?? 5199}`
export const PASSWORD = 'correct-horse-battery'
const SHOTS = join(process.cwd(), 'tests/e2e/screenshots')

// Realtime, storage and edge functions are not part of the local stack; their failures are expected noise.
const ignorable =
  /websocket|realtime|ERR_CONNECTION|Failed to load resource|favicon|sw\.js|storage|functions\/v1|net::/i

export type Person = {
  user: TestUser
  username: string
  context: BrowserContext
  page: Page
  errors: string[]
}

export async function launch(): Promise<Browser> {
  mkdirSync(SHOTS, { recursive: true })
  return chromium.launch({
    executablePath: CHROME,
    headless: true,
    // A synthetic microphone and camera (no permission prompt), so voice notes can be recorded in tests.
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  })
}

function session(user: TestUser) {
  const now = Math.floor(Date.now() / 1000)
  return {
    access_token: signJwt(user.id),
    refresh_token: 'not-used',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    user: {
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  }
}

/** A signed-in browser context for a fresh test user. No sign-up screen: the session is seeded directly. */
export async function newPerson(
  browser: Browser,
  name: string,
  viewport = { width: 1280, height: 800 },
): Promise<Person> {
  const user = await createUser(name)
  // Unique per run so suites can share one database without "username taken" collisions.
  const username = `${name}_${Math.random().toString(36).slice(2, 8)}`
  const context = await browser.newContext({ viewport })
  await context.addInitScript(
    ([key, value]) => localStorage.setItem(key as string, value as string),
    ['sb-localhost-auth-token', JSON.stringify(session(user))],
  )
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error' && !ignorable.test(message.text()))
      errors.push(`console: ${message.text()}`)
  })
  return { user, username, context, page, errors }
}

/** Let enter/exit animations settle so screenshots show the resting state. */
export async function shot(page: Page, name: string) {
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(SHOTS, `${name}.png`) })
}

export async function onboard({ page, username }: Person, displayName: string) {
  await page.goto(APP)
  await page.getByRole('heading', { name: 'Make it yours' }).waitFor()
  await page.getByLabel('Your name').fill(displayName)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('heading', { name: 'Pick a username' }).waitFor()
  await page.locator('#username').fill(username)
  await page.getByText(`@${username} is available`).waitFor()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('heading', { name: 'A little about you' }).waitFor()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('heading', { name: 'Stay in the loop' }).waitFor()
  await page.getByRole('button', { name: 'Skip' }).click()
  await page.getByLabel('Account password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Continue' }).click()
  await page
    .getByRole('heading', { name: /You are all set/ })
    .waitFor({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Open messages' }).click()
  await page.getByRole('heading', { name: 'ChatBit', exact: true }).waitFor()
}

/**
 * There is no realtime in the local stack, so other people's changes appear after a reload. The key stays unlocked
 * across reloads (until the login expires), so no password prompt is expected here.
 */
export async function reload({ page }: Person) {
  await page.reload()
  await page.getByRole('navigation', { name: 'Primary' }).waitFor()
  // Give the identity check time to settle, then make sure nothing asked for a password.
  await page.waitForTimeout(600)
  if ((await page.getByText(/encryption key is locked/i).count()) > 0) {
    throw new Error(
      'The key was locked after a reload, but it should have stayed unlocked.',
    )
  }
}

/** The recovery path for a locked key: the banner, then the dialog. */
export async function unlockViaBanner({ page }: Person) {
  await page
    .getByRole('button', { name: 'Unlock', exact: true })
    .first()
    .click()
  await page.getByLabel('Password protecting your key').fill(PASSWORD)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Unlock', exact: true })
    .click()
  await page.getByText('Encryption unlocked.').waitFor()
}

/** How many unlocked keys this browser has remembered (should be 0 after logout or expiry). */
export async function rememberedKeyCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('whatsapp-clone-crypto')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains('unlocked')) return resolve(0)
          const request = db
            .transaction('unlocked')
            .objectStore('unlocked')
            .count()
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        }
      }),
  )
}

export async function sendText(page: Page, text: string) {
  await page.getByLabel('Type a message').fill(text)
  await page.keyboard.press('Enter')
  await page.getByText(text).last().waitFor()
}

export async function startChatWith(
  page: Page,
  username: string,
  displayName: string,
) {
  await page.getByRole('button', { name: 'New chat', exact: true }).click()
  await page
    .getByLabel('Search contacts, username or email')
    .fill(`@${username}`)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: new RegExp(displayName) })
    .click()
  await page.getByLabel('Type a message').waitFor()
}

/** A small valid PNG (solid colour), so upload flows have a real image to resize. */
export function makePng(
  width = 64,
  height = 64,
  [r, g, b] = [30, 144, 255],
): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data])
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // RGB
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat()),
  ])
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

export type StoredFile = {
  key: string
  size: number
  contentType: string
  head: string
}

/** What the storage stand-in currently holds, i.e. exactly what a server operator could read. */
export async function storedFiles(): Promise<StoredFile[]> {
  const port = process.env.TEST_PROXY_PORT ?? 54332
  return (await (
    await fetch(`http://localhost:${port}/__test/storage`)
  ).json()) as StoredFile[]
}

/** True once an <img> has finished loading real pixels. */
export function imageLoaded(image: import('playwright-core').Locator) {
  return image.evaluate(
    (element) =>
      (element as HTMLImageElement).complete &&
      (element as HTMLImageElement).naturalWidth > 0,
  )
}
