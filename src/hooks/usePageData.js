import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// Module-level: track when we last validated the session with the server.
// Shared across all pages so we don't validate on every single navigation.
let lastValidatedAt = 0
const VALIDATE_INTERVAL = 5 * 60 * 1000 // 5 minutes

/**
 * Validate the session is still good by calling getUser() (server check).
 * Only does the server call if we haven't validated in the last 5 minutes.
 * Returns true if session is valid, false if user should be signed out.
 */
async function ensureValidSession() {
  const now = Date.now()

  // If we validated recently, trust the cache
  if (now - lastValidatedAt < VALIDATE_INTERVAL) {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) return true
  }

  // Server-side validation: getUser() actually hits Supabase auth server
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    // Token is invalid/expired — try to refresh
    const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession()
    if (refreshErr || !refreshData?.session) {
      // Refresh also failed — session is truly dead
      await supabase.auth.signOut()
      return false
    }
    lastValidatedAt = Date.now()
    return true
  }

  lastValidatedAt = now
  return true
}

/**
 * Hook for loading page data from Supabase with:
 * - Server-validated session check before fetching (every 5 min)
 * - Error display with retry button
 * - Stale-session auto-recovery (refreshes token and retries)
 * - Abort on unmount (prevents setState on unmounted component)
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
  const mountedRef = useRef(true)
  const retriedRef = useRef(false)

  const execute = useCallback(async () => {
    if (!mountedRef.current) return
    setLoading(true)
    setError('')

    try {
      // Validate session with the server before fetching data
      const valid = await ensureValidSession()
      if (!valid) {
        if (mountedRef.current) {
          setError('Session expired. Redirecting to login…')
          setLoading(false)
        }
        return
      }

      await fetchFn()
    } catch (err) {
      if (!mountedRef.current) return

      const msg = err?.message ?? 'Failed to load data.'

      // If it's an auth error and we haven't retried yet, refresh and retry
      if (!retriedRef.current && (msg.includes('JWT') || msg.includes('token') || msg.includes('401'))) {
        retriedRef.current = true
        // Force re-validation since something went wrong
        lastValidatedAt = 0
        const valid = await ensureValidSession()
        if (!valid) {
          if (mountedRef.current) setError('Session expired. Redirecting to login…')
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

  useEffect(() => {
    mountedRef.current = true
    retriedRef.current = false
    execute()
    return () => { mountedRef.current = false }
  }, [execute])

  const retry = useCallback(() => {
    retriedRef.current = false
    lastValidatedAt = 0 // Force fresh validation on manual retry
    execute()
  }, [execute])

  return { loading, error, retry }
}
