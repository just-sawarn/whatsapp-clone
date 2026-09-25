import { Spinner } from './ui/Spinner'

export function RouteFallback() {
  return (
    <div className="grid h-full min-h-40 w-full place-items-center text-muted">
      <Spinner size={22} />
    </div>
  )
}
