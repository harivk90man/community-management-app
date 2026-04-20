import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const inputCls = `w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900
  placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500
  focus:border-transparent transition`

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [sent, setSent]       = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const redirectTo = `${window.location.origin}/reset-password`
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
      if (resetErr) throw resetErr
      setSent(true)
    } catch (err) {
      setError(err.message ?? 'Failed to send reset email. Please try again.')
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
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Forgot your password?</h2>
          <p className="text-sm text-gray-500 mb-5">
            Enter your email address and we'll send you a link to reset your password.
          </p>

          {sent ? (
            <div className="space-y-4">
              <div className="px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
                Reset link sent! Check your email inbox (and spam folder) for a link to reset your password.
              </div>
              <p className="text-center text-sm text-gray-500">
                Didn't receive it?{' '}
                <button onClick={() => setSent(false)}
                  className="text-green-700 font-medium hover:underline">
                  Try again
                </button>
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
                  <input type="email" required value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com" className={inputCls} />
                </div>

                <button type="submit" disabled={loading}
                  className="w-full py-2.5 px-4 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-green-400
                             text-white text-sm font-semibold transition focus:outline-none focus:ring-2
                             focus:ring-green-500 focus:ring-offset-2 flex items-center justify-center gap-2">
                  {loading && (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>

              <p className="text-xs text-gray-400 mt-4">
                Phone users: If you haven't added a recovery email yet, please contact your board member to reset your password.
              </p>
            </>
          )}

          <p className="text-center text-sm text-gray-500 mt-6">
            <Link to="/login" className="text-green-700 font-medium hover:underline">Back to login</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
