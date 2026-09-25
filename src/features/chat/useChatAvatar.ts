import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../components/ui/ToastContext'
import { errorMessage } from '../../lib/errors'
import { keys } from '../../lib/queryKeys'
import { useCurrentUserId } from '../auth/useCurrentUser'
import { removeChatAvatar, uploadChatAvatar } from './chatAvatarService'

/** Upload or remove a group/community photo, then refresh everything that shows it. */
export function useChatAvatar(chatId: string, currentPath: string | null) {
  const userId = useCurrentUserId()
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.chats(userId) }),
        queryClient.invalidateQueries({ queryKey: keys.communities(userId) }),
        queryClient.invalidateQueries({ queryKey: ['community-groups'] }),
      ]),
    [queryClient, userId],
  )

  const upload = useCallback(
    async (file: File) => {
      setBusy(true)
      try {
        await uploadChatAvatar(chatId, file, currentPath)
        await refresh()
        notify('Photo updated.', 'success')
      } catch (error) {
        notify(errorMessage(error, 'Could not update the photo.'), 'error')
      } finally {
        setBusy(false)
      }
    },
    [chatId, currentPath, notify, refresh],
  )

  const remove = useCallback(async () => {
    if (!currentPath) return
    setBusy(true)
    try {
      await removeChatAvatar(chatId, currentPath)
      await refresh()
    } catch (error) {
      notify(errorMessage(error, 'Could not remove the photo.'), 'error')
    } finally {
      setBusy(false)
    }
  }, [chatId, currentPath, notify, refresh])

  return { busy, upload, remove }
}

/**
 * For photos picked while creating something: the chat exists only after creation, so the upload follows it. A
 * failure here never undoes the creation; it just tells the user the photo can be added later.
 */
export async function uploadPhotoAfterCreate(
  chatId: string,
  file: File | null,
  notify: (message: string, kind: 'error' | 'info') => void,
): Promise<void> {
  if (!file) return
  try {
    await uploadChatAvatar(chatId, file, null)
  } catch (error) {
    notify(
      `Created, but the photo could not be added: ${errorMessage(error, 'upload failed')}. You can add it later.`,
      'error',
    )
  }
}
