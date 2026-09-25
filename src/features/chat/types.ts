import type { MessageMedia, MessagePayloadV1 } from '../../lib/crypto/crypto'
import type { TickStatus } from '../../components/ui/Ticks'

export type MessageKind = 'text' | 'image' | 'file' | 'audio'

export type ChatMedia = MessageMedia & {
  path: string
  durationSeconds: number | null
}

export type ChatMessage = {
  id: string
  chatId: string
  senderId: string
  createdAt: string
  isMine: boolean
  kind: MessageKind
  text: string
  replyToId: string | null
  isForwarded: boolean
  /** Deleted for everyone: only a placeholder is shown. */
  deleted: boolean
  /** Ciphertext present but this device could not decrypt it. */
  undecryptable: boolean
  media: ChatMedia | null
  linkPreview: MessagePayloadV1['linkPreview'] | null
  /** Needed to decrypt attachments; never leaves memory. */
  messageKey: CryptoKey | null
  /** Client-only delivery state for optimistic sends. */
  sendState: 'sent' | 'sending' | 'failed'
}

export type MessagePreview = {
  kind: MessageKind
  text: string
  deleted: boolean
  isMine: boolean
  senderId: string
  createdAt: string
}

export type ChatSummary = {
  id: string
  isGroup: boolean
  /** Group name, or the other person's display name in a direct chat. */
  name: string
  peerId: string | null
  peerUsername: string | null
  avatarPath: string | null
  /** Group photos live in their own bucket, separate from profile photos. */
  avatarBucket: string
  isPinned: boolean
  isArchived: boolean
  isMuted: boolean
  markedUnread: boolean
  unreadCount: number
  participantCount: number
  peerLastSeen: string | null
  /** An announcements chat: only admins can post. */
  isAnnouncement: boolean
  /** False for members of an announcements chat, who can read but not send. */
  canPost: boolean
  communityId: string | null
  communityName: string | null
  lastMessage: MessagePreview | null
}

export type ReactionRow = { messageId: string; userId: string; emoji: string }

export type MessageStatusMap = Record<string, TickStatus>
