import { useQuery } from '@tanstack/react-query'
import {
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Video,
} from 'lucide-react'
import { SplitLayout } from '../../components/layout/SplitLayout'
import { Avatar } from '../../components/ui/Avatar'
import { EmptyState } from '../../components/ui/EmptyState'
import { Icon } from '../../components/ui/Icon'
import { IconButton } from '../../components/ui/IconButton'
import { ChatListSkeleton } from '../../components/ui/Skeleton'
import { cn } from '../../lib/cn'
import { errorMessage } from '../../lib/errors'
import { formatChatTime } from '../../lib/format'
import { keys } from '../../lib/queryKeys'
import { useCurrentUserId } from '../auth/useCurrentUser'
import { useChatOverview } from '../chat/useChats'
import { useCall } from './CallContext'
import { describeCall } from './callDisplay'
import { loadCallHistory } from './callService'

function History() {
  const userId = useCurrentUserId()
  const call = useCall()
  const { data: chats = [] } = useChatOverview()
  const {
    data: history,
    isPending,
    error,
  } = useQuery({
    queryKey: keys.calls(userId),
    queryFn: () => loadCallHistory(),
    staleTime: 15_000,
  })

  return (
    <>
      <header className="flex h-[60px] shrink-0 items-center bg-panel px-5">
        <h1 className="text-[22px] font-semibold">Calls</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isPending ? (
          <ChatListSkeleton rows={6} />
        ) : error ? (
          <p role="alert" className="p-6 text-center text-sm text-danger">
            {errorMessage(error)}
          </p>
        ) : history.length === 0 ? (
          <EmptyState
            icon={Phone}
            title="No calls yet"
            description="Start a voice or video call from any chat with the phone or video buttons."
          />
        ) : (
          <ul>
            {history.map((record) => {
              const chat = chats.find(
                (candidate) => candidate.id === record.chatId,
              )
              const description = describeCall(record, userId)
              const missed = description.outcome === 'missed'
              const glyph = missed
                ? PhoneMissed
                : description.direction === 'incoming'
                  ? PhoneIncoming
                  : PhoneOutgoing
              const blocked = chat
                ? call.callBlockedReason(chat)
                : 'Chat unavailable'
              return (
                <li
                  key={record.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover"
                >
                  <Avatar
                    name={chat?.name ?? 'Unknown'}
                    path={chat?.avatarPath}
                    bucket={chat?.avatarBucket}
                    size={48}
                  />
                  <span className="min-w-0 flex-1">
                    <strong
                      className={cn(
                        'block truncate text-[16px] font-normal',
                        missed && 'text-danger',
                      )}
                    >
                      {chat?.name ?? 'Unknown chat'}
                    </strong>
                    <span className="flex items-center gap-1.5 text-[13px] text-muted">
                      <Icon
                        icon={glyph}
                        size={14}
                        className={missed ? 'text-danger' : 'text-accent'}
                      />
                      {description.label}
                      {description.duration
                        ? ` · ${description.duration}`
                        : ''}{' '}
                      · {formatChatTime(record.startedAt)}
                    </span>
                  </span>
                  {chat && (
                    <IconButton
                      icon={record.type === 'video' ? Video : Phone}
                      label={`${record.type === 'video' ? 'Video' : 'Voice'} call ${chat.name}`}
                      tone="primary"
                      disabled={blocked !== null}
                      title={blocked ?? undefined}
                      onClick={() =>
                        call.startCall(chat, record.type === 'video')
                      }
                    />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}

export default function CallsPage() {
  return (
    <SplitLayout
      list={<History />}
      detail={
        <div className="grid h-full w-full place-items-center bg-panel">
          <EmptyState
            icon={Phone}
            title="Voice and video calls"
            description="Calls are peer to peer and encrypted in transit. Behind some strict networks a TURN relay is needed for calls to connect."
          />
        </div>
      }
      hasDetail={false}
    />
  )
}
