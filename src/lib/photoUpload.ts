import type { SupabaseClient } from '@supabase/supabase-js'
import { smallVariantPath } from './bucketImage'
import { resizeImage } from './image'

type Bucket = ReturnType<SupabaseClient['storage']['from']>

const FULL_SIDE = 512
const SMALL_SIDE = 128

/**
 * Uploads a profile, group or community photo at `path` plus a 128 px copy beside it (see `smallVariantPath`) for
 * lists and headers. The small copy is best effort: without it the full photo is used.
 */
export async function uploadPhoto(
  storage: Bucket,
  path: string,
  file: Blob,
): Promise<void> {
  const { blob } = await resizeImage(file, FULL_SIDE, 0.88)
  const { error } = await storage.upload(path, blob, {
    contentType: 'image/jpeg',
    cacheControl: '3600',
  })
  if (error) throw error
  try {
    const small = await resizeImage(file, SMALL_SIDE, 0.8)
    await storage.upload(smallVariantPath(path), small.blob, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
    })
  } catch {
    // Lists fall back to the full photo.
  }
}

/** Removes a photo and its small copy. */
export async function removePhotoFiles(
  storage: Bucket,
  path: string,
): Promise<void> {
  await storage.remove([path, smallVariantPath(path)])
}
