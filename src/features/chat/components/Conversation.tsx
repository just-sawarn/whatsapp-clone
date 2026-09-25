import { useCallback, useMemo, useState, type DragEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { LockKeyhole, Megaphone, MessageCircleOff } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Skeleton } from '../../../components/ui/Skeleton'
import { useToast } from '../../../components/ui/ToastContext'
import { errorMessage } from '../../../lib/errors'
import { useAuth } from '../../auth/AuthContext'
import { useEncryptionPrompt } from '../../auth/EncryptionPromptContext'
import { prepareAttachment, rejectionFor } from '../attachments'
import { EncryptionLockedError } from '../messageCrypto'
import {
  useParticipants,
  useReactions,
  useReceiptStatuses,
  useStarredIds,
} from '../useChatData'
import { useChat, useChatOverview } from '../useChats'
import { useMarkRead } from '../useMarkRead'
import { useMessageActions } from '../useMessageActions'
import { useSendMessage } from '../useSendMessage'
import { useThread } from '../useThread'
import { useTyping } from '../useTyping'
import type { ChatMessage } from '../types'
import { AttachmentPreview } from './AttachmentPreview'
import { ChatInfoPanel } from './ChatInfoPanel'
import { Composer } from './Composer'
import { ContactBanner } from './ContactBanner'
import { ConversationHeader } from './ConversationHeader'
import { ForwardModal } from './ForwardModal'
import { InChatSearch } from './InChatSearch'
import { MediaViewer } from './MediaViewer'
import { MessageList } from './MessageList'

export function Conversation({ chatId }: { chatId: string }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const me = user?.id ?? ''
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const prompt = useEncryptionPrompt()
  const overview = useChatOverview()
  const chat = useChat(chatId)
  const { thread, isPending, error, refetch, loadOlder, loadingOlder } =
    useThread(chatId)
  const { send, retry, discard } = useSendMessage(chatId)
  const { typingUserIds, notifyTyping } = useTyping(chatId)
  const { data: participants } = useParticipants(chatId)
  const reactions = useReactions(chatId)
  const starred = useStarredIds()
  const statuses = useReceiptStatuses(
    chatId,
    Math.max((chat?.participantCount ?? 2) - 1, 1),
  )
  const messageActions = useMessageActions(chatId)
  const [, setParams] = useSearchParams()
  const [reply, setReply] = useState<ChatMessage | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [forwarding, setForwarding] = useState<ChatMessage | null>(null)
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null)
  const [viewer, setViewer] = useState<{ url: string; name: string } | null>(
    null,
  )
  const [dragging, setDragging] = useState(false)

  useMarkRead(
    chatId,
    thread.messages,
    Boolean(chat && (chat.unreadCount > 0 || chat.markedUnread)),
  )

  const names = useMemo(
    () =>
      new Map(
        (participants ?? []).map((participant) => [
          participant.userId,
          participant.displayName,
        ]),
      ),
    [participants],
  )
  const typingNames = typingUserIds.map((id) => names.get(id) ?? 'Someone')
  const jumpTo = useCallback(
    (id: string) =>
      setParams(
        (current) => {
          current.set('m', id)
          return current
        },
        { replace: true },
      ),
    [setParams],
  )

  const pickFiles = useCallback(
    (files: File[]) => {
      const problems = files
        .map(rejectionFor)
        .filter((problem): problem is string => problem !== null)
      const acceptable = files.filter((file) => rejectionFor(file) === null)
      if (problems.length > 0)
        notify(problems[0] ?? 'That file cannot be sent.', 'error')
      if (acceptable.length > 0) setPendingFiles(acceptable)
    },
    [notify],
  )

  const sendFiles = async (files: File[], caption: string) => {
    setPendingFiles(null)
    const replyToId = reply?.id ?? null
    setReply(null)
    for (const [index, file] of files.entries()) {
      try {
        send({
          attachment: await prepareAttachment(file),
          text: index === 0 && caption.trim() ? caption.trim() : undefined,
          replyToId: index === 0 ? replyToId : null,
        })
      } catch (prepareError) {
        notify(
          errorMessage(prepareError, `Could not prepare ${file.name}.`),
          'error',
        )
      }
    }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length > 0) pickFiles(files)
  }

  if (!chat) {
    return overview.isPending ? (
      <div className="flex w-full flex-col">
        <div className="h-[60px] bg-panel p-3">
          <Skeleton className="h-10 w-48" />
        </div>
      </div>
    ) : (
      <div className="grid w-full place-items-center">
        <EmptyState
          icon={MessageCircleOff}
          title="This chat is not available"
          description="It may have been deleted, or you are no longer a member."
          action={<Button onClick={() => navigate('/')}>Back to chats</Button>}
        />
      </div>
    )
  }

  const locked = error instanceof EncryptionLockedError
  return (
    <div
      className="relative flex h-full w-full min-w-0"
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) =>
        event.currentTarget === event.target && setDragging(false)
      }
      onDrop={onDrop}
    >
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <ConversationHeader
          chat={chat}
          typingNames={typingNames}
          onBack={() => navigate('/')}
          onToggleSearch={() => setSearchOpen((open) => !open)}
          onToggleInfo={() => setInfoOpen((open) => !open)}
          searchOpen={searchOpen}
          infoOpen={infoOpen}
        />
        {searchOpen && (
          <InChatSearch
            chatId={chatId}
            onJump={jumpTo}
            onClose={() => setSearchOpen(false)}
          />
        )}
        <ContactBanner chat={chat} />
        {locked ? (
          <div className="grid flex-1 place-items-center">
            <EmptyState
              icon={LockKeyhole}
              title="Your key is locked"
              description="Unlock your encryption key to read and send messages on this device."
              action={<Button onClick={prompt.open}>Unlock</Button>}
            />
          </div>
        ) : error ? (
          <div className="grid flex-1 place-items-center">
            <EmptyState
              icon={MessageCircleOff}
              title="Could not load messages"
              description={errorMessage(error)}
              action={<Button onClick={() => void refetch()}>Try again</Button>}
            />
          </div>
        ) : (
          <MessageList
            messages={thread.messages}
            loading={isPending}
            hasMore={thread.hasMore}
            loadingOlder={loadingOlder}
            onLoadOlder={() => void loadOlder()}
            names={names}
            statuses={statuses}
            isGroup={chat.isGroup}
            chatId={chatId}
            me={me}
            starred={starred}
            reactions={reactions}
            actions={{
              onReply: setReply,
              onReact: (message, emoji) =>
                void messageActions.react(message.id, emoji),
              onStar: (message, value) =>
                void messageActions.star(message.id, value),
              onForward: setForwarding,
              onDeleteForMe: (message) =>
                void messageActions.removeForMe(message),
              onDeleteForEveryone: (message) =>
                void messageActions.removeForEveryone(message),
              onRetry: retry,
              onDiscard: discard,
              onOpenImage: (message, url) =>
                setViewer({ url, name: message.media?.name ?? 'Photo' }),
            }}
          />
        )}
        {chat.canPost ? (
          <Composer
            onSend={(text, linkPreview) => {
              send({ text, linkPreview, replyToId: reply?.id ?? null })
              setReply(null)
            }}
            onSendVoice={(recording) =>
              send({
                attachment: {
                  blob: recording.blob,
                  name: 'Voice message',
                  mime: recording.mime,
                  durationSeconds: recording.seconds,
                },
                replyToId: reply?.id ?? null,
              })
            }
            onPickFiles={pickFiles}
            onTyping={notifyTyping}
            reply={reply}
            replyName={reply ? names.get(reply.senderId) : undefined}
            onCancelReply={() => setReply(null)}
            disabled={locked || isPending}
          />
        ) : (
          <div className="flex shrink-0 items-center justify-center gap-2 bg-panel px-4 py-4 text-center text-[13.5px] text-muted">
            <Megaphone size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>
              Only community admins can send messages in announcements.
            </span>
          </div>
        )}
      </div>
      {infoOpen && (
        <ChatInfoPanel chat={chat} onClose={() => setInfoOpen(false)} />
      )}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center border-4 border-dashed border-accent bg-surface/80 text-lg">
          Drop files to send
        </div>
      )}
      <AttachmentPreview
        files={pendingFiles}
        onCancel={() => setPendingFiles(null)}
        onSend={(files, caption) => void sendFiles(files, caption)}
      />
      <ForwardModal
        open={forwarding !== null}
        onClose={() => setForwarding(null)}
        onForward={async (ids) => {
          if (forwarding) await messageActions.forward(forwarding, ids)
          void queryClient.invalidateQueries({ queryKey: ['chats'] })
        }}
      />
      {viewer && (
        <MediaViewer
          url={viewer.url}
          name={viewer.name}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  )
}
