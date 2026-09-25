/** Minimal OpenGraph extraction with no DOM dependency, so it runs in Deno and in the app's unit tests. */

export type OpenGraph = {
  title?: string
  description?: string
  image?: string
  siteName?: string
}

const entities: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
}

export function decodeEntities(value: string): string {
  return value
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
      if (code.startsWith('#x'))
        return String.fromCodePoint(parseInt(code.slice(2), 16))
      if (code.startsWith('#') && /^#\d+$/.test(code))
        return entities[code] ?? String.fromCodePoint(Number(code.slice(1)))
      return entities[code.toLowerCase()] ?? match
    })
    .replace(/\s+/g, ' ')
    .trim()
}

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const match of tag.matchAll(
    /([a-zA-Z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g,
  )) {
    result[(match[1] ?? '').toLowerCase()] =
      match[2] ?? match[3] ?? match[4] ?? ''
  }
  return result
}

function absolute(value: string | undefined, base: string): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(decodeEntities(value), base)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

const clip = (value: string | undefined, max: number) =>
  value && value.length > max ? `${value.slice(0, max - 1)}…` : value

/** Reads title, description and image from the document head, preferring og: then twitter: then plain tags. */
export function parseOpenGraph(html: string, baseUrl: string): OpenGraph {
  const head = html.slice(
    0,
    html.search(/<\/head>/i) > 0 ? html.search(/<\/head>/i) : 200_000,
  )
  const meta = new Map<string, string>()
  for (const match of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(match[0])
    const key = (attrs.property ?? attrs.name ?? '').toLowerCase()
    if (key && attrs.content !== undefined && !meta.has(key))
      meta.set(key, attrs.content)
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1]
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = meta.get(key)
      if (value) return decodeEntities(value)
    }
    return undefined
  }
  return {
    title: clip(
      pick('og:title', 'twitter:title') ??
        (titleTag ? decodeEntities(titleTag) : undefined),
      150,
    ),
    description: clip(
      pick('og:description', 'twitter:description', 'description'),
      300,
    ),
    image: absolute(
      meta.get('og:image') ??
        meta.get('og:image:url') ??
        meta.get('twitter:image'),
      baseUrl,
    ),
    siteName: clip(pick('og:site_name'), 60),
  }
}
