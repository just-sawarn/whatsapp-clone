import type { MessageSound } from '../features/preferences/PreferencesContext'

/**
 * Notification sounds and the call ringtone are synthesised with the Web Audio API, so the app ships no
 * third-party audio assets. Browsers only allow audio after a user gesture; failures are ignored on purpose.
 *
 * Loudness: a web page cannot go beyond the device's own volume, so the goal is the strongest clean signal. Each
 * note stacks a fundamental with an octave and a fifth above it (extra partials carry further than a pure sine at the
 * same peak), runs near full scale, and passes through a limiter so the louder mix never clips into distortion.
 */
let context: AudioContext | null = null
let liveMaster: GainNode | null = null
/** 0.1 to 1: the user's Sound volume setting. 1 is the loudest the sounds can be. */
let volume = 1

function audio(): AudioContext | null {
  try {
    context ??= new AudioContext()
    if (context.state === 'suspended') void context.resume()
    return context
  } catch {
    return null
  }
}

/**
 * Master gain into a limiter into the speakers. Exported (with the schedule functions below) so the same sounds
 * can be rendered offline and measured in tests.
 */
export function createOutput(ctx: BaseAudioContext, level = 1): GainNode {
  const master = ctx.createGain()
  master.gain.value = level
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -3
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.001
  limiter.release.value = 0.08
  // A compressor reacts after a peak has begun, so a final soft clip guarantees the signal never passes full scale.
  const softClip = ctx.createWaveShaper()
  const curve = new Float32Array(1025)
  for (let index = 0; index < curve.length; index++)
    curve[index] = Math.tanh((index / 512 - 1) * 1.4) / Math.tanh(1.4)
  softClip.curve = curve
  master.connect(limiter)
  limiter.connect(softClip)
  softClip.connect(ctx.destination)
  return master
}

function live(): { ctx: AudioContext; out: GainNode } | null {
  const ctx = audio()
  if (!ctx) return null
  liveMaster ??= createOutput(ctx, volume)
  return { ctx, out: liveMaster }
}

/** Applies the Sound volume setting (clamped to 0.1 to 1) to sounds that are playing or will play. */
export function setSoundVolume(level: number): void {
  volume = Math.min(1, Math.max(0.1, Number.isFinite(level) ? level : 1))
  if (liveMaster) liveMaster.gain.value = volume
}

const partials: Array<{ ratio: number; weight: number; type: OscillatorType }> =
  [
    { ratio: 1, weight: 0.6, type: 'sine' },
    { ratio: 2, weight: 0.3, type: 'triangle' },
    { ratio: 3, weight: 0.15, type: 'sine' },
  ]

/**
 * One note: a fast attack, a short hold at full level, then a decay. Holding before decaying keeps the sound strong
 * for its whole length (a pure decay is loud only for an instant), which is much of what makes it feel louder.
 */
function note(
  ctx: BaseAudioContext,
  out: AudioNode,
  frequency: number,
  at: number,
  duration: number,
  peak: number,
): void {
  const start = ctx.currentTime + at
  const attack = 0.008
  const holdUntil = start + attack + Math.min(duration * 0.4, 0.14)
  for (const partial of partials) {
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    const level = peak * partial.weight
    oscillator.type = partial.type
    oscillator.frequency.setValueAtTime(frequency * partial.ratio, start)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(level, start + attack)
    gain.gain.setValueAtTime(level, holdUntil)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(gain).connect(out)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.05)
  }
}

export const messageSoundLabels: Record<
  Exclude<MessageSound, 'off'>,
  string
> = {
  chime: 'Two-tone chime',
  pop: 'Double pop',
  ding: 'Bell ding',
}

export function scheduleMessageSound(
  kind: Exclude<MessageSound, 'off'>,
  ctx: BaseAudioContext,
  out: AudioNode,
  at = 0,
): void {
  if (kind === 'chime') {
    note(ctx, out, 880, at, 0.24, 0.95)
    note(ctx, out, 1175, at + 0.17, 0.55, 0.95)
  } else if (kind === 'pop') {
    note(ctx, out, 520, at, 0.16, 0.95)
    note(ctx, out, 780, at + 0.11, 0.2, 0.95)
  } else {
    note(ctx, out, 1320, at, 0.9, 0.95)
  }
}

/** One repeat of the ringtone: four insistent notes, then a short gap before the next repeat. */
export function scheduleRingBurst(
  ctx: BaseAudioContext,
  out: AudioNode,
  at = 0,
): void {
  for (const [offset, frequency] of [
    [0, 784],
    [0.3, 659],
    [0.72, 784],
    [1.02, 659],
  ] as const) {
    note(ctx, out, frequency, at + offset, 0.3, 1)
  }
}

export const RING_INTERVAL_MS = 2400

export function playMessageSound(kind: MessageSound): void {
  if (kind === 'off') return
  const target = live()
  if (target) scheduleMessageSound(kind, target.ctx, target.out)
}

/** A quiet, short tick: intentionally subtle, since it plays for every message you send. */
export function playSentSound(): void {
  const target = live()
  if (target) note(target.ctx, target.out, 660, 0, 0.09, 0.35)
}

/** Plays one ring, for previewing the ringtone in Settings. */
export function playRingPreview(): void {
  const target = live()
  if (target) scheduleRingBurst(target.ctx, target.out)
}

/** Starts a looping ringtone and returns a function that stops it. */
export function startRingtone(): () => void {
  const ring = () => {
    const target = live()
    if (target) scheduleRingBurst(target.ctx, target.out)
  }
  ring()
  const timer = window.setInterval(ring, RING_INTERVAL_MS)
  return () => window.clearInterval(timer)
}
