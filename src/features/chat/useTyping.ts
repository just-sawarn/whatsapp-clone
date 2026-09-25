import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useCurrentUserId } from '../auth/useCurrentUser'

const TYPING_TTL_MS = 4000
const SEND_INTERVAL_MS = 2500

/** Ephemeral typing signals over a Realtime broadcast channel scoped to the open chat. Nothing is stored. */
export function useTyping(chatId: string) {
  const userId = useCurrentUserId()
  const [typing, setTyping] = useState<ReadonlyMap<string, number>>(new Map())
  const channelRef = useRef<ReturnType<
    NonNullable<typeof supabase>['channel']
  > | null>(null)
  const lastSent = useRef(0)

  useEffect(() => {
    const client = supabase
    if (!client) return
    const channel = client.channel(`typing:${chatId}`)
    channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const sender = (payload as { userId?: string }).userId
      if (!sender || sender === userId) return
      setTyping((current) =>
        new Map(current).set(sender, Date.now() + TYPING_TTL_MS),
      )
    })
    channel.subscribe()
    channelRef.current = channel
    const sweep = window.setInterval(() => {
      setTyping((current) => {
        const alive = new Map(
          Array.from(current).filter(([, expires]) => expires > Date.now()),
        )
        return alive.size === current.size ? current : alive
      })
    }, 1000)
    return () => {
      window.clearInterval(sweep)
      channelRef.current = null
      setTyping(new Map())
      void client.removeChannel(channel)
    }
  }, [chatId, userId])

  const notifyTyping = useCallback(() => {
    const now = Date.now()
    if (!channelRef.current || now - lastSent.current < SEND_INTERVAL_MS) return
    lastSent.current = now
    void channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId },
    })
  }, [userId])

  return { typingUserIds: Array.from(typing.keys()), notifyTyping }
}
