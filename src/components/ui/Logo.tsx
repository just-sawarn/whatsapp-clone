import { MessageCircle } from 'lucide-react'
import { Icon } from './Icon'

export function Logo({ size = 56 }: { size?: number }) {
  return (
    <span
      className="grid place-items-center rounded-2xl bg-primary text-white shadow-popover"
      style={{ width: size, height: size }}
    >
      <Icon icon={MessageCircle} size={size * 0.55} strokeWidth={1.75} />
    </span>
  )
}
