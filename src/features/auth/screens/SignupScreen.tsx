import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { useAuth } from '../AuthContext'
import { signupSchema, type SignupValues } from '../authSchemas'
import { PasswordStrengthMeter } from '../PasswordStrengthMeter'

type Props = { onLogin: () => void; onConfirmEmail: (email: string) => void }

export function SignupScreen({ onLogin, onConfirmEmail }: Props) {
  const { signUp, authError } = useAuth()
  const [busy, setBusy] = useState(false)
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<SignupValues>({ resolver: zodResolver(signupSchema) })
  const password = useWatch({ control, name: 'password', defaultValue: '' })

  const submit = handleSubmit(async (values) => {
    setBusy(true)
    const result = await signUp(values.email, values.password)
    setBusy(false)
    if (result === 'confirm-email') onConfirmEmail(values.email)
  })

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="grid gap-4"
    >
      <div>
        <h1 className="text-2xl font-semibold">Create your account</h1>
        <p className="mt-1 text-[14px] text-muted">
          It only takes a minute. You will set up your profile next.
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
      <div className="grid gap-2">
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <PasswordStrengthMeter password={password} />
      </div>
      <Input
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        error={errors.confirm?.message}
        {...register('confirm')}
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
        Create account
      </Button>
      <p className="text-center text-[13.5px] text-muted">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onLogin}
          className="text-link hover:underline"
        >
          Log in
        </button>
      </p>
    </form>
  )
}
