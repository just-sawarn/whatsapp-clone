import { ArrowLeft, Info, Phone, Search, Video } from 'lucide-react'
import { Avatar } from '../../../components/ui/Avatar'
import { IconButton } from '../../../components/ui/IconButton'
import { formatLastSeen } from '../../../lib/format'
import { useCall } from '../../calls/CallContext'
import { useRealtime } from '../../realtime/RealtimeContext'
import { useMyProfile } from '../../profile/useProfile'
import { useParticipants } from '../useChatData'
import type { ChatSummary } from '../types'

type Props = {
  chat: ChatSummary
  typingNames: string[]
  onBack: () => void
  onToggleSearch: () => void
  onToggleInfo: () => void
  searchOpen: boolean
  infoOpen: boolean
}

/** Second line under the name: typing, online, last seen, or the group's member names. */
function useSubtitle(chat: ChatSummary, typingNames: string[]): string {
  const { onlineUserIds } = useRealtime()
  const { data: me } = useMyProfile()
  const { data: participants } = useParticipants(chat.id, chat.isGroup)
  if (typingNames.length > 0)
    return chat.isGroup ? `${typingNames.join(', ')} typing…` : 'typing…'
  if (chat.isGroup)
    return participants
      ? participants.map((participant) => participant.displayName).join(', ')
      : `${chat.participantCount} participants`
  // Last-seen and online status are reciprocal: hiding mine hides theirs.
  if (!me?.show_last_seen || !chat.peerId) return ''
  if (onlineUserIds.has(chat.peerId)) return 'online'
  return chat.peerLastSeen ? formatLastSeen(chat.peerLastSeen) : ''
}

export function ConversationHeader({
  chat,
  typingNames,
  onBack,
  onToggleSearch,
  onToggleInfo,
  searchOpen,
  infoOpen,
}: Props) {
  const { onlineUserIds } = useRealtime()
  const subtitle = useSubtitle(chat, typingNames)
  const call = useCall()
  const blocked = call.callBlockedReason(chat)
  return (
    <header className="flex h-[60px] shrink-0 items-center gap-3 bg-panel px-3 md:px-4">
      <IconButton
        icon={ArrowLeft}
        label="Back to chats"
        onClick={onBack}
        className="md:hidden"
      />
      <button
        type="button"
        onClick={onToggleInfo}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        aria-label={`${chat.name}, view info`}
      >
        <Avatar
          name={chat.name}
          path={chat.avatarPath}
          size={40}
          online={chat.peerId !== null && onlineUserIds.has(chat.peerId)}
        />
        <span className="min-w-0">
          <strong className="block truncate text-base font-normal">
            {chat.name}
          </strong>
          {subtitle && (
            <span
              className="block truncate text-[13px] text-muted"
              aria-live="polite"
            >
              {subtitle}
            </span>
          )}
        </span>
      </button>
      <IconButton
        icon={Video}
        label="Video call"
        title={blocked ?? 'Video call'}
        disabled={blocked !== null}
        onClick={() => call.startCall(chat, true)}
      />
      <IconButton
        icon={Phone}
        label="Voice call"
        title={blocked ?? 'Voice call'}
        disabled={blocked !== null}
        onClick={() => call.startCall(chat, false)}
      />
      <IconButton
        icon={Search}
        label="Search in chat"
        active={searchOpen}
        onClick={onToggleSearch}
      />
      <IconButton
        icon={Info}
        label="Chat info"
        active={infoOpen}
        onClick={onToggleInfo}
      />
    </header>
  )
}
