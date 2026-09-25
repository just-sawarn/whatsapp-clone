import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Connection = 'ok' | 'offline' | 'connecting'

/** Persistent top banner driven by browser connectivity and the Supabase Realtime socket. */
export function ConnectionBanner() {
  const [online, setOnline] = useState(navigator.onLine)
  const [realtimeDown, setRealtimeDown] = useState(false)

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  useEffect(() => {
    if (!supabase) return
    let everConnected = false
    let misses = 0
    const timer = window.setInterval(() => {
      const connected = supabase?.realtime.isConnected() ?? false
      if (connected) {
        everConnected = true
        misses = 0
        setRealtimeDown(false)
      } else if (everConnected && ++misses >= 2) {
        setRealtimeDown(true)
      }
    }, 3000)
    return () => window.clearInterval(timer)
  }, [])

  const state: Connection = !online
    ? 'offline'
    : realtimeDown
      ? 'connecting'
      : 'ok'
  if (state === 'ok') return null
  return (
    <div
      role="status"
      className="bg-warning px-4 py-1.5 text-center text-[13px] text-text"
    >
      {state === 'offline'
        ? 'No internet connection. Messages will send when you are back online.'
        : 'Connecting…'}
    </div>
  )
}
