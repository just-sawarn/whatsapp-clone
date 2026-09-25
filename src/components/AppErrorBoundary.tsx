import { Component, type ErrorInfo, type ReactNode } from 'react'

type AppErrorBoundaryProps = { children: ReactNode }
type AppErrorBoundaryState = { hasError: boolean }

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application error', error, info.componentStack)
  }

  override render() {
    if (!this.state.hasError) return this.props.children
    return <main className="app-crash-state"><div><h1>Something went wrong</h1><p>The app could not render this screen.</p><button onClick={() => window.location.reload()}>Reload app</button></div></main>
  }
}
