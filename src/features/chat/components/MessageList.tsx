import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDown, Lock } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import { MessageListSkeleton } from '../../../components/ui/Skeleton'
import { cn } from '../../../lib/cn'
import { wallpapers } from '../../../design/tokens'
import { formatDayLabel, sameDay } from '../../../lib/format'
import { usePreferences } from '../../preferences/PreferencesContext'
import type { TickStatus } from '../../../components/ui/Ticks'
import type { ChatMessage, ReactionRow } from '../types'
import { MessageBubble, type BubbleActions } from './MessageBubble'

type Props = {
  messages: ChatMessage[]
  loading: boolean
  hasMore: boolean
  loadingOlder: boolean
  onLoadOlder: () => void
  names: ReadonlyMap<string, string>
  statuses: Record<string, TickStatus>
  isGroup: boolean
  chatId: string
  me: string
  starred: ReadonlySet<string>
  reactions: Record<string, ReactionRow[]>
  actions: Omit<BubbleActions, 'onJump'>
}

const NEAR_BOTTOM_PX = 140
const GROUP_GAP_MS = 5 * 60 * 1000

export function MessageList({
  messages,
  loading,
  hasMore,
  loadingOlder,
  onLoadOlder,
  names,
  statuses,
  isGroup,
  chatId,
  me,
  starred,
  reactions,
  actions,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const previous = useRef({ count: 0, lastId: '', height: 0, chatStart: '' })
  const [showJump, setShowJump] = useState(false)
  const { wallpaper, resolvedDark } = usePreferences()
  const paper =
    wallpapers.find((item) => item.id === wallpaper) ?? wallpapers[0]
  const dotColour = resolvedDark
    ? 'rgb(255 255 255 / 0.035)'
    : 'rgb(0 0 0 / 0.045)'
  const [params, setParams] = useSearchParams()
  const target = params.get('m')

  const scrollToBottom = (smooth: boolean) => {
    const element = scroller.current
    if (element)
      element.scrollTo({
        top: element.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      })
  }

  // Stick to the bottom for my own messages or when already near it; keep position when older pages arrive.
  useLayoutEffect(() => {
    const element = scroller.current
    if (!element) return
    const last = messages.at(-1)
    const seen = previous.current
    const prependedOlder =
      messages[0]?.id !== seen.chatStart &&
      seen.count > 0 &&
      last?.id === seen.lastId
    if (seen.count === 0) scrollToBottom(false)
    else if (prependedOlder)
      element.scrollTop += element.scrollHeight - seen.height
    else if (last && last.id !== seen.lastId) {
      const nearBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight <
        NEAR_BOTTOM_PX
      if (last.isMine || nearBottom) scrollToBottom(true)
      else setShowJump(true)
    }
    previous.current = {
      count: messages.length,
      lastId: last?.id ?? '',
      height: element.scrollHeight,
      chatStart: messages[0]?.id ?? '',
    }
  }, [messages])

  useEffect(() => {
    if (!target) return
    const element = document.getElementById(`msg-${target}`)
    if (!element) return
    element.scrollIntoView({ block: 'center', behavior: 'smooth' })
    element.classList.add('ring-2', 'ring-accent', 'rounded-lg')
    const timer = window.setTimeout(() => {
      element.classList.remove('ring-2', 'ring-accent', 'rounded-lg')
      setParams(
        (current) => {
          current.delete('m')
          return current
        },
        { replace: true },
      )
    }, 2200)
    return () => window.clearTimeout(timer)
  }, [messages, setParams, target])

  const jumpTo = (id: string) =>
    setParams(
      (current) => {
        current.set('m', id)
        return current
      },
      { replace: true },
    )

  const onScroll = () => {
    const element = scroller.current
    if (!element) return
    if (
      element.scrollHeight - element.scrollTop - element.clientHeight <
      NEAR_BOTTOM_PX
    )
      setShowJump(false)
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="h-full overflow-y-auto px-[4%] py-4 md:px-[7%]"
        style={{
          backgroundColor: resolvedDark ? paper.dark : paper.light,
          backgroundImage:
            wallpaper === 'plain'
              ? undefined
              : `radial-gradient(${dotColour} 1.5px, transparent 1.5px)`,
          backgroundSize: '22px 22px',
        }}
        aria-label="Messages"
        role="log"
        aria-live="polite"
      >
        <div className="mx-auto mb-4 flex max-w-lg items-center justify-center gap-2 rounded-lg bg-warning px-4 py-2 text-center text-[12.5px] text-muted">
          <Icon icon={Lock} size={13} className="shrink-0" />
          Messages are end-to-end encrypted. No one outside this chat, not even
          the server, can read them.
        </div>
        {loading ? (
          <MessageListSkeleton />
        ) : (
          <>
            {hasMore && (
              <div className="mb-3 flex justify-center">
                <Button
                  variant="secondary"
                  loading={loadingOlder}
                  onClick={onLoadOlder}
                  className="h-8 px-4 text-[13px]"
                >
                  Load earlier messages
                </Button>
              </div>
            )}
            {messages.map((message, index) => {
              const before = messages[index - 1]
              const newDay =
                !before ||
                !sameDay(
                  new Date(before.createdAt),
                  new Date(message.createdAt),
                )
              const first =
                newDay ||
                before.senderId !== message.senderId ||
                new Date(message.createdAt).getTime() -
                  new Date(before.createdAt).getTime() >
                  GROUP_GAP_MS
              return (
                <Fragment key={message.id}>
                  {newDay && (
                    <div className="my-3 flex justify-center">
                      <span className="rounded-lg bg-surface px-3 py-1 text-[12.5px] text-muted shadow-bubble">
                        {formatDayLabel(message.createdAt)}
                      </span>
                    </div>
                  )}
                  <MessageBubble
                    {...actions}
                    onJump={jumpTo}
                    message={message}
                    chatId={chatId}
                    me={me}
                    first={first}
                    names={names}
                    senderName={
                      isGroup
                        ? (names.get(message.senderId) ?? 'Former member')
                        : undefined
                    }
                    status={statuses[message.id] ?? 'sent'}
                    starred={starred.has(message.id)}
                    reactions={reactions[message.id] ?? []}
                  />
                </Fragment>
              )
            })}
          </>
        )}
      </div>
      <button
        type="button"
        aria-label="Jump to latest message"
        onClick={() => {
          scrollToBottom(true)
          setShowJump(false)
        }}
        className={cn(
          'absolute bottom-4 right-6 grid h-10 w-10 place-items-center rounded-full bg-surface text-muted shadow-popover transition-opacity',
          showJump ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <Icon icon={ArrowDown} size={20} />
      </button>
    </div>
  )
}
