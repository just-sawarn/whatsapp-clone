import { useState } from 'react'
import { LogOut, Trash2 } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { useToast } from '../../../components/ui/ToastContext'
import { forgetIdentity } from '../../../lib/crypto/keyStore'
import { errorMessage } from '../../../lib/errors'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../auth/AuthContext'
import { useCurrentUserId } from '../../auth/useCurrentUser'
import { SettingsCard, SettingsPanel } from '../SettingsPanel'

export function AccountSection() {
  const userId = useCurrentUserId()
  const { signOut } = useAuth()
  const { notify } = useToast()
  const [confirming, setConfirming] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState(false)

  const deleteAccount = async () => {
    if (!supabase) return
    setBusy(true)
    try {
      const { error } = await supabase.functions.invoke('delete-account', {
        method: 'POST',
      })
      if (error) throw error
      await forgetIdentity(userId)
      await signOut()
    } catch (error) {
      const message = errorMessage(error)
      notify(
        /not found|404|failed to send/i.test(message)
          ? 'Account deletion is not enabled for this project yet (the delete-account function is not deployed).'
          : message,
        'error',
      )
      setBusy(false)
    }
  }

  return (
    <SettingsPanel title="Account">
      <SettingsCard>
        <Button
          variant="secondary"
          icon={LogOut}
          onClick={() => void signOut()}
          className="justify-self-start"
        >
          Log out
        </Button>
        <p className="text-[13px] leading-relaxed text-muted">
          Logging out locks your encryption key and clears this device&rsquo;s
          search cache. Your messages stay on your account.
        </p>
      </SettingsCard>
      <SettingsCard
        title="Delete account"
        description="This permanently deletes your profile, contacts, statuses, and every message you have sent, for everyone in those chats."
      >
        <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-muted">
          <li>It cannot be undone and we cannot recover anything.</li>
          <li>
            Your encryption key lives only on your devices, so even a backup of
            the server could not restore your messages.
          </li>
          <li>
            Messages other people sent you are deleted along with the chat.
          </li>
        </ul>
        <Button
          variant="danger"
          icon={Trash2}
          onClick={() => setConfirming(true)}
          className="justify-self-start"
        >
          Delete my account
        </Button>
      </SettingsCard>
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete your account?"
        description="Type DELETE to confirm."
      >
        <div className="grid gap-4">
          <Input
            label="Confirmation"
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
            autoComplete="off"
          />
          <Button
            variant="danger"
            loading={busy}
            disabled={phrase !== 'DELETE'}
            onClick={() => void deleteAccount()}
          >
            Permanently delete
          </Button>
        </div>
      </Modal>
    </SettingsPanel>
  )
}
