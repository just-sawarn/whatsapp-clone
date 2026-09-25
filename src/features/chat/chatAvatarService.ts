import { photoRejection, resizeImage } from '../../lib/image'
import { buckets } from '../../lib/storageUrls'
import { supabase } from '../../lib/supabase'

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

async function setAvatarPath(
  chatId: string,
  path: string | null,
): Promise<void> {
  const { data, error } = await client()
    .from('chats')
    .update({ avatar_url: path })
    .eq('id', chatId)
    .select('id')
  if (error) throw error
  // Row level security hides rows you may not change, so a non-admin's update "succeeds" by matching nothing.
  if (!data || data.length === 0)
    throw new Error('Only group admins can change the photo.')
}

/**
 * Uploads a group or community photo to `chat-avatars/{chat}/…` and points the chat at it. Only group admins pass
 * the storage policy. The previous file is removed once the new one is in place.
 */
export async function uploadChatAvatar(
  chatId: string,
  file: File,
  previousPath: string | null,
): Promise<string> {
  const problem = photoRejection(file)
  if (problem) throw new Error(problem)
  const { blob } = await resizeImage(file, 512, 0.88)
  const path = `${chatId}/${crypto.randomUUID()}.jpg`
  const storage = client().storage.from(buckets.chatAvatars)
  const { error } = await storage.upload(path, blob, {
    contentType: 'image/jpeg',
    cacheControl: '3600',
  })
  if (error) throw error
  try {
    await setAvatarPath(chatId, path)
  } catch (updateError) {
    await storage.remove([path]).catch(() => undefined)
    throw updateError
  }
  if (previousPath) await storage.remove([previousPath]).catch(() => undefined)
  return path
}

export async function removeChatAvatar(
  chatId: string,
  path: string,
): Promise<void> {
  await setAvatarPath(chatId, null)
  await client()
    .storage.from(buckets.chatAvatars)
    .remove([path])
    .catch(() => undefined)
}
