import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { IconButton } from '../../components/ui/IconButton'

export function SettingsPanel({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <div className="flex h-full w-full flex-col bg-panel">
      <header className="flex h-[60px] shrink-0 items-center gap-2 border-b border-divider bg-panel px-3 md:px-6">
        <IconButton
          icon={ArrowLeft}
          label="Back to settings"
          onClick={() => navigate('/settings')}
          className="md:hidden"
        />
        <h1 className="text-lg font-medium">{title}</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-2xl gap-4 p-4 md:p-8">
          {children}
        </div>
      </div>
    </div>
  )
}

export function SettingsCard({
  title,
  description,
  children,
}: {
  title?: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="grid gap-4 rounded-xl bg-surface p-5 shadow-bubble">
      {(title || description) && (
        <div>
          {title && <h2 className="text-[15px] font-medium">{title}</h2>}
          {description && (
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </section>
  )
}

export function SettingRow({
  label,
  description,
  control,
}: {
  label: string
  description?: string
  control: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[15px]">{label}</div>
        {description && (
          <div className="mt-0.5 text-[13px] leading-relaxed text-muted">
            {description}
          </div>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}
