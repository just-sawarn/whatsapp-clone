import { useEffect, useMemo, useRef } from 'react'
import { Camera } from 'lucide-react'
import { photoRejection } from '../../lib/image'
import { cn } from '../../lib/cn'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import { Spinner } from './Spinner'
import { useToast } from './ToastContext'

type Props = {
  name: string
  size?: number
  shape?: 'circle' | 'square'
  /** The current photo already stored for this chat. */
  path?: string | null
  bucket?: string
  /** A photo chosen but not uploaded yet (for example while creating a group). */
  previewFile?: File | null
  busy?: boolean
  disabled?: boolean
  onPick: (file: File) => void
  onRemove?: () => void
  className?: string
}

/** A photo you can click to change: shows the current or chosen photo with a camera overlay, and a remove link. */
export function AvatarPicker({
  name,
  size = 96,
  shape = 'circle',
  path,
  bucket,
  previewFile,
  busy = false,
  disabled = false,
  onPick,
  onRemove,
  className,
}: Props) {
  const input = useRef<HTMLInputElement>(null)
  const { notify } = useToast()
  const previewUrl = useMemo(
    () => (previewFile ? URL.createObjectURL(previewFile) : null),
    [previewFile],
  )
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    },
    [previewUrl],
  )
  const rounding = shape === 'square' ? 'rounded-[28%]' : 'rounded-full'
  const hasPhoto = Boolean(previewFile || path)

  const choose = (file: File | undefined) => {
    if (!file) return
    const problem = photoRejection(file)
    if (problem) return notify(problem, 'error')
    onPick(file)
  }

  return (
    <div className={cn('grid justify-items-center gap-1.5', className)}>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
        aria-label={hasPhoto ? 'Change photo' : 'Add a photo'}
        className={cn(
          'group relative focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default',
          rounding,
        )}
        style={{ width: size, height: size }}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            className={cn('h-full w-full object-cover', rounding)}
          />
        ) : (
          <Avatar
            name={name || '?'}
            path={path}
            bucket={bucket}
            size={size}
            shape={shape}
          />
        )}
        {!disabled && (
          <span
            className={cn(
              'absolute inset-0 grid place-items-center bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100',
              busy && 'opacity-100',
              rounding,
            )}
          >
            {busy ? (
              <Spinner size={22} />
            ) : (
              <Icon icon={Camera} size={Math.max(20, size * 0.26)} />
            )}
          </span>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(event) => {
          choose(event.target.files?.[0])
          event.target.value = ''
        }}
      />
      {!disabled && hasPhoto && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="text-[13px] text-danger hover:underline disabled:opacity-50"
        >
          Remove photo
        </button>
      )}
    </div>
  )
}
