// Permanently deletes the calling user: their uploaded files, then the auth user, which cascades to the profile,
// contacts, statuses and every message they sent. Deploy with JWT verification ON.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'

function required(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

async function removeFolder(
  admin: SupabaseClient,
  bucket: string,
  folder: string,
): Promise<void> {
  for (;;) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(folder, { limit: 1000 })
    if (error || !data || data.length === 0) return
    const { error: removeError } = await admin.storage
      .from(bucket)
      .remove(data.map((file) => `${folder}/${file.name}`))
    if (removeError) return
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405)
  try {
    const admin = createClient(
      required('SUPABASE_URL'),
      required('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false } },
    )
    const token = (request.headers.get('Authorization') ?? '').replace(
      /^Bearer /i,
      '',
    )
    const { data, error } = await admin.auth.getUser(token)
    if (error || !data.user) return json({ error: 'Not signed in.' }, 401)
    const userId = data.user.id

    await removeFolder(admin, 'avatars', userId)
    await removeFolder(admin, 'status-media', userId)
    const { data: media } = await admin
      .from('messages')
      .select('media_path')
      .eq('sender_id', userId)
      .not('media_path', 'is', null)
    const paths = (media ?? []).map(
      (row: { media_path: string }) => row.media_path,
    )
    for (let index = 0; index < paths.length; index += 100) {
      await admin.storage
        .from('chat-media')
        .remove(paths.slice(index, index + 100))
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
    if (deleteError)
      return json({ error: 'Could not delete the account.' }, 500)
    return json({ deleted: true })
  } catch {
    return json({ error: 'Could not delete the account.' }, 500)
  }
})
