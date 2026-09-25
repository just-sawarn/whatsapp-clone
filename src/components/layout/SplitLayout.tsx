import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

type SplitLayoutProps = {
  list: ReactNode
  detail: ReactNode
  hasDetail: boolean
}

/** List + detail panes. On narrow screens only one is shown at a time. */
export function SplitLayout({ list, detail, hasDetail }: SplitLayoutProps) {
  return (
    <div className="flex h-full w-full min-w-0">
      <section
        className={cn(
          'flex h-full w-full min-w-0 flex-col border-r border-divider bg-surface md:w-[360px] md:shrink-0 lg:w-[420px]',
          hasDetail && 'hidden md:flex',
        )}
      >
        {list}
      </section>
      <section
        className={cn(
          'relative h-full min-w-0 flex-1 bg-chat-bg',
          !hasDetail && 'hidden md:flex',
        )}
      >
        {detail}
      </section>
    </div>
  )
}
