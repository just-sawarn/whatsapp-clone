import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import {
  setup as startProxy,
  teardown as stopProxy,
  PROXY_PORT,
} from '../integration/globalSetup'

export const APP_PORT = Number(process.env.TEST_APP_PORT ?? 5199)
let vite: ViteDevServer | undefined

/**
 * Serves the real app with Vite, pointed at the local PostgREST proxy. `envDir` is an empty temp folder and the
 * variables are set explicitly, so the repository's .env (your real Supabase project) is never read.
 */
export async function setup() {
  await startProxy()
  // Vitest loads the developer's real .env into this process. The tests must not depend on it (it holds real
  // project keys and a production app URL), so every VITE_* value is dropped before the harness sets its own.
  for (const key of Object.keys(process.env))
    if (key.startsWith('VITE_')) delete process.env[key]
  process.env.VITE_SUPABASE_URL = `http://localhost:${PROXY_PORT}`
  process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key'
  vite = await createServer({
    envDir: mkdtempSync(join(tmpdir(), 'wa-e2e-env-')),
    server: { port: APP_PORT, strictPort: true },
    logLevel: 'error',
  })
  await vite.listen()
}

export async function teardown() {
  await vite?.close()
  await stopProxy()
}
