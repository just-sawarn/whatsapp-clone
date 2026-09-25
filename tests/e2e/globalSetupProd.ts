import { mkdtempSync, readFileSync, existsSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { build } from 'vite'
import {
  setup as startProxy,
  teardown as stopProxy,
  PROXY_PORT,
} from '../integration/globalSetup'

export const APP_PORT = Number(process.env.TEST_APP_PORT ?? 5199)
let server: Server | undefined

const types: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

/** The Content-Security-Policy that ships in public/.htaccess, with the Supabase host swapped for the test backend. */
function shippedCsp(): string {
  const htaccess = readFileSync(join(process.cwd(), 'public/.htaccess'), 'utf8')
  const policy = /Content-Security-Policy "([^"]+)"/.exec(htaccess)?.[1]
  if (!policy)
    throw new Error('No Content-Security-Policy found in public/.htaccess')
  return policy
    .replaceAll('https://*.supabase.co', `http://localhost:${PROXY_PORT}`)
    .replaceAll('wss://*.supabase.co', `ws://localhost:${PROXY_PORT}`)
}

/**
 * Builds the production bundle and serves it the way the Apache config would: SPA fallback plus the shipped
 * security headers. This is what proves the CSP does not break the app.
 */
export async function setup() {
  await startProxy()
  process.env.VITE_SUPABASE_URL = `http://localhost:${PROXY_PORT}`
  process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key'
  const outDir = mkdtempSync(join(tmpdir(), 'wa-e2e-dist-'))
  await build({
    envDir: mkdtempSync(join(tmpdir(), 'wa-e2e-env-')),
    build: { outDir, emptyOutDir: true },
    logLevel: 'error',
  })
  const csp = shippedCsp()

  server = createServer((request, response) => {
    const path = normalize(
      decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/'),
    ).replace(/^(\.\.[/\\])+/, '')
    const file = join(outDir, path)
    const target =
      existsSync(file) && statSync(file).isFile()
        ? file
        : join(outDir, 'index.html')
    response.writeHead(200, {
      'Content-Type': types[extname(target)] ?? 'application/octet-stream',
      'Content-Security-Policy': csp,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    })
    response.end(readFileSync(target))
  })
  await new Promise<void>((resolve) => server?.listen(APP_PORT, resolve))
}

export async function teardown() {
  await new Promise<void>((resolve) =>
    server ? server.close(() => resolve()) : resolve(),
  )
  await stopProxy()
}
