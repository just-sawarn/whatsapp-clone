import {
  createServer,
  request,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { handleStorage } from './fakeStorage'

const REST_PORT = Number(process.env.TEST_REST_PORT ?? 54331)
export const PROXY_PORT = Number(process.env.TEST_PROXY_PORT ?? 54332)

let server: Server | undefined

/** Passes a request to PostgREST, which serves from `/` rather than supabase-js's `/rest/v1/` prefix. */
function forward(incoming: IncomingMessage, outgoing: ServerResponse) {
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
}

/**
 * supabase-js talks to `<url>/rest/v1/...` for data and `<url>/storage/v1/...` for files. This proxy strips the
 * REST prefix so the real client runs unmodified against a bare PostgREST, and answers Storage calls itself with
 * a small in-memory stand-in (the local stack has no Storage service).
 */
export async function setup() {
  server = createServer((incoming, outgoing) => {
    void handleStorage(incoming, outgoing).then((handled) => {
      if (!handled) forward(incoming, outgoing)
    })
  })
  await new Promise<void>((resolve) => server?.listen(PROXY_PORT, resolve))
}

export async function teardown() {
  await new Promise<void>((resolve) =>
    server ? server.close(() => resolve()) : resolve(),
  )
}
