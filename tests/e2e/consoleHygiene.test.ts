import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Browser } from 'playwright-core'
import { closePool } from '../integration/helpers'
import {
  APP,
  launch,
  newPerson,
  onboard,
  sendText,
  startChatWith,
  type Person,
} from './helpers'

// Only meaningful on the production build, where console output is stripped at build time.
const prod = process.env.E2E_MODE === 'prod'

let browser: Browser
let alice: Person
let bob: Person

/** Records every console method call made by page JavaScript (the browser's own network messages are not calls). */
const spy = () => {
  const calls: string[] = []
  for (const method of [
    'log',
    'info',
    'warn',
    'error',
    'debug',
    'trace',
    'dir',
    'table',
  ] as const) {
    const original = console[method].bind(console)
    console[method] = (...args: unknown[]) => {
      calls.push(`${method}: ${args.map(String).join(' ').slice(0, 160)}`)
      original(...args)
    }
  }
  ;(window as unknown as { __consoleCalls: string[] }).__consoleCalls = calls
}
const calls = (person: Person) =>
  person.page.evaluate(
    () => (window as unknown as { __consoleCalls: string[] }).__consoleCalls,
  )

beforeAll(async () => {
  if (!prod) return
  browser = await launch()
  ;[alice, bob] = await Promise.all([
    newPerson(browser, 'alice'),
    newPerson(browser, 'bob'),
  ])
  for (const person of [alice, bob]) await person.context.addInitScript(spy)
})

afterAll(async () => {
  await browser?.close()
  await closePool()
})

describe.skipIf(!prod)('production console hygiene', () => {
  it('ships no console calls, debugger statements or source maps', async () => {
    const shell = await (await fetch(`${APP}/`)).text()
    const assets = Array.from(
      shell.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g),
      (match) => match[1] ?? '',
    )
    expect(assets.length).toBeGreaterThan(0)
    const chunks = new Set(assets)
    // Lazy chunks are referenced from the entry bundle, so follow those too.
    for (const asset of [...chunks]) {
      const code = await (await fetch(`${APP}${asset}`)).text()
      for (const match of code.matchAll(/["'`]\.\/([\w.-]+\.js)["'`]/g))
        chunks.add(`/assets/${match[1]}`)
    }
    for (const asset of chunks) {
      const response = await fetch(`${APP}${asset}`)
      if (!response.ok) continue
      const code = await response.text()
      expect(code, `${asset} console call`).not.toMatch(
        /console\.(log|info|warn|error|debug|trace|dir|table)\s*\(/,
      )
      expect(code, `${asset} debugger`).not.toMatch(/\bdebugger\b/)
      expect(code, `${asset} source map`).not.toMatch(/sourceMappingURL/)
      const map = await fetch(`${APP}${asset}.map`)
      expect(await map.text(), `${asset}.map`).not.toContain('"mappings"')
    }
  })

  it('prints nothing while signed out, including a failed login and bad links', async () => {
    const context = await browser.newContext()
    await context.addInitScript(spy)
    const page = await context.newPage()
    await page.goto(`${APP}/auth`)
    await page.getByRole('button', { name: 'Log in' }).click()
    await page.getByLabel('Email address').fill('nobody@example.com')
    await page.getByLabel('Password').fill('wrong-password')
    await page.getByRole('button', { name: 'Log in' }).click()
    await page.waitForTimeout(1500)
    await page.goto(`${APP}/communities/join/000000000000000000000000`)
    await page.goto(`${APP}/not/a/real/page`)
    await page.waitForTimeout(500)
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __consoleCalls: string[] }).__consoleCalls,
      ),
    ).toEqual([])
    await context.close()
  })

  it('prints nothing through onboarding, messaging and reloads', async () => {
    await onboard(alice, 'Alice Adams')
    await onboard(bob, 'Bob Brown')
    await startChatWith(alice.page, bob.username, 'Bob Brown')
    await sendText(alice.page, 'hello there')
    await bob.page.reload()
    await bob.page.getByRole('navigation', { name: 'Primary' }).waitFor()
    await bob.page.locator('button', { hasText: 'Alice Adams' }).first().click()
    await bob.page.getByText('hello there').last().waitFor()
    expect(await calls(alice)).toEqual([])
    expect(await calls(bob)).toEqual([])
  })

  it('prints nothing when requests fail either', async () => {
    const { page } = alice
    await alice.context.route('**/rest/v1/rpc/chat_overview', (route) =>
      route.abort(),
    )
    await page.reload()
    await page.getByRole('navigation', { name: 'Primary' }).waitFor()
    await page
      .getByText(/Could not load your chats|Try again/)
      .first()
      .waitFor()
    await alice.context.unroute('**/rest/v1/rpc/chat_overview')
    // Sending while the message endpoint fails shows an error toast but still logs nothing.
    await page.reload()
    await page.getByRole('navigation', { name: 'Primary' }).waitFor()
    await page.locator('button', { hasText: 'Bob Brown' }).first().click()
    await alice.context.route('**/rest/v1/messages*', (route) => route.abort())
    await page.getByLabel('Type a message').fill('this will fail')
    await page.keyboard.press('Enter')
    await page.getByText('Message failed to send.').first().waitFor()
    await alice.context.unroute('**/rest/v1/messages*')
    expect(await calls(alice)).toEqual([])
  })
})
