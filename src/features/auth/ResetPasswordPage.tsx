import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useAuth } from './AuthContext'

/** Reached from the emailed reset link, which signs the user in with a recovery session. */
export default function ResetPasswordPage() {
  const { recoveryMode, loading, user, authError, completePasswordReset } =
    useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const mismatch = confirm.length > 0 && password !== confirm

  useEffect(() => {
    if (!loading && !user) navigate('/auth', { replace: true })
  }, [loading, navigate, user])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (password.length < 8 || mismatch) return
    setBusy(true)
    if (await completePasswordReset(password)) navigate('/', { replace: true })
    setBusy(false)
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-app-bg p-4 text-text">
      <form
        onSubmit={(event) => void submit(event)}
        className="grid w-full max-w-sm gap-4 rounded-2xl bg-surface p-7 shadow-popover"
      >
        <h1 className="text-2xl font-medium">Choose a new password</h1>
        {!recoveryMode && !loading && (
          <p className="rounded-lg bg-warning px-3 py-2 text-[13px]">
            Open the reset link from your email to change your password.
          </p>
        )}
        <p className="text-[13px] leading-relaxed text-muted">
          Your messages are protected by a key on your device. If it was locked
          with your old password, you will be asked to unlock it after signing
          in.
        </p>
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          hint="At least 8 characters."
          minLength={8}
          required
        />
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          error={mismatch ? 'Passwords do not match.' : undefined}
          required
        />
        {authError && (
          <p role="alert" className="text-[13px] text-danger">
            {authError}
          </p>
        )}
        <Button
          type="submit"
          loading={busy}
          disabled={!recoveryMode || password.length < 8 || mismatch}
        >
          Update password
        </Button>
      </form>
    </main>
  )
}
