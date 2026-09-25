import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Link2, RefreshCw, Share2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Icon } from '../../components/ui/Icon'
import { Modal } from '../../components/ui/Modal'
import { Spinner } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/ToastContext'
import { errorMessage } from '../../lib/errors'
import {
  getInviteCode,
  inviteUrl,
  resetInviteCode,
  type Community,
} from './communityService'

export function InviteModal({
  community,
  open,
  onClose,
}: {
  community: Community
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const [confirming, setConfirming] = useState(false)
  const key = ['community-invite', community.id]
  const {
    data: code,
    isPending,
    error,
  } = useQuery({
    queryKey: key,
    queryFn: () => getInviteCode(community.id),
    enabled: open,
    staleTime: Infinity,
  })
  const link = code ? inviteUrl(code) : ''
  const canShare = typeof navigator.share === 'function'

  const reset = async () => {
    try {
      queryClient.setQueryData(key, await resetInviteCode(community.id))
      notify('Invite link reset. The old link no longer works.', 'success')
    } catch (resetError) {
      notify(errorMessage(resetError, 'Could not reset the link.'), 'error')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite to community"
      description="Anyone with this link can join the community, so share it carefully."
    >
      <div className="grid gap-4">
        {isPending ? (
          <p className="flex justify-center py-4">
            <Spinner />
          </p>
        ) : error ? (
          <p
            role="alert"
            className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger"
          >
            {errorMessage(error)}
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2 rounded-lg bg-panel px-3 py-2.5 text-[13.5px]">
              <Icon icon={Link2} size={16} className="shrink-0 text-muted" />
              <input
                readOnly
                aria-label="Invite link"
                value={link}
                onFocus={(event) => event.currentTarget.select()}
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                icon={Copy}
                onClick={() =>
                  void navigator.clipboard
                    .writeText(link)
                    .then(() => notify('Invite link copied.', 'success'))
                }
              >
                Copy link
              </Button>
              {canShare && (
                <Button
                  variant="secondary"
                  icon={Share2}
                  onClick={() =>
                    void navigator
                      .share({ title: community.name, url: link })
                      .catch(() => undefined)
                  }
                >
                  Share
                </Button>
              )}
              <Button
                variant="ghost"
                icon={RefreshCw}
                onClick={() => setConfirming(true)}
              >
                Reset link
              </Button>
            </div>
          </>
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Reset the invite link?"
        description="The current link will stop working for anyone who has not used it yet. People already in the community are not affected."
        confirmLabel="Reset link"
        onConfirm={reset}
      />
    </Modal>
  )
}
