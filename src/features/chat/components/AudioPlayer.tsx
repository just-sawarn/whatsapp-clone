import { useEffect, useRef, useState } from 'react'
import { Download, Mic, Pause, Play } from 'lucide-react'
import { Icon } from '../../../components/ui/Icon'
import { Spinner } from '../../../components/ui/Spinner'
import { formatDuration } from '../../../lib/format'
import { useNearViewport } from '../../../lib/useNearViewport'
import { useMediaBlob } from '../useMediaBlob'
import { useSaveMedia } from '../useSaveMedia'
import type { ChatMessage } from '../types'

const speeds = [1, 1.5, 2] as const

/** Voice-note player: play/pause, a scrub bar bound to real playback position, duration, and speed. */
export function AudioPlayer({ message }: { message: ChatMessage }) {
  const [ref, near] = useNearViewport<HTMLDivElement>()
  const { url, isPending, error } = useMediaBlob(message, 'full', near)
  const { save, saving } = useSaveMedia(message)
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(message.media?.durationSeconds ?? 0)
  const [speed, setSpeed] = useState<(typeof speeds)[number]>(1)

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed
  }, [speed])

  const toggle = () => {
    const element = audio.current
    if (!element) return
    if (element.paused) void element.play().catch(() => setPlaying(false))
    else element.pause()
  }

  return (
    <div ref={ref} className="flex min-w-[220px] items-center gap-2.5 py-1">
      <button
        type="button"
        onClick={toggle}
        disabled={!url}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-white disabled:opacity-50"
      >
        {isPending && !error ? (
          <Spinner size={16} />
        ) : (
          <Icon icon={playing ? Pause : Play} size={18} />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.05}
          value={Math.min(position, duration || 1)}
          disabled={!url}
          aria-label="Seek voice message"
          onChange={(event) => {
            const next = Number(event.target.value)
            setPosition(next)
            if (audio.current) audio.current.currentTime = next
          }}
          className="h-1 w-full cursor-pointer accent-[rgb(var(--wa-primary))]"
        />
        <div className="mt-0.5 flex justify-between text-[11px] text-muted">
          <span>
            {formatDuration(playing || position > 0 ? position : duration)}
          </span>
          <button
            type="button"
            onClick={() =>
              setSpeed(speeds[(speeds.indexOf(speed) + 1) % speeds.length] ?? 1)
            }
            aria-label={`Playback speed ${speed}x`}
            className="font-medium"
          >
            {speed}x
          </button>
        </div>
      </div>
      <Icon icon={Mic} size={16} className="text-muted" />
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || Boolean(error)}
        aria-label="Download voice message"
        title="Download"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-hover disabled:opacity-40"
      >
        {saving ? <Spinner size={14} /> : <Icon icon={Download} size={16} />}
      </button>
      {url && (
        <audio
          ref={audio}
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false)
            setPosition(0)
          }}
          onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) => {
            const length = event.currentTarget.duration
            if (Number.isFinite(length)) setDuration(length)
          }}
        />
      )}
    </div>
  )
}
