import { describe, expect, it } from 'vitest'
import {
  markSendState,
  prependPage,
  removeMessage,
  upsertMessage,
  type Thread,
} from './threadCache'
import type { ChatMessage } from './types'

const message = (
  id: string,
  createdAt: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage => ({
  id,
  chatId: 'c',
  senderId: 's',
  createdAt,
  isMine: true,
  kind: 'text',
  text: id,
  replyToId: null,
  isForwarded: false,
  deleted: false,
  undecryptable: false,
  media: null,
  linkPreview: null,
  messageKey: null,
  sendState: 'sent',
  ...extra,
})

describe('thread cache', () => {
  it('keeps messages ordered when inserting out of order', () => {
    let thread: Thread | undefined
    thread = upsertMessage(thread, message('b', '2026-01-02T00:00:00Z'))
    thread = upsertMessage(thread, message('a', '2026-01-01T00:00:00Z'))
    expect(thread.messages.map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('treats the realtime echo of an optimistic send as the same message', () => {
    let thread = upsertMessage(
      undefined,
      message('x', '2026-01-01T00:00:00Z', { sendState: 'sending' }),
    )
    thread = upsertMessage(thread, message('x', '2026-01-01T00:00:01Z'))
    expect(thread.messages).toHaveLength(1)
    expect(thread.messages[0]?.sendState).toBe('sent')
  })

  it('marks failures and removes hidden messages', () => {
    let thread = upsertMessage(
      undefined,
      message('x', '2026-01-01T00:00:00Z', { sendState: 'sending' }),
    )
    thread = markSendState(thread, 'x', 'failed')
    expect(thread.messages[0]?.sendState).toBe('failed')
    expect(removeMessage(thread, 'x').messages).toEqual([])
  })

  it('prepends an older page without duplicating overlap', () => {
    const current: Thread = {
      messages: [message('b', '2026-01-02T00:00:00Z')],
      hasMore: true,
      cursor: '2026-01-02T00:00:00Z',
    }
    const next = prependPage(current, {
      messages: [
        message('a', '2026-01-01T00:00:00Z'),
        message('b', '2026-01-02T00:00:00Z'),
      ],
      hasMore: false,
      cursor: '2026-01-01T00:00:00Z',
    })
    expect(next.messages.map((m) => m.id)).toEqual(['a', 'b'])
    expect(next.hasMore).toBe(false)
  })
})
