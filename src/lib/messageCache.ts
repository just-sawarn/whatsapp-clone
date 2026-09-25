import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from 'idb'

/**
 * On-device index of decrypted message text. Because the server only stores ciphertext, search has to run
 * here. The cache is per account, only contains messages this device has already decrypted, and is wiped on
 * sign-out and from Settings → Storage & data.
 */
export type CachedMessage = {
  id: string
  chatId: string
  senderId: string
  createdAt: string
  text: string
}

interface CacheDatabase extends DBSchema {
  messages: { key: string; value: CachedMessage; indexes: { byChat: string } }
}

const databases = new Map<string, Promise<IDBPDatabase<CacheDatabase>>>()

const nameFor = (userId: string) => `whatsapp-clone-cache:${userId}`

function open(userId: string): Promise<IDBPDatabase<CacheDatabase>> {
  let database = databases.get(userId)
  if (!database) {
    database = openDB<CacheDatabase>(nameFor(userId), 1, {
      upgrade(db) {
        db.createObjectStore('messages', { keyPath: 'id' }).createIndex(
          'byChat',
          'chatId',
        )
      },
    })
    databases.set(userId, database)
  }
  return database
}

export async function cacheMessages(
  userId: string,
  messages: CachedMessage[],
): Promise<void> {
  const withText = messages.filter((message) => message.text.length > 0)
  if (withText.length === 0) return
  const db = await open(userId)
  const tx = db.transaction('messages', 'readwrite')
  await Promise.all([
    ...withText.map((message) => tx.store.put(message)),
    tx.done,
  ])
}

export async function removeCachedMessage(
  userId: string,
  messageId: string,
): Promise<void> {
  await (await open(userId)).delete('messages', messageId)
}

export type SearchOptions = { chatId?: string; limit?: number }

/** Case-insensitive substring search, newest first. */
export async function searchCache(
  userId: string,
  query: string,
  options: SearchOptions = {},
): Promise<CachedMessage[]> {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return []
  const db = await open(userId)
  const all = options.chatId
    ? await db.getAllFromIndex('messages', 'byChat', options.chatId)
    : await db.getAll('messages')
  return all
    .filter((message) => message.text.toLowerCase().includes(needle))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, options.limit ?? 50)
}

export async function cacheStats(
  userId: string,
): Promise<{ count: number; bytes: number }> {
  const all = await (await open(userId)).getAll('messages')
  return {
    count: all.length,
    bytes: all.reduce(
      (total, message) => total + message.text.length * 2 + 120,
      0,
    ),
  }
}

export async function clearCache(userId: string): Promise<void> {
  const database = databases.get(userId)
  databases.delete(userId)
  if (database) (await database).close()
  await deleteDB(nameFor(userId))
}

export type Snippet = { before: string; match: string; after: string }

/** A short excerpt around the first occurrence of `query`, for highlighting in search results. */
export function makeSnippet(text: string, query: string, radius = 36): Snippet {
  const index = text.toLowerCase().indexOf(query.trim().toLowerCase())
  if (index < 0 || query.trim().length === 0)
    return { before: '', match: '', after: text.slice(0, radius * 2) }
  const end = index + query.trim().length
  const start = Math.max(0, index - radius)
  return {
    before: (start > 0 ? '…' : '') + text.slice(start, index),
    match: text.slice(index, end),
    after:
      text.slice(end, end + radius) + (end + radius < text.length ? '…' : ''),
  }
}
