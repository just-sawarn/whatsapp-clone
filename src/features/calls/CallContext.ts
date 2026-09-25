import { createContext, useContext } from 'react'
import type { ChatSummary } from '../chat/types'
import type { useCallEngine } from './useCallEngine'

export type CallContextValue = Omit<
  ReturnType<typeof useCallEngine>,
  'startCall' | 'receiveIncoming' | 'onCallUpdate'
> & {
  startCall: (chat: ChatSummary, video: boolean) => void
  /** Why a call cannot be started with this chat, or null when it can. */
  callBlockedReason: (chat: ChatSummary) => string | null
}

export const CallContext = createContext<CallContextValue | undefined>(
  undefined,
)

export function useCall(): CallContextValue {
  const context = useContext(CallContext)
  if (!context) throw new Error('useCall must be used inside CallProvider.')
  return context
}
