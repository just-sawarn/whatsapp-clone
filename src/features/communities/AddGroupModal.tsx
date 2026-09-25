import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../../components/ui/Avatar'
import { AvatarPicker } from '../../components/ui/AvatarPicker'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { cn } from '../../lib/cn'
import { supabase } from '../../lib/supabase'
import { useCurrentUserId } from '../auth/useCurrentUser'
import { useChatOverview } from '../chat/useChats'
import type { Community } from './communityService'
import { useCommunityActions } from './useCommunityActions'

/** Chat ids of the groups I administer: only those can be linked to a community. */
async function loadAdminChatIds(userId: string): Promise<Set<string>> {
  if (!supabase) return new Set()
  const { data, error } = await supabase
    .from('chat_participants')
    .select('chat_id')
    .eq('user_id', userId)
    .eq('role', 'admin')
  if (error) throw error
  return new Set(
    (data as unknown as Array<{ chat_id: string }>).map((row) => row.chat_id),
  )
}

type Props = {
  community: Community
  open: boolean
  initialTab: 'existing' | 'new'
  onClose: () => void
}

export function AddGroupModal({ community, open, initialTab, onClose }: Props) {
  const userId = useCurrentUserId()
  const navigate = useNavigate()
  const actions = useCommunityActions()
  const { data: chats = [] } = useChatOverview()
  const { data: adminIds } = useQuery({
    queryKey: ['admin-chats', userId],
    queryFn: () => loadAdminChatIds(userId),
    enabled: open,
    staleTime: 10_000,
  })
  const [tab, setTab] = useState<'existing' | 'new'>(initialTab)
  const [name, setName] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  // The modal stays mounted, so pick the requested tab each time it opens.
  useEffect(() => {
    if (open) setTab(initialTab)
  }, [initialTab, open])

  const eligible = chats.filter(
    (chat) =>
      chat.isGroup &&
      !chat.isAnnouncement &&
      chat.communityId === null &&
      adminIds?.has(chat.id),
  )

  const add = async (chatId: string) => {
    setBusy(chatId)
    if (await actions.addGroup(community.id, chatId)) onClose()
    setBusy(null)
  }

  const create = async () => {
    setBusy('new')
    const chatId = await actions.createGroup(community.id, name, photo)
    setBusy(null)
    if (!chatId) return
    setName('')
    setPhoto(null)
    onClose()
    navigate(`/chat/${chatId}`)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a group"
      description="Community members can see and join every group here."
    >
      <div className="grid gap-4">
        <div
          role="tablist"
          className="grid grid-cols-2 gap-1 rounded-full bg-panel p-1"
        >
          {(['existing', 'new'] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              onClick={() => setTab(item)}
              className={cn(
                'rounded-full py-2 text-[14px]',
                tab === item ? 'bg-surface shadow-bubble' : 'text-muted',
              )}
            >
              {item === 'existing' ? 'Existing group' : 'New group'}
            </button>
          ))}
        </div>
        {tab === 'existing' ? (
          eligible.length === 0 ? (
            <p className="py-6 text-center text-[13.5px] leading-relaxed text-muted">
              You do not administer any groups that can be added. A group must
              not already be in a community, and you must be one of its admins.
            </p>
          ) : (
            <ul className="max-h-[44vh] overflow-y-auto">
              {eligible.map((chat) => (
                <li key={chat.id} className="flex items-center gap-3 py-2">
                  <Avatar
                    name={chat.name}
                    path={chat.avatarPath}
                    bucket={chat.avatarBucket}
                    size={40}
                  />
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-[15px] font-normal">
                      {chat.name}
                    </strong>
                    <span className="text-[13px] text-muted">
                      {chat.participantCount} participants
                    </span>
                  </span>
                  <Button
                    variant="secondary"
                    className="h-9 px-4 text-[13px]"
                    loading={busy === chat.id}
                    onClick={() => void add(chat.id)}
                  >
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void create()
            }}
          >
            <div className="flex justify-center">
              <AvatarPicker
                name={name}
                size={80}
                previewFile={photo}
                onPick={setPhoto}
                onRemove={() => setPhoto(null)}
              />
            </div>
            <Input
              label="Group name"
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              data-autofocus
            />
            <p className="text-[12.5px] leading-relaxed text-muted">
              You will be the group&rsquo;s admin. Community members can find it
              here and join it.
            </p>
            <Button
              type="submit"
              loading={busy === 'new'}
              disabled={name.trim().length === 0}
            >
              Create group
            </Button>
          </form>
        )}
      </div>
    </Modal>
  )
}
