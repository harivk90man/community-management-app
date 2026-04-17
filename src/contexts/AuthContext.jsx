import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [villa, setVilla] = useState(null)  // the villa row for logged-in user
  const [role, setRole] = useState(null)    // 'board' | 'resident'
  const [loading, setLoading] = useState(true)

  async function loadVillaProfile(authEmail) {
    // Phone-based logins use {digits}@villaapp.local as the Supabase auth email
    const isPhoneEmail = authEmail.endsWith('@villaapp.local')

    let data = null

    if (isPhoneEmail) {
      // Digits are already normalized (set at signup). Match against stored phone
      // by stripping non-digits from both sides to handle any formatting in the DB.
      const digits = authEmail.slice(0, authEmail.lastIndexOf('@'))
      const { data: allVillas } = await supabase.from('villas').select('*').eq('is_active', true)
      data = allVillas?.find(v => v.phone?.replace(/\D/g, '') === digits) ?? null
    } else {
      const { data: row } = await supabase
        .from('villas').select('*').eq('email', authEmail).eq('is_active', true).maybeSingle()
      data = row ?? null
    }

    if (!data) {
      setVilla(null)
      setRole('resident')
      return
    }

    setVilla(data)
    setRole(data.is_board_member ? 'board' : 'resident')
  }

  useEffect(() => {
    let cancelled = false

    // Step 1: restore any existing session from localStorage immediately.
    // This is the primary initialisation path — avoids a blank loading screen.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return
      if (session?.user?.email) {
        setUser(session.user)
        try { await loadVillaProfile(session.user.email) }
        finally { if (!cancelled) setLoading(false) }
      } else {
        setUser(null)
        setVilla(null)
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
          setRole(null)
          setLoading(false)
          return
        }

        if (event === 'INITIAL_SESSION') {
          // Already handled by getSession() above — skip to avoid a double load
          return
        }

        // SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED — refresh user + villa profile
        setUser(session?.user ?? null)
        if (session?.user?.email) {
          await loadVillaProfile(session.user.email)
        } else {
          setVilla(null)
          setRole(null)
        }
        setLoading(false)
      }
    )

    // Step 3: silently refresh the session when the user returns to this tab.
    // Uses getSession() to re-validate the token — if expired, Supabase auto-refreshes it.
    // No hard redirects here; the onAuthStateChange listener handles SIGNED_OUT naturally.
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function logout() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  const value = { user, villa, role, loading, login, logout }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
