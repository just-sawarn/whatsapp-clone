import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  LogOut,
  Megaphone,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { Icon } from '../../components/ui/Icon'
import { IconButton } from '../../components/ui/IconButton'
import { DropdownMenu } from '../../components/ui/Menu'
import { ChatListSkeleton } from '../../components/ui/Skeleton'
import { errorMessage } from '../../lib/errors'
import { useChat } from '../chat/useChats'
import { AddGroupModal } from './AddGroupModal'
import { CommunityGroupRow } from './CommunityGroupRow'
import { CommunityMembersModal } from './CommunityMembersModal'
import { CommunityPhoto } from './CommunityPhoto'
import { EditCommunityModal } from './EditCommunityModal'
import { InviteModal } from './InviteModal'
import type { CommunityGroup } from './communityService'
import { useCommunity, useCommunityGroups } from './useCommunities'
import { useCommunityActions } from './useCommunityActions'

type Dialog = 'edit' | 'invite' | 'members' | 'leave' | 'deactivate' | null

export function CommunityDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const actions = useCommunityActions()
  const { community, isPending } = useCommunity(id)
  const {
    data: groups,
    isPending: groupsPending,
    error: groupsError,
  } = useCommunityGroups(id)
  const announcements = useChat(community?.announcementChatId)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [adding, setAdding] = useState<'existing' | 'new' | null>(null)
  const [joining, setJoining] = useState<string | null>(null)
  const [removing, setRemoving] = useState<CommunityGroup | null>(null)

  if (isPending)
    return (
      <div className="p-6">
        <ChatListSkeleton rows={3} />
      </div>
    )
  if (!community) {
    return (
      <div className="grid h-full w-full place-items-center bg-panel">
        <EmptyState
          icon={Users}
          title="Community not found"
          description="It may have been deactivated, or you are no longer a member."
          action={
            <Button onClick={() => navigate('/communities')}>
              Back to communities
            </Button>
          }
        />
      </div>
    )
  }

  const isAdmin = community.myRole === 'admin'
  const unread = announcements?.unreadCount ?? 0
  const preview = announcements?.lastMessage

  const join = async (group: CommunityGroup) => {
    setJoining(group.chatId)
    if (await actions.joinGroup(community.id, group.chatId))
      navigate(`/chat/${group.chatId}`)
    setJoining(null)
  }

  return (
    <div className="flex h-full w-full flex-col bg-panel">
      <header className="flex h-[60px] shrink-0 items-center gap-2 border-b border-divider bg-panel px-3 md:px-6">
        <IconButton
          icon={ArrowLeft}
          label="Back to communities"
          onClick={() => navigate('/communities')}
          className="md:hidden"
        />
        <h1 className="min-w-0 flex-1 truncate text-lg font-medium">
          {community.name}
        </h1>
        <DropdownMenu
          label="Community options"
          items={[
            {
              label: 'Members',
              icon: Users,
              onSelect: () => setDialog('members'),
            },
            ...(isAdmin
              ? [
                  {
                    label: 'Invite link',
                    icon: UserPlus,
                    onSelect: () => setDialog('invite'),
                  },
                  {
                    label: 'Edit community',
                    icon: Pencil,
                    onSelect: () => setDialog('edit'),
                  },
                ]
              : []),
            {
              label: 'Leave community',
              icon: LogOut,
              onSelect: () => setDialog('leave'),
              separatorBefore: true,
            },
            ...(isAdmin
              ? [
                  {
                    label: 'Deactivate community',
                    icon: Trash2,
                    danger: true,
                    onSelect: () => setDialog('deactivate'),
                  },
                ]
              : []),
          ]}
        />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-2xl gap-4 p-4 md:p-8">
          <section className="grid justify-items-center gap-2 rounded-xl bg-surface p-6 text-center shadow-bubble">
            <CommunityPhoto community={community} />
            <h2 className="mt-1 text-[22px] font-medium">{community.name}</h2>
            <p className="text-[13.5px] text-muted">
              Community · {community.groupCount}{' '}
              {community.groupCount === 1 ? 'group' : 'groups'} ·{' '}
              <button
                type="button"
                onClick={() => setDialog('members')}
                className="text-link hover:underline"
              >
                {community.memberCount}{' '}
                {community.memberCount === 1 ? 'member' : 'members'}
              </button>
            </p>
            {community.description && (
              <p className="mt-1 max-w-md whitespace-pre-wrap text-[14.5px] leading-relaxed">
                {community.description}
              </p>
            )}
            {isAdmin && (
              <Button
                variant="secondary"
                icon={UserPlus}
                className="mt-2"
                onClick={() => setDialog('invite')}
              >
                Invite people
              </Button>
            )}
          </section>

          <button
            type="button"
            onClick={() => navigate(`/chat/${community.announcementChatId}`)}
            className="flex items-center gap-3 rounded-xl bg-surface p-4 text-left shadow-bubble hover:bg-surface-hover"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-white">
              <Icon icon={Megaphone} size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block text-[16px] font-medium">
                Announcements
              </strong>
              <span className="block truncate text-[13.5px] text-muted">
                {preview
                  ? preview.text
                  : isAdmin
                    ? 'Post the first announcement.'
                    : 'No announcements yet.'}
              </span>
            </span>
            {unread > 0 && (
              <span
                aria-label={`${unread} unread`}
                className="min-w-5 rounded-full bg-accent px-1.5 text-center text-xs font-semibold leading-5 text-white"
              >
                {unread}
              </span>
            )}
          </button>

          <section
            className="overflow-hidden rounded-xl bg-surface shadow-bubble"
            aria-label="Groups"
          >
            <div className="flex items-center justify-between px-5 pb-1 pt-4">
              <h3 className="text-sm text-muted">Groups you can join</h3>
              {isAdmin && (
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    icon={Plus}
                    className="h-8 px-3 text-[13px]"
                    onClick={() => setAdding('new')}
                  >
                    New group
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-8 px-3 text-[13px]"
                    onClick={() => setAdding('existing')}
                  >
                    Add existing
                  </Button>
                </div>
              )}
            </div>
            {groupsPending ? (
              <ChatListSkeleton rows={2} />
            ) : groupsError ? (
              <p role="alert" className="px-5 py-4 text-sm text-danger">
                {errorMessage(groupsError)}
              </p>
            ) : groups.length === 0 ? (
              <p className="px-5 py-6 text-center text-[13.5px] leading-relaxed text-muted">
                {isAdmin
                  ? 'No groups yet. Create one, or add a group you already administer.'
                  : 'No groups have been added yet.'}
              </p>
            ) : (
              <ul>
                {groups.map((group) => (
                  <CommunityGroupRow
                    key={group.chatId}
                    group={group}
                    isAdmin={isAdmin}
                    busy={joining === group.chatId}
                    onOpen={() => navigate(`/chat/${group.chatId}`)}
                    onJoin={() => void join(group)}
                    onRemove={() => setRemoving(group)}
                  />
                ))}
              </ul>
            )}
          </section>
          <p className="px-2 text-center text-[12.5px] leading-relaxed text-muted">
            Messages in every group here are end-to-end encrypted. Joining the
            community gives you the announcements; each group is joined
            separately.
          </p>
        </div>
      </div>

      <CommunityMembersModal
        community={community}
        open={dialog === 'members'}
        onClose={() => setDialog(null)}
      />
      <InviteModal
        community={community}
        open={dialog === 'invite'}
        onClose={() => setDialog(null)}
      />
      <EditCommunityModal
        community={community}
        open={dialog === 'edit'}
        onClose={() => setDialog(null)}
      />
      <AddGroupModal
        community={community}
        open={adding !== null}
        initialTab={adding ?? 'existing'}
        onClose={() => setAdding(null)}
      />
      <ConfirmDialog
        open={dialog === 'leave'}
        onClose={() => setDialog(null)}
        title={`Leave ${community.name}?`}
        description="You will stop receiving announcements and be removed from all of this community's groups. You can rejoin later with an invite link."
        confirmLabel="Leave community"
        danger
        onConfirm={() => actions.leave(community)}
      />
      <ConfirmDialog
        open={dialog === 'deactivate'}
        onClose={() => setDialog(null)}
        title={`Deactivate ${community.name}?`}
        description="The community and its announcements history will be deleted for everyone. Its groups stay as ordinary groups with their members and messages."
        confirmLabel="Deactivate"
        danger
        onConfirm={() => actions.deactivate(community)}
      />
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? 'group'}?`}
        description="The group is unlinked from the community but keeps its members and messages."
        confirmLabel="Remove group"
        danger
        onConfirm={() =>
          removing
            ? actions.removeGroup(community.id, removing.chatId)
            : undefined
        }
      />
    </div>
  )
}
