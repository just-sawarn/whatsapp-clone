/** One place for TanStack Query keys so invalidation and reads always agree. */
export const keys = {
  chats: (userId: string) => ['chats', userId] as const,
  thread: (chatId: string) => ['thread', chatId] as const,
  reactions: (chatId: string) => ['reactions', chatId] as const,
  receipts: (chatId: string) => ['receipts', chatId] as const,
  participants: (chatId: string) => ['participants', chatId] as const,
  starredIds: (userId: string) => ['starred-ids', userId] as const,
  starred: (userId: string) => ['starred', userId] as const,
  profile: (userId: string) => ['profile', userId] as const,
  contacts: (userId: string) => ['contacts', userId] as const,
  statuses: (userId: string) => ['statuses', userId] as const,
  calls: (userId: string) => ['calls', userId] as const,
  media: (messageId: string, variant: string = 'full') =>
    ['media', messageId, variant] as const,
  communities: (userId: string) => ['communities', userId] as const,
  communityGroups: (communityId: string) =>
    ['community-groups', communityId] as const,
  invitePreview: (code: string) => ['invite-preview', code] as const,
}
