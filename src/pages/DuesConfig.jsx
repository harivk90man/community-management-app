import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

function fmt(n) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)
}
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function DuesConfig() {
  const { role, user } = useAuth()
  if (role !== 'board') {
    return (
      <div className="p-6 py-24 text-center">
        <p className="text-gray-500 font-medium">This page is for board members only.</p>
      </div>
    )
  }
  return <BoardView user={user} />
}

function BoardView({ user }) {
  const [configs, setConfigs]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [form, setForm]         = useState({
    monthly_amount: '',
    effective_from: new Date().toISOString().slice(0, 10),
    set_by: user?.email ?? '',
  })

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('dues_config')
      .select('*')
      .order('effective_from', { ascending: false })
    setConfigs(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const current = configs[0] ?? null  // most recent by effective_from

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault(); setError('')
    const amount = Number(form.monthly_amount)
    if (!amount || amount <= 0) { setError('Enter a valid amount.'); return }
    setSaving(true)
    try {
      const { data, error: err } = await supabase.from('dues_config').insert({
        monthly_amount: amount,
        effective_from: form.effective_from,
        set_by: form.set_by.trim() || null,
      }).select().single()
      if (err) throw err
      setConfigs(prev => [data, ...prev])
      setShowForm(false)
      setForm({ monthly_amount: '', effective_from: new Date().toISOString().slice(0, 10), set_by: user?.email ?? '' })
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dues Configuration</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage monthly maintenance due amounts</p>
        </div>
        <button onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                     text-white text-sm font-semibold rounded-lg transition">
          <PlusIcon className="w-4 h-4" />
          {showForm ? 'Cancel' : 'Set New Amount'}
        </button>
      </div>

      {/* Current active rate */}
      <div className={`rounded-2xl p-6 mb-6 ${current
        ? 'bg-gradient-to-br from-green-600 to-green-500 text-white'
        : 'bg-gray-100 text-gray-500'}`}>
        <p className={`text-sm font-medium ${current ? 'text-green-100' : 'text-gray-400'}`}>
          Current Monthly Due
        </p>
        <p className={`text-4xl font-black mt-1 ${current ? 'text-white' : 'text-gray-400'}`}>
          {current ? `₹${fmt(current.monthly_amount)}` : 'Not set'}
        </p>
        {current && (
          <p className="text-green-200 text-sm mt-2">
            Effective from {fmtDate(current.effective_from)}
            {current.set_by && ` · Set by ${current.set_by}`}
          </p>
        )}
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Set New Due Amount</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <ErrorBox msg={error} />}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Monthly Amount (₹)" required>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                  <input type="number" required min="1" step="0.01" value={form.monthly_amount}
                    onChange={e => set('monthly_amount', e.target.value)}
                    placeholder="e.g. 2000" className={inputCls + ' pl-7'} />
                </div>
              </Field>
              <Field label="Effective From" required>
                <input type="date" required value={form.effective_from}
                  onChange={e => set('effective_from', e.target.value)} className={inputCls} />
              </Field>
            </div>
            <Field label="Set By">
              <input type="text" value={form.set_by}
                onChange={e => set('set_by', e.target.value)} placeholder="Your name" className={inputCls} />
            </Field>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200
                           hover:border-gray-300 rounded-lg transition">Cancel</button>
              <button type="submit" disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700
                           disabled:bg-green-400 text-white text-sm font-semibold rounded-lg transition">
                {saving && <Spinner />}{saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* History */}
      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-3">History</h2>
        {loading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4">
                <div className="h-6 w-24 bg-gray-100 rounded animate-pulse" />
                <div className="h-4 w-32 bg-gray-100 rounded animate-pulse ml-auto" />
              </div>
            ))}
          </div>
        ) : configs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 py-10 text-center">
            <p className="text-gray-400 text-sm">No dues configured yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <Th>Monthly Amount</Th><Th>Effective From</Th><Th>Set By</Th><Th>Added On</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {configs.map((c, i) => (
                  <tr key={c.id} className={`hover:bg-gray-50 transition-colors ${i === 0 ? 'font-semibold' : ''}`}>
                    <td className="px-4 py-3">
                      <span className="text-gray-900">₹{fmt(c.monthly_amount)}</span>
                      {i === 0 && (
                        <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                          Current
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(c.effective_from)}</td>
                    <td className="px-4 py-3 text-gray-500">{c.set_by || '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── shared ───────────────────────────────────────────────────────────────────

function Field({ label, required, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
function Th({ children }) {
  return <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-left whitespace-nowrap">{children}</th>
}
function ErrorBox({ msg }) {
  return <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{msg}</div>
}
function Spinner() {
  return <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
}
const inputCls = `w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
  focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition`
function PlusIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
}
