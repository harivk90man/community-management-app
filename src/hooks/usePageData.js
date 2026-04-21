import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// ─── shared session refresh (prevents concurrent calls) ─────────────────────

let refreshInFlight = null

/**
 * Single-flight session refresh. If a refresh is already in progress,
 * all callers share the same promise. Prevents Supabase refresh token
 * from being used twice (which invalidates the session).
 */
function safeRefreshSession() {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = supabase.auth.refreshSession()
    .finally(() => { refreshInFlight = null })
  return refreshInFlight
}

// ─── session validation ──────────────────────────────────────────────────────

let lastValidatedAt = 0
const VALIDATE_INTERVAL = 5 * 60 * 1000 // 5 minutes

function withTimeout(promise, ms = 10_000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), ms)),
  ])
}

function isTokenExpired(session) {
  if (!session?.expires_at) return true
  return session.expires_at - 30 < Date.now() / 1000
}

/**
 * Validate the session is still good. Returns:
 *   true           — session valid
 *   false          — session dead, should sign out
 *   'network_error' — network issue, show retry
 */
async function ensureValidSession() {
  const now = Date.now()

  if (now - lastValidatedAt < VALIDATE_INTERVAL) {
    const { data: { session } } = await supabase.auth.getSession()
    if (session && !isTokenExpired(session)) return true
  }

  try {
    const { data: { user }, error } = await withTimeout(supabase.auth.getUser())

    if (error || !user) {
      const { data, error: refreshErr } = await withTimeout(safeRefreshSession())
      if (refreshErr || !data?.session) {
        await supabase.auth.signOut()
        return false
      }
      lastValidatedAt = Date.now()
      return true
    }

    lastValidatedAt = now
    return true
  } catch {
    try {
      const { data, error } = await withTimeout(safeRefreshSession(), 8000)
      if (error || !data?.session) {
        await supabase.auth.signOut()
        return false
      }
      lastValidatedAt = Date.now()
      return true
    } catch {
      return 'network_error'
    }
  }
}

// ─── app resume: single event bus ────────────────────────────────────────────

const resumeListeners = new Set()
let hiddenAt = 0
let resumeHandled = false

/**
 * One global visibilitychange + focus listener. When the app resumes:
 *  1. Refresh the session ONCE (safe, deduplicated)
 *  2. Notify all usePageData hooks to re-fetch
 */
function onVisible() {
  if (resumeHandled) return
  resumeHandled = true
  // Reset after a tick so rapid visibility+focus events don't double-fire
  setTimeout(() => { resumeHandled = false }, 2000)

  lastValidatedAt = 0 // force re-validation

  // Refresh session first, then tell all pages to re-fetch
  safeRefreshSession().finally(() => {
    resumeListeners.forEach(fn => fn())
  })
}

function handleVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now()
  } else if (document.visibilityState === 'visible' && hiddenAt > 0) {
    const away = Date.now() - hiddenAt
    hiddenAt = 0
    if (away > 3_000) onVisible()
  }
}

function handleFocus() {
  // Only fire if we were actually hidden (hiddenAt was set)
  if (hiddenAt > 0) {
    const away = Date.now() - hiddenAt
    hiddenAt = 0
    if (away > 3_000) onVisible()
  }
}

// Attach once at module load
document.addEventListener('visibilitychange', handleVisibilityChange)
window.addEventListener('focus', handleFocus)

// ─── hook ────────────────────────────────────────────────────────────────────

export function usePageData(fetchFn, deps = []) {
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const mountedRef = useRef(true)
  const retriedRef = useRef(false)

  const execute = useCallback(async () => {
    if (!mountedRef.current) return
    setLoading(true)
    setError('')

    try {
      const result = await ensureValidSession()
      if (result === 'network_error') {
        if (mountedRef.current) {
          setError('Network error. Check your connection and try again.')
          setLoading(false)
        }
        return
      }
      if (!result) {
        await supabase.auth.signOut().catch(() => {})
        if (mountedRef.current) setLoading(false)
        return
      }

      await fetchFn()
    } catch (err) {
      if (!mountedRef.current) return
      const msg = err?.message ?? 'Failed to load data.'

      if (!retriedRef.current && (msg.includes('JWT') || msg.includes('token') || msg.includes('401') || msg.includes('timed out'))) {
        retriedRef.current = true
        lastValidatedAt = 0
        const retryResult = await ensureValidSession()
        if (retryResult === 'network_error') {
          if (mountedRef.current) setError('Network error. Check your connection and try again.')
        } else if (!retryResult) {
          await supabase.auth.signOut().catch(() => {})
          if (mountedRef.current) setLoading(false)
          return
        } else {
          try {
            await fetchFn()
            if (mountedRef.current) { setLoading(false); setError('') }
            return
          } catch (retryErr) {
            if (mountedRef.current) setError(retryErr?.message ?? 'Failed to load data after retry.')
          }
        }
      } else {
        setError(msg)
      }
    }

    if (mountedRef.current) setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  // Initial fetch on mount
  useEffect(() => {
    mountedRef.current = true
    retriedRef.current = false
    execute()
    return () => { mountedRef.current = false }
  }, [execute])

  // Subscribe to the global resume event — re-fetch when tab comes back
  useEffect(() => {
    function onResume() {
      if (mountedRef.current) {
        retriedRef.current = false
        execute()
      }
    }
    resumeListeners.add(onResume)
    return () => { resumeListeners.delete(onResume) }
  }, [execute])

  const retry = useCallback(() => {
    retriedRef.current = false
    lastValidatedAt = 0
    execute()
  }, [execute])

  return { loading, error, retry }
}
