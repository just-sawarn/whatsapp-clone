import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Mic, Paperclip, SendHorizontal, Smile, X } from 'lucide-react'
import { IconButton } from '../../../components/ui/IconButton'
import { Icon } from '../../../components/ui/Icon'
import { useToast } from '../../../components/ui/ToastContext'
import { errorMessage } from '../../../lib/errors'
import { useDebouncedValue } from '../../../lib/useDebouncedValue'
import { fetchLinkPreview, firstUrl, type LinkPreview } from '../linkPreview'
import { useVoiceRecorder, type Recording } from '../useVoiceRecorder'
import type { ChatMessage } from '../types'
import { EmojiPicker } from './EmojiPicker'
import { LinkPreviewCard } from './LinkPreviewCard'
import { VoiceRecorderBar } from './VoiceRecorderBar'

type Props = {
  onSend: (text: string, linkPreview: LinkPreview | null) => void
  onSendVoice: (recording: Recording) => void
  onPickFiles: (files: File[]) => void
  onTyping: () => void
  reply: ChatMessage | null
  replyName?: string
  onCancelReply: () => void
  disabled?: boolean
}

const MAX_HEIGHT = 140
const CANCEL_DRAG_PX = 80

export function Composer({
  onSend,
  onSendVoice,
  onPickFiles,
  onTyping,
  reply,
  replyName,
  onCancelReply,
  disabled,
}: Props) {
  const { notify } = useToast()
  const [text, setText] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [dismissedUrl, setDismissedUrl] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const dragStart = useRef<{ x: number; touch: boolean } | null>(null)
  const recorder = useVoiceRecorder()
  const hasText = text.trim().length > 0

  const url = firstUrl(text)
  const debouncedUrl = useDebouncedValue(url, 600)
  const { data: preview } = useQuery({
    queryKey: ['link-preview', debouncedUrl],
    queryFn: () => fetchLinkPreview(debouncedUrl ?? ''),
    enabled: Boolean(debouncedUrl),
    staleTime: Infinity,
    retry: false,
  })
  const activePreview =
    url && url === debouncedUrl && url !== dismissedUrl ? preview : null

  useEffect(() => {
    const element = field.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT)}px`
  }, [text])

  useEffect(() => {
    if (reply) field.current?.focus()
  }, [reply])

  const submit = () => {
    const value = text.trim()
    if (!value || disabled) return
    onSend(value, activePreview ?? null)
    setText('')
    setEmojiOpen(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault()
      submit()
    }
  }

  const onPaste = (event: ClipboardEvent) => {
    const files = Array.from(event.clipboardData.files)
    if (files.length > 0) {
      event.preventDefault()
      onPickFiles(files)
    }
  }

  const insertEmoji = (emoji: string) => {
    const element = field.current
    const start = element?.selectionStart ?? text.length
    const end = element?.selectionEnd ?? text.length
    setText(`${text.slice(0, start)}${emoji}${text.slice(end)}`)
    window.requestAnimationFrame(() => {
      element?.focus()
      element?.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }

  const beginRecording = async () => {
    try {
      await recorder.start()
    } catch (error) {
      notify(errorMessage(error, 'Could not start recording.'), 'error')
    }
  }

  const finishRecording = async (send: boolean) => {
    const result = await recorder.stop(send)
    setCancelling(false)
    if (result) onSendVoice(result)
  }

  // Touch: press and hold to record, release to send, slide left to cancel. Mouse: click to start/stop.
  const onMicDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') return
    dragStart.current = { x: event.clientX, touch: true }
    event.currentTarget.setPointerCapture(event.pointerId)
    void beginRecording()
  }
  const onMicMove = (event: PointerEvent) => {
    if (dragStart.current)
      setCancelling(event.clientX - dragStart.current.x < -CANCEL_DRAG_PX)
  }
  const onMicUp = (event: PointerEvent) => {
    if (!dragStart.current) return
    const cancelled = event.clientX - dragStart.current.x < -CANCEL_DRAG_PX
    dragStart.current = null
    void finishRecording(!cancelled)
  }
  const onMicClick = () => {
    if (dragStart.current === null && !recorder.recording) void beginRecording()
  }

  return (
    <div className="relative shrink-0 bg-panel">
      {emojiOpen && (
        <EmojiPicker onPick={insertEmoji} onClose={() => setEmojiOpen(false)} />
      )}
      <AnimatePresence initial={false}>
        {reply && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 40 }}
            className="overflow-hidden"
          >
            <div className="mx-3 mt-2 flex items-start gap-2 rounded-lg border-l-4 border-accent bg-surface px-3 py-2 text-[13px]">
              <div className="min-w-0 flex-1">
                <strong className="block text-link">
                  {reply.isMine ? 'You' : (replyName ?? 'Message')}
                </strong>
                <span className="block truncate text-muted">
                  {reply.deleted
                    ? 'This message was deleted'
                    : reply.text || reply.media?.name || 'Attachment'}
                </span>
              </div>
              <button
                type="button"
                aria-label="Cancel reply"
                onClick={onCancelReply}
              >
                <Icon icon={X} size={18} className="text-muted" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {activePreview && (
        <div className="relative mx-3 mt-2 max-w-sm">
          <LinkPreviewCard preview={activePreview} />
          <button
            type="button"
            aria-label="Remove link preview"
            onClick={() => setDismissedUrl(url)}
            className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-surface/90 shadow-bubble"
          >
            <Icon icon={X} size={14} />
          </button>
        </div>
      )}
      {recorder.recording ? (
        <VoiceRecorderBar
          seconds={recorder.seconds}
          levels={recorder.levels}
          cancelling={cancelling}
          onCancel={() => void finishRecording(false)}
          onSend={() => void finishRecording(true)}
        />
      ) : (
        <div className="flex items-end gap-1.5 px-3 py-2.5">
          <IconButton
            icon={Smile}
            label="Emoji"
            active={emojiOpen}
            onClick={() => setEmojiOpen((open) => !open)}
            disabled={disabled}
          />
          <IconButton
            icon={Paperclip}
            label="Attach a file"
            onClick={() => fileInput.current?.click()}
            disabled={disabled}
          />
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? [])
              event.target.value = ''
              if (files.length) onPickFiles(files)
            }}
          />
          <textarea
            ref={field}
            value={text}
            rows={1}
            disabled={disabled}
            onChange={(event) => {
              setText(event.target.value)
              if (event.target.value) onTyping()
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder="Type a message"
            aria-label="Type a message"
            className="max-h-36 min-h-[42px] flex-1 resize-none rounded-lg bg-surface px-3.5 py-2.5 text-[15px] text-text outline-none placeholder:text-muted disabled:opacity-60"
          />
          <AnimatePresence mode="popLayout" initial={false}>
            {hasText ? (
              <motion.span
                key="send"
                initial={{ scale: 0.4, rotate: -45, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 600, damping: 30 }}
              >
                <IconButton
                  icon={SendHorizontal}
                  label="Send message"
                  tone="primary"
                  disabled={disabled}
                  onClick={submit}
                />
              </motion.span>
            ) : (
              <motion.span
                key="mic"
                initial={{ scale: 0.4, rotate: 45, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 600, damping: 30 }}
              >
                <IconButton
                  icon={Mic}
                  label="Record voice message"
                  disabled={disabled}
                  onPointerDown={onMicDown}
                  onPointerMove={onMicMove}
                  onPointerUp={onMicUp}
                  onClick={onMicClick}
                  className="touch-none"
                />
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
