import { createContext, useContext } from 'react'

export type RealtimeValue = {
  /** Users currently online, or empty when I have hidden my own last-seen (the rule is reciprocal). */
  onlineUserIds: ReadonlySet<string>
  /** Chat open in the current route, if any. */
  openChatId: string | undefined
}

export const RealtimeContext = createContext<RealtimeValue>({
  onlineUserIds: new Set(),
  openChatId: undefined,
})

export function useRealtime(): RealtimeValue {
  return useContext(RealtimeContext)
}
