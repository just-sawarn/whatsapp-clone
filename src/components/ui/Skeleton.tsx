import { cn } from '../../lib/cn'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-shimmer rounded bg-divider', className)}
    />
  )
}

export function ChatListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading chats" className="grid">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  )
}

const bubbleWidths = ['w-48', 'w-64', 'w-40', 'w-56', 'w-72', 'w-44']

export function MessageListSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading messages"
      className="grid gap-3 px-[6%] py-6"
    >
      {bubbleWidths.map((width, index) => (
        <Skeleton
          key={index}
          className={cn('h-10 rounded-lg', width, index % 3 === 1 && 'ml-auto')}
        />
      ))}
    </div>
  )
}
