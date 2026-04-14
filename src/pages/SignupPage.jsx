import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const inputCls = `w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900
  placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500
  focus:border-transparent transition`

export default function SignupPage() {
  const navigate = useNavigate()

  const [mode,     setMode]     = useState('email') // 'email' | 'phone'
  const [email,    setEmail]    = useState('')
  const [phone,    setPhone]    = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  function switchMode(m) { setMode(m); setError('') }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    try {
      // Step 1 — verify the villa exists for this email / phone
      let villa = null

      if (mode === 'email') {
        const { data } = await supabase
          .from('villas').select('id').eq('email', email.trim()).eq('is_active', true).maybeSingle()
        villa = data
      } else {
        // Normalize digits only — handles +91, spaces, dashes, etc.
        const digits = phone.replace(/\D/g, '')
        const { data: allVillas } = await supabase
          .from('villas').select('id, phone').eq('is_active', true)
        villa = allVillas?.find(v => v.phone?.replace(/\D/g, '') === digits) ?? null
      }

      if (!villa) {
        setError('Your details are not registered. Please contact your board member.')
        return
      }

      // Step 2 — create Supabase auth account
      const authEmail = mode === 'phone'
        ? `${phone.replace(/\D/g, '')}@villaapp.local`
        : email.trim()

      const { error: signUpError } = await supabase.auth.signUp({ email: authEmail, password })
      if (signUpError) throw signUpError

      navigate('/login', { state: { message: 'Account created! Please login.' } })
    } catch (err) {
      const msg = err.message ?? ''
      if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('already been registered')) {
        setError('An account with this ' + (mode === 'email' ? 'email' : 'phone number') + ' already exists. Please login instead.')
      } else if (msg.toLowerCase().includes('invalid') && msg.toLowerCase().includes('email')) {
        setError('This email address was not accepted by the server. Try a different email or use phone sign-up instead.')
      } else {
        setError(msg || 'Sign up failed. Please try again.')
      }
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
          <h2 className="text-lg font-semibold text-gray-800 mb-5">Create your account</h2>

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
                {m === 'email' ? 'Sign up with Email' : 'Sign up with Phone'}
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
                <p className="text-xs text-gray-400 mt-1">Must match the email registered for your villa.</p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone number</label>
                <input type="tel" required value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+91 98765 43210" className={inputCls} />
                <p className="text-xs text-gray-400 mt-1">Must match the phone registered for your villa.</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <input type="password" required value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min. 6 characters" className={inputCls} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm password</label>
              <input type="password" required value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Re-enter password" className={inputCls} />
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-green-400
                         text-white text-sm font-semibold transition focus:outline-none focus:ring-2
                         focus:ring-green-500 focus:ring-offset-2 flex items-center justify-center gap-2">
              {loading && (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-green-700 font-medium hover:underline">Login</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
