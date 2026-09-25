import { useEffect, useMemo, useState } from 'react'
import { FileText } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import { Modal } from '../../../components/ui/Modal'
import { formatBytes } from '../../../lib/format'

type Props = {
  files: File[] | null
  onCancel: () => void
  onSend: (files: File[], caption: string) => void
}

/** Review step before sending: photo previews or file cards, plus a caption for the first item. */
export function AttachmentPreview({ files, onCancel, onSend }: Props) {
  const [caption, setCaption] = useState('')
  const previews = useMemo(
    () =>
      (files ?? []).map((file) => ({
        file,
        url:
          file.type.startsWith('image/') && file.type !== 'image/svg+xml'
            ? URL.createObjectURL(file)
            : null,
      })),
    [files],
  )

  useEffect(
    () => () =>
      previews.forEach((item) => item.url && URL.revokeObjectURL(item.url)),
    [previews],
  )
  useEffect(() => setCaption(''), [files])

  return (
    <Modal
      open={files !== null && files.length > 0}
      onClose={onCancel}
      title={
        files && files.length > 1
          ? `Send ${files.length} files`
          : 'Send attachment'
      }
      className="max-w-lg"
    >
      <div className="grid gap-4">
        <ul className="grid max-h-72 gap-2 overflow-y-auto">
          {previews.map(({ file, url }) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}`}
              className="flex items-center gap-3 rounded-lg bg-panel p-2"
            >
              {url ? (
                <img
                  src={url}
                  alt=""
                  className="h-16 w-16 rounded-md object-cover"
                />
              ) : (
                <span className="grid h-16 w-16 place-items-center rounded-md bg-primary/15 text-link">
                  <Icon icon={FileText} size={26} />
                </span>
              )}
              <span className="min-w-0">
                <strong className="block truncate text-[14px] font-normal">
                  {file.name}
                </strong>
                <span className="text-xs text-muted">
                  {formatBytes(file.size)}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <input
          data-autofocus
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          onKeyDown={(event) =>
            event.key === 'Enter' && files && onSend(files, caption)
          }
          placeholder="Add a caption"
          aria-label="Caption"
          maxLength={1000}
          className="h-11 rounded-lg border border-divider bg-surface px-3 text-[15px] outline-none focus:border-primary"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => files && onSend(files, caption)}>Send</Button>
        </div>
      </div>
    </Modal>
  )
}
