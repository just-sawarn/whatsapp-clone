import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { UserPlus, X } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { useToast } from '../../../components/ui/ToastContext'
import { Avatar } from '../../../components/ui/Avatar'
import { errorMessage } from '../../../lib/errors'
import { keys } from '../../../lib/queryKeys'
import { useCurrentUserId } from '../../auth/useCurrentUser'
import { AvatarPicker } from '../../../components/ui/AvatarPicker'
import { uploadPhotoAfterCreate } from '../useChatAvatar'
import { createGroupChat, openDirectChat } from '../chatService'
import { ContactPicker, type PickedPerson } from './ContactPicker'

type Props = {
  mode: 'chat' | 'group' | null
  onClose: () => void
  onSwitch: (mode: 'chat' | 'group') => void
}

export function NewChatModal({ mode, onClose, onSwitch }: Props) {
  const userId = useCurrentUserId()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const [busy, setBusy] = useState(false)
  const [members, setMembers] = useState<PickedPerson[]>([])
  const [name, setName] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)

  const finish = async (chatId: string) => {
    await queryClient.invalidateQueries({ queryKey: keys.chats(userId) })
    await queryClient.invalidateQueries({ queryKey: keys.contacts(userId) })
    setMembers([])
    setName('')
    onClose()
    navigate(`/chat/${chatId}`)
  }

  const startChat = async (person: PickedPerson) => {
    if (busy) return
    setBusy(true)
    try {
      await finish(await openDirectChat(person.userId))
    } catch (error) {
      notify(errorMessage(error, 'Could not start the chat.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const toggleMember = (person: PickedPerson) =>
    setMembers((current) =>
      current.some((member) => member.userId === person.userId)
        ? current.filter((member) => member.userId !== person.userId)
        : [...current, person],
    )

  const createGroup = async () => {
    setBusy(true)
    try {
      const chatId = await createGroupChat(
        name,
        members.map((member) => member.userId),
      )
      // The photo needs the group to exist, and never blocks creating it.
      await uploadPhotoAfterCreate(chatId, photo, notify)
      setPhoto(null)
      await finish(chatId)
    } catch (error) {
      notify(errorMessage(error, 'Could not create the group.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={mode !== null}
      onClose={onClose}
      title={mode === 'group' ? 'New group' : 'New chat'}
      description={
        mode === 'group'
          ? 'Choose who to add, then name the group.'
          : 'Message someone by @username or email.'
      }
    >
      {mode === 'chat' && (
        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => onSwitch('group')}
            className="flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-hover"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-primary text-white">
              <UserPlus size={20} strokeWidth={1.75} />
            </span>
            <span className="text-[15px]">New group</span>
          </button>
          <ContactPicker onPick={(person) => void startChat(person)} />
        </div>
      )}
      {mode === 'group' && (
        <div className="grid gap-4">
          {members.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Selected members">
              {members.map((member) => (
                <li
                  key={member.userId}
                  className="flex items-center gap-1.5 rounded-full bg-panel py-1 pl-1 pr-2 text-[13px]"
                >
                  <Avatar
                    name={member.displayName}
                    path={member.avatarPath}
                    size={22}
                  />
                  {member.displayName}
                  <button
                    type="button"
                    aria-label={`Remove ${member.displayName}`}
                    onClick={() => toggleMember(member)}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ContactPicker
            onPick={toggleMember}
            selectedIds={new Set(members.map((member) => member.userId))}
          />
          <div className="flex justify-center">
            <AvatarPicker
              name={name}
              size={80}
              previewFile={photo}
              onPick={setPhoto}
              onRemove={() => setPhoto(null)}
            />
          </div>
          <Input
            label="Group name"
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            loading={busy}
            disabled={members.length === 0 || name.trim().length === 0}
            onClick={() => void createGroup()}
          >
            Create group
          </Button>
        </div>
      )}
    </Modal>
  )
}
