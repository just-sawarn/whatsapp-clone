import type { LucideIcon } from 'lucide-react'

type IconProps = {
  icon: LucideIcon
  size?: number
  className?: string
  strokeWidth?: number
}

/** Every glyph goes through here so size and stroke weight stay consistent across the app. */
export function Icon({
  icon: Glyph,
  size = 20,
  strokeWidth = 1.75,
  className,
}: IconProps) {
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden="true"
    />
  )
}
