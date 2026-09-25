import { useCallback, useEffect, useRef, useState } from 'react'

const BARS = 36
const MAX_SECONDS = 10 * 60

export type Recording = { blob: Blob; seconds: number; mime: string }

function pickMime(): string | undefined {
  return [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ].find(
    (type) =>
      typeof MediaRecorder !== 'undefined' &&
      MediaRecorder.isTypeSupported(type),
  )
}

export class MicrophoneBlockedError extends Error {
  constructor() {
    super(
      'Microphone access is blocked. Allow it from the lock icon in your browser’s address bar (Site settings → Microphone), then try again.',
    )
    this.name = 'MicrophoneBlockedError'
  }
}

/**
 * Records audio with MediaRecorder and exposes a live waveform sampled from an AnalyserNode (real signal
 * levels, not a canned animation).
 */
export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0))
  const session = useRef<{
    recorder: MediaRecorder
    stream: MediaStream
    context: AudioContext
    chunks: Blob[]
    startedAt: number
    timer: number
    resolve: ((value: Recording | null) => void) | null
    send: boolean
  } | null>(null)

  const teardown = useCallback(() => {
    const current = session.current
    if (!current) return
    window.clearInterval(current.timer)
    current.stream.getTracks().forEach((track) => track.stop())
    void current.context.close().catch(() => undefined)
    session.current = null
    setRecording(false)
    setSeconds(0)
    setLevels(Array(BARS).fill(0))
  }, [])

  const start = useCallback(async () => {
    if (session.current) return
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === 'NotAllowedError' || error.name === 'SecurityError')
      )
        throw new MicrophoneBlockedError()
      throw new Error('No microphone was found on this device.')
    }
    const mime = pickMime()
    const recorder = new MediaRecorder(
      stream,
      mime ? { mimeType: mime } : undefined,
    )
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 256
    context.createMediaStreamSource(stream).connect(analyser)
    const samples = new Uint8Array(analyser.fftSize)
    const startedAt = Date.now()

    const timer = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples)
      let sum = 0
      for (const value of samples) sum += ((value - 128) / 128) ** 2
      const level = Math.min(1, Math.sqrt(sum / samples.length) * 3.2)
      setLevels((current) => [...current.slice(1), level])
      const elapsed = (Date.now() - startedAt) / 1000
      setSeconds(elapsed)
      if (elapsed >= MAX_SECONDS && session.current)
        session.current.recorder.stop()
    }, 60)

    const chunks: Blob[] = []
    recorder.ondataavailable = (event) =>
      event.data.size > 0 && chunks.push(event.data)
    recorder.onstop = () => {
      const current = session.current
      const elapsed = (Date.now() - startedAt) / 1000
      const result =
        current?.send && chunks.length > 0
          ? {
              blob: new Blob(chunks, {
                type: recorder.mimeType || 'audio/webm',
              }),
              seconds: elapsed,
              mime:
                (recorder.mimeType || 'audio/webm').split(';')[0] ??
                'audio/webm',
            }
          : null
      const resolve = current?.resolve
      teardown()
      resolve?.(result)
    }
    session.current = {
      recorder,
      stream,
      context,
      chunks,
      startedAt,
      timer,
      resolve: null,
      send: true,
    }
    recorder.start(250)
    setRecording(true)
  }, [teardown])

  /** Stops recording. Resolves with the audio when `send` is true, otherwise null (cancelled). */
  const stop = useCallback(
    (send: boolean): Promise<Recording | null> => {
      const current = session.current
      if (!current) return Promise.resolve(null)
      current.send = send && Date.now() - current.startedAt > 500
      return new Promise((resolve) => {
        current.resolve = resolve
        if (current.recorder.state !== 'inactive') current.recorder.stop()
        else {
          teardown()
          resolve(null)
        }
      })
    },
    [teardown],
  )

  useEffect(
    () => () => {
      if (session.current) {
        session.current.send = false
        if (session.current.recorder.state !== 'inactive')
          session.current.recorder.stop()
        else teardown()
      }
    },
    [teardown],
  )

  return { recording, seconds, levels, start, stop }
}
