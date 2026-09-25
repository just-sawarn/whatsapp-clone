import { resizeImage } from '../../lib/image'
import { supabase } from '../../lib/supabase'
import { buckets } from '../../lib/storageUrls'
import {
  groupStatuses,
  type StatusItem,
  type StatusOwner,
} from './statusGrouping'

export const STATUS_LIFETIME_MS = 24 * 60 * 60 * 1000
export const MAX_CAPTION = 700

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

type StatusRow = {
  id: string
  user_id: string
  caption: string | null
  media_path: string | null
  bg_color: string | null
  created_at: string
  expires_at: string
  profiles: { display_name: string; avatar_url: string | null } | null
}

/** Everything I am allowed to see (RLS applies the poster's audience rules), grouped by person. */
export async function loadStatuses(userId: string) {
  const { data, error } = await client()
    .from('statuses')
    .select(
      'id, user_id, caption, media_path, bg_color, created_at, expires_at, profiles!user_id(display_name, avatar_url)',
    )
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true })
  if (error) throw error
  const rows = data as unknown as StatusRow[]
  const { data: views, error: viewError } = await client()
    .from('status_views')
    .select('status_id')
    .eq('viewer_id', userId)
  if (viewError) throw viewError
  const seen = new Set(
    (views as unknown as Array<{ status_id: string }>).map(
      (view) => view.status_id,
    ),
  )
  return groupStatuses(
    rows.map((row) => {
      const owner: StatusOwner = {
        userId: row.user_id,
        displayName: row.profiles?.display_name ?? 'Unknown',
        avatarPath: row.profiles?.avatar_url ?? null,
      }
      const item: StatusItem = {
        id: row.id,
        userId: row.user_id,
        caption: row.caption,
        mediaPath: row.media_path,
        bgColor: row.bg_color,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        viewed: row.user_id === userId || seen.has(row.id),
      }
      return { ...item, owner }
    }),
    userId,
  )
}

export async function postTextStatus(
  userId: string,
  caption: string,
  bgColor: string,
): Promise<void> {
  const text = caption.trim()
  if (!text) throw new Error('Write something first.')
  const { error } = await client()
    .from('statuses')
    .insert({
      user_id: userId,
      caption: text.slice(0, MAX_CAPTION),
      bg_color: bgColor,
      expires_at: new Date(Date.now() + STATUS_LIFETIME_MS).toISOString(),
    })
  if (error) throw error
}

export async function postImageStatus(
  userId: string,
  file: File,
  caption: string,
): Promise<void> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image.')
  const { blob } = await resizeImage(file, 1600, 0.85)
  const path = `${userId}/${crypto.randomUUID()}.jpg`
  const { error: uploadError } = await client()
    .storage.from(buckets.statusMedia)
    .upload(path, blob, { contentType: 'image/jpeg' })
  if (uploadError) throw uploadError
  const { error } = await client()
    .from('statuses')
    .insert({
      user_id: userId,
      media_path: path,
      caption: caption.trim().slice(0, MAX_CAPTION) || null,
      expires_at: new Date(Date.now() + STATUS_LIFETIME_MS).toISOString(),
    })
  if (error) {
    await client()
      .storage.from(buckets.statusMedia)
      .remove([path])
      .catch(() => undefined)
    throw error
  }
}

export async function deleteStatus(status: StatusItem): Promise<void> {
  const { error } = await client().from('statuses').delete().eq('id', status.id)
  if (error) throw error
  if (status.mediaPath)
    await client()
      .storage.from(buckets.statusMedia)
      .remove([status.mediaPath])
      .catch(() => undefined)
}

export async function markStatusViewed(
  statusId: string,
  viewerId: string,
): Promise<void> {
  const { error } = await client()
    .from('status_views')
    .upsert(
      { status_id: statusId, viewer_id: viewerId },
      { onConflict: 'status_id,viewer_id', ignoreDuplicates: true },
    )
  if (error) throw error
}

export type StatusViewer = {
  userId: string
  displayName: string
  avatarPath: string | null
  viewedAt: string
}

export async function loadViewers(statusId: string): Promise<StatusViewer[]> {
  const { data, error } = await client()
    .from('status_views')
    .select(
      'viewer_id, viewed_at, profiles!viewer_id(display_name, avatar_url)',
    )
    .eq('status_id', statusId)
    .order('viewed_at', { ascending: false })
  if (error) throw error
  return (
    data as unknown as Array<{
      viewer_id: string
      viewed_at: string
      profiles: { display_name: string; avatar_url: string | null } | null
    }>
  ).map((row) => ({
    userId: row.viewer_id,
    displayName: row.profiles?.display_name ?? 'Unknown',
    avatarPath: row.profiles?.avatar_url ?? null,
    viewedAt: row.viewed_at,
  }))
}
