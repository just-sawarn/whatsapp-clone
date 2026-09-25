import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../components/ui/ToastContext'
import { errorMessage } from '../../lib/errors'
import { mediaBlobQuery } from './useMediaBlob'
import type { ChatMessage } from './types'

/** Hands a blob to the browser as a download with the given file name. */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/**
 * Saves a message's attachment to the device under its original name. It decrypts here in the browser (reusing the
 * copy already on screen when there is one), so the saved file is the real photo, voice note or document.
 */
export function useSaveMedia(message: ChatMessage) {
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const [saving, setSaving] = useState(false)
  const save = useCallback(async () => {
    const media = message.media
    if (!media || saving) return
    setSaving(true)
    try {
      const blob = await queryClient.fetchQuery(mediaBlobQuery(message, 'full'))
      saveBlob(blob, media.name)
    } catch (error) {
      notify(errorMessage(error, `Could not download ${media.name}.`), 'error')
    } finally {
      setSaving(false)
    }
  }, [message, notify, queryClient, saving])
  return { save, saving, canSave: message.media !== null && !message.deleted }
}
