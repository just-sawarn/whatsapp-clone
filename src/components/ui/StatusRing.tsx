import type { ReactNode } from 'react'

type StatusRingProps = {
  segments: number
  viewed: number
  size?: number
  children: ReactNode
}

/** Ring of `segments` arcs around an avatar; the first `viewed` arcs are drawn muted. */
export function StatusRing({
  segments,
  viewed,
  size = 52,
  children,
}: StatusRingProps) {
  const stroke = 2.5
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const gap = segments > 1 ? 5 : 0
  const arc = circumference / Math.max(segments, 1) - gap
  return (
    <span
      className="relative inline-grid place-items-center"
      style={{ width: size, height: size }}
    >
      {segments > 0 && (
        <svg
          className="absolute inset-0 -rotate-90"
          width={size}
          height={size}
          aria-hidden="true"
        >
          {Array.from({ length: segments }, (_, index) => (
            <circle
              key={index}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${Math.max(arc, 1)} ${circumference - Math.max(arc, 1)}`}
              strokeDashoffset={-index * (arc + gap)}
              className={index < viewed ? 'stroke-divider' : 'stroke-accent'}
            />
          ))}
        </svg>
      )}
      <span
        className="grid place-items-center overflow-hidden rounded-full"
        style={{ width: size - 8, height: size - 8 }}
      >
        {children}
      </span>
    </span>
  )
}
