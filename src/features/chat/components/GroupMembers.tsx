import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { LogOut, UserMinus, UserPlus, Shield } from 'lucide-react'
import { Avatar } from '../../../components/ui/Avatar'
import { Button } from '../../../components/ui/Button'
import { DropdownMenu } from '../../../components/ui/Menu'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { useToast } from '../../../components/ui/ToastContext'
import { errorMessage } from '../../../lib/errors'
import { keys } from '../../../lib/queryKeys'
import { useCurrentUserId } from '../../auth/useCurrentUser'
import {
  addParticipants,
  removeParticipant,
  renameGroup,
  setParticipantRole,
} from '../groupService'
import { useChatActions } from '../useChatActions'
import { useParticipants } from '../useChatData'
import type { ChatSummary } from '../types'
import { ContactPicker, type PickedPerson } from './ContactPicker'

const GROUP_LIMIT = 256

export function GroupMembers({ chat }: { chat: ChatSummary }) {
  const userId = useCurrentUserId()
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const actions = useChatActions()
  const { data: participants = [] } = useParticipants(chat.id)
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(chat.name)
  const me = participants.find((participant) => participant.userId === userId)
  const isAdmin = me?.role === 'admin'

  const run = async (task: () => Promise<void>, failure: string) => {
    try {
      await task()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.participants(chat.id) }),
        queryClient.invalidateQueries({ queryKey: keys.chats(userId) }),
      ])
    } catch (error) {
      notify(errorMessage(error, failure), 'error')
    }
  }

  const addPerson = (person: PickedPerson) => {
    if (
      participants.some((participant) => participant.userId === person.userId)
    )
      return notify(`${person.displayName} is already in the group.`, 'info')
    if (participants.length >= GROUP_LIMIT)
      return notify(`A group can have at most ${GROUP_LIMIT} members.`, 'error')
    void run(
      () => addParticipants(chat.id, [person.userId]),
      'Could not add that person.',
    )
    setAdding(false)
  }

  return (
    <section aria-label="Group members" className="border-t border-divider">
      <div className="flex items-center justify-between px-5 pb-1 pt-4">
        <h3 className="text-sm text-muted">
          {participants.length} participants
        </h3>
        {isAdmin && (
          <Button
            variant="ghost"
            icon={UserPlus}
            className="h-8 px-3 text-[13px]"
            onClick={() => setAdding(true)}
          >
            Add
          </Button>
        )}
      </div>
      <ul>
        {participants.map((participant) => {
          const isMe = participant.userId === userId
          return (
            <li
              key={participant.userId}
              className="flex items-center gap-3 px-5 py-2"
            >
              <Avatar
                name={participant.displayName}
                path={participant.avatarPath}
                size={40}
              />
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-[15px] font-normal">
                  {isMe ? 'You' : participant.displayName}
                </strong>
                <span className="block truncate text-[13px] text-muted">
                  @{participant.username}
                </span>
              </span>
              {participant.role === 'admin' && (
                <span className="rounded border border-primary/40 px-1.5 text-[11px] text-link">
                  Admin
                </span>
              )}
              {isAdmin && !isMe && (
                <DropdownMenu
                  label={`Manage ${participant.displayName}`}
                  items={[
                    participant.role === 'admin'
                      ? {
                          label: 'Dismiss as admin',
                          icon: Shield,
                          onSelect: () =>
                            void run(
                              () =>
                                setParticipantRole(
                                  chat.id,
                                  participant.userId,
                                  'member',
                                ),
                              'Could not change the role.',
                            ),
                        }
                      : {
                          label: 'Make admin',
                          icon: Shield,
                          onSelect: () =>
                            void run(
                              () =>
                                setParticipantRole(
                                  chat.id,
                                  participant.userId,
                                  'admin',
                                ),
                              'Could not change the role.',
                            ),
                        },
                    {
                      label: 'Remove from group',
                      icon: UserMinus,
                      danger: true,
                      onSelect: () =>
                        void run(
                          () => removeParticipant(chat.id, participant.userId),
                          'Could not remove that person.',
                        ),
                    },
                  ]}
                />
              )}
            </li>
          )
        })}
      </ul>
      <div className="grid gap-1 border-t border-divider p-2">
        {isAdmin && (
          <Button
            variant="ghost"
            className="justify-start"
            onClick={() => {
              setName(chat.name)
              setRenaming(true)
            }}
          >
            Rename group
          </Button>
        )}
        <Button
          variant="ghost"
          icon={LogOut}
          className="justify-start text-danger"
          onClick={() => void actions.deleteChat(chat)}
        >
          Exit group
        </Button>
      </div>
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add member"
        description="Only people you add can read messages sent after they join."
      >
        <ContactPicker
          onPick={addPerson}
          selectedIds={
            new Set(participants.map((participant) => participant.userId))
          }
        />
      </Modal>
      <Modal
        open={renaming}
        onClose={() => setRenaming(false)}
        title="Rename group"
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void run(
              () => renameGroup(chat.id, name),
              'Could not rename the group.',
            )
            setRenaming(false)
          }}
        >
          <Input
            label="Group name"
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <Button type="submit" disabled={name.trim().length === 0}>
            Save
          </Button>
        </form>
      </Modal>
    </section>
  )
}
