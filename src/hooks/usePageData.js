import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// Module-level: track when we last validated the session with the server.
let lastValidatedAt = 0
const VALIDATE_INTERVAL = 5 * 60 * 1000 // 5 minutes

/**
 * Wrap a promise with a timeout so it never hangs forever.
 */
function withTimeout(promise, ms = 10_000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), ms)),
  ])
}

/**
 * Check if a Supabase session's access token is expired or about to expire.
 */
function isTokenExpired(session) {
  if (!session?.expires_at) return true
  // expires_at is in seconds since epoch; consider expired if < 30s remaining
  return session.expires_at - 30 < Date.now() / 1000
}

/**
 * Validate the session is still good by calling getUser() (server check).
 * Only does the server call if we haven't validated in the last 5 minutes.
 * Returns true if session is valid, false if user should be signed out.
 */
async function ensureValidSession() {
  const now = Date.now()

  // If we validated recently, trust the cache — but only if the token isn't expired
  if (now - lastValidatedAt < VALIDATE_INTERVAL) {
    const { data: { session } } = await supabase.auth.getSession()
    if (session && !isTokenExpired(session)) return true
    // Token expired in cache — fall through to server validation
  }

  try {
    // Server-side validation with timeout
    const { data: { user }, error } = await withTimeout(supabase.auth.getUser())

    if (error || !user) {
      // Token is invalid/expired — try to refresh
      const { data: refreshData, error: refreshErr } = await withTimeout(
        supabase.auth.refreshSession()
      )
      if (refreshErr || !refreshData?.session) {
        await supabase.auth.signOut()
        return false
      }
      lastValidatedAt = Date.now()
      return true
    }

    lastValidatedAt = now
    return true
  } catch {
    // Timeout or network error — try refresh as last resort
    try {
      const { data, error } = await withTimeout(supabase.auth.refreshSession(), 8000)
      if (error || !data?.session) {
        await supabase.auth.signOut()
        return false
      }
      lastValidatedAt = Date.now()
      return true
    } catch {
      // Total failure — don't sign out, let user retry
      return false
    }
  }
}

/**
 * Reset the validation timer so the next fetch does a full server check.
 * Called from AuthContext on app resume / visibility change.
 */
export function invalidateSession() {
  lastValidatedAt = 0
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
      if (!retriedRef.current && (msg.includes('JWT') || msg.includes('token') || msg.includes('401') || msg.includes('timed out'))) {
        retriedRef.current = true
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
    lastValidatedAt = 0
    execute()
  }, [execute])

  return { loading, error, retry }
}
