import { supabase } from './supabase'
import { removePhotoFiles, uploadPhoto } from './photoUpload'
import { buckets } from './storageUrls'
import { getStoredPublicKey } from './crypto/keyStore'

export type PhotoVisibility = 'everyone' | 'contacts' | 'nobody'
export type Discoverability = 'username' | 'username_and_email' | 'nobody'

export type Profile = {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  about: string | null
  show_last_seen: boolean
  show_read_receipts: boolean
  show_profile_photo: PhotoVisibility
  discoverable_by: Discoverability
}

export type ProfileSearchResult = {
  id: string
  username: string
  displayName: string
  about: string | null
  avatarPath: string | null
  isContact: boolean
}

const profileColumns =
  'id, username, display_name, avatar_url, about, show_last_seen, show_read_receipts, show_profile_photo, discoverable_by'
const MAX_AVATAR_SOURCE_BYTES = 8 * 1024 * 1024

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await client()
    .from('profiles')
    .select(profileColumns)
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data as Profile | null
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  if (!supabase) return false
  const { data, error } = await supabase.rpc('username_available', {
    candidate: username,
  })
  if (error) throw error
  return data === true
}

export async function createProfile(profile: {
  id: string
  username: string
  displayName: string
  about: string
  avatarPath?: string | null
}): Promise<void> {
  const publicKey = await getStoredPublicKey(profile.id)
  if (!publicKey)
    throw new Error(
      'Your local encryption identity is missing. Sign out and sign in again to initialize it.',
    )
  const { error } = await client()
    .from('profiles')
    .insert({
      id: profile.id,
      username: profile.username,
      display_name: profile.displayName,
      about: profile.about,
      avatar_url: profile.avatarPath ?? null,
      public_key: JSON.stringify(publicKey),
    })
  if (error) throw error
}

export type ProfilePatch = Partial<
  Pick<
    Profile,
    | 'display_name'
    | 'about'
    | 'username'
    | 'show_last_seen'
    | 'show_read_receipts'
    | 'show_profile_photo'
    | 'discoverable_by'
  >
>

export async function updateProfile(
  userId: string,
  patch: ProfilePatch,
): Promise<void> {
  const { error } = await client()
    .from('profiles')
    .update(patch)
    .eq('id', userId)
  if (error) throw error
}

/** Publishes a (re)generated identity key so other people encrypt to it. */
export async function publishPublicKey(
  userId: string,
  publicKey: JsonWebKey,
): Promise<void> {
  const { error } = await client()
    .from('profiles')
    .update({ public_key: JSON.stringify(publicKey) })
    .eq('id', userId)
  if (error) throw error
}

/** Older builds stored a non-JSON placeholder key; bring the profile in line with the key on this device. */
export async function repairStoredPublicKey(userId: string): Promise<void> {
  const publicKey = await getStoredPublicKey(userId)
  if (!publicKey) return
  const { data, error } = await client()
    .from('profiles')
    .select('public_key')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data?.public_key || data.public_key.trim().startsWith('{')) return
  await publishPublicKey(userId, publicKey)
}

export async function findProfile(
  query: string,
): Promise<ProfileSearchResult[]> {
  const { data, error } = await client().rpc('find_profile', { search: query })
  if (error) throw error
  const rows = (data ?? []) as Array<{
    id: string
    username: string
    display_name: string
    about: string | null
    avatar_url: string | null
    is_contact: boolean
  }>
  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    about: row.about,
    avatarPath: row.avatar_url,
    isContact: row.is_contact,
  }))
}

/** Uploads a resized avatar to `avatars/{user}/…` and points the profile at it. Returns the new object path. */
export async function uploadAvatar(
  userId: string,
  file: File,
  previousPath: string | null,
): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
  if (file.size > MAX_AVATAR_SOURCE_BYTES)
    throw new Error('That image is larger than 8 MB.')
  const path = `${userId}/${crypto.randomUUID()}.jpg`
  const storage = client().storage.from(buckets.avatars)
  await uploadPhoto(storage, path, file)
  await updateAvatarPath(userId, path)
  if (previousPath) await removePhotoFiles(storage, previousPath)
  return path
}

async function updateAvatarPath(
  userId: string,
  path: string | null,
): Promise<void> {
  const { error } = await client()
    .from('profiles')
    .update({ avatar_url: path })
    .eq('id', userId)
  if (error) throw error
}

export async function removeAvatar(
  userId: string,
  path: string,
): Promise<void> {
  await updateAvatarPath(userId, null)
  await removePhotoFiles(client().storage.from(buckets.avatars), path)
}

/** Best effort: the tab may be closing, so failures are ignored. */
export function touchLastSeen(userId: string): void {
  if (!supabase) return
  void supabase
    .from('profiles')
    .update({ last_seen: new Date().toISOString() })
    .eq('id', userId)
    .then(() => undefined)
}
