import type { LucideIcon } from 'lucide-react'
import { EmptyState } from '../../components/ui/EmptyState'

export default function ComingSoon({
  icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="grid h-full place-items-center bg-panel">
      <EmptyState icon={icon} title={title} description={description} />
    </div>
  )
}
