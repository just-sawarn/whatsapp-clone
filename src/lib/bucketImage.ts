import { useQuery, type QueryClient } from '@tanstack/react-query'
import { readStored, writeStored } from './mediaStore'
import { useObjectUrl } from './objectUrls'
import { signedUrl } from './signedUrls'
import { supabase } from './supabase'

/** Small copies (see `smallVariantPath`) are shown at or below this many CSS pixels. */
export const SMALL_IMAGE_MAX_SIZE = 64

/** Where the small copy of an uploaded picture lives: `a/b.jpg` becomes `a/b.s.jpg`. */
export function smallVariantPath(path: string): string {
  return path.replace(/(\.\w+)?$/, (extension) => `.s${extension || '.jpg'}`)
}

async function fetchStored(bucket: string, path: string): Promise<Blob> {
  const key = `${bucket}/${path}`
  const stored = await readStored('images', key)
  if (stored) return stored
  const response = await fetch(await signedUrl(bucket, path))
  if (!response.ok)
    throw new Error(`Could not load the image (${response.status}).`)
  const blob = await response.blob()
  await writeStored('images', key, blob)
  return blob
}

/**
 * A picture from a private bucket, from this device's store when it has it and from Storage when not. With `small`
 * the 128 px copy is used (a chat list of forty 48 px avatars would otherwise download forty 512 px photos); pictures
 * uploaded before small copies existed fall back to the full one.
 */
async function loadImage(
  bucket: string,
  path: string,
  small: boolean,
): Promise<Blob> {
  if (!small) return fetchStored(bucket, path)
  try {
    return await fetchStored(bucket, smallVariantPath(path))
  } catch {
    const full = await fetchStored(bucket, path)
    // Remember the answer so the missing small copy is not looked for on every visit.
    await writeStored('images', `${bucket}/${smallVariantPath(path)}`, full)
    return full
  }
}

const imageQuery = (bucket: string, path: string, small: boolean) => ({
  queryKey: ['bucket-image', bucket, path, small] as const,
  staleTime: Infinity,
  gcTime: 10 * 60 * 1000,
  retry: 1,
  queryFn: () => loadImage(bucket, path, small),
})

export function useBucketImage(
  bucket: string,
  path: string | null | undefined,
  options: { small?: boolean } = {},
) {
  const query = useQuery({
    ...imageQuery(bucket, path ?? '', options.small ?? false),
    enabled: Boolean(path && supabase),
  })
  return {
    url: useObjectUrl(query.data),
    isPending: query.isPending && Boolean(path),
    error: query.error,
  }
}

/** Starts fetching a picture the user is about to see (the next status), so it is ready when they get there. */
export function prefetchBucketImage(
  queryClient: QueryClient,
  bucket: string,
  path: string | null | undefined,
): void {
  if (path && supabase)
    void queryClient.prefetchQuery(imageQuery(bucket, path, false))
}
