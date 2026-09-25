import { Download, FileText, ImageOff } from 'lucide-react'
import { Icon } from '../../../components/ui/Icon'
import { Skeleton } from '../../../components/ui/Skeleton'
import { formatBytes } from '../../../lib/format'
import { downloadMedia } from '../messageExtras'
import { useMediaUrl } from '../useMediaUrl'
import type { ChatMessage } from '../types'
import { AudioPlayer } from './AudioPlayer'

type Props = {
  message: ChatMessage
  onOpenImage: (message: ChatMessage, url: string) => void
}

function ImageContent({ message, onOpenImage }: Props) {
  const { data: url, isPending, error } = useMediaUrl(message)
  const media = message.media
  if (!media) return null
  const ratio =
    media.width && media.height ? `${media.width} / ${media.height}` : '4 / 3'
  return (
    <div
      className="mb-1 w-[min(320px,70vw)] overflow-hidden rounded-md bg-black/10"
      style={{ aspectRatio: ratio, maxHeight: 360 }}
    >
      {url ? (
        <button
          type="button"
          onClick={() => onOpenImage(message, url)}
          aria-label={`Open photo ${media.name}`}
          className="block h-full w-full"
        >
          <img
            src={url}
            alt={media.name}
            className="h-full w-full object-cover"
          />
        </button>
      ) : error ? (
        <div className="grid h-full place-items-center text-[13px] text-muted">
          <span className="grid justify-items-center gap-1">
            <Icon icon={ImageOff} size={22} />
            Could not load photo
          </span>
        </div>
      ) : isPending ? (
        <Skeleton className="h-full w-full rounded-none" />
      ) : null}
    </div>
  )
}

function FileContent({ message }: { message: ChatMessage }) {
  const media = message.media
  if (!media) return null
  const save = async () => {
    const blob = await downloadMedia(message)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = media.name
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
  return (
    <button
      type="button"
      onClick={() => void save()}
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
      <Icon icon={Download} size={20} className="text-muted" />
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
