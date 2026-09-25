import { cn } from '../../lib/cn'
import { passwordStrength } from './authSchemas'

const colours = [
  'bg-danger',
  'bg-danger',
  'bg-warning-strong',
  'bg-accent',
  'bg-primary',
]

export function PasswordStrengthMeter({ password }: { password: string }) {
  const { score, label, hint } = passwordStrength(password)
  if (!password) return null
  return (
    <div aria-live="polite" className="grid gap-1.5">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              index < score ? (colours[score] ?? 'bg-primary') : 'bg-divider',
            )}
          />
        ))}
      </div>
      <p className="text-xs text-muted">
        <span className="font-medium text-text">{label}</span>
        {hint && ` · ${hint}`}
      </p>
    </div>
  )
}
