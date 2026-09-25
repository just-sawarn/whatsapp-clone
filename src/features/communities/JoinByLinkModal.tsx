import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { parseInviteCode } from './communityService'

export function JoinByLinkModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const code = parseInviteCode(value)
  const invalid = value.trim().length > 0 && code === null

  const submit = () => {
    if (!code) return
    setValue('')
    onClose()
    navigate(`/communities/join/${code}`)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Join with a link"
      description="Paste the invite link a community admin shared with you."
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <Input
          label="Invite link"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="https://…/communities/join/…"
          error={
            invalid
              ? 'That does not look like a community invite link.'
              : undefined
          }
          data-autofocus
        />
        <Button type="submit" disabled={!code}>
          Continue
        </Button>
      </form>
    </Modal>
  )
}
