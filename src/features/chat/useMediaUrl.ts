import { useQuery } from '@tanstack/react-query'
import { keys } from '../../lib/queryKeys'
import { downloadMedia } from './messageExtras'
import { localMedia } from './mediaCache'
import type { ChatMessage } from './types'

/** Object URL for an attachment, decrypted lazily in the browser. */
export function useMediaUrl(message: ChatMessage, enabled = true) {
  return useQuery({
    queryKey: keys.media(message.id),
    enabled: enabled && message.media !== null && !message.deleted,
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const cached = localMedia.get(message.id)
      const blob = cached ?? (await downloadMedia(message))
      localMedia.set(message.id, blob)
      return URL.createObjectURL(blob)
    },
  })
}
