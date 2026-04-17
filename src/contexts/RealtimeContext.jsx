import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'

const RealtimeContext = createContext(null)

export function RealtimeProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [badges, setBadges] = useState({ complaints: 0, announcements: 0 })
  const idRef = useRef(0)
  const throttleRef = useRef(null)

  // ── Fetch badge counts (throttled — max once per 10 seconds) ──
  const refreshBadges = useCallback(() => {
    if (throttleRef.current) return // skip if already scheduled
    throttleRef.current = setTimeout(async () => {
      throttleRef.current = null
      try {
        const [{ count: c }, { count: a }] = await Promise.all([
          supabase.from('complaints').select('*', { count: 'exact', head: true }).eq('status', 'Pending'),
          supabase.from('announcements').select('*', { count: 'exact', head: true })
            .in('audience', ['All', 'Owners'])
            .or(`ends_at.is.null,ends_at.gte.${new Date().toISOString()}`),
        ])
        const newComplaints = c ?? 0
        const newAnnouncements = a ?? 0
        // Only update state if values actually changed — prevents re-render cascade
        setBadges(prev => {
          if (prev.complaints === newComplaints && prev.announcements === newAnnouncements) return prev
          return { complaints: newComplaints, announcements: newAnnouncements }
        })
      } catch {
        // Network error — silently ignore, badges stay stale
      }
    }, 500) // debounce 500ms
  }, [])

  // Initial fetch
  useEffect(() => { refreshBadges() }, [refreshBadges])

  // ── Push a toast ──
  const pushToast = useCallback((message, type = 'info') => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // ── Supabase Realtime subscriptions (fire-and-forget, never crash the app) ──
  useEffect(() => {
    let channel
    try {
      channel = supabase.channel('app-realtime')

      channel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'complaints' },
        () => { pushToast('New complaint raised', 'complaint'); refreshBadges() }
      )

      channel.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'complaints' },
        (payload) => {
          if (payload.old?.status !== payload.new?.status && payload.new?.status) {
            pushToast(`Complaint updated to "${payload.new.status}"`, 'complaint')
            refreshBadges()
          }
        }
      )

      channel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'announcements' },
        (payload) => {
          pushToast(`New announcement: ${payload.new?.title ?? ''}`, 'announcement')
          refreshBadges()
        }
      )

      channel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'payments' },
        () => { pushToast('New payment recorded', 'payment') }
      )

      channel.subscribe((status) => {
        // If subscription fails (Realtime not enabled on tables), just log silently.
        // The app works fine without Realtime — badges update on page navigation.
        if (status === 'CHANNEL_ERROR') {
          console.warn('Realtime subscription error — badges will update on navigation only')
        }
      })
    } catch {
      // Realtime completely unavailable — app still works
    }

    return () => {
      if (channel) {
        try { supabase.removeChannel(channel) } catch { /* ignore cleanup errors */ }
      }
      clearTimeout(throttleRef.current)
    }
  }, [pushToast, refreshBadges])

  // ── Memoize context value to prevent re-renders when nothing changed ──
  const value = useMemo(
    () => ({ toasts, badges, refreshBadges, dismissToast }),
    [toasts, badges, refreshBadges, dismissToast]
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
