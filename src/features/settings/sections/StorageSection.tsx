import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../../components/ui/Button'
import { useToast } from '../../../components/ui/ToastContext'
import { formatBytes } from '../../../lib/format'
import { cacheStats, clearCache } from '../../../lib/messageCache'
import { useCurrentUserId } from '../../auth/useCurrentUser'
import { SettingsCard, SettingsPanel } from '../SettingsPanel'

export function StorageSection() {
  const userId = useCurrentUserId()
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const [busy, setBusy] = useState(false)
  const { data } = useQuery({
    queryKey: ['cache-stats', userId],
    queryFn: () => cacheStats(userId),
  })

  const clear = async () => {
    setBusy(true)
    await clearCache(userId)
    await queryClient.invalidateQueries({ queryKey: ['cache-stats', userId] })
    queryClient.removeQueries({ queryKey: ['message-search'] })
    queryClient.removeQueries({ queryKey: ['chat-search'] })
    setBusy(false)
    notify('Local message cache cleared.', 'success')
  }

  return (
    <SettingsPanel title="Storage and data">
      <SettingsCard
        title="Local message cache"
        description="Because messages are end-to-end encrypted, search runs on this device over messages it has already decrypted. This is that cache."
      >
        <p className="text-[15px]">
          {data
            ? `${data.count} messages · about ${formatBytes(data.bytes)}`
            : 'Calculating…'}
        </p>
        <Button
          variant="secondary"
          loading={busy}
          onClick={() => void clear()}
          className="justify-self-start"
        >
          Clear local cache
        </Button>
        <p className="text-[13px] leading-relaxed text-muted">
          Clearing removes only this device&rsquo;s searchable copy. It does not
          delete messages from your account or from anyone else&rsquo;s chats,
          and search results are rebuilt as you open chats again.
        </p>
      </SettingsCard>
    </SettingsPanel>
  )
}
