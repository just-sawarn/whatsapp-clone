import { useEffect } from 'react'
import { Outlet, useMatch } from 'react-router-dom'
import { EncryptionGate } from '../../features/auth/EncryptionGate'
import { CallOverlay } from '../../features/calls/CallOverlay'
import { CallProvider } from '../../features/calls/CallProvider'
import { useUnreadTotal } from '../../features/chat/useChats'
import { RealtimeProvider } from '../../features/realtime/RealtimeProvider'
import { ConnectionBanner } from '../ui/ConnectionBanner'
import { NavRail } from './NavRail'

/** Signed-in frame: connection and encryption banners, primary navigation, realtime, and the routed page. */
export default function AppShell() {
  const unread = useUnreadTotal()
  const inChat = useMatch('/chat/:chatId') !== null

  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) ChatBit` : 'ChatBit'
  }, [unread])

  return (
    <RealtimeProvider>
      <CallProvider>
        <div className="flex h-dvh flex-col bg-app-bg text-text">
          <ConnectionBanner />
          <EncryptionGate>
            <div className="flex min-h-0 flex-1 flex-col-reverse md:flex-row">
              <NavRail unread={unread} hidden={inChat} />
              <main className="min-h-0 min-w-0 flex-1">
                <Outlet />
              </main>
            </div>
          </EncryptionGate>
        </div>
        <CallOverlay />
      </CallProvider>
    </RealtimeProvider>
  )
}
