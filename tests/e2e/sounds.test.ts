import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Browser } from 'playwright-core'
import { closePool } from '../integration/helpers'
import { APP, launch, newPerson, onboard, type Person } from './helpers'

// The loudness test imports the source module through the dev server, so it only runs there.
const dev = process.env.E2E_MODE !== 'prod'

let browser: Browser
let page: Awaited<ReturnType<Browser['newPage']>>

beforeAll(async () => {
  browser = await launch()
  page = await browser.newPage()
  await page.goto(`${APP}/auth`)
})

afterAll(async () => {
  await browser?.close()
  await closePool()
})

type Level = { peak: number; rms: number }
type Measured = Record<
  'chime' | 'pop' | 'ding' | 'ring',
  { before: Level; after: Level }
> & { half: Level; full: Level }

/** Renders each sound offline (as a speaker would receive it) and reports its peak and average (RMS) level. */
async function measure(): Promise<Measured> {
  return page.evaluate(async () => {
    const load = new Function('url', 'return import(url)') as (
      url: string,
    ) => Promise<unknown>
    const sounds = (await load('/src/lib/sounds.ts')) as {
      createOutput: (ctx: BaseAudioContext, level?: number) => AudioNode
      scheduleMessageSound: (
        kind: 'chime' | 'pop' | 'ding',
        ctx: BaseAudioContext,
        out: AudioNode,
        at?: number,
      ) => void
      scheduleRingBurst: (
        ctx: BaseAudioContext,
        out: AudioNode,
        at?: number,
      ) => void
    }
    const RATE = 44100
    const stats = (data: Float32Array): Level => {
      let peak = 0
      let energy = 0
      for (const value of data) {
        peak = Math.max(peak, Math.abs(value))
        energy += value * value
      }
      return { peak, rms: Math.sqrt(energy / data.length) }
    }
    const render = async (
      seconds: number,
      build: (ctx: OfflineAudioContext) => void,
    ): Promise<Level> => {
      const ctx = new OfflineAudioContext(1, Math.ceil(RATE * seconds), RATE)
      build(ctx)
      return stats((await ctx.startRendering()).getChannelData(0))
    }
    // The previous implementation: one plain oscillator per note at a low gain, straight to the speakers.
    const oldNote = (
      ctx: OfflineAudioContext,
      frequency: number,
      at: number,
      duration: number,
      volume: number,
      type: OscillatorType,
    ) => {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.type = type
      oscillator.frequency.setValueAtTime(frequency, at)
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(volume, at + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
      oscillator.connect(gain).connect(ctx.destination)
      oscillator.start(at)
      oscillator.stop(at + duration + 0.05)
    }
    const compare = async (
      seconds: number,
      before: (ctx: OfflineAudioContext) => void,
      after: (ctx: OfflineAudioContext, out: AudioNode) => void,
    ) => ({
      before: await render(seconds, before),
      after: await render(seconds, (ctx) =>
        after(ctx, sounds.createOutput(ctx, 1)),
      ),
    })
    return {
      chime: await compare(
        1.2,
        (ctx) => {
          oldNote(ctx, 880, 0, 0.18, 0.16, 'sine')
          oldNote(ctx, 1175, 0.16, 0.26, 0.16, 'sine')
        },
        (ctx, out) => sounds.scheduleMessageSound('chime', ctx, out),
      ),
      pop: await compare(
        1,
        (ctx) => oldNote(ctx, 520, 0, 0.09, 0.2, 'triangle'),
        (ctx, out) => sounds.scheduleMessageSound('pop', ctx, out),
      ),
      ding: await compare(
        1.2,
        (ctx) => oldNote(ctx, 1320, 0, 0.4, 0.14, 'sine'),
        (ctx, out) => sounds.scheduleMessageSound('ding', ctx, out),
      ),
      ring: await compare(
        1.6,
        (ctx) => {
          for (const [at, frequency] of [
            [0, 784],
            [0.26, 659],
            [0.6, 784],
            [0.86, 659],
          ] as const)
            oldNote(ctx, frequency, at, 0.22, 0.14, 'sine')
        },
        (ctx, out) => sounds.scheduleRingBurst(ctx, out),
      ),
      full: await render(1.2, (ctx) =>
        sounds.scheduleMessageSound('chime', ctx, sounds.createOutput(ctx, 1)),
      ),
      half: await render(1.2, (ctx) =>
        sounds.scheduleMessageSound(
          'chime',
          ctx,
          sounds.createOutput(ctx, 0.5),
        ),
      ),
    }
  })
}

describe.skipIf(!dev)('sound loudness', () => {
  it('is several times louder than before without clipping', async () => {
    const result = await measure()
    for (const name of ['chime', 'pop', 'ding', 'ring'] as const) {
      const { before, after } = result[name]
      // Near full scale, and never past it (a limiter sits before the speakers).
      expect(after.peak, `${name} peak`).toBeGreaterThan(0.6)
      expect(after.peak, `${name} peak must not clip`).toBeLessThanOrEqual(
        1.0001,
      )
      // At least 12 dB more average energy (4x amplitude) than the previous version.
      expect(after.rms / before.rms, `${name} loudness gain`).toBeGreaterThan(4)
      // The previous sounds peaked around 0.14 to 0.2 of full scale.
      expect(before.peak, `${name} baseline`).toBeLessThan(0.25)
    }
  })

  it('scales with the volume setting', async () => {
    const { half, full } = await measure()
    expect(half.rms / full.rms).toBeGreaterThan(0.35)
    expect(half.rms / full.rms).toBeLessThan(0.65)
  })
})

describe('sound volume setting', () => {
  let person: Person

  it('is saved and survives a reload', async () => {
    person = await newPerson(browser, 'alice')
    await onboard(person, 'Alice Adams')
    const { page: settings } = person
    await settings.getByRole('link', { name: 'Settings', exact: true }).click()
    await settings.getByRole('button', { name: /^Notifications/ }).click()
    const slider = settings.getByLabel('Sound volume')
    expect(await slider.inputValue()).toBe('100')
    await slider.fill('40')
    await settings.getByText('40%').waitFor()
    await settings.reload()
    await settings.getByLabel('Sound volume').waitFor()
    expect(await settings.getByLabel('Sound volume').inputValue()).toBe('40')
    expect(person.errors).toEqual([])
  })
})
