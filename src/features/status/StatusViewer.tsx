import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Eye, Trash2, X } from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'
import { Icon } from '../../components/ui/Icon'
import { IconButton } from '../../components/ui/IconButton'
import { useToast } from '../../components/ui/ToastContext'
import { errorMessage } from '../../lib/errors'
import { formatClock } from '../../lib/format'
import { keys } from '../../lib/queryKeys'
import { buckets, useSignedUrl } from '../../lib/storageUrls'
import { useCurrentUserId } from '../auth/useCurrentUser'
import {
  firstUnviewedIndex,
  type StatusGroup,
  type StatusItem,
} from './statusGrouping'
import { deleteStatus, markStatusViewed } from './statusService'
import { StatusViewersModal } from './StatusViewersModal'

const DURATION_MS = 5500
const TICK_MS = 50

function Content({ item }: { item: StatusItem }) {
  const { data: url } = useSignedUrl(buckets.statusMedia, item.mediaPath)
  if (item.mediaPath) {
    return (
      <div className="grid h-full w-full place-items-center">
        {url && (
          <img
            src={url}
            alt={item.caption ?? 'Status photo'}
            className="max-h-full max-w-full object-contain"
          />
        )}
        {item.caption && (
          <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-6 pb-8 pt-12 text-center text-[16px] text-white">
            {item.caption}
          </p>
        )}
      </div>
    )
  }
  return (
    <div
      className="grid h-full w-full place-items-center px-8"
      style={{ backgroundColor: item.bgColor ?? '#128C7E' }}
    >
      <p className="max-w-lg whitespace-pre-wrap break-words text-center text-[26px] leading-snug text-white">
        {item.caption}
      </p>
    </div>
  )
}

type Props = { group: StatusGroup; onClose: () => void; onFinished: () => void }

/** Story player: one progress bar per update, hold to pause, tap left/right or use arrow keys. */
export function StatusViewer({ group, onClose, onFinished }: Props) {
  const userId = useCurrentUserId()
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const [index, setIndex] = useState(() =>
    group.isMine ? 0 : firstUnviewedIndex(group),
  )
  const [progress, setProgress] = useState(0)
  const [held, setHeld] = useState(false)
  const [viewersFor, setViewersFor] = useState<string | null>(null)
  const marked = useRef(new Set<string>())
  const item = group.items[Math.min(index, group.items.length - 1)]
  const paused = held || viewersFor !== null

  const next = useCallback(() => {
    setProgress(0)
    setIndex((current) => {
      if (current + 1 >= group.items.length) {
        window.setTimeout(onFinished, 0)
        return current
      }
      return current + 1
    })
  }, [group.items.length, onFinished])

  const previous = useCallback(() => {
    setProgress(0)
    setIndex((current) => Math.max(0, current - 1))
  }, [])

  useEffect(() => {
    if (paused || !item) return
    const timer = window.setInterval(
      () => setProgress((value) => value + TICK_MS / DURATION_MS),
      TICK_MS,
    )
    return () => window.clearInterval(timer)
  }, [item, paused])

  useEffect(() => {
    if (progress >= 1) next()
  }, [next, progress])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') next()
      else if (event.key === 'ArrowLeft') previous()
      else if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [next, onClose, previous])

  useEffect(() => {
    if (!item || group.isMine || item.viewed || marked.current.has(item.id))
      return
    marked.current.add(item.id)
    void markStatusViewed(item.id, userId)
      .then(() =>
        queryClient.invalidateQueries({ queryKey: keys.statuses(userId) }),
      )
      .catch(() => undefined)
  }, [group.isMine, item, queryClient, userId])

  if (!item) return null

  const remove = async () => {
    try {
      await deleteStatus(item)
      await queryClient.invalidateQueries({ queryKey: keys.statuses(userId) })
      if (group.items.length <= 1) onClose()
      else setIndex((current) => Math.max(0, current - 1))
    } catch (error) {
      notify(errorMessage(error, 'Could not delete that status.'), 'error')
    }
  }

  return (
    <div
      className="absolute inset-0 z-10 flex flex-col bg-black text-white"
      role="dialog"
      aria-label={`${group.displayName}'s status`}
    >
      <div className="absolute inset-x-0 top-0 z-20 grid gap-3 bg-gradient-to-b from-black/60 to-transparent px-3 pb-6 pt-3">
        <div className="flex gap-1" aria-hidden="true">
          {group.items.map((entry, position) => (
            <span
              key={entry.id}
              className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30"
            >
              <span
                className="block h-full bg-white"
                style={{
                  width: `${position < index ? 100 : position === index ? Math.min(progress, 1) * 100 : 0}%`,
                }}
              />
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Avatar name={group.displayName} path={group.avatarPath} size={38} />
          <div className="min-w-0 flex-1 leading-tight">
            <strong className="block truncate text-[15px] font-medium">
              {group.isMine ? 'My status' : group.displayName}
            </strong>
            <time className="text-xs text-white/75">
              {formatClock(item.createdAt)}
            </time>
          </div>
          {group.isMine && (
            <IconButton
              icon={Trash2}
              label="Delete this status"
              onClick={() => void remove()}
              className="!text-white hover:!bg-white/15"
            />
          )}
          <IconButton
            icon={X}
            label="Close status"
            onClick={onClose}
            className="!text-white hover:!bg-white/15"
          />
        </div>
      </div>
      <div
        className="relative min-h-0 flex-1"
        onPointerDown={() => setHeld(true)}
        onPointerUp={() => setHeld(false)}
        onPointerLeave={() => setHeld(false)}
      >
        <Content item={item} />
        <button
          type="button"
          aria-label="Previous update"
          onClick={previous}
          className="absolute inset-y-16 left-0 w-1/3 cursor-w-resize"
        />
        <button
          type="button"
          aria-label="Next update"
          onClick={next}
          className="absolute inset-y-16 right-0 w-2/3 cursor-e-resize"
        />
      </div>
      {group.isMine && (
        <button
          type="button"
          onClick={() => setViewersFor(item.id)}
          className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-center gap-2 bg-gradient-to-t from-black/70 to-transparent py-4 text-[14px]"
        >
          <Icon icon={Eye} size={18} /> Viewed by
        </button>
      )}
      <StatusViewersModal
        statusId={viewersFor}
        onClose={() => setViewersFor(null)}
      />
    </div>
  )
}
