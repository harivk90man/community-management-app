import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [villa, setVilla] = useState(null)      // the villa row
  const [villaUser, setVillaUser] = useState(null)  // the logged-in person's row from villa_users
  const [role, setRole] = useState(null)         // 'board' | 'resident'
  const [loading, setLoading] = useState(true)
  const villaRef = useRef(null) // track villa outside the closure for onAuthStateChange

  async function loadVillaProfile(authEmail) {
    // Phone-based logins use {digits}@villaapp.local as the Supabase auth email
    const isPhoneEmail = authEmail.endsWith('@villaapp.local')

    let vuRow = null  // villa_users row

    if (isPhoneEmail) {
      const digits = authEmail.slice(0, authEmail.lastIndexOf('@'))
      const { data: allVU } = await supabase.from('villa_users').select('*')
      vuRow = allVU?.find(vu => vu.phone?.replace(/\D/g, '') === digits) ?? null
    } else {
      const { data: row } = await supabase
        .from('villa_users').select('*').eq('email', authEmail).maybeSingle()
      vuRow = row ?? null
    }

    // Fallback: check villas table directly (for users not yet migrated to villa_users)
    if (!vuRow) {
      let villaData = null
      if (isPhoneEmail) {
        const digits = authEmail.slice(0, authEmail.lastIndexOf('@'))
        const { data: allVillas } = await supabase.from('villas').select('*').eq('is_active', true)
        villaData = allVillas?.find(v => v.phone?.replace(/\D/g, '') === digits) ?? null
      } else {
        const { data: row } = await supabase
          .from('villas').select('*').eq('email', authEmail).eq('is_active', true).maybeSingle()
        villaData = row ?? null
      }

      if (!villaData) {
        setVilla(null)
        setVillaUser(null)
        setRole('resident')
        return
      }

      setVilla(villaData)
      setVillaUser({ name: villaData.owner_name, email: villaData.email, phone: villaData.phone })
      setRole(villaData.is_board_member ? 'board' : 'resident')
      return
    }

    // Load the villa for this villa_user
    const { data: villaData } = await supabase
      .from('villas').select('*').eq('id', vuRow.villa_id).eq('is_active', true).maybeSingle()

    if (!villaData) {
      setVilla(null)
      setVillaUser(null)
      setRole('resident')
      return
    }

    setVillaUser(vuRow)
    setVilla(villaData)
    setRole(villaData.is_board_member ? 'board' : 'resident')
  }

  // Keep ref in sync so the onAuthStateChange closure can read current villa
  useEffect(() => { villaRef.current = villa }, [villa])

  useEffect(() => {
    let cancelled = false

    // Step 1: restore session from localStorage.
    // getSession() reads from localStorage and auto-refreshes expired tokens.
    // No setSession() needed — it caused redundant _getUser() calls and
    // SIGNED_IN events that triggered unnecessary loadVillaProfile() reloads.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return
      if (session?.user?.email) {

        setUser(session.user)
        try {
          // Timeout loadVillaProfile so loading never hangs forever
          await Promise.race([
            loadVillaProfile(session.user.email),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10_000)),
          ])
        } catch {
          // Profile load failed or timed out — still show the app, just without villa context
          setVilla(null)
          setVillaUser(null)
          setRole('resident')
        }
        if (!cancelled) setLoading(false)
      } else {
        setUser(null)
        setVilla(null)
        setVillaUser(null)
        setRole(null)
        setLoading(false)
      }
    })

    // Step 2: subscribe to future auth changes.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (cancelled) return

        if (event === 'SIGNED_OUT') {
          // Clear all state; ProtectedRoute will redirect to /login
          setUser(null)
          setVilla(null)
          setVillaUser(null)
          setRole(null)
          setLoading(false)
          return
        }

        if (event === 'INITIAL_SESSION') {
          // Already handled by getSession() above — skip to avoid a double load
          return
        }

        // TOKEN_REFRESHED — user didn't change, just update the user object.
        // SIGNED_IN — only reload profile if we don't have one yet.
        // Supabase's _recoverAndRefresh() fires SIGNED_IN on every tab restore;
        // re-running loadVillaProfile() each time can race with page queries
        // and temporarily set villa=null if the DB call fails, breaking
        // navigation to pages that depend on villa context.
        setUser(session?.user ?? null)
        if (event === 'SIGNED_IN' && session?.user?.email && !villaRef.current) {
          await loadVillaProfile(session.user.email)
        }
        setLoading(false)
      }
    )

    // Session refresh on tab resume is handled centrally by usePageData.js
    // (single-flight refresh + re-fetch). AuthContext picks up the refreshed
    // token via onAuthStateChange TOKEN_REFRESHED above.

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const login = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }, [])

  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }, [])

  // Memoize so consumers don't re-render unless actual values change
  const value = useMemo(
    () => ({ user, villa, villaUser, role, loading, login, logout }),
    [user, villa, villaUser, role, loading, login, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
