import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * A minimal in-memory stand-in for Supabase Storage, so tests can exercise uploads, signed URLs and downloads
 * without the real service. It speaks the same HTTP protocol as storage-js. It does NOT enforce access policies
 * (the SQL tests cover those) and it forgets everything when the test run ends.
 */
type StoredObject = { contentType: string; bytes: Buffer }

const objects = new Map<string, StoredObject>()
const tokens = new Map<string, string>()

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, x-client-info, x-upsert, cache-control',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

function send(
  response: ServerResponse,
  status: number,
  body: unknown,
  contentType = 'application/json',
) {
  const payload = Buffer.isBuffer(body)
    ? body
    : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
  response.writeHead(status, {
    ...cors,
    'Content-Type': contentType,
    'Content-Length': payload.length,
  })
  response.end(payload)
}

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks)))
    request.on('error', reject)
  })
}

/** Pulls the file out of a multipart/form-data body (the form field storage-js uses for the file has an empty name). */
function fileFromMultipart(
  body: Buffer,
  contentType: string,
): StoredObject | null {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType)
  const marker = Buffer.from(`--${boundary?.[1] ?? boundary?.[2] ?? ''}`)
  let start = body.indexOf(marker)
  while (start !== -1) {
    const next = body.indexOf(marker, start + marker.length)
    if (next === -1) break
    const part = body.subarray(start + marker.length, next)
    const split = part.indexOf('\r\n\r\n')
    const headers = part.subarray(0, split).toString()
    if (/filename=/i.test(headers) || /name=""/.test(headers)) {
      const type =
        /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1] ??
        'application/octet-stream'
      return {
        contentType: type.trim(),
        bytes: Buffer.from(part.subarray(split + 4, part.length - 2)),
      }
    }
    start = next
  }
  return null
}

const keyOf = (bucket: string, path: string) => `${bucket}/${path}`

/** Returns true when the request was for Storage (or the debug endpoint) and has been answered. */
export async function handleStorage(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const isStorage = url.pathname.startsWith('/storage/v1/')
  if (!isStorage && url.pathname !== '/__test/storage') return false

  if (request.method === 'OPTIONS') {
    response.writeHead(204, cors)
    response.end()
    return true
  }

  if (url.pathname === '/__test/storage') {
    send(
      response,
      200,
      Array.from(objects, ([key, value]) => ({
        key,
        size: value.bytes.length,
        contentType: value.contentType,
        head: value.bytes.subarray(0, 4).toString('hex'),
      })),
    )
    return true
  }

  const parts = url.pathname
    .replace('/storage/v1/object/', '')
    .split('/')
    .map(decodeURIComponent)
  const method = request.method ?? 'GET'

  // Signed URL for a later GET (the client draws avatars and status photos from these).
  if (method === 'POST' && parts[0] === 'sign') {
    const key = keyOf(parts[1] ?? '', parts.slice(2).join('/'))
    if (!objects.has(key))
      return (
        send(response, 404, {
          statusCode: '404',
          error: 'not_found',
          message: 'Object not found',
        }),
        true
      )
    await readBody(request)
    const token = randomUUID()
    tokens.set(token, key)
    send(response, 200, {
      signedURL: `/object/sign/${parts.slice(1).map(encodeURIComponent).join('/')}?token=${token}`,
    })
    return true
  }

  if (method === 'GET' && parts[0] === 'sign') {
    const key = tokens.get(url.searchParams.get('token') ?? '')
    const stored = key ? objects.get(key) : undefined
    if (!stored)
      return (send(response, 400, { message: 'Invalid token' }), true)
    send(response, 200, stored.bytes, stored.contentType)
    return true
  }

  if (method === 'GET') {
    const rest =
      parts[0] === 'authenticated' || parts[0] === 'public'
        ? parts.slice(1)
        : parts
    const stored = objects.get(keyOf(rest[0] ?? '', rest.slice(1).join('/')))
    if (!stored)
      return (
        send(response, 404, {
          statusCode: '404',
          error: 'not_found',
          message: 'Object not found',
        }),
        true
      )
    send(response, 200, stored.bytes, stored.contentType)
    return true
  }

  if ((method === 'POST' || method === 'PUT') && parts.length >= 2) {
    const key = keyOf(parts[0] ?? '', parts.slice(1).join('/'))
    const body = await readBody(request)
    const type = request.headers['content-type'] ?? 'application/octet-stream'
    const stored = type.startsWith('multipart/form-data')
      ? fileFromMultipart(body, type)
      : { contentType: type, bytes: body }
    if (!stored)
      return (send(response, 400, { message: 'No file in the upload' }), true)
    if (objects.has(key) && request.headers['x-upsert'] !== 'true') {
      send(response, 400, {
        statusCode: '409',
        error: 'Duplicate',
        message: 'The resource already exists',
      })
      return true
    }
    objects.set(key, stored)
    send(response, 200, { Id: randomUUID(), Key: key })
    return true
  }

  if (method === 'DELETE' && parts.length === 1) {
    const { prefixes } = JSON.parse(
      (await readBody(request)).toString() || '{"prefixes":[]}',
    ) as { prefixes: string[] }
    const removed = prefixes.filter((path) =>
      objects.delete(keyOf(parts[0] ?? '', path)),
    )
    send(
      response,
      200,
      removed.map((name) => ({ name })),
    )
    return true
  }

  send(response, 404, {
    message: 'Unsupported storage call in the test stand-in',
  })
  return true
}

export function storageSnapshot() {
  return Array.from(objects, ([key, value]) => ({
    key,
    size: value.bytes.length,
    contentType: value.contentType,
  }))
}
