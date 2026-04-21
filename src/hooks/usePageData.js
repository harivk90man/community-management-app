import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Ensure the Supabase access token is fresh before making data queries.
 * Supabase data queries (from().select()) silently return empty arrays
 * with expired tokens + RLS — no errors thrown. So we must check expiry
 * and refresh BEFORE fetching data.
 */
async function ensureFreshToken() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    // No session at all — try refresh, might recover from localStorage
    const { data, error } = await supabase.auth.refreshSession()
    return !error && !!data?.session
  }
  // Check if access token is expired (expires_at is seconds since epoch)
  if (session.expires_at && session.expires_at < Date.now() / 1000) {
    const { data, error } = await supabase.auth.refreshSession()
    return !error && !!data?.session
  }
  return true // token still valid
}

/**
 * Hook for loading page data from Supabase.
 *
 * - Ensures auth token is fresh before every fetch (prevents silent empty results)
 * - Re-fetches when browser tab/window regains focus after being away
 * - On auth errors: refreshes session once and retries
 * - Shows error with retry button on failure
 *
 * Usage:
 *   const { loading, error, retry } = usePageData(async () => {
 *     const { data, error } = await supabase.from('x').select('*')
 *     if (error) throw error
 *     setItems(data ?? [])
 *   }, [dependency])
 */
export function usePageData(fetchFn, deps = []) {
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const mountedRef  = useRef(true)
  const fetchingRef = useRef(false) // prevent overlapping fetches

  const execute = useCallback(async (isResume = false) => {
    if (!mountedRef.current) return
    if (fetchingRef.current) return // already fetching
    fetchingRef.current = true

    // On resume, don't flash loading spinner — just silently refresh data
    if (!isResume) setLoading(true)
    setError('')

    try {
      // Ensure token is fresh — expired tokens cause silent empty results with RLS
      const tokenOk = await ensureFreshToken()
      if (!tokenOk) {
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
        // Let Supabase try to refresh the session internally
        const { data, error: refreshErr } = await supabase.auth.refreshSession()
        if (refreshErr || !data?.session) {
          // Session is truly dead — sign out → ProtectedRoute redirects to login
          await supabase.auth.signOut().catch(() => {})
          fetchingRef.current = false
          if (mountedRef.current) setLoading(false)
          return
        }
        // Retry the fetch with the refreshed session
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

  // Re-fetch when app resumes after being away
  // visibilitychange: fires on tab switch
  // focus/blur: fires on window minimize/restore and app switch (mobile)
  // pageshow: fires on bfcache restore
  useEffect(() => {
    let lostFocusAt = 0

    function onHide() {
      if (!lostFocusAt) lostFocusAt = Date.now()
    }

    function onShow() {
      if (!lostFocusAt) return
      const away = Date.now() - lostFocusAt
      lostFocusAt = 0
      if (away > 3_000 && mountedRef.current) {
        execute(true) // silent re-fetch, no loading spinner
      }
    }

    function handleVisibility() {
      if (document.visibilityState === 'hidden') onHide()
      else onShow()
    }

    function handleBlur() { onHide() }
    function handleFocus() { onShow() }
    function handlePageShow(e) { if (e.persisted) onShow() }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('pageshow', handlePageShow)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [execute])

  const retry = useCallback(() => {
    fetchingRef.current = false // allow retry even if previous fetch stuck
    execute(false)
  }, [execute])

  return { loading, error, retry }
}
