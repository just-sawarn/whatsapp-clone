import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, BellOff, LockKeyhole, ShieldCheck, Trash2, X } from 'lucide-react'
import { Avatar } from '../../../components/ui/Avatar'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import { IconButton } from '../../../components/ui/IconButton'
import { useToast } from '../../../components/ui/ToastContext'
import { errorMessage } from '../../../lib/errors'
import { keys } from '../../../lib/queryKeys'
import { supabase } from '../../../lib/supabase'
import { useCurrentUserId } from '../../auth/useCurrentUser'
import { setBlocked } from '../../contacts/contactsService'
import { useContacts } from '../../contacts/useContacts'
import { useChatActions } from '../useChatActions'
import type { ChatSummary } from '../types'
import { GroupMembers } from './GroupMembers'
import { VerifyEncryptionModal } from './VerifyEncryptionModal'

async function loadAbout(peerId: string): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from('profiles')
    .select('about')
    .eq('id', peerId)
    .maybeSingle()
  return (data?.about as string | null | undefined) ?? null
}

/** Right-hand drawer: contact details for a direct chat, members and admin tools for a group. */
export function ChatInfoPanel({
  chat,
  onClose,
}: {
  chat: ChatSummary
  onClose: () => void
}) {
  const userId = useCurrentUserId()
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const actions = useChatActions()
  const { data: contacts = [] } = useContacts()
  const [verifying, setVerifying] = useState(false)
  const peerId = chat.peerId
  const { data: about } = useQuery({
    queryKey: ['peer-about', peerId],
    queryFn: () => loadAbout(peerId ?? ''),
    enabled: Boolean(peerId),
  })
  const contact = contacts.find((candidate) => candidate.userId === peerId)

  const toggleBlock = async () => {
    if (!peerId) return
    try {
      await setBlocked(userId, peerId, !contact?.isBlocked)
      await queryClient.invalidateQueries({ queryKey: keys.contacts(userId) })
      notify(
        contact?.isBlocked
          ? 'Contact unblocked.'
          : 'Contact blocked. Their messages are hidden from you.',
        'success',
      )
    } catch (error) {
      notify(errorMessage(error), 'error')
    }
  }

  return (
    <aside
      aria-label="Chat info"
      className="absolute inset-0 z-20 flex flex-col overflow-y-auto bg-surface lg:static lg:w-[360px] lg:shrink-0 lg:border-l lg:border-divider"
    >
      <header className="flex h-[60px] shrink-0 items-center gap-3 bg-panel px-3">
        <IconButton icon={X} label="Close info" onClick={onClose} />
        <h2 className="text-base font-medium">
          {chat.isGroup ? 'Group info' : 'Contact info'}
        </h2>
      </header>
      <div className="grid justify-items-center gap-1 px-6 py-6 text-center">
        <Avatar name={chat.name} path={chat.avatarPath} size={140} />
        <h3 className="mt-3 text-[22px]">{chat.name}</h3>
        {chat.peerUsername && (
          <p className="text-[15px] text-muted">@{chat.peerUsername}</p>
        )}
        {chat.isGroup && (
          <p className="text-[14px] text-muted">
            Group · {chat.participantCount} participants
          </p>
        )}
      </div>
      {!chat.isGroup && about && (
        <section className="border-t border-divider px-6 py-4">
          <h3 className="text-sm text-muted">About</h3>
          <p className="mt-1 text-[15px]">{about}</p>
        </section>
      )}
      <section className="grid border-t border-divider py-1">
        <div className="flex items-center gap-4 px-6 py-3 text-[15px] text-muted">
          <Icon icon={LockKeyhole} size={20} />
          <span>Messages are end-to-end encrypted.</span>
        </div>
        {!chat.isGroup && peerId && (
          <button
            type="button"
            onClick={() => setVerifying(true)}
            className="flex items-center gap-4 px-6 py-3 text-left text-[15px] hover:bg-surface-hover"
          >
            <Icon icon={ShieldCheck} size={20} className="text-link" /> Verify
            security code
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            void actions.mute(chat, chat.isMuted ? null : 'always')
          }
          className="flex items-center gap-4 px-6 py-3 text-left text-[15px] hover:bg-surface-hover"
        >
          <Icon icon={BellOff} size={20} className="text-muted" />{' '}
          {chat.isMuted ? 'Unmute notifications' : 'Mute notifications'}
        </button>
      </section>
      {chat.isGroup ? (
        <GroupMembers chat={chat} />
      ) : (
        <section className="grid border-t border-divider py-1">
          <Button
            variant="ghost"
            icon={Ban}
            className="justify-start px-6 text-danger"
            onClick={() => void toggleBlock()}
          >
            {contact?.isBlocked ? `Unblock ${chat.name}` : `Block ${chat.name}`}
          </Button>
          <Button
            variant="ghost"
            icon={Trash2}
            className="justify-start px-6 text-danger"
            onClick={() => void actions.deleteChat(chat)}
          >
            Delete chat
          </Button>
        </section>
      )}
      {peerId && (
        <VerifyEncryptionModal
          open={verifying}
          onClose={() => setVerifying(false)}
          peerId={peerId}
          peerName={chat.name}
        />
      )}
    </aside>
  )
}
