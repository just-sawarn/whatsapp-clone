import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircleDashed, Plus } from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'
import { DropdownMenu } from '../../components/ui/Menu'
import { EmptyState } from '../../components/ui/EmptyState'
import { Icon } from '../../components/ui/Icon'
import { ChatListSkeleton } from '../../components/ui/Skeleton'
import { StatusRing } from '../../components/ui/StatusRing'
import { cn } from '../../lib/cn'
import { errorMessage } from '../../lib/errors'
import { formatChatTime } from '../../lib/format'
import { useMyProfile } from '../profile/useProfile'
import { StatusComposer } from './StatusComposer'
import type { StatusGroup } from './statusGrouping'
import { useStatuses } from './useStatuses'

function Row({
  group,
  active,
  onOpen,
}: {
  group: StatusGroup
  active: boolean
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-hover',
        active && 'bg-panel',
      )}
    >
      <StatusRing
        segments={group.items.length}
        viewed={group.viewedCount}
        size={54}
      >
        <Avatar name={group.displayName} path={group.avatarPath} size={46} />
      </StatusRing>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-[16px] font-normal">
          {group.isMine ? 'My status' : group.displayName}
        </strong>
        <span className="block text-[13px] text-muted">
          {group.items.length} {group.items.length === 1 ? 'update' : 'updates'}{' '}
          · {formatChatTime(group.latestAt)}
        </span>
      </span>
    </button>
  )
}

export function StatusList({
  activeUserId,
}: {
  activeUserId: string | undefined
}) {
  const navigate = useNavigate()
  const { data, isPending, error } = useStatuses()
  const { data: profile } = useMyProfile()
  const [composer, setComposer] = useState<'text' | 'photo' | null>(null)
  const nobody =
    data && !data.mine && data.recent.length === 0 && data.viewed.length === 0

  return (
    <>
      <header className="flex h-[60px] shrink-0 items-center justify-between bg-panel px-4">
        <h1 className="text-[22px] font-semibold">Status</h1>
        <DropdownMenu
          label="Add status"
          icon={Plus}
          items={[
            { label: 'Text status', onSelect: () => setComposer('text') },
            { label: 'Photo status', onSelect: () => setComposer('photo') },
          ]}
        />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isPending ? (
          <ChatListSkeleton rows={5} />
        ) : error ? (
          <p role="alert" className="p-6 text-center text-sm text-danger">
            {errorMessage(error)}
          </p>
        ) : (
          <>
            {data.mine ? (
              <Row
                group={data.mine}
                active={activeUserId === data.mine.userId}
                onOpen={() => navigate(`/status/${data.mine?.userId}`)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setComposer('text')}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover"
              >
                <span className="relative">
                  <Avatar
                    name={profile?.display_name ?? 'You'}
                    path={profile?.avatar_url}
                    size={50}
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-accent text-white">
                    <Icon icon={Plus} size={14} />
                  </span>
                </span>
                <span>
                  <strong className="block text-[16px] font-normal">
                    My status
                  </strong>
                  <span className="text-[13px] text-muted">
                    Tap to add a status update
                  </span>
                </span>
              </button>
            )}
            {data.recent.length > 0 && (
              <h2 className="px-4 pb-1 pt-4 text-[13px] font-medium uppercase tracking-wide text-link">
                Recent updates
              </h2>
            )}
            {data.recent.map((group) => (
              <Row
                key={group.userId}
                group={group}
                active={activeUserId === group.userId}
                onOpen={() => navigate(`/status/${group.userId}`)}
              />
            ))}
            {data.viewed.length > 0 && (
              <h2 className="px-4 pb-1 pt-4 text-[13px] font-medium uppercase tracking-wide text-muted">
                Viewed updates
              </h2>
            )}
            {data.viewed.map((group) => (
              <Row
                key={group.userId}
                group={group}
                active={activeUserId === group.userId}
                onOpen={() => navigate(`/status/${group.userId}`)}
              />
            ))}
            {nobody && (
              <EmptyState
                icon={CircleDashed}
                title="No status updates yet"
                description="When your contacts share a status, it appears here for 24 hours. Both of you need to have each other saved as contacts."
              />
            )}
          </>
        )}
      </div>
      <StatusComposer
        open={composer !== null}
        initialMode={composer ?? 'text'}
        onClose={() => setComposer(null)}
      />
    </>
  )
}
