import { useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { keys } from '../../lib/queryKeys'
import { playSentSound } from '../../lib/sounds'
import { useToast } from '../../components/ui/ToastContext'
import { useCurrentUserId } from '../auth/useCurrentUser'
import { usePreferences } from '../preferences/PreferencesContext'
import { localMedia } from './mediaCache'
import { kindOfMime, sendMessage, type OutgoingMessage } from './messageService'
import {
  markSendState,
  removeMessage,
  upsertMessage,
  type Thread,
} from './threadCache'
import type { ChatMessage } from './types'

export type SendDraft = Omit<OutgoingMessage, 'id' | 'chatId' | 'senderId'>

function optimistic(
  id: string,
  chatId: string,
  userId: string,
  draft: SendDraft,
): ChatMessage {
  const { attachment } = draft
  return {
    id,
    chatId,
    senderId: userId,
    createdAt: new Date().toISOString(),
    isMine: true,
    kind: attachment ? kindOfMime(attachment.mime) : 'text',
    text: draft.text ?? '',
    replyToId: draft.replyToId ?? null,
    isForwarded: draft.isForwarded ?? false,
    deleted: false,
    undecryptable: false,
    media: attachment
      ? {
          name: attachment.name,
          mime: attachment.mime,
          size: attachment.blob.size,
          iv: '',
          path: '',
          width: attachment.width,
          height: attachment.height,
          durationSeconds: attachment.durationSeconds ?? null,
        }
      : null,
    linkPreview: draft.linkPreview ?? null,
    messageKey: null,
    sendState: 'sending',
  }
}

/** Optimistic sending: the bubble appears at once, then settles to sent or failed (with retry). */
export function useSendMessage(chatId: string) {
  const userId = useCurrentUserId()
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const { sentSound } = usePreferences()
  const pending = useRef(new Map<string, OutgoingMessage>())

  const update = useCallback(
    (change: (thread: Thread | undefined) => Thread) =>
      queryClient.setQueryData<Thread>(keys.thread(chatId), change),
    [chatId, queryClient],
  )

  const attempt = useCallback(
    async (outgoing: OutgoingMessage & { id: string }) => {
      try {
        await sendMessage(outgoing)
        pending.current.delete(outgoing.id)
        update((thread) => markSendState(thread, outgoing.id, 'sent'))
        void queryClient.invalidateQueries({ queryKey: keys.chats(userId) })
        // Replying in a direct chat makes the other person a contact (database trigger), so refresh that list.
        void queryClient.invalidateQueries({ queryKey: keys.contacts(userId) })
        if (sentSound) playSentSound()
      } catch (error) {
        update((thread) => markSendState(thread, outgoing.id, 'failed'))
        notify(
          error instanceof Error ? error.message : 'Message failed to send.',
          'error',
        )
      }
    },
    [notify, queryClient, sentSound, update, userId],
  )

  const send = useCallback(
    (draft: SendDraft) => {
      const id = crypto.randomUUID()
      const outgoing = { ...draft, id, chatId, senderId: userId }
      pending.current.set(id, outgoing)
      if (draft.attachment) localMedia.set(id, draft.attachment.blob)
      update((thread) =>
        upsertMessage(thread, optimistic(id, chatId, userId, draft)),
      )
      void attempt(outgoing)
    },
    [attempt, chatId, update, userId],
  )

  const retry = useCallback(
    (id: string) => {
      const outgoing = pending.current.get(id)
      if (!outgoing?.id) return
      update((thread) => markSendState(thread, id, 'sending'))
      void attempt({ ...outgoing, id })
    },
    [attempt, update],
  )

  const discard = useCallback(
    (id: string) => {
      pending.current.delete(id)
      localMedia.delete(id)
      update((thread) => removeMessage(thread, id))
    },
    [update],
  )

  return { send, retry, discard }
}
