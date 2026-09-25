// Fetches OpenGraph metadata for a URL so the client can attach a preview card to a message before encrypting it.
// Browsers cannot fetch arbitrary pages (CORS), so this must run server-side. It necessarily sees the URL being
// previewed, but never the surrounding message text. Deploy with JWT verification ON (the default).
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'
import { corsHeaders, json } from '../_shared/cors.ts'
import { rateLimited } from '../_shared/limit.ts'
import { parseOpenGraph } from '../_shared/og.ts'
import {
  UnsafeUrlError,
  assertPublicHttpUrl,
  isPrivateAddress,
} from '../_shared/ssrf.ts'

const MAX_HTML_BYTES = 512 * 1024
const MAX_IMAGE_BYTES = 90 * 1024
const MAX_REDIRECTS = 3
const TIMEOUT_MS = 5000
const imageTypes = /^image\/(jpeg|png|webp|gif)/i

function subjectOf(authorization: string | null): string | null {
  try {
    const token = authorization?.replace(/^Bearer /i, '') ?? ''
    const payload = JSON.parse(
      atob((token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/')),
    ) as { sub?: string }
    return payload.sub ?? null
  } catch {
    return null
  }
}

/** Resolves the hostname and refuses it if any address is internal, so a public name cannot point inward. */
async function assertResolvesPublic(host: string): Promise<void> {
  if (/^[\d.]+$/.test(host) || host.includes(':')) return // literals were already checked
  const addresses: string[] = []
  for (const type of ['A', 'AAAA'] as const) {
    try {
      addresses.push(...(await Deno.resolveDns(host, type)))
    } catch {
      // No records of this type.
    }
  }
  if (addresses.length === 0)
    throw new UnsafeUrlError('That address could not be found.')
  if (addresses.some(isPrivateAddress))
    throw new UnsafeUrlError('That address cannot be previewed.')
}

async function readLimited(
  response: Response,
  limit: number,
): Promise<Uint8Array | null> {
  const reader = response.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

/** Follows redirects by hand so every hop is validated again. */
async function fetchPublic(
  start: URL,
  accept: string,
): Promise<{ response: Response; url: URL }> {
  let url = start
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertResolvesPublic(url.hostname)
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LinkPreviewBot/1.0)',
        Accept: accept,
      },
    })
    const location = response.headers.get('location')
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel()
      url = assertPublicHttpUrl(new URL(location, url).toString())
      continue
    }
    return { response, url }
  }
  throw new UnsafeUrlError('Too many redirects.')
}

/** Inlines a small thumbnail so recipients never contact the linked site themselves. */
async function thumbnail(imageUrl: string): Promise<string | undefined> {
  try {
    const { response } = await fetchPublic(
      assertPublicHttpUrl(imageUrl),
      'image/*',
    )
    const type = response.headers.get('content-type') ?? ''
    if (!response.ok || !imageTypes.test(type)) return undefined
    const bytes = await readLimited(response, MAX_IMAGE_BYTES)
    return bytes
      ? `data:${type.split(';')[0]};base64,${encodeBase64(bytes)}`
      : undefined
  } catch {
    return undefined
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405)
  const userId = subjectOf(request.headers.get('Authorization'))
  if (!userId) return json({ error: 'Sign in to preview links.' }, 401)
  if (rateLimited(`link-preview:${userId}`, 30, 60_000))
    return json({ error: 'Too many previews. Try again in a minute.' }, 429)

  try {
    const body = (await request.json()) as { url?: unknown }
    if (typeof body.url !== 'string' || body.url.length > 2048)
      return json({ error: 'A url is required.' }, 400)
    const { response, url } = await fetchPublic(
      assertPublicHttpUrl(body.url),
      'text/html,application/xhtml+xml',
    )
    const type = response.headers.get('content-type') ?? ''
    if (!response.ok || !/text\/html|application\/xhtml/i.test(type))
      return json({ error: 'No preview available.' }, 422)
    const bytes = await readLimited(response, MAX_HTML_BYTES)
    if (!bytes)
      return json({ error: 'That page is too large to preview.' }, 422)

    const og = parseOpenGraph(new TextDecoder().decode(bytes), url.toString())
    if (!og.title && !og.description && !og.image)
      return json({ error: 'No preview available.' }, 422)
    const imageUrl = og.image ? await thumbnail(og.image) : undefined
    return json({
      url: url.toString(),
      title: og.title,
      description: og.description,
      imageUrl,
      domain: (og.siteName ?? url.hostname).replace(/^www\./, ''),
    })
  } catch (error) {
    if (error instanceof UnsafeUrlError)
      return json({ error: error.message }, 400)
    return json({ error: 'No preview available.' }, 422)
  }
})
