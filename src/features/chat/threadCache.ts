import type { ChatMessage } from './types'

export type Thread = {
  messages: ChatMessage[]
  hasMore: boolean
  cursor: string | null
}

const byTime = (a: ChatMessage, b: ChatMessage) =>
  a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)

export const emptyThread: Thread = {
  messages: [],
  hasMore: false,
  cursor: null,
}

/** Inserts a message, or replaces the one with the same id (echo of an optimistic send, status change). */
export function upsertMessage(
  thread: Thread | undefined,
  message: ChatMessage,
): Thread {
  const current = thread ?? emptyThread
  const others = current.messages.filter(
    (existing) => existing.id !== message.id,
  )
  return { ...current, messages: [...others, message].sort(byTime) }
}

export function removeMessage(
  thread: Thread | undefined,
  messageId: string,
): Thread {
  const current = thread ?? emptyThread
  return {
    ...current,
    messages: current.messages.filter((message) => message.id !== messageId),
  }
}

/** Adds an older page in front of what is already loaded. */
export function prependPage(thread: Thread | undefined, page: Thread): Thread {
  const current = thread ?? emptyThread
  const known = new Set(current.messages.map((message) => message.id))
  const older = page.messages.filter((message) => !known.has(message.id))
  return {
    messages: [...older, ...current.messages].sort(byTime),
    hasMore: page.hasMore,
    cursor: page.cursor,
  }
}

export function markSendState(
  thread: Thread | undefined,
  messageId: string,
  sendState: ChatMessage['sendState'],
): Thread {
  const current = thread ?? emptyThread
  return {
    ...current,
    messages: current.messages.map((message) =>
      message.id === messageId ? { ...message, sendState } : message,
    ),
  }
}
