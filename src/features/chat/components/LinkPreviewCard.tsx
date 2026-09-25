import type { LinkPreview } from '../linkPreview'

/** WhatsApp-style card: thumbnail on top, bold title, clamped description, and the domain. */
export function LinkPreviewCard({
  preview,
  url,
}: {
  preview: LinkPreview
  url?: string
}) {
  const href = url ?? preview.url
  // Thumbnails are inlined by the server; only accept an inline image or an https one from an older message.
  const image =
    preview.imageUrl &&
    /^(data:image\/(jpeg|png|webp|gif);base64,|https:\/\/)/i.test(
      preview.imageUrl,
    )
      ? preview.imageUrl
      : undefined
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="mb-1 block overflow-hidden rounded-md border border-divider bg-black/5 text-left no-underline dark:bg-white/5"
    >
      {image && (
        <img
          src={image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="max-h-40 w-full object-cover"
        />
      )}
      <span className="block px-2.5 py-2">
        {preview.title && (
          <strong className="block truncate text-[13.5px] font-medium text-text">
            {preview.title}
          </strong>
        )}
        {preview.description && (
          <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-muted">
            {preview.description}
          </span>
        )}
        <span className="mt-1 block text-[11px] uppercase tracking-wide text-muted">
          {preview.domain}
        </span>
      </span>
    </a>
  )
}
