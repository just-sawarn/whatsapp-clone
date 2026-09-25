import type { MessagePayloadV1 } from '../../lib/crypto/crypto'
import { supabase } from '../../lib/supabase'

export type LinkPreview = NonNullable<MessagePayloadV1['linkPreview']>

const urlPattern = /\bhttps?:\/\/[^\s<>"']+/i
const trailingPunctuation = /[.,;:!?)\]}]+$/

/** First http(s) URL in a piece of text, without trailing sentence punctuation. */
export function firstUrl(text: string): string | null {
  const match = urlPattern.exec(text)
  if (!match) return null
  const cleaned = match[0].replace(trailingPunctuation, '')
  try {
    const url = new URL(cleaned)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : null
  } catch {
    return null
  }
}

export type TextSegment = { text: string; href?: string }

/** Splits text into plain and link segments so links can render as anchors. */
export function segmentText(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let rest = text
  for (;;) {
    const match = urlPattern.exec(rest)
    if (!match) break
    const cleaned = match[0].replace(trailingPunctuation, '')
    let href: string | undefined
    try {
      const url = new URL(cleaned)
      if (url.protocol === 'http:' || url.protocol === 'https:')
        href = url.toString()
    } catch {
      href = undefined
    }
    if (match.index > 0) segments.push({ text: rest.slice(0, match.index) })
    segments.push(href ? { text: cleaned, href } : { text: cleaned })
    rest = rest.slice(match.index + cleaned.length)
  }
  if (rest) segments.push({ text: rest })
  return segments
}

/**
 * Asks the `link-preview` Edge Function for OpenGraph data. The function must see the URL (browsers cannot
 * fetch arbitrary pages because of CORS), but never the surrounding message. Any failure yields no preview.
 */
export async function fetchLinkPreview(
  url: string,
): Promise<LinkPreview | null> {
  if (!supabase) return null
  try {
    const { data, error } = await supabase.functions.invoke<LinkPreview>(
      'link-preview',
      { body: { url } },
    )
    if (error || !data?.domain) return null
    return data
  } catch {
    return null
  }
}
