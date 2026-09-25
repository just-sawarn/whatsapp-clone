import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '../../../components/ui/Button'

type Props = {
  title: string
  description: string
  children: ReactNode
  onBack?: () => void
  onSubmit: () => void
  submitLabel?: string
  submitDisabled?: boolean
  submitting?: boolean
  onSkip?: () => void
  error?: string | null
}

/** Shared layout for an onboarding step: heading (focused for screen readers), body, and Back / Continue. */
export function StepFrame({
  title,
  description,
  children,
  onBack,
  onSubmit,
  submitLabel = 'Continue',
  submitDisabled,
  submitting,
  onSkip,
  error,
}: Props) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
      className="grid gap-5"
    >
      <div>
        <h1
          tabIndex={-1}
          data-step-heading
          className="text-2xl font-semibold outline-none"
        >
          {title}
        </h1>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">
          {description}
        </p>
      </div>
      {children}
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger"
        >
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-3 pt-1">
        {onBack ? (
          <Button variant="ghost" icon={ArrowLeft} onClick={onBack}>
            Back
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {onSkip && (
            <Button variant="ghost" onClick={onSkip}>
              Skip
            </Button>
          )}
          <Button type="submit" loading={submitting} disabled={submitDisabled}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  )
}
