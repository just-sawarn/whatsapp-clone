import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/ui/ToastContext'
import { useAuth } from './AuthContext'

type Mode = 'unlock' | 'recover' | 'import' | 'reset'

type Props = { open: boolean; onClose: () => void }

const linkClass = 'text-[13px] text-link hover:underline'

/**
 * Recovery paths for this device's encryption key: unlock it, unlock after a password reset, restore a
 * backup made on another device, or (last resort) generate a new key and give up old messages.
 */
export function UnlockEncryptionModal({ open, onClose }: Props) {
  const { identityState, unlockEncryption, resetEncryption, importKeyBackup } =
    useAuth()
  const queryClient = useQueryClient()
  const { notify } = useToast()
  const [mode, setMode] = useState<Mode>(
    identityState === 'missing' ? 'import' : 'unlock',
  )
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const finish = async (message: string) => {
    setPassword('')
    setNewPassword('')
    setAcknowledged(false)
    notify(message, 'success')
    await queryClient.invalidateQueries()
    onClose()
  }

  const run = async (task: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await task()
    } catch (taskError) {
      setError(
        taskError instanceof Error
          ? taskError.message
          : 'Something went wrong.',
      )
    } finally {
      setBusy(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (mode === 'unlock')
      void run(async () => {
        await unlockEncryption(password)
        await finish('Encryption unlocked.')
      })
    if (mode === 'recover')
      void run(async () => {
        await unlockEncryption(password, newPassword)
        await finish('Encryption unlocked and re-protected.')
      })
    if (mode === 'reset')
      void run(async () => {
        await resetEncryption(password)
        await finish('A new encryption key was created.')
      })
  }

  const onFile = (file: File | undefined) => {
    if (!file) return
    void run(async () => {
      await importKeyBackup(await file.text())
      setMode('unlock')
      notify('Backup loaded. Enter the password that protected it.', 'info')
    })
  }

  const title =
    mode === 'reset'
      ? 'Create a new encryption key'
      : mode === 'import'
        ? 'Restore your key'
        : 'Unlock encryption'
  const description =
    mode === 'import'
      ? 'This device has no encryption key for your account yet.'
      : mode === 'reset'
        ? 'Only do this if you cannot unlock or restore your old key.'
        : 'Your messages are decrypted on this device with a key that only your password can open.'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
    >
      <form onSubmit={submit} className="grid gap-4">
        {mode === 'import' && (
          <>
            <label className="grid gap-1.5 text-[13px] font-medium text-muted">
              Key backup file
              <input
                type="file"
                accept="application/json,.json"
                onChange={(event) => onFile(event.target.files?.[0])}
                className="text-sm text-text file:mr-3 file:rounded-full file:border-0 file:bg-panel file:px-4 file:py-2 file:text-sm file:text-text"
              />
            </label>
            <p className="text-[13px] leading-relaxed text-muted">
              Export a backup from Settings → Security on a device where you can
              read your messages, then choose the file here.
            </p>
          </>
        )}
        {mode === 'unlock' && (
          <Input
            label="Password protecting your key"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        )}
        {mode === 'recover' && (
          <>
            <Input
              label="Previous password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              hint="The password you used before resetting it."
              required
            />
            <Input
              label="Current account password"
              type="password"
              autoComplete="current-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              hint="Your key will be protected by this password from now on."
              required
            />
          </>
        )}
        {mode === 'reset' && (
          <>
            <Input
              label="Account password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <label className="flex items-start gap-2 text-[13px] leading-relaxed text-text">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                className="mt-1"
              />
              I understand that messages sent to my old key can no longer be
              read on this account.
            </label>
          </>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger"
          >
            {error}
          </p>
        )}
        {mode !== 'import' && (
          <Button
            type="submit"
            loading={busy}
            disabled={mode === 'reset' && !acknowledged}
            variant={mode === 'reset' ? 'danger' : 'primary'}
          >
            {mode === 'reset' ? 'Create new key' : 'Unlock'}
          </Button>
        )}
        <div className="flex flex-wrap justify-between gap-3">
          {mode !== 'unlock' && identityState !== 'missing' && (
            <button
              type="button"
              className={linkClass}
              onClick={() => setMode('unlock')}
            >
              Back to unlock
            </button>
          )}
          {mode === 'unlock' && (
            <button
              type="button"
              className={linkClass}
              onClick={() => setMode('recover')}
            >
              I reset my password
            </button>
          )}
          {mode !== 'import' && (
            <button
              type="button"
              className={linkClass}
              onClick={() => setMode('import')}
            >
              Restore from backup
            </button>
          )}
          {mode !== 'reset' && (
            <button
              type="button"
              className="text-[13px] text-danger hover:underline"
              onClick={() => setMode('reset')}
            >
              I cannot unlock it
            </button>
          )}
        </div>
      </form>
    </Modal>
  )
}
