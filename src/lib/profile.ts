import { supabase } from './supabase'
import { getStoredPublicKey } from './crypto/keyStore'

export type Profile = {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  about: string | null
}

export async function getProfile(userId: string): Promise<Profile | null> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.from('profiles').select('id, username, display_name, avatar_url, about').eq('id', userId).maybeSingle()
  if (error) throw error
  return data as Profile | null
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
