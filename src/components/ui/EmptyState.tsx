import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Icon } from './Icon'

type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="grid justify-items-center gap-3 px-8 py-14 text-center">
      <span className="grid h-20 w-20 place-items-center rounded-full bg-panel text-muted">
        <Icon icon={icon} size={36} strokeWidth={1.5} />
      </span>
      <h3 className="text-base font-medium text-text">{title}</h3>
      {description && (
        <p className="max-w-xs text-sm leading-relaxed text-muted">
          {description}
        </p>
      )}
      {action}
    </div>
  )
}
