import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Browser, Page, Route } from 'playwright-core'
import { APP, launch } from './helpers'

// Production builds send the configured public address; development sends the address the app is open on.
const expectedOrigin =
  process.env.E2E_MODE === 'prod' ? 'https://codespaces.online' : APP

let browser: Browser

beforeAll(async () => {
  browser = await launch()
})

afterAll(async () => {
  await browser?.close()
})

const allowAll = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
}

/** Answers an auth call and records where the emailed link would send the user back to. */
async function captureRedirect(
  page: Page,
  endpoint: string,
  body: unknown = {},
): Promise<{ redirects: string[] }> {
  const seen = { redirects: [] as string[] }
  await page.route(`**/auth/v1/${endpoint}**`, (route: Route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: allowAll })
    seen.redirects.push(
      new URL(route.request().url()).searchParams.get('redirect_to') ??
        '(none)',
    )
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: allowAll,
      body: JSON.stringify(body),
    })
  })
  return seen
}

describe('links in emails and invites point at the public app address', () => {
  it('sends the verification email back to the app address on sign-up, and again on resend', async () => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.clock.install()
    // Sign-up with email confirmation on: the auth server answers with a user but no session.
    const user = {
      id: '11111111-1111-1111-1111-111111111111',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'new@example.com',
      created_at: new Date().toISOString(),
      app_metadata: {},
      user_metadata: {},
    }
    const signup = await captureRedirect(page, 'signup', user)
    const resend = await captureRedirect(page, 'resend', {})
    await page.goto(`${APP}/auth`)
    await page.clock.resume()

    await page.getByRole('button', { name: 'Create account' }).click()
    // Wait for the screen change to finish, or the text would go into the screen that is animating out.
    await page.getByRole('heading', { name: 'Create your account' }).waitFor()
    await page.getByLabel('Email address').fill('new@example.com')
    await page
      .getByLabel('Password', { exact: true })
      .fill('Tr1cky-Horse-Battery!')
    await page.getByLabel('Confirm password').fill('Tr1cky-Horse-Battery!')
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.getByRole('heading', { name: 'Check your email' }).waitFor()
    expect(signup.redirects).toEqual([expectedOrigin])

    // The resend button is locked for 30 seconds; run the clock through it rather than waiting.
    await page.clock.runFor(31_000)
    await page.getByRole('button', { name: 'Resend email' }).click()
    await page.getByText('Confirmation email sent again.').waitFor()
    expect(resend.redirects).toEqual([expectedOrigin])
    await context.close()
  })

  it('sends the password-reset email back to the reset page on the app address', async () => {
    const context = await browser.newContext()
    const page = await context.newPage()
    const recover = await captureRedirect(page, 'recover', {})
    await page.goto(`${APP}/auth`)
    await page.getByRole('button', { name: 'Log in' }).click()
    await page.getByRole('button', { name: 'Forgot your password?' }).click()
    await page.getByRole('heading', { name: 'Reset your password' }).waitFor()
    await page.getByLabel('Email address').fill('someone@example.com')
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await page.getByText(/reset link is on its way/i).waitFor()
    expect(recover.redirects).toEqual([`${expectedOrigin}/reset-password`])
    await context.close()
  })
})
