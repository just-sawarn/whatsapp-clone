import type { MessageSound } from '../features/preferences/PreferencesContext'

/**
 * Notification sounds are synthesised with the Web Audio API so the app ships no third-party audio
 * assets. Browsers only allow audio after a user gesture; failures are ignored on purpose.
 */
let context: AudioContext | null = null

function audio(): AudioContext | null {
  try {
    context ??= new AudioContext()
    if (context.state === 'suspended') void context.resume()
    return context
  } catch {
    return null
  }
}

function tone(frequency: number, startOffset: number, duration: number, volume = 0.16, type: OscillatorType = 'sine'): void {
  const ctx = audio()
  if (!ctx) return
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  const start = ctx.currentTime + startOffset
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  oscillator.connect(gain).connect(ctx.destination)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.05)
}

export const messageSoundLabels: Record<Exclude<MessageSound, 'off'>, string> = {
  chime: 'Two-tone chime',
  pop: 'Soft pop',
  ding: 'Single ding',
}

export function playMessageSound(kind: MessageSound): void {
  if (kind === 'off') return
  if (kind === 'chime') {
    tone(880, 0, 0.18)
    tone(1175, 0.16, 0.26)
  } else if (kind === 'pop') {
    tone(520, 0, 0.09, 0.2, 'triangle')
  } else {
    tone(1320, 0, 0.4, 0.14)
  }
}

export function playSentSound(): void {
  tone(660, 0, 0.07, 0.08, 'triangle')
}

/** Starts a looping ringtone and returns a function that stops it. */
export function startRingtone(): () => void {
  const ring = () => {
    tone(784, 0, 0.22, 0.14)
    tone(659, 0.26, 0.22, 0.14)
    tone(784, 0.6, 0.22, 0.14)
    tone(659, 0.86, 0.22, 0.14)
  }
  ring()
  const timer = window.setInterval(ring, 2600)
  return () => window.clearInterval(timer)
}
