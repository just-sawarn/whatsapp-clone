import { Outlet, useMatch, useNavigate, useParams } from 'react-router-dom'
import { CircleDashed } from 'lucide-react'
import { SplitLayout } from '../../components/layout/SplitLayout'
import { EmptyState } from '../../components/ui/EmptyState'
import { Skeleton } from '../../components/ui/Skeleton'
import { StatusList } from './StatusList'
import { StatusViewer } from './StatusViewer'
import { useStatuses } from './useStatuses'

export default function StatusLayout() {
  const userId = useMatch('/status/:userId')?.params.userId
  return (
    <SplitLayout
      list={<StatusList activeUserId={userId} />}
      detail={<Outlet />}
      hasDetail={userId !== undefined}
    />
  )
}

export function StatusWelcome() {
  return (
    <div className="grid h-full w-full place-items-center bg-panel">
      <EmptyState
        icon={CircleDashed}
        title="View a status update"
        description="Click a contact on the left to see their status. Updates disappear after 24 hours."
      />
    </div>
  )
}

/** Plays the selected person's updates, then moves on to the next person with unseen updates. */
export function StatusViewerRoute() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { data, isPending } = useStatuses()
  if (isPending)
    return (
      <div className="grid h-full place-items-center bg-black">
        <Skeleton className="h-8 w-40" />
      </div>
    )
  const queue = data
    ? [...(data.mine ? [data.mine] : []), ...data.recent, ...data.viewed]
    : []
  const at = queue.findIndex((group) => group.userId === userId)
  const group = queue[at]
  if (!group) {
    return (
      <div className="grid h-full place-items-center bg-panel">
        <EmptyState
          icon={CircleDashed}
          title="Status unavailable"
          description="It may have expired or been deleted."
        />
      </div>
    )
  }
  const following = queue[at + 1]
  return (
    <StatusViewer
      key={group.userId}
      group={group}
      onClose={() => navigate('/status')}
      onFinished={() =>
        navigate(following ? `/status/${following.userId}` : '/status')
      }
    />
  )
}
