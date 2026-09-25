import { Component, type ErrorInfo, type ReactNode } from 'react'

type AppErrorBoundaryProps = { children: ReactNode }
type AppErrorBoundaryState = { hasError: boolean }

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  override state: AppErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application error', error, info.componentStack)
  }

  override render() {
    if (!this.state.hasError) return this.props.children
    return (
      <main className="grid min-h-dvh place-items-center bg-app-bg p-4 text-text">
        <div className="grid max-w-sm justify-items-center gap-3 rounded-2xl bg-surface p-8 text-center shadow-popover">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-[14px] text-muted">
            The app could not render this screen. Your messages are safe;
            reloading usually fixes it.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 h-10 rounded-full bg-primary px-6 text-sm font-medium text-white hover:bg-primary-strong"
          >
            Reload app
          </button>
        </div>
      </main>
    )
  }
}
