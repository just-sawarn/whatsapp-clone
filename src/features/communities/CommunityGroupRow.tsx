import { MessageCircle, Trash2 } from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { DropdownMenu } from '../../components/ui/Menu'
import { buckets } from '../../lib/storageUrls'
import type { CommunityGroup } from './communityService'

type Props = {
  group: CommunityGroup
  isAdmin: boolean
  busy: boolean
  onOpen: () => void
  onJoin: () => void
  onRemove: () => void
}

export function CommunityGroupRow({
  group,
  isAdmin,
  busy,
  onOpen,
  onJoin,
  onRemove,
}: Props) {
  return (
    <li className="flex items-center gap-3 px-5 py-2.5">
      <Avatar
        name={group.name}
        path={group.avatarPath}
        bucket={buckets.chatAvatars}
        size={44}
      />
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-[15.5px] font-normal">
          {group.name}
        </strong>
        <span className="text-[13px] text-muted">
          {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
        </span>
      </span>
      {group.isMember ? (
        <Button
          variant="secondary"
          icon={MessageCircle}
          className="h-9 px-4 text-[13px]"
          onClick={onOpen}
        >
          Open
        </Button>
      ) : (
        <Button
          className="h-9 px-4 text-[13px]"
          loading={busy}
          onClick={onJoin}
        >
          Join
        </Button>
      )}
      {isAdmin && (
        <DropdownMenu
          label={`Manage ${group.name}`}
          items={[
            {
              label: 'Remove from community',
              icon: Trash2,
              danger: true,
              onSelect: onRemove,
            },
          ]}
        />
      )}
    </li>
  )
}
