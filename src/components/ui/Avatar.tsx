import { avatarPalette } from '../../design/tokens'
import { buckets, useSignedUrl } from '../../lib/storageUrls'
import { cn } from '../../lib/cn'

type AvatarProps = {
  name: string
  /** Object path inside the private `avatars` bucket. */
  path?: string | null
  size?: number
  online?: boolean
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
  size = 48,
  online = false,
  className,
}: AvatarProps) {
  const { data: url } = useSignedUrl(buckets.avatars, path)
  return (
    <span
      className={cn('relative inline-block shrink-0', className)}
      style={{ width: size, height: size }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          className="h-full w-full rounded-full object-cover"
          loading="lazy"
        />
      ) : (
        <span
          aria-hidden="true"
          className="grid h-full w-full place-items-center rounded-full font-medium text-white"
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
