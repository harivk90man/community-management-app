import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// ─── session re-initialization on resume ─────────────────────────────────────

let needsReinit = false

/**
 * Force the Supabase client to re-initialize its internal auth state
 * from localStorage. This fixes the stale in-memory auth headers that
 * cause silent empty results after idle/minimize/tab switch.
 *
 * setSession() resets the client's internal Authorization header,
 * timer state, and token cache — without a network call.
 */
async function reinitSession() {
  if (!needsReinit) return true

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return false

    // Force the client to fully reset its internal state with this session
    const { error } = await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    })
    if (error) return false

    needsReinit = false
    return true
  } catch {
    return false
  }
}

// ─── global resume detection ─────────────────────────────────────────────────

let lostFocusAt = 0

function onHide() {
  if (!lostFocusAt) lostFocusAt = Date.now()
}

function onResume() {
  if (!lostFocusAt) return false
  lostFocusAt = 0
  needsReinit = true // mark session for re-initialization
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
      // Re-initialize Supabase client's auth state if we've been idle
      const sessionOk = await reinitSession()
      if (!sessionOk) {
        await supabase.auth.signOut().catch(() => {})
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
        // Force full re-init and retry
        needsReinit = true
        const ok = await reinitSession()
        if (!ok) {
          await supabase.auth.signOut().catch(() => {})
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

  // Re-fetch when app resumes — listen for focus to detect any return
  useEffect(() => {
    function handleFocus() {
      // If we were hidden, needsReinit is already true from the global listener
      if (needsReinit && mountedRef.current) {
        execute(true)
      }
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [execute])

  const retry = useCallback(() => {
    fetchingRef.current = false
    needsReinit = true // force re-init on manual retry too
    execute(false)
  }, [execute])

  return { loading, error, retry }
}
