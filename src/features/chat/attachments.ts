import { imageDimensions, resizeImage } from '../../lib/image'
import { MAX_ATTACHMENT_BYTES, type Attachment } from './messageService'
import { makeThumbnails } from './thumbnails'

const MAX_IMAGE_SIDE = 2048
const compressible = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function rejectionFor(file: File): string | null {
  if (file.size === 0) return `${file.name} is empty.`
  // Images are re-encoded to a smaller size below, so they get a more generous source limit.
  const limit = compressible.has(file.type)
    ? MAX_ATTACHMENT_BYTES * 2
    : MAX_ATTACHMENT_BYTES
  if (file.size > limit)
    return `${file.name} is larger than ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB.`
  return null
}

/** Downscales large photos and records dimensions so the bubble can reserve space before decryption. */
export async function prepareAttachment(file: File): Promise<Attachment> {
  const problem = rejectionFor(file)
  if (problem) throw new Error(problem)
  let attachment: Attachment
  if (compressible.has(file.type)) {
    const { blob, width, height } = await resizeImage(file, MAX_IMAGE_SIDE)
    const previews = await makeThumbnails(blob, { width, height })
    attachment = {
      blob,
      name: file.name.replace(/\.\w+$/, '') + '.jpg',
      mime: 'image/jpeg',
      width,
      height,
      thumb: previews?.thumb,
      tiny: previews?.tiny,
    }
  } else if (file.type === 'image/gif') {
    const size = await imageDimensions(file)
    attachment = {
      blob: file,
      name: file.name,
      mime: file.type,
      width: size?.width,
      height: size?.height,
    }
  } else {
    attachment = {
      blob: file,
      name: file.name,
      mime: file.type || 'application/octet-stream',
    }
  }
  if (attachment.blob.size > MAX_ATTACHMENT_BYTES)
    throw new Error(
      `${file.name} is larger than ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB.`,
    )
  return attachment
}
