import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { IconButton } from '../../../components/ui/IconButton'

type Props = { url: string; name: string; onClose: () => void }

/** Full-screen lightbox for a decrypted image. */
export function MediaViewer({ url, name, onClose }: Props) {
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
      <IconButton
        icon={X}
        label="Close photo"
        onClick={onClose}
        className="absolute right-4 top-4 !text-white hover:!bg-white/10"
      />
      <img
        src={url}
        alt={name}
        className="max-h-full max-w-full object-contain"
        onClick={(event) => event.stopPropagation()}
      />
    </div>,
    document.body,
  )
}
