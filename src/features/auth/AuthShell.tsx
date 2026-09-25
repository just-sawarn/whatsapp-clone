import type { ReactNode } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Icon } from '../../components/ui/Icon'
import { Logo } from '../../components/ui/Logo'

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-app-bg px-4 py-8 text-text">
      <div className="w-full max-w-[420px] overflow-hidden rounded-2xl bg-surface p-7 shadow-popover sm:p-9">
        <div className="mb-7 flex items-center gap-3">
          <Logo size={40} />
          <strong className="text-lg font-semibold">WhatsApp</strong>
        </div>
        {children}
        <p className="mt-8 flex items-start gap-2 text-[12px] leading-relaxed text-muted">
          <Icon icon={ShieldCheck} size={15} className="mt-0.5 shrink-0" />
          Messages are end-to-end encrypted on your device. Your data is
          protected by database access rules.
        </p>
      </div>
    </main>
  )
}
