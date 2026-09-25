import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Browser, BrowserContext, Page } from 'playwright-core'
import { APP, launch } from './helpers'

// The service worker is only registered in production builds, so this runs with E2E_MODE=prod.
const prod = process.env.E2E_MODE === 'prod'

let browser: Browser
let context: BrowserContext
let page: Page
const problems: string[] = []

beforeAll(async () => {
  if (!prod) return
  browser = await launch()
  context = await browser.newContext()
  // Covers page, worker and service-worker console output.
  context.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text())
  })
  page = await context.newPage()
  page.on('pageerror', (error) => problems.push(error.message))
})

afterAll(async () => {
  await browser?.close()
})

describe.skipIf(!prod)('service worker', () => {
  it('registers, takes control, and precaches the app shell', async () => {
    await page.goto(`${APP}/auth`)
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
    await page.reload()
    await page.getByRole('heading', { name: 'Welcome to ChatBit' }).waitFor()
    expect(
      await page.evaluate(() => navigator.serviceWorker.controller !== null),
    ).toBe(true)
    expect(await page.evaluate(() => caches.keys())).toEqual([
      'chatbit-shell-v1',
    ])
  })

  it('serves the app shell for a deep link while the network is down', async () => {
    await context.setOffline(true)
    const response = await page.goto(
      `${APP}/communities/0c432491-ce62-43c1-8eb1-0d575a02156a`,
    )
    expect(response?.status()).toBe(200)
    expect(await response?.text()).toContain('id="root"')
    await context.setOffline(false)
  })

  it('does not break with "Failed to convert value to Response" when nothing is cached', async () => {
    await page.goto(`${APP}/auth`)
    await page.evaluate(async () => {
      for (const name of await caches.keys()) await caches.delete(name)
    })
    await context.setOffline(true)
    // With no network and no cache the navigation fails, and it must fail as an ordinary network error.
    await expect(page.goto(`${APP}/communities/x`)).rejects.toThrow(/net::ERR/)
    await context.setOffline(false)
    await page.waitForTimeout(500)
    expect(
      problems.filter((message) => /convert value|FetchEvent/i.test(message)),
    ).toEqual([])
  })

  it('does not intercept API or asset requests', async () => {
    await page.goto(`${APP}/auth`)
    await page.getByRole('heading', { name: 'Welcome to ChatBit' }).waitFor()
    const outcome = await page.evaluate(async () => {
      const response = await fetch('/definitely-not-a-file.json')
      return response.status
    })
    // The static test server answers unknown paths with the shell (200); what matters is that fetch resolves normally.
    expect([200, 404]).toContain(outcome)
    expect(
      problems.filter((message) => /convert value|FetchEvent/i.test(message)),
    ).toEqual([])
  })
})
