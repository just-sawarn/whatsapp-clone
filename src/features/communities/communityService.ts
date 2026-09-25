import { isMissingFunctionError, MIGRATIONS_HINT } from '../../lib/errors'
import { supabase } from '../../lib/supabase'

function client() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

/** Calls an RPC and turns "function does not exist" into the actionable migrations hint. */
async function rpc<T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client().rpc(name, args)
  if (error)
    throw isMissingFunctionError(error) ? new Error(MIGRATIONS_HINT) : error
  return data as T
}

export type Community = {
  id: string
  name: string
  description: string
  announcementChatId: string
  memberCount: number
  groupCount: number
  myRole: 'admin' | 'member'
  createdAt: string
  /** Photo path in the chat-avatars bucket (the announcements group's photo). */
  avatarPath: string | null
}

export type CommunityGroup = {
  chatId: string
  name: string
  memberCount: number
  isMember: boolean
  myRole: 'admin' | 'member' | null
  addedAt: string
  avatarPath: string | null
}

export type InvitePreview = {
  communityId: string
  name: string
  description: string
  memberCount: number
  groupCount: number
  alreadyMember: boolean
}

type CommunityRow = {
  community_id: string
  name: string
  description: string
  announcement_chat_id: string
  member_count: number
  group_count: number
  my_role: 'admin' | 'member'
  created_at: string
  avatar_url: string | null
}

export async function loadCommunities(): Promise<Community[]> {
  const rows = await rpc<CommunityRow[]>('community_overview')
  return rows.map((row) => ({
    id: row.community_id,
    name: row.name,
    description: row.description,
    announcementChatId: row.announcement_chat_id,
    memberCount: Number(row.member_count),
    groupCount: Number(row.group_count),
    myRole: row.my_role,
    createdAt: row.created_at,
    avatarPath: row.avatar_url,
  }))
}

type GroupRow = {
  chat_id: string
  name: string
  member_count: number
  is_member: boolean
  my_role: 'admin' | 'member' | null
  added_at: string
  avatar_url: string | null
}

export async function loadCommunityGroups(
  communityId: string,
): Promise<CommunityGroup[]> {
  const rows = await rpc<GroupRow[]>('community_groups_overview', {
    target_community_id: communityId,
  })
  return rows.map((row) => ({
    chatId: row.chat_id,
    name: row.name,
    memberCount: Number(row.member_count),
    isMember: row.is_member,
    myRole: row.my_role,
    addedAt: row.added_at,
    avatarPath: row.avatar_url,
  }))
}

export const DESCRIPTION_LIMIT = 500

export function createCommunity(
  name: string,
  description: string,
  memberIds: string[],
): Promise<string> {
  return rpc<string>('create_community', {
    community_name: name,
    community_description: description,
    member_ids: memberIds,
  })
}

export async function updateCommunity(
  communityId: string,
  name: string,
  description: string,
): Promise<void> {
  await rpc('update_community', {
    target_community_id: communityId,
    new_name: name,
    new_description: description,
  })
}

export async function deactivateCommunity(communityId: string): Promise<void> {
  await rpc('deactivate_community', { target_community_id: communityId })
}

export async function addGroupToCommunity(
  communityId: string,
  chatId: string,
): Promise<void> {
  await rpc('add_group_to_community', {
    target_community_id: communityId,
    target_chat_id: chatId,
  })
}

export async function removeGroupFromCommunity(
  communityId: string,
  chatId: string,
): Promise<void> {
  await rpc('remove_group_from_community', {
    target_community_id: communityId,
    target_chat_id: chatId,
  })
}

export function createGroupInCommunity(
  communityId: string,
  name: string,
): Promise<string> {
  return rpc<string>('create_group_in_community', {
    target_community_id: communityId,
    group_name: name,
  })
}

export async function joinCommunityGroup(chatId: string): Promise<void> {
  await rpc('join_community_group', { target_chat_id: chatId })
}

export function getInviteCode(communityId: string): Promise<string> {
  return rpc<string>('community_invite_code', {
    target_community_id: communityId,
  })
}

export function resetInviteCode(communityId: string): Promise<string> {
  return rpc<string>('reset_community_invite', {
    target_community_id: communityId,
  })
}

type PreviewRow = {
  community_id: string
  name: string
  description: string
  member_count: number
  group_count: number
  already_member: boolean
}

/** Null when the code does not exist (or has been reset). */
export async function previewInvite(
  code: string,
): Promise<InvitePreview | null> {
  const [row] = await rpc<PreviewRow[]>('preview_community_invite', {
    invite_code: code,
  })
  return row
    ? {
        communityId: row.community_id,
        name: row.name,
        description: row.description,
        memberCount: Number(row.member_count),
        groupCount: Number(row.group_count),
        alreadyMember: row.already_member,
      }
    : null
}

export function joinByInvite(code: string): Promise<string> {
  return rpc<string>('join_community_by_code', { invite_code: code })
}

const inviteCodePattern = /^[a-z0-9_-]{16,64}$/i

/** Accepts a full invite link or a bare code, and returns the code (or null when it is neither). */
export function parseInviteCode(input: string): string | null {
  const trimmed = input.trim()
  const fromLink = /\/communities\/join\/([^/?#\s]+)/i.exec(trimmed)?.[1]
  const candidate = fromLink ?? trimmed
  return inviteCodePattern.test(candidate) ? candidate : null
}

export function inviteUrl(
  code: string,
  origin = window.location.origin,
): string {
  return `${origin}/communities/join/${code}`
}
