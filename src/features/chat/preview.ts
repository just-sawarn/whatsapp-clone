import type { ChatMessage, MessagePreview } from './types'

export function toPreview(message: ChatMessage): MessagePreview {
  const text = message.deleted
    ? 'This message was deleted'
    : message.undecryptable
      ? 'Message unavailable on this device'
      : message.kind === 'text'
        ? message.text
        : message.text || defaultCaption(message)
  return {
    kind: message.kind,
    text,
    deleted: message.deleted,
    isMine: message.isMine,
    senderId: message.senderId,
    createdAt: message.createdAt,
  }
}

function defaultCaption(message: ChatMessage): string {
  if (message.kind === 'image') return 'Photo'
  if (message.kind === 'audio') return 'Voice message'
  return message.media?.name ?? 'Document'
}
