import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Image as ImageIcon, Type } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Icon } from '../../components/ui/Icon'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/ToastContext'
import { statusPalette } from '../../design/tokens'
import { cn } from '../../lib/cn'
import { errorMessage } from '../../lib/errors'
import { keys } from '../../lib/queryKeys'
import { useCurrentUserId } from '../auth/useCurrentUser'
import { MAX_CAPTION, postImageStatus, postTextStatus } from './statusService'

type Props = {
  open: boolean
  initialMode?: 'text' | 'photo'
  onClose: () => void
}

export function StatusComposer({ open, initialMode = 'text', onClose }: Props) {
  const userId = useCurrentUserId()
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const [mode, setMode] = useState<'text' | 'photo'>(initialMode)
  const [text, setText] = useState('')
  const [color, setColor] = useState<string>(statusPalette[0])
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const preview = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  )

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )
  useEffect(() => {
    if (open) setMode(initialMode)
  }, [initialMode, open])

  const reset = () => {
    setText('')
    setFile(null)
    setCaption('')
  }

  const post = async () => {
    setBusy(true)
    try {
      if (mode === 'text') await postTextStatus(userId, text, color)
      else if (file) await postImageStatus(userId, file, caption)
      await queryClient.invalidateQueries({ queryKey: keys.statuses(userId) })
      notify('Status posted. It disappears after 24 hours.', 'success')
      reset()
      onClose()
    } catch (error) {
      notify(errorMessage(error, 'Could not post your status.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const ready = mode === 'text' ? text.trim().length > 0 : file !== null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New status"
      description="Visible to your contacts for 24 hours."
    >
      <div className="grid gap-4">
        <div
          role="tablist"
          className="grid grid-cols-2 gap-1 rounded-full bg-panel p-1"
        >
          {(['text', 'photo'] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={mode === item}
              onClick={() => setMode(item)}
              className={cn(
                'flex items-center justify-center gap-2 rounded-full py-2 text-[14px]',
                mode === item ? 'bg-surface shadow-bubble' : 'text-muted',
              )}
            >
              <Icon icon={item === 'text' ? Type : ImageIcon} size={16} />{' '}
              {item === 'text' ? 'Text' : 'Photo'}
            </button>
          ))}
        </div>
        {mode === 'text' ? (
          <>
            <div
              className="grid h-56 place-items-center rounded-xl p-5"
              style={{ backgroundColor: color }}
            >
              <textarea
                data-autofocus
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={MAX_CAPTION}
                placeholder="Type a status"
                aria-label="Status text"
                className="h-full w-full resize-none bg-transparent text-center text-[22px] leading-snug text-white outline-none placeholder:text-white/70"
              />
            </div>
            <div
              className="flex flex-wrap items-center gap-2"
              role="radiogroup"
              aria-label="Background colour"
            >
              {statusPalette.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  role="radio"
                  aria-checked={color === swatch}
                  aria-label={`Colour ${swatch}`}
                  onClick={() => setColor(swatch)}
                  className={cn(
                    'h-8 w-8 rounded-full border-2',
                    color === swatch ? 'border-text' : 'border-transparent',
                  )}
                  style={{ backgroundColor: swatch }}
                />
              ))}
              <span className="ml-auto text-xs text-muted">
                {text.length}/{MAX_CAPTION}
              </span>
            </div>
          </>
        ) : (
          <>
            {preview ? (
              <img
                src={preview}
                alt="Selected"
                className="max-h-64 w-full rounded-xl object-contain"
              />
            ) : (
              <label className="grid h-40 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-divider text-[14px] text-muted hover:bg-surface-hover">
                Choose a photo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </label>
            )}
            {preview && (
              <input
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                maxLength={MAX_CAPTION}
                placeholder="Add a caption"
                aria-label="Caption"
                className="h-11 rounded-lg border border-divider bg-surface px-3 text-[15px] outline-none focus:border-primary"
              />
            )}
            {preview && (
              <Button
                variant="ghost"
                onClick={() => setFile(null)}
                className="justify-self-start"
              >
                Choose a different photo
              </Button>
            )}
          </>
        )}
        <p className="text-[12.5px] leading-relaxed text-muted">
          Status updates are shown to people you and they have each saved as
          contacts. Unlike messages, they are not end-to-end encrypted.
        </p>
        <Button loading={busy} disabled={!ready} onClick={() => void post()}>
          Post status
        </Button>
      </div>
    </Modal>
  )
}
