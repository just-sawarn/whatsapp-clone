import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Icon } from '../../../components/ui/Icon'
import { Input } from '../../../components/ui/Input'
import { useAuth } from '../AuthContext'
import { resetSchema, type ResetValues } from '../authSchemas'

export function ResetScreen({ onBack }: { onBack: () => void }) {
  const { resetPassword, authError } = useAuth()
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetValues>({ resolver: zodResolver(resetSchema) })

  const submit = handleSubmit(async (values) => {
    setBusy(true)
    setSent(await resetPassword(values.email))
    setBusy(false)
  })

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="grid gap-4"
    >
      <div>
        <h1 className="text-2xl font-semibold">Reset your password</h1>
        <p className="mt-1 text-[14px] text-muted">
          We will email you a secure link to choose a new password.
        </p>
      </div>
      <Input
        label="Email address"
        type="email"
        autoComplete="email"
        autoFocus
        error={errors.email?.message}
        {...register('email')}
      />
      {authError && (
        <p
          role="alert"
          className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger"
        >
          {authError}
        </p>
      )}
      {sent && (
        <p
          role="status"
          className="rounded-lg bg-primary/15 px-3 py-2 text-[13px]"
        >
          If that email has an account, a reset link is on its way.
        </p>
      )}
      <Button type="submit" loading={busy} className="h-11">
        Send reset link
      </Button>
      <button
        type="button"
        onClick={onBack}
        className="flex items-center justify-center gap-1.5 text-[13.5px] text-link hover:underline"
      >
        <Icon icon={ArrowLeft} size={15} /> Back to log in
      </button>
    </form>
  )
}
