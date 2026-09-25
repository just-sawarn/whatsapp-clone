import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Download, X } from 'lucide-react'
import { IconButton } from '../../../components/ui/IconButton'
import { Spinner } from '../../../components/ui/Spinner'
import { cn } from '../../../lib/cn'
import { useMediaBlob } from '../useMediaBlob'
import { useSaveMedia } from '../useSaveMedia'
import type { ChatMessage } from '../types'

type Props = { message: ChatMessage; onClose: () => void }

/**
 * Full-screen lightbox. The bubble-sized copy is already in memory, so it appears at once and is swapped for the
 * full photo when that has downloaded and decrypted.
 */
export function MediaViewer({ message, onClose }: Props) {
  const name = message.media?.name ?? 'Photo'
  const preview = useMediaBlob(message, 'thumb', Boolean(message.media?.thumb))
  const full = useMediaBlob(message, 'full')
  const { save, saving } = useSaveMedia(message)
  const url = full.url ?? preview.url
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={name}
      className="fixed inset-0 z-[65] grid place-items-center bg-black/90 p-4"
      onClick={onClose}
    >
      <div className="absolute right-4 top-4 flex gap-1">
        <IconButton
          icon={Download}
          label="Download photo"
          disabled={saving}
          onClick={(event) => {
            event.stopPropagation()
            void save()
          }}
          className="!text-white hover:!bg-white/10"
        />
        <IconButton
          icon={X}
          label="Close photo"
          onClick={onClose}
          className="!text-white hover:!bg-white/10"
        />
      </div>
      {url && (
        <img
          src={url}
          alt={name}
          className={cn(
            'max-h-full max-w-full object-contain transition-[filter] duration-200',
            !full.url && 'blur-[2px]',
          )}
          onClick={(event) => event.stopPropagation()}
        />
      )}
      {!full.url && !full.error && (
        <span className="pointer-events-none absolute bottom-6 text-white">
          <Spinner size={22} />
        </span>
      )}
    </div>,
    document.body,
  )
}
