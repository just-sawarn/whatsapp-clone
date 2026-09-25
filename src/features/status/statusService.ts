import { supabase } from '../../lib/supabase'

export type StatusItem = {
  id: string
  userId: string
  displayName: string
  caption: string | null
  createdAt: string
  expiresAt: string
  isMine: boolean
}

function clientOrThrow() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function loadActiveStatuses(currentUserId: string): Promise<StatusItem[]> {
  const { data, error } = await clientOrThrow().from('statuses').select('id, user_id, caption, created_at, expires_at, profiles(display_name)').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false })
  if (error) throw error
  return (data as unknown as Array<{ id: string; user_id: string; caption: string | null; created_at: string; expires_at: string; profiles: { display_name: string } | null }>).map((status) => ({
    id: status.id,
    userId: status.user_id,
    displayName: status.profiles?.display_name ?? 'Unknown contact',
    caption: status.caption,
    createdAt: status.created_at,
    expiresAt: status.expires_at,
    isMine: status.user_id === currentUserId,
  }))
}

export async function createCaptionStatus(userId: string, caption: string): Promise<void> {
  const { error } = await clientOrThrow().from('statuses').insert({ user_id: userId, caption: caption.trim(), expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })
  if (error) throw error
}

export async function markStatusViewed(statusId: string, viewerId: string): Promise<void> {
  const { error } = await clientOrThrow().from('status_views').upsert({ status_id: statusId, viewer_id: viewerId }, { onConflict: 'status_id,viewer_id' })
  if (error) throw error
}
