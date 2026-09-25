import { useRef, type MouseEvent, type PointerEvent } from 'react'
import { BellOff, FileText, Image as ImageIcon, Mic, Pin } from 'lucide-react'
import { Avatar } from '../../../components/ui/Avatar'
import { Icon } from '../../../components/ui/Icon'
import { cn } from '../../../lib/cn'
import { formatChatTime } from '../../../lib/format'
import type { ChatSummary } from '../types'

type Props = {
  chat: ChatSummary
  selected: boolean
  online: boolean
  typing: boolean
  onSelect: () => void
  onContextMenu: (x: number, y: number) => void
}

const LONG_PRESS_MS = 500

function PreviewLine({ chat, typing }: { chat: ChatSummary; typing: boolean }) {
  if (typing) return <span className="text-accent">typing…</span>
  const last = chat.lastMessage
  if (!last) return <span>No messages yet</span>
  const glyph = last.deleted
    ? null
    : last.kind === 'image'
      ? ImageIcon
      : last.kind === 'audio'
        ? Mic
        : last.kind === 'file'
          ? FileText
          : null
  return (
    <span
      className={cn(
        'flex items-center gap-1 truncate',
        last.deleted && 'italic',
      )}
    >
      {last.isMine && <span>You:</span>}
      {glyph && <Icon icon={glyph} size={14} />}
      <span className="truncate">{last.text}</span>
    </span>
  )
}

export function ChatListItem({
  chat,
  selected,
  online,
  typing,
  onSelect,
  onContextMenu,
}: Props) {
  const pressTimer = useRef<number | undefined>(undefined)
  const unread = chat.unreadCount > 0
  const flagged = unread || chat.markedUnread

  const startPress = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') return
    const { clientX, clientY } = event
    pressTimer.current = window.setTimeout(
      () => onContextMenu(clientX, clientY),
      LONG_PRESS_MS,
    )
  }
  const cancelPress = () => window.clearTimeout(pressTimer.current)
  const handleContext = (event: MouseEvent) => {
    event.preventDefault()
    onContextMenu(event.clientX, event.clientY)
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      onContextMenu={handleContext}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none',
        selected && 'bg-panel',
      )}
    >
      <Avatar
        name={chat.name}
        path={chat.avatarPath}
        size={48}
        online={online && !chat.isGroup}
      />
      <span className="min-w-0 flex-1 border-b border-divider pb-3 pt-0.5">
        <span className="flex items-baseline justify-between gap-2">
          <strong
            className={cn(
              'truncate text-[16px] font-normal',
              flagged && 'font-medium',
            )}
          >
            {chat.name}
          </strong>
          {chat.lastMessage && (
            <time
              className={cn(
                'shrink-0 text-xs',
                flagged && !chat.isMuted ? 'text-accent' : 'text-muted',
              )}
            >
              {formatChatTime(chat.lastMessage.createdAt)}
            </time>
          )}
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2 text-[14px] text-muted">
          <PreviewLine chat={chat} typing={typing} />
          <span className="flex shrink-0 items-center gap-1.5">
            {chat.isMuted && <Icon icon={BellOff} size={15} />}
            {chat.isPinned && <Icon icon={Pin} size={15} />}
            {flagged && (
              <span
                aria-label={`${chat.unreadCount || 1} unread`}
                className={cn(
                  'min-w-5 rounded-full px-1.5 text-center text-xs font-semibold leading-5 text-white',
                  chat.isMuted ? 'bg-muted' : 'bg-accent',
                )}
              >
                {chat.unreadCount > 0 ? chat.unreadCount : ''}
              </span>
            )}
          </span>
        </span>
      </span>
    </button>
  )
}
