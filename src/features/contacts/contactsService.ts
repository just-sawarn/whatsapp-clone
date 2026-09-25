import { supabase } from '../../lib/supabase'

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

export type Contact = {
  userId: string
  displayName: string
  username: string
  avatarPath: string | null
  about: string | null
  isBlocked: boolean
}

type ContactRow = {
  contact_id: string
  is_blocked: boolean
  profiles: {
    display_name: string
    username: string
    avatar_url: string | null
    about: string | null
  } | null
}

export async function loadContacts(userId: string): Promise<Contact[]> {
  const { data, error } = await client()
    .from('contacts')
    .select(
      'contact_id, is_blocked, profiles!contact_id(display_name, username, avatar_url, about)',
    )
    .eq('owner_id', userId)
  if (error) throw error
  return (data as unknown as ContactRow[])
    .flatMap((row) =>
      row.profiles
        ? [
            {
              userId: row.contact_id,
              displayName: row.profiles.display_name,
              username: row.profiles.username,
              avatarPath: row.profiles.avatar_url,
              about: row.profiles.about,
              isBlocked: row.is_blocked,
            },
          ]
        : [],
    )
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export async function addContact(
  ownerId: string,
  contactId: string,
): Promise<void> {
  const { error } = await client()
    .from('contacts')
    .upsert(
      { owner_id: ownerId, contact_id: contactId },
      { onConflict: 'owner_id,contact_id', ignoreDuplicates: true },
    )
  if (error) throw error
}

export async function setBlocked(
  ownerId: string,
  contactId: string,
  blocked: boolean,
): Promise<void> {
  const { error } = await client()
    .from('contacts')
    .upsert(
      { owner_id: ownerId, contact_id: contactId, is_blocked: blocked },
      { onConflict: 'owner_id,contact_id' },
    )
  if (error) throw error
}

export async function removeContact(
  ownerId: string,
  contactId: string,
): Promise<void> {
  const { error } = await client()
    .from('contacts')
    .delete()
    .eq('owner_id', ownerId)
    .eq('contact_id', contactId)
  if (error) throw error
}
