import { useState } from 'react'
import { Avatar } from '../../../components/ui/Avatar'
import { Button } from '../../../components/ui/Button'
import { Modal } from '../../../components/ui/Modal'
import { cn } from '../../../lib/cn'
import { MAX_FORWARD_TARGETS } from '../useMessageActions'
import { useChatOverview } from '../useChats'

type Props = {
  open: boolean
  onClose: () => void
  onForward: (chatIds: string[]) => Promise<void>
}

/** Multi-select chat picker, capped at five destinations. */
export function ForwardModal({ open, onClose, onForward }: Props) {
  const { data: chats = [] } = useChatOverview()
  const [selected, setSelected] = useState<string[]>([])
  const [term, setTerm] = useState('')
  const [busy, setBusy] = useState(false)
  // Announcements chats only accept posts from admins, so members cannot forward into them.
  const shown = chats.filter(
    (chat) =>
      chat.canPost &&
      chat.name.toLowerCase().includes(term.trim().toLowerCase()),
  )

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : current.length < MAX_FORWARD_TARGETS
          ? [...current, id]
          : current,
    )
  const send = async () => {
    setBusy(true)
    await onForward(selected)
    setBusy(false)
    setSelected([])
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Forward message to"
      description={`Choose up to ${MAX_FORWARD_TARGETS} chats.`}
    >
      <div className="grid gap-3">
        <input
          data-autofocus
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search chats"
          aria-label="Search chats"
          className="h-10 rounded-lg bg-panel px-3 text-[14px] outline-none placeholder:text-muted"
        />
        <ul className="max-h-[44vh] overflow-y-auto">
          {shown.map((chat) => (
            <li key={chat.id}>
              <label
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-hover',
                  selected.includes(chat.id) && 'bg-primary/10',
                )}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(chat.id)}
                  onChange={() => toggle(chat.id)}
                  className="h-4 w-4 accent-[rgb(var(--wa-primary))]"
                />
                <Avatar
                  name={chat.name}
                  path={chat.avatarPath}
                  bucket={chat.avatarBucket}
                  size={36}
                />
                <span className="truncate text-[15px]">{chat.name}</span>
              </label>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="px-2 py-6 text-center text-[13px] text-muted">
              No chats found.
            </li>
          )}
        </ul>
        <Button
          loading={busy}
          disabled={selected.length === 0}
          onClick={() => void send()}
        >
          Forward{selected.length > 0 ? ` (${selected.length})` : ''}
        </Button>
      </div>
    </Modal>
  )
}
