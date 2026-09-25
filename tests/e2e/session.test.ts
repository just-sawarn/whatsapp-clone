import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Browser, Page } from 'playwright-core'
import { closePool } from '../integration/helpers'
import {
  launch,
  newPerson,
  onboard,
  reload,
  rememberedKeyCount,
  sendText,
  startChatWith,
  unlockViaBanner,
  type Person,
} from './helpers'

const DAY = 24 * 60 * 60 * 1000

let browser: Browser

/** In-app route changes are not navigations, so wait on the path itself. */
async function waitForPath(page: Page, path: string) {
  await page.waitForFunction((expected) => location.pathname === expected, path)
}
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
  await sendText(alice.page, 'a message to decrypt later')
})

afterAll(async () => {
  await browser?.close()
  await closePool()
})

describe('unlock once per login', () => {
  it('stays unlocked across reloads without asking for the password again', async () => {
    await reload(bob)
    await reload(bob)
    await bob.page.getByText('a message to decrypt later').first().waitFor()
    await bob.page.getByText('Alice Adams').first().click()
    await bob.page.getByText('a message to decrypt later').last().waitFor()
    expect(await rememberedKeyCount(bob.page)).toBe(1)
    expect(bob.errors).toEqual([])
  })

  it('asks for the password again after a reload when the user opts out', async () => {
    const { page } = bob
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: /^Security/ }).click()
    const toggle = page.getByRole('switch', {
      name: 'Stay unlocked on this device',
    })
    expect(await toggle.getAttribute('aria-checked')).toBe('true')
    await toggle.click()
    await page.waitForFunction(
      () =>
        document
          .querySelector(
            '[role="switch"][aria-label="Stay unlocked on this device"]',
          )
          ?.getAttribute('aria-checked') === 'false',
    )
    // Opting out also wipes the copy that was already remembered.
    await page.waitForFunction(() => true)
    await page.waitForTimeout(500)
    expect(await rememberedKeyCount(page)).toBe(0)

    await page.reload()
    await page.getByText(/encryption key is locked/i).waitFor()
    await unlockViaBanner(bob)
    await page
      .getByText(/encryption key is locked/i)
      .waitFor({ state: 'hidden' })
    // Because the setting is off, it is not remembered even after unlocking.
    expect(await rememberedKeyCount(page)).toBe(0)

    // Turning it back on remembers the currently unlocked key straight away.
    await page
      .getByRole('switch', { name: 'Stay unlocked on this device' })
      .click()
    await page.waitForTimeout(500)
    expect(await rememberedKeyCount(page)).toBe(1)
    await reload(bob)
    expect(bob.errors).toEqual([])
  })

  it('shows when the login ends', async () => {
    const { page } = bob
    await page.getByRole('link', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: /^Security/ }).click()
    await page.getByText(/Your login ends on/).waitFor()
  })
})

describe('login lifetime of seven days', () => {
  it('keeps the login just under seven days, and ends it after', async () => {
    const { page, user } = bob
    const key = `wa:login-at:${user.id}`

    await page.evaluate(
      ([k, at]) => localStorage.setItem(k as string, String(at)),
      [key, Date.now() - 6 * DAY - 23 * 60 * 60 * 1000],
    )
    await reload(bob)
    expect(page.url()).not.toContain('/auth')

    await page.evaluate(
      ([k, at]) => localStorage.setItem(k as string, String(at)),
      [key, Date.now() - 7 * DAY - 1000],
    )
    await page.reload()
    await waitForPath(page, '/auth')
    await page
      .getByText('Your session expired after 7 days. Please sign in again.')
      .waitFor()
    // The remembered key is gone with it, so the next person at this browser cannot read the messages.
    expect(await rememberedKeyCount(page)).toBe(0)
    expect(
      await page.evaluate((k) => localStorage.getItem(k as string), key),
    ).toBeNull()
  })

  it('signs out an open tab when the seven days pass while it is in use', async () => {
    const { page, user } = alice
    await page.evaluate(
      ([k, at]) => localStorage.setItem(k as string, String(at)),
      [`wa:login-at:${user.id}`, Date.now() - 8 * DAY],
    )
    // The tab notices when it becomes visible again (or on its next minute check).
    await page.evaluate(() =>
      document.dispatchEvent(new Event('visibilitychange')),
    )
    await waitForPath(page, '/auth')
    await page
      .getByText('Your session expired after 7 days. Please sign in again.')
      .waitFor()
    expect(await rememberedKeyCount(page)).toBe(0)
  })
})

describe('logging out', () => {
  it('forgets the remembered key and returns to the sign-in screen', async () => {
    const carol = await newPerson(browser, 'carol')
    await onboard(carol, 'Carol Chen')
    expect(await rememberedKeyCount(carol.page)).toBe(1)
    // Pictures kept on the device for speed must not outlive the login.
    await carol.page.evaluate(async () => {
      for (const name of ['chatbit-images-v1', 'chatbit-cipher-v1'])
        await (await caches.open(name)).put('/seed', new Response('x'))
    })
    await carol.page
      .getByRole('link', { name: 'Settings', exact: true })
      .click()
    await carol.page.getByRole('button', { name: /^Account/ }).click()
    await carol.page
      .getByRole('button', { name: 'Log out', exact: true })
      .click()
    await waitForPath(carol.page, '/auth')
    expect(await rememberedKeyCount(carol.page)).toBe(0)
    expect(
      await carol.page.evaluate(async () =>
        (await caches.keys()).filter(
          (name) =>
            name.startsWith('chatbit-i') || name.startsWith('chatbit-c'),
        ),
      ),
    ).toEqual([])
    // The stored Supabase session is gone too (the test context re-seeds it on load, so check it directly).
    expect(
      await carol.page.evaluate(() =>
        localStorage.getItem('sb-localhost-auth-token'),
      ),
    ).toBeNull()
    expect(carol.errors).toEqual([])
  })
})
