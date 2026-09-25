import { createHmac } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import pg from 'pg'

const SECRET =
  process.env.TEST_JWT_SECRET ?? 'test-secret-test-secret-test-secret-1234'
const PROXY_URL = `http://localhost:${process.env.TEST_PROXY_PORT ?? 54332}`

const base64url = (value: Buffer | string) =>
  Buffer.from(value).toString('base64url')

export function signJwt(sub: string): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({
      sub,
      role: 'authenticated',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  )
  const signature = createHmac('sha256', SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url')
  return `${header}.${payload}.${signature}`
}

export type TestUser = {
  id: string
  name: string
  email: string
  client: SupabaseClient
}

let current: SupabaseClient | null = null

/** The client the app code under test will use; switch it with actAs(). */
export function currentClient(): SupabaseClient {
  if (!current) throw new Error('Call actAs(user) before using a service.')
  return current
}

export function actAs(user: TestUser): void {
  current = user.client
}

const pool = new pg.Pool({
  host: 'localhost',
  port: Number(process.env.TEST_DB_PORT ?? 54330),
  user: 'postgres',
  password: 'test',
  database: 'postgres',
})

/** Creates the auth.users row (the client cannot) and a client that sends this user's JWT. */
export async function createUser(name: string): Promise<TestUser> {
  const email = `${name}-${Date.now()}@example.com`
  const { rows } = await pool.query<{ id: string }>(
    'insert into auth.users (email) values ($1) returning id',
    [email],
  )
  const id = rows[0]?.id ?? ''
  const client = createClient(PROXY_URL, 'test-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${signJwt(id)}` } },
  })
  return { id, name, email, client }
}

/** Runs SQL as the superuser, for fixtures the API deliberately cannot create. */
export async function sql(text: string, params: unknown[] = []) {
  return pool.query(text, params)
}

export async function closePool() {
  await pool.end()
}
