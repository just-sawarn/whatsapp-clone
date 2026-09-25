import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright-core'

const CHROME =
  process.env.CHROME_PATH ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const APP = `http://localhost:${process.env.TEST_APP_PORT ?? 5199}`

let browser: Browser

beforeAll(async () => {
  browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    // Synthetic camera/microphone, no permission prompt, and plain host candidates so loopback ICE works.
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
    ],
  })
})

afterAll(async () => {
  await browser?.close()
})

/**
 * Replaces the Supabase Realtime channel inside a page with a stand-in that relays broadcast messages to the
 * other page. Everything else (CallSession, RTCPeerConnection, the signalling protocol) is the real code.
 */
async function wire(page: Page, peer: () => Page) {
  await page.exposeFunction(
    '__relay',
    async (name: string, payload: unknown) => {
      await peer().evaluate(
        ([n, p]) =>
          (
            window as unknown as { __deliver?: (n: string, p: unknown) => void }
          ).__deliver?.(n as string, p),
        [name, payload],
      )
    },
  )
  await page.goto(`${APP}/auth`)
  await page.evaluate(async () => {
    // Vitest rewrites import() in serialised functions; a Function wrapper leaves it for the browser.
    const load = new Function('url', 'return import(url)') as (
      url: string,
    ) => Promise<unknown>
    const { supabase } = (await load('/src/lib/supabase.ts')) as {
      supabase: object
    }
    const listeners = new Map<string, (message: { payload: unknown }) => void>()
    const w = window as unknown as {
      __relay: (n: string, p: unknown) => Promise<void>
      __deliver: (n: string, p: unknown) => void
    }
    const client = supabase as unknown as {
      channel: (name: string) => unknown
      removeChannel: () => Promise<string>
    }
    client.channel = (name: string) => {
      const channel = {
        on: (
          _type: string,
          _filter: unknown,
          callback: (message: { payload: unknown }) => void,
        ) => {
          listeners.set(name, callback)
          return channel
        },
        subscribe: (callback?: (status: string) => void) => {
          window.setTimeout(() => callback?.('SUBSCRIBED'), 0)
          return channel
        },
        send: (message: { payload: unknown }) => {
          void w.__relay(name, message.payload)
          return Promise.resolve('ok')
        },
      }
      return channel
    }
    client.removeChannel = () => Promise.resolve('ok')
    w.__deliver = (name, payload) => listeners.get(name)?.({ payload })
  })
}

async function startSession(page: Page, caller: boolean, video: boolean) {
  await page.evaluate(
    async ([isCaller, wantVideo]) => {
      const load = new Function('url', 'return import(url)') as (
        url: string,
      ) => Promise<unknown>
      const { CallSession } = (await load(
        '/src/features/calls/CallSession.ts',
      )) as {
        CallSession: new (
          id: string,
          caller: boolean,
          stream: MediaStream,
          handlers: Record<string, (...args: never[]) => void>,
        ) => { beginOffer: () => Promise<void>; open: () => Promise<void> }
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: wantVideo as boolean,
      })
      const w = window as unknown as Record<string, unknown>
      const state = {
        health: [] as string[],
        remoteTracks: 0,
        accepted: false,
        hungUp: false,
      }
      w.__state = state
      const session = new CallSession(
        'test-call',
        isCaller as boolean,
        stream,
        {
          onRemoteStream: (remote: MediaStream) => {
            state.remoteTracks = remote.getTracks().length
          },
          onPeerHealth: (health: string) => state.health.push(health),
          onAccept: () => {
            state.accepted = true
            void session.beginOffer()
          },
          onHangup: () => {
            state.hungUp = true
          },
        },
      )
      w.__session = session
      await session.open()
    },
    [caller, video],
  )
}

const read = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __state: {
            health: string[]
            remoteTracks: number
            accepted: boolean
            hungUp: boolean
          }
        }
      ).__state,
  )

async function until(
  page: Page,
  predicate: (state: Awaited<ReturnType<typeof read>>) => boolean,
  what: string,
  timeoutMs = 20_000,
) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate(await read(page))) return
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(
    `Timed out waiting for ${what}; state: ${JSON.stringify(await read(page))}`,
  )
}

describe('WebRTC call signalling', () => {
  it.each([
    ['voice', false, 1],
    ['video', true, 2],
  ])(
    'connects a %s call end to end and hangs up cleanly',
    async (_label, video, tracks) => {
      const context = await browser.newContext()
      const caller = await context.newPage()
      const callee = await context.newPage()
      await wire(caller, () => callee)
      await wire(callee, () => caller)

      await startSession(caller, true, video)
      await startSession(callee, false, video)

      // The callee accepting is what prompts the caller to send an offer.
      await callee.evaluate(() =>
        (
          window as unknown as { __session: { send: (m: unknown) => void } }
        ).__session.send({ kind: 'accept' }),
      )
      await until(
        caller,
        (state) => state.accepted,
        'the caller to see the accept',
      )
      await until(
        caller,
        (state) => state.health.includes('connected'),
        'the caller to connect',
      )
      await until(
        callee,
        (state) => state.health.includes('connected'),
        'the callee to connect',
      )
      await until(
        caller,
        (state) => state.remoteTracks >= tracks,
        'remote media on the caller',
      )
      await until(
        callee,
        (state) => state.remoteTracks >= tracks,
        'remote media on the callee',
      )

      await caller.evaluate(() => {
        const w = window as unknown as {
          __session: { send: (m: unknown) => void; close: () => void }
        }
        w.__session.send({ kind: 'hangup' })
        w.__session.close()
      })
      await until(
        callee,
        (state) => state.hungUp,
        'the callee to see the hangup',
      )
      expect((await read(caller)).health).not.toContain('failed')
      await context.close()
    },
  )
})
