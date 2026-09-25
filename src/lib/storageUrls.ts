import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

export const buckets = {
  avatars: 'avatars',
  chatAvatars: 'chat-avatars',
  chatMedia: 'chat-media',
  statusMedia: 'status-media',
} as const

/** Private-bucket objects are served through short-lived signed URLs, cached for most of their lifetime. */
export function useSignedUrl(bucket: string, path: string | null | undefined) {
  return useQuery({
    queryKey: ['signed-url', bucket, path],
    enabled: Boolean(path && supabase),
    staleTime: 50 * 60 * 1000,
    gcTime: 55 * 60 * 1000,
    queryFn: async () => {
      if (!supabase || !path) return null
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 3600)
      if (error) throw error
      return data.signedUrl
    },
  })
}
