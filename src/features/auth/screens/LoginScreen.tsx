import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { useAuth } from '../AuthContext'
import { loginSchema, type LoginValues } from '../authSchemas'

type Props = { onForgot: () => void; onSignup: () => void }

export function LoginScreen({ onForgot, onSignup }: Props) {
  const { signIn, authError } = useAuth()
  const [busy, setBusy] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  const submit = handleSubmit(async (values) => {
    setBusy(true)
    await signIn(values.email, values.password)
    setBusy(false)
  })

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="grid gap-4"
    >
      <div>
        <h1 className="text-2xl font-semibold">Welcome back</h1>
        <p className="mt-1 text-[14px] text-muted">
          Log in to continue your conversations.
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
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      {authError && (
        <p
          role="alert"
          className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger"
        >
          {authError}
        </p>
      )}
      <Button type="submit" loading={busy} className="h-11">
        Log in
      </Button>
      <div className="flex justify-between text-[13.5px]">
        <button
          type="button"
          onClick={onForgot}
          className="text-link hover:underline"
        >
          Forgot your password?
        </button>
        <button
          type="button"
          onClick={onSignup}
          className="text-link hover:underline"
        >
          Create an account
        </button>
      </div>
    </form>
  )
}
