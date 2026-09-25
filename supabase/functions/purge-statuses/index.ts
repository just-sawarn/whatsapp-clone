// Hard-deletes statuses (and their photos) that expired more than an hour ago. Expired statuses are already
// hidden from everyone by row level security; this only reclaims storage. Schedule it hourly (see the README) and
// deploy with `--no-verify-jwt`: it authenticates callers itself with the service-role key.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { json } from '../_shared/cors.ts'

function required(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index++)
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return difference === 0
}

Deno.serve(async (request) => {
  try {
    const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY')
    if (
      !sameSecret(
        request.headers.get('Authorization') ?? '',
        `Bearer ${serviceKey}`,
      )
    )
      return json({ error: 'Forbidden.' }, 403)
    const admin = createClient(required('SUPABASE_URL'), serviceKey, {
      auth: { persistSession: false },
    })
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data, error } = await admin
      .from('statuses')
      .select('id, media_path')
      .lt('expires_at', cutoff)
      .limit(500)
    if (error) return json({ error: 'Query failed.' }, 500)
    const rows = (data ?? []) as Array<{
      id: string
      media_path: string | null
    }>
    const paths = rows.flatMap((row) =>
      row.media_path ? [row.media_path] : [],
    )
    if (paths.length > 0) await admin.storage.from('status-media').remove(paths)
    if (rows.length > 0)
      await admin
        .from('statuses')
        .delete()
        .in(
          'id',
          rows.map((row) => row.id),
        )
    return json({ deleted: rows.length, files: paths.length })
  } catch {
    return json({ error: 'Purge failed.' }, 500)
  }
})
