import { useQueryClient } from '@tanstack/react-query'
import { UserPlus } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import { useToast } from '../../../components/ui/ToastContext'
import { errorMessage } from '../../../lib/errors'
import { keys } from '../../../lib/queryKeys'
import { useCurrentUserId } from '../../auth/useCurrentUser'
import { addContact, setBlocked } from '../../contacts/contactsService'
import { useContacts } from '../../contacts/useContacts'
import type { ChatSummary } from '../types'

/** Lightweight notice when a direct chat is with someone who is not in the user's contacts. */
export function ContactBanner({ chat }: { chat: ChatSummary }) {
  const userId = useCurrentUserId()
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const { data: contacts, isSuccess } = useContacts()
  if (
    chat.isGroup ||
    !chat.peerId ||
    !isSuccess ||
    contacts.some((contact) => contact.userId === chat.peerId)
  )
    return null
  const peerId = chat.peerId

  const act = async (task: () => Promise<void>, done: string) => {
    try {
      await task()
      await queryClient.invalidateQueries({ queryKey: keys.contacts(userId) })
      notify(done, 'success')
    } catch (error) {
      notify(errorMessage(error), 'error')
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 border-b border-divider bg-surface px-4 py-2 text-[13px]">
      <Icon icon={UserPlus} size={16} className="text-muted" />
      <span>{chat.name} is not in your contacts.</span>
      <Button
        variant="secondary"
        className="h-8 px-4 text-[13px]"
        onClick={() =>
          void act(() => addContact(userId, peerId), 'Added to contacts.')
        }
      >
        Add contact
      </Button>
      <Button
        variant="ghost"
        className="h-8 px-4 text-[13px] text-danger"
        onClick={() =>
          void act(() => setBlocked(userId, peerId, true), 'Contact blocked.')
        }
      >
        Block
      </Button>
    </div>
  )
}
