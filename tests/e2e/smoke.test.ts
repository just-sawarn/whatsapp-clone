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
  startChatWith,
  type Person,
} from './helpers'

let browser: Browser

beforeAll(async () => {
  browser = await launch()
})

afterAll(async () => {
  await browser?.close()
  await closePool()
})

describe('the app in a real browser', () => {
  let alice: Person
  let bob: Person

  it('shows the welcome and log-in screens when signed out', async () => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`${APP}/auth`)
    await page.getByRole('heading', { name: 'Welcome to ChatBit' }).waitFor()
    await shot(page, '01-welcome')
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.getByRole('heading', { name: 'Create your account' }).waitFor()
    await page.getByLabel('Password', { exact: true }).fill('abc')
    await page.getByText('Too weak').waitFor()
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.getByText('Enter your email address.').waitFor()
    await shot(page, '02-signup-validation')
    await context.close()
    expect(errors).toEqual([])
  })

  it('walks a new user through onboarding', async () => {
    alice = await newPerson(browser, 'alice')
    await onboard(alice, 'Alice Adams')
    await shot(alice.page, '03-empty-chats')
    expect(alice.errors).toEqual([])
    bob = await newPerson(browser, 'bob')
    await onboard(bob, 'Bob Brown')
    expect(bob.errors).toEqual([])
  })

  it('starts a chat by username and sends an encrypted message', async () => {
    const { page } = alice
    await startChatWith(page, bob.username, 'Bob Brown')
    await sendText(page, 'hello bob, this is secret')
    await shot(page, '04-alice-sent')
    expect(alice.errors).toEqual([])
  })

  it('keeps the recipient unlocked after a reload and shows the message', async () => {
    const { page } = bob
    await reload(bob)
    await page.getByText('Alice Adams').first().waitFor()
    await page.getByText('hello bob, this is secret').first().waitFor() // decrypted preview in the list
    await shot(page, '05-bob-chat-list')
    await page.getByText('Alice Adams').first().click()
    await page.getByText('hello bob, this is secret').last().waitFor()
    await page.getByLabel('Type a message').fill('got it, thanks')
    await page.keyboard.press('Enter')
    await page.getByText('got it, thanks').first().waitFor()
    await page.getByText('hello bob, this is secret').last().waitFor()
    await shot(page, '06-bob-conversation')
    expect(bob.errors).toEqual([])
  })

  it('opens the info panel, verifies the security code, and searches the chat', async () => {
    const { page } = bob
    await page.getByRole('button', { name: 'Chat info' }).click()
    await page.getByRole('button', { name: 'Verify security code' }).click()
    await page.getByLabel('Security code', { exact: true }).waitFor()
    await shot(page, '07-safety-number')
    const code = await page
      .getByLabel('Security code', { exact: true })
      .innerText()
    expect(code.replace(/\s+/g, ' ')).toMatch(/^(\d{5} ?){12}$/)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Close info' }).click()
    await page.getByRole('button', { name: 'Search in chat' }).click()
    await page.getByLabel('Search in this chat').fill('secret')
    await page.getByText('1 of 1').waitFor()
    expect(bob.errors).toEqual([])
  })

  it('navigates to settings, status, calls and communities without errors', async () => {
    const { page } = bob
    for (const [label, heading] of [
      ['Calls', 'Calls'],
      ['Status', 'Status'],
      ['Communities', 'Communities'],
      ['Settings', 'Settings'],
    ] as const) {
      await page.getByRole('link', { name: label, exact: true }).click()
      await page
        .getByRole('heading', { name: heading, exact: true })
        .first()
        .waitFor()
    }
    await page.getByRole('button', { name: /Security/ }).click()
    await page.getByRole('heading', { name: 'Your encryption key' }).waitFor()
    await shot(page, '08-settings-security')
    await page.getByRole('button', { name: /Chats/ }).click()
    await page.getByRole('radio', { name: 'Dark' }).click()
    await shot(page, '09-dark-theme')
    await page.getByRole('radio', { name: 'Light' }).click()
    expect(bob.errors).toEqual([])
  })

  it('renders the phone layout without horizontal overflow', async () => {
    const phone = await newPerson(browser, 'carol', { width: 390, height: 780 })
    await onboard(phone, 'Carol Chen')
    await shot(phone.page, '10-mobile-chats')
    const overflow = await phone.page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
    expect(phone.errors).toEqual([])
  })
})
