import { mkdirSync } from 'node:fs'
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
  return chromium.launch({ executablePath: CHROME, headless: true })
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
  await page.getByRole('heading', { name: 'WhatsApp', exact: true }).waitFor()
}

/** There is no realtime in the local stack, so other people's changes appear after a reload and unlock. */
export async function reloadAndUnlock({ page }: Person) {
  await page.reload()
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
