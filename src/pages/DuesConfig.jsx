import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { usePageData } from '../hooks/usePageData'

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
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [form, setForm]         = useState({
    monthly_amount: '',
    effective_from: new Date().toISOString().slice(0, 10),
    set_by: user?.email ?? '',
  })

  // Association config state
  const [assocConfig, setAssocConfig] = useState({ opening_balance: 0, due_day: 10, upi_id: '' })
  const [savingAssoc, setSavingAssoc] = useState(false)
  const [assocMsg, setAssocMsg]       = useState({ type: '', text: '' })
  const [editingAssoc, setEditingAssoc] = useState(false)
  const [assocForm, setAssocForm]     = useState({ opening_balance: '', due_day: '10', upi_id: '' })

  const { loading, error: fetchError, retry: fetchRetry } = usePageData(async () => {
    const [duesRes, assocRes] = await Promise.all([
      supabase.from('dues_config').select('*').order('effective_from', { ascending: false }),
      supabase.from('association_config').select('*').limit(1).single(),
    ])
    if (duesRes.error) throw duesRes.error
    setConfigs(duesRes.data ?? [])
    if (assocRes.data) {
      setAssocConfig(assocRes.data)
      setAssocForm({
        opening_balance: String(assocRes.data.opening_balance ?? 0),
        due_day: String(assocRes.data.due_day ?? 10),
        upi_id: assocRes.data.upi_id ?? '',
      })
    }
  }, [])

  async function handleAssocSave() {
    setSavingAssoc(true)
    setAssocMsg({ type: '', text: '' })
    try {
      const payload = {
        opening_balance: Number(assocForm.opening_balance) || 0,
        due_day: Math.min(28, Math.max(1, Number(assocForm.due_day) || 10)),
        upi_id: assocForm.upi_id.trim() || null,
        updated_at: new Date().toISOString(),
      }
      if (assocConfig.id) {
        const { error: err } = await supabase.from('association_config').update(payload).eq('id', assocConfig.id)
        if (err) throw err
        setAssocConfig(prev => ({ ...prev, ...payload }))
      } else {
        const { data, error: err } = await supabase.from('association_config').insert(payload).select().single()
        if (err) throw err
        setAssocConfig(data)
      }
      setAssocMsg({ type: 'success', text: 'Association settings saved!' })
      setEditingAssoc(false)
      setTimeout(() => setAssocMsg({ type: '', text: '' }), 3000)
    } catch (e) {
      setAssocMsg({ type: 'error', text: e.message })
    } finally {
      setSavingAssoc(false)
    }
  }

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

      {/* Association Config */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Association Settings</h2>
            <p className="text-xs text-gray-400 mt-0.5">Opening balance & default due date</p>
          </div>
          {!editingAssoc && (
            <button onClick={() => setEditingAssoc(true)}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200
                         hover:border-gray-300 rounded-lg transition">
              Edit
            </button>
          )}
        </div>

        {assocMsg.text && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
            assocMsg.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700'}`}>
            {assocMsg.text}
          </div>
        )}

        {editingAssoc ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Opening Balance (₹)" required>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                  <input type="number" step="0.01" value={assocForm.opening_balance}
                    onChange={e => setAssocForm(p => ({ ...p, opening_balance: e.target.value }))}
                    placeholder="e.g. 50000" className={inputCls + ' pl-7'} />
                </div>
                <p className="text-xs text-gray-400 mt-1">Total funds the association has as of April 2026</p>
              </Field>
              <Field label="Due Day (of every month)" required>
                <input type="number" min="1" max="28" value={assocForm.due_day}
                  onChange={e => setAssocForm(p => ({ ...p, due_day: e.target.value }))}
                  className={inputCls} />
                <p className="text-xs text-gray-400 mt-1">Residents not paying by this day = defaulter</p>
              </Field>
            </div>
            <Field label="UPI ID (for Pay Now)">
              <input type="text" value={assocForm.upi_id}
                onChange={e => setAssocForm(p => ({ ...p, upi_id: e.target.value }))}
                placeholder="e.g. yourname@okhdfcbank" className={inputCls} />
              <p className="text-xs text-gray-400 mt-1">Residents will pay to this UPI ID via the Pay Now button</p>
            </Field>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => { setEditingAssoc(false); setAssocForm({ opening_balance: String(assocConfig.opening_balance ?? 0), due_day: String(assocConfig.due_day ?? 10) }) }}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200
                           hover:border-gray-300 rounded-lg transition">Cancel</button>
              <button onClick={handleAssocSave} disabled={savingAssoc}
                className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700
                           disabled:bg-green-400 text-white text-sm font-semibold rounded-lg transition">
                {savingAssoc && <Spinner />}{savingAssoc ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-500 font-medium">Opening Balance</p>
                <p className="text-xl font-bold text-blue-700 mt-1">₹{fmt(assocConfig.opening_balance ?? 0)}</p>
              </div>
              <div className="p-4 bg-amber-50 rounded-lg">
                <p className="text-xs text-amber-500 font-medium">Payment Due Day</p>
                <p className="text-xl font-bold text-amber-700 mt-1">{assocConfig.due_day ?? 10}th of every month</p>
                <p className="text-xs text-amber-400 mt-0.5">After this = defaulter</p>
              </div>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-xs text-green-600 font-medium">UPI ID (Pay Now)</p>
              {assocConfig.upi_id ? (
                <p className="text-base font-bold text-green-800 font-mono mt-1 break-all">{assocConfig.upi_id}</p>
              ) : (
                <p className="text-sm text-green-400 mt-1 italic">Not set — residents cannot use Pay Now</p>
              )}
            </div>
          </div>
        )}
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
