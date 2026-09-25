import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Icon } from './Icon'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-strong disabled:opacity-60',
  secondary: 'bg-panel text-text hover:bg-surface-hover border border-divider',
  ghost: 'bg-transparent text-link hover:bg-surface-hover',
  danger: 'bg-danger text-white hover:opacity-90 disabled:opacity-60',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  loading?: boolean
  icon?: LucideIcon
  children: ReactNode
}

/** Spinners are reserved for button-level actions like sending or uploading. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      loading = false,
      icon,
      className,
      disabled,
      children,
      type = 'button',
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={cn(
          'inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed',
          variants[variant],
          className,
        )}
        {...rest}
      >
        {loading ? (
          <Spinner size={16} />
        ) : icon ? (
          <Icon icon={icon} size={18} />
        ) : null}
        {children}
      </button>
    )
  },
)
