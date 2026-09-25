import { queryOptions, useQuery } from '@tanstack/react-query'
import { keys } from '../../lib/queryKeys'
import { useObjectUrl } from '../../lib/objectUrls'
import { localMedia } from './mediaCache'
import { downloadMedia, type MediaVariant } from './messageExtras'
import type { ChatMessage } from './types'

/**
 * Query for one decrypted attachment. Photos I just sent come straight from memory. The result is a Blob, kept in
 * the query cache while the chat is in use; object URLs for displaying it are created and released by the view.
 */
export function mediaBlobQuery(message: ChatMessage, variant: MediaVariant) {
  return queryOptions({
    queryKey: keys.media(message.id, variant),
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    queryFn: async () =>
      localMedia.get(message.id) ?? (await downloadMedia(message, variant)),
  })
}

/** Decrypted attachment as a Blob plus an object URL for showing it, fetched only while `enabled`. */
export function useMediaBlob(
  message: ChatMessage,
  variant: MediaVariant = 'full',
  enabled = true,
) {
  const query = useQuery({
    ...mediaBlobQuery(message, variant),
    enabled: enabled && message.media !== null && !message.deleted,
  })
  return {
    blob: query.data,
    url: useObjectUrl(query.data),
    isPending: query.isPending,
    error: query.error,
  }
}
