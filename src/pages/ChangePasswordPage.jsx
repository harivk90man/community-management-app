import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const inputCls = `w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900
  placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500
  focus:border-transparent transition`

export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const { villaUser, user, logout } = useAuth()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

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
      // Use the auth email from context (already loaded)
      const authEmail = user?.email
      if (!authEmail) throw new Error('Session error. Please log out and try again.')

      // Use the DB function to set the new password directly
      const { error: rpcErr } = await supabase.rpc('admin_reset_password', {
        target_email: authEmail,
        new_password: password,
      })
      if (rpcErr) throw rpcErr

      // Clear the force_password_change flag
      if (villaUser?.id) {
        await supabase.from('villa_users')
          .update({ force_password_change: false })
          .eq('id', villaUser.id)
      }

      // Sign out and redirect to login — user logs in fresh with new password
      await logout()
      navigate('/login', { replace: true, state: { message: 'Password updated! Please login with your new password.' } })
    } catch (err) {
      setError(err.message ?? 'Failed to update password.')
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
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">Change your password</h2>
              <p className="text-sm text-gray-500">Your password was reset. Please set a new one to continue.</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">New password</label>
              <input type="password" required value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min. 6 characters" className={inputCls} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm new password</label>
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
              {loading ? 'Updating…' : 'Set new password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
