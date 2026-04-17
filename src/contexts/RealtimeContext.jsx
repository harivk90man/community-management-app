import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'

const RealtimeContext = createContext(null)

/**
 * Provides badge counts via simple polling (every 60s).
 *
 * Previous versions used Supabase Realtime WebSocket subscriptions, but those
 * caused the app to freeze when the WebSocket entered a reconnection loop
 * (which happens if Realtime isn't enabled on the tables, or on flaky networks).
 * The reconnection loop blocks the JS main thread, making all onClick handlers
 * unresponsive while native <a> tags still work (browser-handled).
 *
 * Polling is simpler, reliable, and sufficient for badge counts.
 */
export function RealtimeProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [badges, setBadges] = useState({ complaints: 0, announcements: 0 })
  const idRef = useRef(0)

  const refreshBadges = useCallback(async () => {
    try {
      const [{ count: c }, { count: a }] = await Promise.all([
        supabase.from('complaints').select('*', { count: 'exact', head: true }).eq('status', 'Pending'),
        supabase.from('announcements').select('*', { count: 'exact', head: true })
          .in('audience', ['All', 'Owners'])
          .or(`ends_at.is.null,ends_at.gte.${new Date().toISOString()}`),
      ])
      const nc = c ?? 0
      const na = a ?? 0
      setBadges(prev => {
        if (prev.complaints === nc && prev.announcements === na) return prev
        return { complaints: nc, announcements: na }
      })
    } catch {
      // Network error — badges stay stale, no crash
    }
  }, [])

  // Poll every 60 seconds + on mount
  useEffect(() => {
    refreshBadges()
    const id = setInterval(refreshBadges, 60_000)
    return () => clearInterval(id)
  }, [refreshBadges])

  const pushToast = useCallback((message, type = 'info') => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const value = useMemo(
    () => ({ toasts, badges, refreshBadges, pushToast, dismissToast }),
    [toasts, badges, refreshBadges, pushToast, dismissToast]
  )

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  )
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext)
  if (!ctx) throw new Error('useRealtime must be used inside RealtimeProvider')
  return ctx
}
