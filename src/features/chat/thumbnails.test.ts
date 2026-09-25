import { describe, expect, it } from 'vitest'
import { THUMB_SIDE, makeThumbnails, thumbPathFor } from './thumbnails'

describe('thumbnails', () => {
  it('stores the thumbnail beside the original', () => {
    expect(thumbPathFor('chat/user/file')).toBe('chat/user/file.t')
  })

  it('skips photos that are already about thumbnail size', async () => {
    const image = new Blob(['x'])
    expect(
      await makeThumbnails(image, { width: THUMB_SIDE, height: 300 }),
    ).toBeNull()
    expect(await makeThumbnails(image, { width: 200, height: 120 })).toBeNull()
  })

  it('returns null, not an error, when a large photo cannot be decoded', async () => {
    // Not an image, and no createImageBitmap here: the send must carry on with the original.
    expect(
      await makeThumbnails(new Blob(['x']), { width: 2000, height: 1500 }),
    ).toBeNull()
  })
})
