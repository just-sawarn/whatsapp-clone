import { useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { motion } from 'framer-motion'
import {
  Ban,
  ChevronDown,
  Forward,
  RotateCcw,
  Smile,
  Star,
  X,
} from 'lucide-react'
import { ContextMenu, type MenuItem } from '../../../components/ui/Menu'
import { Icon } from '../../../components/ui/Icon'
import { Ticks, type TickStatus } from '../../../components/ui/Ticks'
import { cn } from '../../../lib/cn'
import { formatClock } from '../../../lib/format'
import { canDeleteForEveryone } from '../messageService'
import { segmentText } from '../linkPreview'
import type { ChatMessage, ReactionRow } from '../types'
import { LinkPreviewCard } from './LinkPreviewCard'
import { MediaContent } from './MediaContent'
import { ReactionPicker } from './ReactionPicker'
import { ReactionPills } from './ReactionPills'
import { ReplyQuote } from './ReplyQuote'

export type BubbleActions = {
  onReply: (message: ChatMessage) => void
  onReact: (message: ChatMessage, emoji: string | null) => void
  onStar: (message: ChatMessage, starred: boolean) => void
  onForward: (message: ChatMessage) => void
  onDeleteForMe: (message: ChatMessage) => void
  onDeleteForEveryone: (message: ChatMessage) => void
  onRetry: (id: string) => void
  onDiscard: (id: string) => void
  onOpenImage: (message: ChatMessage, url: string) => void
  onJump: (id: string) => void
}

type Props = BubbleActions & {
  message: ChatMessage
  chatId: string
  me: string
  first: boolean
  senderName?: string
  names: ReadonlyMap<string, string>
  status: TickStatus
  starred: boolean
  reactions: ReactionRow[]
}

const LONG_PRESS_MS = 500

function TextBody({ text }: { text: string }) {
  return (
    <span className="whitespace-pre-wrap break-words">
      {segmentText(text).map((segment, index) =>
        segment.href ? (
          <a
            key={index}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-link underline-offset-2 hover:underline"
          >
            {segment.text}
          </a>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </span>
  )
}

export function MessageBubble(props: Props) {
  const {
    message,
    chatId,
    me,
    first,
    senderName,
    names,
    status,
    starred,
    reactions,
  } = props
  const mine = message.isMine
  const [menu, setMenu] = useState<{
    x: number
    y: number
    picker: boolean
  } | null>(null)
  const pressTimer = useRef<number | undefined>(undefined)
  const fresh =
    mine && Date.now() - new Date(message.createdAt).getTime() < 2500
  const tick: TickStatus =
    message.sendState === 'sending'
      ? 'sending'
      : message.sendState === 'failed'
        ? 'failed'
        : status
  const canInteract = !message.deleted && message.sendState === 'sent'
  const myReaction = reactions.find((reaction) => reaction.userId === me)?.emoji

  const items: MenuItem[] = [
    {
      label: 'Reply',
      onSelect: () => props.onReply(message),
      disabled: !canInteract || message.undecryptable,
    },
    {
      label: 'Forward',
      icon: Forward,
      onSelect: () => props.onForward(message),
      disabled: !canInteract || message.undecryptable,
    },
    {
      label: starred ? 'Unstar' : 'Star',
      icon: Star,
      onSelect: () => props.onStar(message, !starred),
      disabled: !canInteract,
    },
    {
      label: 'Copy',
      onSelect: () => void navigator.clipboard.writeText(message.text),
      disabled: !message.text || message.deleted,
    },
    {
      label: 'Delete for me',
      onSelect: () => props.onDeleteForMe(message),
      separatorBefore: true,
      danger: true,
    },
    ...(mine && !message.deleted
      ? [
          {
            label: 'Delete for everyone',
            onSelect: () => props.onDeleteForEveryone(message),
            danger: true,
            disabled: !canDeleteForEveryone(message),
          },
        ]
      : []),
  ]

  const openAt = (x: number, y: number, picker = false) =>
    canInteract && setMenu({ x, y, picker })
  const onContext = (event: MouseEvent) => {
    event.preventDefault()
    openAt(event.clientX, event.clientY)
  }
  const startPress = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') return
    const { clientX, clientY } = event
    pressTimer.current = window.setTimeout(
      () => openAt(clientX, clientY),
      LONG_PRESS_MS,
    )
  }
  const cancelPress = () => window.clearTimeout(pressTimer.current)

  return (
    <motion.div
      id={`msg-${message.id}`}
      initial={fresh ? { opacity: 0, scale: 0.88, y: 8 } : false}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 520, damping: 30 }}
      className={cn(
        'group flex flex-col',
        mine ? 'items-end' : 'items-start',
        first ? 'mt-2' : 'mt-0.5',
        reactions.length > 0 && 'mb-2',
      )}
    >
      <div
        className={cn(
          'flex max-w-[88%] items-center gap-1 md:max-w-[68%]',
          mine && 'flex-row-reverse',
        )}
      >
        <div
          onContextMenu={onContext}
          onPointerDown={startPress}
          onPointerUp={cancelPress}
          onPointerLeave={cancelPress}
          onPointerCancel={cancelPress}
          className={cn(
            'relative min-w-0 rounded-lg px-2.5 py-1.5 text-[14.5px] leading-[1.35] shadow-bubble',
            mine ? 'bg-bubble-out' : 'bg-bubble-in',
            first && (mine ? 'rounded-tr-none' : 'rounded-tl-none'),
            first && 'before:absolute before:top-0 before:h-3 before:w-2',
            first &&
              mine &&
              'before:-right-2 before:bg-bubble-out before:[clip-path:polygon(0_0,100%_0,0_100%)]',
            first &&
              !mine &&
              'before:-left-2 before:bg-bubble-in before:[clip-path:polygon(100%_0,0_0,100%_100%)]',
          )}
        >
          {canInteract && (
            <button
              type="button"
              aria-label="Message options"
              onClick={(event) => openAt(event.clientX, event.clientY)}
              className={cn(
                'absolute right-1 top-1 z-10 hidden rounded-full bg-gradient-to-l from-inherit to-transparent px-1 text-muted group-hover:block focus-visible:block',
                mine ? 'from-bubble-out' : 'from-bubble-in',
              )}
            >
              <Icon icon={ChevronDown} size={18} />
            </button>
          )}
          {first && !mine && senderName && (
            <strong className="mb-0.5 block text-[13px] font-medium text-link">
              {senderName}
            </strong>
          )}
          {message.isForwarded && !message.deleted && (
            <span className="mb-0.5 flex items-center gap-1 text-[12.5px] italic text-muted">
              <Icon icon={Forward} size={13} /> Forwarded
            </span>
          )}
          {message.replyToId && !message.deleted && (
            <ReplyQuote
              chatId={chatId}
              replyToId={message.replyToId}
              names={names}
              onJump={props.onJump}
            />
          )}
          {message.deleted ? (
            <span className="flex items-center gap-1.5 italic text-muted">
              <Icon icon={Ban} size={15} />{' '}
              {mine ? 'You deleted this message' : 'This message was deleted'}
            </span>
          ) : message.undecryptable ? (
            <span className="italic text-muted">
              This message cannot be decrypted on this device.
            </span>
          ) : (
            <>
              {message.linkPreview && (
                <LinkPreviewCard preview={message.linkPreview} />
              )}
              <MediaContent message={message} onOpenImage={props.onOpenImage} />
              {message.text && <TextBody text={message.text} />}
            </>
          )}
          <span className="float-right ml-3 mt-1.5 flex items-center gap-1 text-[11px] text-muted">
            {starred && <Icon icon={Star} size={11} className="fill-current" />}
            {formatClock(message.createdAt)}
            {mine && !message.deleted && <Ticks status={tick} />}
          </span>
        </div>
        {canInteract && (
          <button
            type="button"
            aria-label="React to message"
            onClick={(event) => openAt(event.clientX, event.clientY, true)}
            className="hidden shrink-0 rounded-full bg-surface p-1 text-muted shadow-bubble group-hover:block focus-visible:block"
          >
            <Icon icon={Smile} size={16} />
          </button>
        )}
      </div>
      {!message.deleted && (
        <ReactionPills
          reactions={reactions}
          me={me}
          onToggle={(emoji) => props.onReact(message, emoji)}
        />
      )}
      {message.sendState === 'failed' && (
        <div
          className="mt-1 flex items-center gap-3 text-xs text-danger"
          role="alert"
        >
          Message failed to send.
          <button
            type="button"
            onClick={() => props.onRetry(message.id)}
            className="flex items-center gap-1 font-medium underline"
          >
            <Icon icon={RotateCcw} size={12} /> Tap to retry
          </button>
          <button
            type="button"
            onClick={() => props.onDiscard(message.id)}
            aria-label="Discard message"
          >
            <Icon icon={X} size={13} />
          </button>
        </div>
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.picker ? [] : items}
          header={
            <ReactionPicker
              current={myReaction}
              onPick={(emoji) => {
                setMenu(null)
                props.onReact(message, emoji)
              }}
            />
          }
          onClose={() => setMenu(null)}
        />
      )}
    </motion.div>
  )
}
