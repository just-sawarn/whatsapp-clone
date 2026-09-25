import { LoaderCircle } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Icon } from './Icon'

export function Spinner({
  size = 18,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn('inline-flex animate-spin', className)}
    >
      <Icon icon={LoaderCircle} size={size} />
    </span>
  )
}
