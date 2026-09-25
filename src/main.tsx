import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Users } from 'lucide-react'
import AppShell from './components/layout/AppShell'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { ProfileGate } from './components/ProfileGate'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ToastProvider } from './components/ui/ToastProvider'
import AuthPage from './features/auth/AuthPage'
import { AuthProvider } from './features/auth/AuthProvider'
import ResetPasswordPage from './features/auth/ResetPasswordPage'
import ChatsLayout from './features/chat/ChatsLayout'
import ConversationRoute from './features/chat/ConversationRoute'
import WelcomePane from './features/chat/WelcomePane'
import ComingSoon from './features/placeholder/ComingSoon'
import { PreferencesProvider } from './features/preferences/PreferencesProvider'
import { RouteFallback } from './components/RouteFallback'
import { registerNotificationServiceWorker } from './lib/notifications'
import './tailwind.css'

const CallsPage = lazy(() => import('./features/calls/CallsPage'))
const OnboardingPage = lazy(
  () => import('./features/onboarding/OnboardingPage'),
)
const SettingsRoutes = lazy(() => import('./features/settings/SettingsRoutes'))
const StatusRoutes = lazy(() => import('./features/status/StatusRoutes'))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})
const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('The app root element is missing.')
}

void registerNotificationServiceWorker().catch(() => undefined)

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary>
      <PreferencesProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ToastProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/auth" element={<AuthPage />} />
                  <Route
                    path="/reset-password"
                    element={<ResetPasswordPage />}
                  />
                  <Route
                    path="/onboarding"
                    element={
                      <ProtectedRoute>
                        <Suspense fallback={<RouteFallback />}>
                          <OnboardingPage />
                        </Suspense>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    element={
                      <ProtectedRoute>
                        <ProfileGate>
                          <AppShell />
                        </ProfileGate>
                      </ProtectedRoute>
                    }
                  >
                    <Route element={<ChatsLayout />}>
                      <Route index element={<WelcomePane />} />
                      <Route
                        path="chat/:chatId"
                        element={<ConversationRoute />}
                      />
                    </Route>
                    <Route
                      path="calls"
                      element={
                        <Suspense fallback={<RouteFallback />}>
                          <CallsPage />
                        </Suspense>
                      }
                    />
                    <Route
                      path="status/*"
                      element={
                        <Suspense fallback={<RouteFallback />}>
                          <StatusRoutes />
                        </Suspense>
                      }
                    />
                    <Route
                      path="communities"
                      element={
                        <ComingSoon
                          icon={Users}
                          title="Communities"
                          description="Communities are not part of this version yet."
                        />
                      }
                    />
                    <Route
                      path="settings/*"
                      element={
                        <Suspense fallback={<RouteFallback />}>
                          <SettingsRoutes />
                        </Suspense>
                      }
                    />
                  </Route>
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </BrowserRouter>
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>
      </PreferencesProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
