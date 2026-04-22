import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// ─── session health check on resume ─────────────────────────────────────────

let needsCheck = false
let lostFocusAt = 0

const SKIP_THRESHOLD_MS = 30_000 // skip re-check if hidden < 30s

/**
 * Verify that we have a valid Supabase session. getSession() reads from
 * localStorage and automatically refreshes expired tokens via the internal
 * lock — no setSession() needed (which was causing redundant _getUser()
 * calls, SIGNED_IN events, and lock contention).
 */
async function checkSession() {
  if (!needsCheck) return true

  try {
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error) {
      console.warn('[usePageData] getSession error:', error.message)
      return false
    }
    if (!session) {
      console.warn('[usePageData] no session found')
      return false
    }
    needsCheck = false
    return true
  } catch (e) {
    console.warn('[usePageData] checkSession exception:', e)
    return false
  }
}

// ─── global resume detection ─────────────────────────────────────────────────

function onHide() {
  if (!lostFocusAt) lostFocusAt = Date.now()
}

function onResume() {
  if (!lostFocusAt) return false
  const away = Date.now() - lostFocusAt
  lostFocusAt = 0
  if (away < SKIP_THRESHOLD_MS) return false // was hidden briefly, token is fine
  needsCheck = true
  return true
}

// Attach ONE set of global listeners (not per-hook)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') onHide()
  else onResume()
})
window.addEventListener('blur', onHide)
window.addEventListener('focus', onResume)
window.addEventListener('pageshow', (e) => { if (e.persisted) onResume() })

// ─── hook ────────────────────────────────────────────────────────────────────

export function usePageData(fetchFn, deps = []) {
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const mountedRef  = useRef(true)
  const fetchingRef = useRef(false)

  const execute = useCallback(async (isResume = false) => {
    if (!mountedRef.current) return
    if (fetchingRef.current) return
    fetchingRef.current = true

    if (!isResume) setLoading(true)
    setError('')

    try {
      // If resuming after idle, give Supabase's own _recoverAndRefresh()
      // a moment to finish (it fires on visibilitychange before our focus handler)
      if (isResume) await new Promise(r => setTimeout(r, 300))

      const sessionOk = await checkSession()
      if (!sessionOk) {
        // Don't silently sign out — show an error so the user can retry
        if (mountedRef.current) setError('Session expired. Please refresh or log in again.')
        fetchingRef.current = false
        if (mountedRef.current) setLoading(false)
        return
      }

      await fetchFn()
    } catch (err) {
      if (!mountedRef.current) { fetchingRef.current = false; return }

      const msg = err?.message ?? 'Failed to load data.'
      const isAuthError = msg.includes('JWT') || msg.includes('token')
        || msg.includes('401') || msg.includes('403')

      if (isAuthError) {
        console.warn('[usePageData] auth error, retrying after delay:', msg)
        // Wait for Supabase auto-refresh to stabilize, then retry once
        await new Promise(r => setTimeout(r, 1000))
        needsCheck = true
        const ok = await checkSession()
        if (!ok) {
          if (mountedRef.current) setError('Session expired. Please refresh or log in again.')
          fetchingRef.current = false
          if (mountedRef.current) setLoading(false)
          return
        }
        try {
          await fetchFn()
        } catch (retryErr) {
          if (mountedRef.current) {
            setError(retryErr?.message ?? 'Failed to load data after retry.')
          }
        }
      } else {
        setError(msg)
      }
    }

    fetchingRef.current = false
    if (mountedRef.current) setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  // Fetch on mount / deps change
  useEffect(() => {
    mountedRef.current = true
    execute(false)
    return () => { mountedRef.current = false }
  }, [execute])

  // Re-fetch when app resumes after meaningful inactivity
  useEffect(() => {
    function handleFocus() {
      if (needsCheck && mountedRef.current) {
        execute(true)
      }
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [execute])

  const retry = useCallback(() => {
    fetchingRef.current = false
    needsCheck = true // force session check on manual retry
    execute(false)
  }, [execute])

  return { loading, error, retry }
}
