import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Shield, UserMinus, UserPlus } from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { DropdownMenu } from '../../components/ui/Menu'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/ToastContext'
import { errorMessage } from '../../lib/errors'
import { keys } from '../../lib/queryKeys'
import { useCurrentUserId } from '../auth/useCurrentUser'
import {
  ContactPicker,
  type PickedPerson,
} from '../chat/components/ContactPicker'
import {
  addParticipants,
  removeParticipant,
  setParticipantRole,
} from '../chat/groupService'
import { useParticipants } from '../chat/useChatData'
import type { Community } from './communityService'

const COMMUNITY_LIMIT = 256

/** Members are the participants of the announcements group, so the existing group functions manage them. */
export function CommunityMembersModal({
  community,
  open,
  onClose,
}: {
  community: Community
  open: boolean
  onClose: () => void
}) {
  const userId = useCurrentUserId()
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const { data: participants = [] } = useParticipants(
    community.announcementChatId,
    open,
  )
  const [adding, setAdding] = useState(false)
  const isAdmin = community.myRole === 'admin'

  const run = async (task: () => Promise<void>, failure: string) => {
    try {
      await task()
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: keys.participants(community.announcementChatId),
        }),
        queryClient.invalidateQueries({ queryKey: keys.communities(userId) }),
        queryClient.invalidateQueries({
          queryKey: keys.communityGroups(community.id),
        }),
      ])
    } catch (error) {
      notify(errorMessage(error, failure), 'error')
    }
  }

  const addPerson = (person: PickedPerson) => {
    if (
      participants.some((participant) => participant.userId === person.userId)
    )
      return notify(`${person.displayName} is already a member.`, 'info')
    if (participants.length >= COMMUNITY_LIMIT)
      return notify(
        `A community can have at most ${COMMUNITY_LIMIT} members.`,
        'error',
      )
    void run(
      () => addParticipants(community.announcementChatId, [person.userId]),
      'Could not add that person.',
    )
    setAdding(false)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Community members"
      description={`${participants.length} ${participants.length === 1 ? 'member' : 'members'}`}
    >
      {adding ? (
        <div className="grid gap-3">
          <ContactPicker
            onPick={addPerson}
            selectedIds={
              new Set(participants.map((participant) => participant.userId))
            }
          />
          <Button variant="ghost" onClick={() => setAdding(false)}>
            Back to members
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {isAdmin && (
            <Button
              variant="secondary"
              icon={UserPlus}
              onClick={() => setAdding(true)}
              className="justify-self-start"
            >
              Add member
            </Button>
          )}
          <ul className="max-h-[50vh] overflow-y-auto">
            {participants.map((participant) => {
              const isMe = participant.userId === userId
              return (
                <li
                  key={participant.userId}
                  className="flex items-center gap-3 py-2"
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
                                      community.announcementChatId,
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
                                      community.announcementChatId,
                                      participant.userId,
                                      'admin',
                                    ),
                                  'Could not change the role.',
                                ),
                            },
                        {
                          label: 'Remove from community',
                          icon: UserMinus,
                          danger: true,
                          onSelect: () =>
                            void run(
                              () =>
                                removeParticipant(
                                  community.announcementChatId,
                                  participant.userId,
                                ),
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
          {isAdmin && (
            <p className="text-[12.5px] leading-relaxed text-muted">
              Removing someone also removes them from every group in this
              community.
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
