import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Hook for loading page data from Supabase with:
 * - Automatic session validation before fetching
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
      // Quick session check — getSession() reads from cache, very fast
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        // Try one refresh
        const { error: refreshErr } = await supabase.auth.refreshSession()
        if (refreshErr) {
          setError('Session expired. Please sign in again.')
          setLoading(false)
          return
        }
      }

      await fetchFn()
    } catch (err) {
      if (!mountedRef.current) return

      const msg = err?.message ?? 'Failed to load data.'

      // If it's an auth error and we haven't retried yet, refresh and retry
      if (!retriedRef.current && (msg.includes('JWT') || msg.includes('token') || msg.includes('401'))) {
        retriedRef.current = true
        await supabase.auth.refreshSession()
        try {
          await fetchFn()
          if (mountedRef.current) { setLoading(false); setError('') }
          return
        } catch (retryErr) {
          if (mountedRef.current) setError(retryErr?.message ?? 'Failed to load data after retry.')
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
    execute()
  }, [execute])

  return { loading, error, retry }
}
