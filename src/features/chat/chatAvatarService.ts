import { photoRejection } from '../../lib/image'
import { removePhotoFiles, uploadPhoto } from '../../lib/photoUpload'
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
  const path = `${chatId}/${crypto.randomUUID()}.jpg`
  const storage = client().storage.from(buckets.chatAvatars)
  await uploadPhoto(storage, path, file)
  try {
    await setAvatarPath(chatId, path)
  } catch (updateError) {
    await removePhotoFiles(storage, path).catch(() => undefined)
    throw updateError
  }
  if (previousPath)
    await removePhotoFiles(storage, previousPath).catch(() => undefined)
  return path
}

export async function removeChatAvatar(
  chatId: string,
  path: string,
): Promise<void> {
  await setAvatarPath(chatId, null)
  await removePhotoFiles(
    client().storage.from(buckets.chatAvatars),
    path,
  ).catch(() => undefined)
}
