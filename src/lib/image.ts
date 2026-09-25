export type ResizedImage = { blob: Blob; width: number; height: number }

/** Scales an image down so its longest side is at most `maxSide`, re-encoding as JPEG (or keeping small GIF/WebP). */
export async function resizeImage(
  file: File,
  maxSide: number,
  quality = 0.85,
): Promise<ResizedImage> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Your browser could not process this image.')
    context.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    if (!blob) throw new Error('Your browser could not process this image.')
    return { blob, width, height }
  } finally {
    bitmap.close()
  }
}

export async function imageDimensions(
  file: Blob,
): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return size
  } catch {
    return null
  }
}

const MAX_PHOTO_SOURCE_BYTES = 8 * 1024 * 1024

/** Why a file cannot be used as a photo, or null when it can. */
export function photoRejection(file: File): string | null {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml')
    return 'Choose a photo (JPEG, PNG or WebP).'
  if (file.size > MAX_PHOTO_SOURCE_BYTES)
    return 'That image is larger than 8 MB.'
  return null
}
