import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const RealtimeContext = createContext(null)

export function RealtimeProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [badges, setBadges] = useState({ complaints: 0, announcements: 0 })
  const idRef = useRef(0)

  // ── Fetch initial badge counts ──
  const refreshBadges = useCallback(async () => {
    const [{ count: pendingComplaints }, { count: activeAnnouncements }] = await Promise.all([
      supabase.from('complaints').select('*', { count: 'exact', head: true }).eq('status', 'Pending'),
      supabase.from('announcements').select('*', { count: 'exact', head: true })
        .in('audience', ['All', 'Owners'])
        .or(`ends_at.is.null,ends_at.gte.${new Date().toISOString()}`),
    ])
    setBadges({
      complaints: pendingComplaints ?? 0,
      announcements: activeAnnouncements ?? 0,
    })
  }, [])

  useEffect(() => { refreshBadges() }, [refreshBadges])

  // ── Push a toast ──
  function pushToast(message, type = 'info') {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }

  // ── Supabase Realtime subscriptions ──
  useEffect(() => {
    const channel = supabase.channel('app-realtime')

    // New complaints
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'complaints' },
      () => {
        pushToast('New complaint raised', 'complaint')
        refreshBadges()
      }
    )

    // Complaint status updates
    channel.on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'complaints' },
      (payload) => {
        const oldStatus = payload.old?.status
        const newStatus = payload.new?.status
        if (oldStatus !== newStatus && newStatus) {
          pushToast(`Complaint updated to "${newStatus}"`, 'complaint')
          refreshBadges()
        }
      }
    )

    // New announcements
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'announcements' },
      (payload) => {
        pushToast(`New announcement: ${payload.new?.title ?? ''}`, 'announcement')
        refreshBadges()
      }
    )

    // New payments (useful for board members)
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'payments' },
      () => {
        pushToast('New payment recorded', 'payment')
      }
    )

    channel.subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [refreshBadges])

  function dismissToast(id) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  return (
    <RealtimeContext.Provider value={{ toasts, badges, refreshBadges, dismissToast }}>
      {children}
    </RealtimeContext.Provider>
  )
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext)
  if (!ctx) throw new Error('useRealtime must be used inside RealtimeProvider')
  return ctx
}
