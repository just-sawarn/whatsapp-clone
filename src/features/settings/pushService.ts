import { subscribeToPush, unsubscribeFromPush } from '../../lib/notifications'
import { supabase } from '../../lib/supabase'

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

/** Subscribes this browser to Web Push and stores the subscription so the server can reach it. */
export async function enablePush(userId: string): Promise<boolean> {
  const subscription = await subscribeToPush()
  if (!subscription?.endpoint || !subscription.keys) return false
  const { error } = await client().from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
    },
    { onConflict: 'user_id,endpoint' },
  )
  if (error) throw error
  return true
}

export async function disablePush(userId: string): Promise<void> {
  const endpoint = await unsubscribeFromPush()
  if (!endpoint) return
  const { error } = await client()
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
  if (error) throw error
}
