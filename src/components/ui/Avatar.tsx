import { avatarPalette } from '../../design/tokens'
import { buckets, useSignedUrl } from '../../lib/storageUrls'
import { cn } from '../../lib/cn'

type AvatarProps = {
  name: string
  /** Object path inside `bucket`. */
  path?: string | null
  /** Which private bucket the path is in: profile photos or group/community photos. */
  bucket?: string
  size?: number
  online?: boolean
  /** Communities use a rounded square to tell them apart from people and groups. */
  shape?: 'circle' | 'square'
  className?: string
}

function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
  return letters.slice(0, 2).toUpperCase() || '?'
}

function colorFor(name: string): string {
  let hash = 0
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) | 0
  return (
    avatarPalette[Math.abs(hash) % avatarPalette.length] ?? avatarPalette[0]
  )
}

export function Avatar({
  name,
  path,
  bucket = buckets.avatars,
  size = 48,
  online = false,
  shape = 'circle',
  className,
}: AvatarProps) {
  const rounding = shape === 'square' ? 'rounded-[28%]' : 'rounded-full'
  const { data: url } = useSignedUrl(bucket, path)
  return (
    <span
      className={cn('relative inline-block shrink-0', className)}
      style={{ width: size, height: size }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          className={cn('h-full w-full object-cover', rounding)}
          loading="lazy"
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'grid h-full w-full place-items-center font-medium text-white',
            rounding,
          )}
          style={{ backgroundColor: colorFor(name), fontSize: size * 0.38 }}
        >
          {initials(name)}
        </span>
      )}
      {online && (
        <span
          role="img"
          aria-label="Online"
          className="absolute bottom-0 right-0 block h-3 w-3 rounded-full border-2 border-surface bg-accent"
        />
      )}
    </span>
  )
}
