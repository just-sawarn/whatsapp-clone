import { useQuery } from '@tanstack/react-query'
import { LockKeyhole } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import { Modal } from '../../../components/ui/Modal'
import { Spinner } from '../../../components/ui/Spinner'
import { useToast } from '../../../components/ui/ToastContext'
import { parsePublicKey, safetyNumber } from '../../../lib/crypto/crypto'
import { getStoredPublicKey } from '../../../lib/crypto/keyStore'
import { errorMessage } from '../../../lib/errors'
import { supabase } from '../../../lib/supabase'
import { useCurrentUserId } from '../../auth/useCurrentUser'

type Props = {
  open: boolean
  onClose: () => void
  peerId: string
  peerName: string
}

async function loadSafetyNumber(
  userId: string,
  peerId: string,
): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const mine = await getStoredPublicKey(userId)
  if (!mine) throw new Error('This device has no encryption key yet.')
  const { data, error } = await supabase
    .from('profiles')
    .select('public_key')
    .eq('id', peerId)
    .maybeSingle()
  if (error) throw error
  if (!data?.public_key)
    throw new Error('That person has not published an encryption key.')
  return safetyNumber(mine, parsePublicKey(data.public_key as string))
}

/**
 * The 60-digit security code is derived from both people's public keys. If it matches on both devices, no one
 * has substituted a key in between.
 */
export function VerifyEncryptionModal({
  open,
  onClose,
  peerId,
  peerName,
}: Props) {
  const userId = useCurrentUserId()
  const { notify } = useToast()
  const { data, isPending, error } = useQuery({
    queryKey: ['safety-number', userId, peerId],
    queryFn: () => loadSafetyNumber(userId, peerId),
    enabled: open,
    staleTime: 60_000,
  })
  const groups = data?.split(' ') ?? []

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Verify security code"
      description={`Compare this code with ${peerName} in person or over another channel.`}
    >
      <div className="grid gap-4">
        {isPending ? (
          <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
            <Spinner /> Calculating…
          </p>
        ) : error ? (
          <p
            role="alert"
            className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger"
          >
            {errorMessage(error)}
          </p>
        ) : (
          <div
            aria-label="Security code"
            className="grid grid-cols-3 gap-x-4 gap-y-2 rounded-xl bg-panel p-4 text-center font-mono text-[17px] tracking-wider"
          >
            {groups.map((group, index) => (
              <span key={index}>{group}</span>
            ))}
          </div>
        )}
        <p className="flex items-start gap-2 text-[13px] leading-relaxed text-muted">
          <Icon icon={LockKeyhole} size={16} className="mt-0.5 shrink-0" />
          If the codes match, your messages with {peerName} are end-to-end
          encrypted and no one has swapped their key. If they differ, do not
          trust the chat until you have sorted it out.
        </p>
        {data && (
          <Button
            variant="secondary"
            onClick={() =>
              void navigator.clipboard
                .writeText(data)
                .then(() => notify('Code copied.', 'success'))
            }
          >
            Copy code
          </Button>
        )}
      </div>
    </Modal>
  )
}
