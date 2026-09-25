import { useQuery } from '@tanstack/react-query'
import { Avatar } from '../../components/ui/Avatar'
import { Modal } from '../../components/ui/Modal'
import { Spinner } from '../../components/ui/Spinner'
import { formatChatTime } from '../../lib/format'
import { loadViewers } from './statusService'

export function StatusViewersModal({
  statusId,
  onClose,
}: {
  statusId: string | null
  onClose: () => void
}) {
  const { data, isPending } = useQuery({
    queryKey: ['status-viewers', statusId],
    queryFn: () => loadViewers(statusId ?? ''),
    enabled: statusId !== null,
  })
  return (
    <Modal
      open={statusId !== null}
      onClose={onClose}
      title="Viewed by"
      description={
        data
          ? `${data.length} ${data.length === 1 ? 'person' : 'people'}`
          : undefined
      }
    >
      {isPending ? (
        <p className="flex justify-center py-6">
          <Spinner />
        </p>
      ) : data && data.length > 0 ? (
        <ul className="grid gap-2">
          {data.map((viewer) => (
            <li key={viewer.userId} className="flex items-center gap-3">
              <Avatar
                name={viewer.displayName}
                path={viewer.avatarPath}
                size={40}
              />
              <span className="min-w-0 flex-1 truncate text-[15px]">
                {viewer.displayName}
              </span>
              <time className="text-xs text-muted">
                {formatChatTime(viewer.viewedAt)}
              </time>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-muted">No views yet.</p>
      )}
    </Modal>
  )
}
