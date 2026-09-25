import { forwardRef, type ButtonHTMLAttributes } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Icon } from './Icon'

type IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> & {
  icon: LucideIcon
  label: string
  size?: number
  active?: boolean
  tone?: 'default' | 'primary'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      icon,
      label,
      size = 20,
      active = false,
      tone = 'default',
      className,
      type = 'button',
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        className={cn(
          'inline-grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40',
          tone === 'primary'
            ? 'text-primary hover:text-primary-strong'
            : 'text-muted',
          active && 'bg-surface-hover text-text',
          className,
        )}
        {...rest}
      >
        <Icon icon={icon} size={size} />
      </button>
    )
  },
)
