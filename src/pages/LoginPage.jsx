import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const inputCls = `w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900
  placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500
  focus:border-transparent transition`

export default function LoginPage() {
  const { login }  = useAuth()
  const navigate   = useNavigate()
  const location   = useLocation()
  const successMsg = location.state?.message ?? ''

  const [mode,     setMode]     = useState('email') // 'email' | 'phone'
  const [email,    setEmail]    = useState('')
  const [phone,    setPhone]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  function switchMode(m) { setMode(m); setError('') }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const authEmail = mode === 'phone'
        ? `${phone.trim()}@villaapp.local`
        : email.trim()

      try {
        await login(authEmail, password)
        navigate('/', { replace: true })
        return
      } catch (firstErr) {
        // If phone login failed, the user might have added a recovery email
        // which changed their auth email. Look up their real email from villa_users.
        if (mode === 'phone') {
          const digits = phone.replace(/\D/g, '')
          const { data: allVU } = await supabase.from('villa_users').select('email, phone')
          const match = allVU?.find(vu => vu.phone?.replace(/\D/g, '') === digits && vu.email)
          if (match?.email) {
            await login(match.email, password)
            navigate('/', { replace: true })
            return
          }
        }
        throw firstErr
      }
    } catch (err) {
      setError(err.message ?? 'Login failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Logo + title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-600 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 22V12h6v10" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Ashirvadh Castle Rock</h1>
          <p className="text-sm text-gray-500 mt-1">Association Management Portal</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-5">Sign in to your account</h2>

          {/* Success message from signup */}
          {successMsg && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
              {successMsg}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Mode toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-5">
            {['email', 'phone'].map(m => (
              <button key={m} type="button" onClick={() => switchMode(m)}
                className={`flex-1 py-2 text-sm font-medium transition ${
                  mode === m ? 'bg-green-600 text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}>
                {m === 'email' ? 'Login with Email' : 'Login with Phone'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === 'email' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
                <input type="email" required value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" className={inputCls} />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone number</label>
                <input type="tel" required value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+91 98765 43210" className={inputCls} />
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-gray-700">Password</label>
                <Link to="/forgot-password" className="text-xs text-green-600 hover:underline">
                  Forgot password?
                </Link>
              </div>
              <input type="password" required value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" className={inputCls} />
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-green-400
                         text-white text-sm font-semibold transition focus:outline-none focus:ring-2
                         focus:ring-green-500 focus:ring-offset-2 flex items-center justify-center gap-2">
              {loading && (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            New resident?{' '}
            <Link to="/signup" className="text-green-700 font-medium hover:underline">Sign up</Link>
          </p>

          <p className="text-center text-xs text-gray-400 mt-5">
            Community Manager · v1.0
          </p>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Contact your association administrator to get access.
        </p>
      </div>
    </div>
  )
}
