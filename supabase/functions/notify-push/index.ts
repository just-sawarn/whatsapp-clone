// Sends Web Push notifications for new messages and incoming calls. Trigger it from Database Webhooks on
// INSERT into public.messages and public.calls (see the README) and deploy with `--no-verify-jwt`; requests are
// authenticated by the shared WEBHOOK_SECRET header instead.
//
// Privacy: message text is end-to-end encrypted and this function cannot read it. Push bodies are deliberately
// generic ("New message"). The in-app realtime path shows the decrypted preview when the app is open.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { json } from '../_shared/cors.ts'

function required(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

type Hook = {
  type: string
  table: string
  record: {
    id?: string
    chat_id: string
    sender_id?: string
    caller_id?: string
    status?: string
  }
}
type Subscription = {
  id: string
  user_id: string
  endpoint: string
  keys: { p256dh: string; auth: string }
}

Deno.serve(async (request) => {
  try {
    if (request.headers.get('x-webhook-secret') !== required('WEBHOOK_SECRET'))
      return json({ error: 'Forbidden.' }, 403)
    const hook = (await request.json()) as Hook
    if (hook.type !== 'INSERT') return json({ sent: 0 })
    const record = hook.record
    const senderId = record.sender_id ?? record.caller_id
    if (!senderId || (hook.table === 'calls' && record.status !== 'ringing'))
      return json({ sent: 0 })

    webpush.setVapidDetails(
      required('VAPID_SUBJECT'),
      required('VAPID_PUBLIC_KEY'),
      required('VAPID_PRIVATE_KEY'),
    )
    const admin = createClient(
      required('SUPABASE_URL'),
      required('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false } },
    )

    const [{ data: sender }, { data: chat }, { data: members }] =
      await Promise.all([
        admin
          .from('profiles')
          .select('display_name')
          .eq('id', senderId)
          .maybeSingle(),
        admin
          .from('chats')
          .select('name, is_group')
          .eq('id', record.chat_id)
          .maybeSingle(),
        admin
          .from('chat_participants')
          .select('user_id, is_muted, muted_until')
          .eq('chat_id', record.chat_id),
      ])
    const now = Date.now()
    const candidates = (
      (members ?? []) as Array<{
        user_id: string
        is_muted: boolean
        muted_until: string | null
      }>
    )
      .filter((member) => member.user_id !== senderId)
      .filter(
        (member) =>
          hook.table === 'calls' ||
          !(
            member.is_muted &&
            (!member.muted_until ||
              new Date(member.muted_until).getTime() > now)
          ),
      )
      .map((member) => member.user_id)
    if (candidates.length === 0) return json({ sent: 0 })

    const { data: blocks } = await admin
      .from('contacts')
      .select('owner_id')
      .in('owner_id', candidates)
      .eq('contact_id', senderId)
      .eq('is_blocked', true)
    const blocked = new Set(
      ((blocks ?? []) as Array<{ owner_id: string }>).map(
        (row) => row.owner_id,
      ),
    )
    const recipients = candidates.filter((id) => !blocked.has(id))
    if (recipients.length === 0) return json({ sent: 0 })

    const { data: subscriptions } = await admin
      .from('push_subscriptions')
      .select('id, user_id, endpoint, keys')
      .in('user_id', recipients)
    const name =
      (sender as { display_name?: string } | null)?.display_name ?? 'Someone'
    const group = (chat as { name?: string; is_group?: boolean } | null)
      ?.is_group
      ? (chat as { name: string }).name
      : null
    const payload =
      hook.table === 'calls'
        ? {
            title: 'Incoming call',
            body: `${name} is calling`,
            tag: `call-${record.id}`,
            url: '/calls',
          }
        : {
            title: name,
            body: group ? `New message in ${group}` : 'New message',
            tag: `chat-${record.chat_id}`,
            url: `/chat/${record.chat_id}`,
          }

    let sent = 0
    const expired: string[] = []
    await Promise.all(
      ((subscriptions ?? []) as Subscription[]).map(async (subscription) => {
        try {
          await webpush.sendNotification(
            { endpoint: subscription.endpoint, keys: subscription.keys },
            JSON.stringify(payload),
            { TTL: 60 },
          )
          sent++
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) expired.push(subscription.id)
        }
      }),
    )
    if (expired.length > 0)
      await admin.from('push_subscriptions').delete().in('id', expired)
    return json({ sent, removed: expired.length })
  } catch {
    return json({ error: 'Push failed.' }, 500)
  }
})
