import { blobToDataUrl, resizeImage, type ResizedImage } from '../../lib/image'

/** Photos are shown at most 320 px wide in a bubble, so 640 covers a 2x screen. */
export const THUMB_SIDE = 640
const TINY_SIDE = 24

export type Thumbnails = { thumb: ResizedImage; tiny: string }

/** Where an attachment's thumbnail lives in storage, next to the (encrypted) original. */
export const thumbPathFor = (mediaPath: string) => `${mediaPath}.t`

/**
 * A bubble-sized copy of a photo plus a tiny blurred placeholder, or null when the photo is already about that
 * small (a thumbnail would save nothing) or cannot be decoded. Returning null is always safe: the bubble then uses
 * the original.
 */
export async function makeThumbnails(
  image: Blob,
  size: { width?: number; height?: number },
): Promise<Thumbnails | null> {
  if (
    size.width &&
    size.height &&
    Math.max(size.width, size.height) <= THUMB_SIDE
  )
    return null
  try {
    const thumb = await resizeImage(image, THUMB_SIDE, 0.72)
    const tiny = await resizeImage(thumb.blob, TINY_SIDE, 0.5)
    return { thumb, tiny: await blobToDataUrl(tiny.blob) }
  } catch {
    return null
  }
}
