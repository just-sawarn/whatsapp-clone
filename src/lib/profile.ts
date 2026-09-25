import { supabase } from './supabase'
import { getStoredPublicKey } from './crypto/keyStore'

export type Profile = {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  about: string | null
  show_last_seen: boolean
  show_read_receipts: boolean
  discoverable_by: 'username' | 'username_and_email' | 'nobody'
}

export async function getProfile(userId: string): Promise<Profile | null> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.from('profiles').select('id, username, display_name, avatar_url, about, show_last_seen, show_read_receipts, discoverable_by').eq('id', userId).maybeSingle()
  if (error) throw error
  return data as Profile | null
}

export async function repairStoredPublicKey(userId: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const publicKey = await getStoredPublicKey(userId)
  if (!publicKey) return
  const { data, error } = await supabase.from('profiles').select('public_key').eq('id', userId).maybeSingle()
  if (error) throw error
  if (!data?.public_key || data.public_key.trim().startsWith('{')) return
  const { error: updateError } = await supabase.from('profiles').update({ public_key: JSON.stringify(publicKey) }).eq('id', userId)
  if (updateError) throw updateError
}

export async function updateProfileSettings(userId: string, settings: { display_name: string; about: string; show_last_seen: boolean; show_read_receipts: boolean; discoverable_by: Profile['discoverable_by'] }): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.from('profiles').update(settings).eq('id', userId)
  if (error) throw error
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  if (!supabase) return false
  const { data, error } = await supabase.from('profiles').select('id').eq('username', username).maybeSingle()
  if (error) throw error
  return data === null
}

export async function createProfile(profile: { id: string; username: string; displayName: string; about: string }): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const publicKey = await getStoredPublicKey(profile.id)
  if (!publicKey) throw new Error('Your local encryption identity is missing. Sign out and sign in again to initialize it.')
  const { error } = await supabase.from('profiles').insert({
    id: profile.id,
    username: profile.username,
    display_name: profile.displayName,
    about: profile.about,
    public_key: JSON.stringify(publicKey),
  })
  if (error) throw error
}
