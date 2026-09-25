import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link2, Plus, Search, Users, X } from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Icon } from '../../components/ui/Icon'
import { IconButton } from '../../components/ui/IconButton'
import { ChatListSkeleton } from '../../components/ui/Skeleton'
import { buckets } from '../../lib/storageUrls'
import { cn } from '../../lib/cn'
import { errorMessage } from '../../lib/errors'
import { CreateCommunityModal } from './CreateCommunityModal'
import { JoinByLinkModal } from './JoinByLinkModal'
import { useCommunities } from './useCommunities'

const plural = (count: number, one: string) =>
  `${count} ${count === 1 ? one : `${one}s`}`

export function CommunityList({ activeId }: { activeId: string | undefined }) {
  const navigate = useNavigate()
  const { data: communities = [], isPending, error, refetch } = useCommunities()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const shown = useMemo(
    () =>
      communities.filter((community) =>
        community.name.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    [communities, search],
  )

  return (
    <>
      <header className="flex h-[60px] shrink-0 items-center justify-between bg-panel px-4">
        <h1 className="text-[22px] font-semibold">Communities</h1>
        <div className="flex items-center gap-1">
          <IconButton
            icon={Link2}
            label="Join with a link"
            onClick={() => setJoining(true)}
          />
          <IconButton
            icon={Plus}
            label="New community"
            onClick={() => setCreating(true)}
          />
        </div>
      </header>
      {communities.length > 3 && (
        <div className="px-3 pt-2">
          <label className="flex h-9 items-center gap-3 rounded-lg bg-panel px-3 text-muted focus-within:ring-2 focus-within:ring-primary/30">
            <Icon icon={Search} size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search communities"
              aria-label="Search communities"
              className="w-full bg-transparent text-[14px] text-text outline-none placeholder:text-muted"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch('')}
              >
                <Icon icon={X} size={16} />
              </button>
            )}
          </label>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isPending ? (
          <ChatListSkeleton rows={4} />
        ) : error ? (
          <EmptyState
            icon={Users}
            title="Could not load communities"
            description={errorMessage(error)}
            action={<Button onClick={() => void refetch()}>Try again</Button>}
          />
        ) : communities.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Bring your groups together"
            description="Communities organise related groups under one roof, with an announcements group only admins can post in."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button icon={Plus} onClick={() => setCreating(true)}>
                  New community
                </Button>
                <Button
                  variant="secondary"
                  icon={Link2}
                  onClick={() => setJoining(true)}
                >
                  Join with a link
                </Button>
              </div>
            }
          />
        ) : shown.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted">
            No communities match &ldquo;{search.trim()}&rdquo;.
          </p>
        ) : (
          <ul>
            {shown.map((community) => (
              <li key={community.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/communities/${community.id}`)}
                  aria-current={activeId === community.id ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover',
                    activeId === community.id && 'bg-panel',
                  )}
                >
                  <Avatar
                    name={community.name}
                    path={community.avatarPath}
                    bucket={buckets.chatAvatars}
                    shape="square"
                    size={52}
                  />
                  <span className="min-w-0 flex-1 border-b border-divider pb-3 pt-0.5">
                    <strong className="block truncate text-[16px] font-normal">
                      {community.name}
                    </strong>
                    <span className="mt-0.5 flex items-center gap-2 text-[13.5px] text-muted">
                      <span className="truncate">
                        {plural(community.groupCount, 'group')} ·{' '}
                        {plural(community.memberCount, 'member')}
                      </span>
                      {community.myRole === 'admin' && (
                        <span className="shrink-0 rounded border border-primary/40 px-1.5 text-[11px] text-link">
                          Admin
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <CreateCommunityModal
        open={creating}
        onClose={() => setCreating(false)}
      />
      <JoinByLinkModal open={joining} onClose={() => setJoining(false)} />
    </>
  )
}
