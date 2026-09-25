import { useState } from 'react'
import { Download, FileText, ImageOff } from 'lucide-react'
import { Icon } from '../../../components/ui/Icon'
import { Skeleton } from '../../../components/ui/Skeleton'
import { Spinner } from '../../../components/ui/Spinner'
import { cn } from '../../../lib/cn'
import { formatBytes } from '../../../lib/format'
import { useNearViewport } from '../../../lib/useNearViewport'
import { useMediaBlob } from '../useMediaBlob'
import { useSaveMedia } from '../useSaveMedia'
import type { ChatMessage } from '../types'
import { AudioPlayer } from './AudioPlayer'

type Props = {
  message: ChatMessage
  onOpenImage: (message: ChatMessage) => void
}

function ImageContent({ message, onOpenImage }: Props) {
  const media = message.media
  // Download only once the bubble is near the screen, and only the bubble-sized copy when there is one.
  const [ref, near] = useNearViewport<HTMLDivElement>()
  const {
    url,
    isPending,
    error: failed,
  } = useMediaBlob(message, media?.thumb ? 'thumb' : 'full', near)
  const { save, saving } = useSaveMedia(message)
  const [loaded, setLoaded] = useState(false)
  if (!media) return null
  const ratio =
    media.width && media.height ? `${media.width} / ${media.height}` : '4 / 3'
  return (
    <div
      ref={ref}
      className="group relative mb-1 w-[min(320px,70vw)] overflow-hidden rounded-md bg-black/10"
      style={{ aspectRatio: ratio, maxHeight: 360 }}
    >
      {media.tiny && !loaded && (
        <img
          src={media.tiny}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-md"
        />
      )}
      {url ? (
        <button
          type="button"
          onClick={() => onOpenImage(message)}
          aria-label={`Open photo ${media.name}`}
          className="relative block h-full w-full"
        >
          <img
            src={url}
            alt={media.name}
            decoding="async"
            onLoad={() => setLoaded(true)}
            className={cn(
              'h-full w-full object-cover transition-opacity duration-200',
              media.tiny && !loaded && 'opacity-0',
            )}
          />
        </button>
      ) : failed ? (
        <div className="grid h-full place-items-center text-[13px] text-muted">
          <span className="grid justify-items-center gap-1">
            <Icon icon={ImageOff} size={22} />
            Could not load photo
          </span>
        </div>
      ) : isPending && !media.tiny ? (
        <Skeleton className="h-full w-full rounded-none" />
      ) : null}
      {!failed && (
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          aria-label={`Download ${media.name}`}
          title="Download"
          className="absolute bottom-1.5 right-1.5 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity hover:bg-black/75 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
        >
          {saving ? <Spinner size={14} /> : <Icon icon={Download} size={16} />}
        </button>
      )}
    </div>
  )
}

function FileContent({ message }: { message: ChatMessage }) {
  const media = message.media
  const { save, saving } = useSaveMedia(message)
  if (!media) return null
  return (
    <button
      type="button"
      onClick={() => void save()}
      disabled={saving}
      className="mb-1 flex w-full min-w-[220px] items-center gap-3 rounded-md bg-black/5 p-2.5 text-left dark:bg-white/5"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-link">
        <Icon icon={FileText} size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-[14px] font-normal">
          {media.name}
        </strong>
        <span className="text-xs text-muted">{formatBytes(media.size)}</span>
      </span>
      {saving ? (
        <Spinner size={18} />
      ) : (
        <Icon icon={Download} size={20} className="text-muted" />
      )}
    </button>
  )
}

export function MediaContent({ message, onOpenImage }: Props) {
  if (!message.media) return null
  if (message.kind === 'image')
    return <ImageContent message={message} onOpenImage={onOpenImage} />
  if (message.kind === 'audio') return <AudioPlayer message={message} />
  return <FileContent message={message} />
}
