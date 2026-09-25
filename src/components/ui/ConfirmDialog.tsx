import { useState } from 'react'
import { Button } from './Button'
import { Modal } from './Modal'

type Props = {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  danger?: boolean
  onClose: () => void
  /** Return after the action finishes; the dialog shows a spinner meanwhile. */
  onConfirm: () => Promise<unknown> | void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  danger = false,
  onClose,
  onConfirm,
}: Props) {
  const [busy, setBusy] = useState(false)
  const confirm = async () => {
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
    onClose()
  }
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-[14.5px] leading-relaxed text-muted">{description}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} data-autofocus>
          Cancel
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          loading={busy}
          onClick={() => void confirm()}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
