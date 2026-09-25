import { createServer, request, type Server } from 'node:http'

const REST_PORT = Number(process.env.TEST_REST_PORT ?? 54331)
export const PROXY_PORT = Number(process.env.TEST_PROXY_PORT ?? 54332)

let server: Server | undefined

/**
 * supabase-js talks to `<url>/rest/v1/...`, while a bare PostgREST serves from `/`. This tiny proxy strips the
 * prefix so the real client runs unmodified against the local stack.
 */
export async function setup() {
  server = createServer((incoming, outgoing) => {
    const path = (incoming.url ?? '/').replace(/^\/rest\/v1/, '') || '/'
    const upstream = request(
      {
        host: 'localhost',
        port: REST_PORT,
        path,
        method: incoming.method,
        headers: { ...incoming.headers, host: `localhost:${REST_PORT}` },
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers)
        response.pipe(outgoing)
      },
    )
    upstream.on('error', () => {
      outgoing.writeHead(502)
      outgoing.end()
    })
    incoming.pipe(upstream)
  })
  await new Promise<void>((resolve) => server?.listen(PROXY_PORT, resolve))
}

export async function teardown() {
  await new Promise<void>((resolve) =>
    server ? server.close(() => resolve()) : resolve(),
  )
}
