import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { usePageData } from '../hooks/usePageData'
import FetchError from '../components/FetchError'

const CATEGORIES = ['Maintenance', 'Utilities', 'Security', 'Cleaning', 'Events', 'Other']
const CAT_STYLE = {
  Maintenance: 'bg-orange-100 text-orange-700',
  Utilities:   'bg-blue-100   text-blue-700',
  Security:    'bg-red-100    text-red-700',
  Cleaning:    'bg-teal-100   text-teal-700',
  Events:      'bg-purple-100 text-purple-700',
  Other:       'bg-gray-100   text-gray-600',
}

function fmt(n) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)
}
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const today = new Date().toISOString().slice(0, 10)
const EMPTY_FORM = { title: '', amount: '', category: 'Maintenance', expense_date: today, added_by: '' }

export default function Expenses() {
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
  const [expenses, setExpenses]   = useState([])
  const [showForm, setShowForm]   = useState(false)
  const [editing, setEditing]     = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [filterCat, setFilterCat] = useState('')

  const { loading, error: fetchError, retry } = usePageData(async () => {
    const { data, error } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false })
    if (error) throw error
    setExpenses(data ?? [])
  }, [])

  function onSaved(saved, isNew) {
    setExpenses(prev =>
      isNew ? [saved, ...prev] : prev.map(x => x.id === saved.id ? saved : x)
    )
    setShowForm(false); setEditing(null)
  }

  async function handleDelete(e) {
    setDeletingId(e.id)
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', e.id)
      if (error) throw error
      setExpenses(prev => prev.filter(x => x.id !== e.id))
    } catch { /* item stays in list */ }
    setDeletingId(null); setConfirmDel(null)
  }

  const filtered = filterCat ? expenses.filter(e => e.category === filterCat) : expenses
  const total    = filtered.reduce((s, e) => s + Number(e.amount), 0)
  const grandTotal = expenses.reduce((s, e) => s + Number(e.amount), 0)

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Expenses</h1>
          <p className="text-sm text-gray-500 mt-0.5">{expenses.length} records</p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                     text-white text-sm font-semibold rounded-lg transition">
          <PlusIcon className="w-4 h-4" /> Add Expense
        </button>
      </div>

      {fetchError && <FetchError message={fetchError} onRetry={retry} />}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <SummaryCard label="Grand Total" value={`₹${fmt(grandTotal)}`} color="red"    icon={ReceiptIcon} />
        <SummaryCard label={filterCat ? `${filterCat} Total` : 'Filtered Total'}
                     value={`₹${fmt(total)}`}  color="orange" icon={ReceiptIcon} />
        <SummaryCard label="Records"     value={filtered.length}       color="blue"   icon={ListIcon} />
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        <FilterPill active={!filterCat} onClick={() => setFilterCat('')} label="All" />
        {CATEGORIES.map(c => (
          <FilterPill key={c} active={filterCat === c} onClick={() => setFilterCat(filterCat === c ? '' : c)} label={c} />
        ))}
      </div>

      {/* Table */}
      {loading ? <TableSkeleton /> : filtered.length === 0 ? (
        <EmptyState message="No expenses found." onAdd={() => { setEditing(null); setShowForm(true) }} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <Th>Title</Th><Th>Category</Th><Th>Amount</Th><Th>Date</Th><Th>Added By</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{e.title}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full
                        ${CAT_STYLE[e.category] ?? 'bg-gray-100 text-gray-500'}`}>
                        {e.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900">₹{fmt(e.amount)}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(e.expense_date)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{e.added_by || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => { setEditing(e); setShowForm(true) }}
                          className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200
                                     hover:border-gray-300 rounded-lg transition">Edit</button>
                        <button onClick={() => setConfirmDel(e)} disabled={deletingId === e.id}
                          className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200
                                     hover:bg-red-50 rounded-lg transition disabled:opacity-50">
                          {deletingId === e.id ? '…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-100 bg-gray-50">
                  <td colSpan={2} className="px-4 py-3 text-sm font-semibold text-gray-700">
                    {filterCat ? `${filterCat} Total` : 'Total'}
                  </td>
                  <td className="px-4 py-3 font-bold text-gray-900">₹{fmt(total)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <ExpenseFormModal editing={editing} user={user} onSaved={onSaved}
          onClose={() => { setShowForm(false); setEditing(null) }} />
      )}
      {confirmDel && (
        <ConfirmModal message={`Delete "${confirmDel.title}"?`} loading={deletingId === confirmDel.id}
          onConfirm={() => handleDelete(confirmDel)} onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  )
}

function ExpenseFormModal({ editing, user, onSaved, onClose }) {
  const isEdit = Boolean(editing)
  const [form, setForm] = useState(isEdit ? {
    title: editing.title, amount: String(editing.amount), category: editing.category,
    expense_date: editing.expense_date, added_by: editing.added_by ?? '',
  } : { ...EMPTY_FORM, added_by: user?.email ?? '' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault(); setError('')
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) {
      setError('Enter a valid amount.'); return
    }
    setSaving(true)
    const payload = {
      title: form.title.trim(), amount: Number(form.amount),
      category: form.category, expense_date: form.expense_date,
      added_by: form.added_by.trim() || null,
    }
    try {
      if (isEdit) {
        const { data, error: err } = await supabase.from('expenses')
          .update(payload).eq('id', editing.id).select().single()
        if (err) throw err; onSaved(data, false)
      } else {
        const { data, error: err } = await supabase.from('expenses')
          .insert(payload).select().single()
        if (err) throw err; onSaved(data, true)
      }
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <Modal title={isEdit ? 'Edit Expense' : 'Add Expense'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <ErrorBox msg={error} />}
        <Field label="Title" required>
          <input type="text" required value={form.title}
            onChange={e => set('title', e.target.value)} placeholder="e.g. Generator fuel" className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount (₹)" required>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
              <input type="number" required min="0.01" step="0.01" value={form.amount}
                onChange={e => set('amount', e.target.value)}
                placeholder="0.00" className={inputCls + ' pl-7'} />
            </div>
          </Field>
          <Field label="Category">
            <select value={form.category} onChange={e => set('category', e.target.value)} className={inputCls}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date" required>
            <input type="date" required value={form.expense_date}
              onChange={e => set('expense_date', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Added By">
            <input type="text" value={form.added_by}
              onChange={e => set('added_by', e.target.value)} placeholder="Your name" className={inputCls} />
          </Field>
        </div>
        <ModalFooter saving={saving} label={isEdit ? 'Save Changes' : 'Add Expense'} onCancel={onClose} />
      </form>
    </Modal>
  )
}

// ─── shared ───────────────────────────────────────────────────────────────────

function SummaryCard({ label, value, color, icon: Icon }) {
  const c = { red: ['bg-red-50','text-red-600','text-red-700'], orange: ['bg-orange-50','text-orange-600','text-orange-700'], blue: ['bg-blue-50','text-blue-600','text-blue-700'] }[color]
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-center gap-4">
      <div className={`${c[0]} w-11 h-11 rounded-lg flex items-center justify-center shrink-0`}>
        <Icon className={`w-5 h-5 ${c[1]}`} />
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className={`text-xl font-bold ${c[2]} leading-tight`}>{value}</p>
      </div>
    </div>
  )
}
function FilterPill({ active, onClick, label }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition
        ${active ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
      {label}
    </button>
  )
}
function TableSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-100">
      {[1,2,3,4].map(i => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-gray-50">
          <div className="h-4 w-48 bg-gray-100 rounded animate-pulse" />
          <div className="h-5 w-20 bg-gray-100 rounded-full animate-pulse" />
          <div className="h-4 w-20 bg-gray-100 rounded animate-pulse ml-auto" />
        </div>
      ))}
    </div>
  )
}
function EmptyState({ message, onAdd }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
        <ReceiptIcon className="w-6 h-6 text-gray-400" />
      </div>
      <p className="text-gray-500 font-medium mb-4">{message}</p>
      {onAdd && (
        <button onClick={onAdd}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                     text-white text-sm font-semibold rounded-lg transition mx-auto">
          <PlusIcon className="w-4 h-4" /> Add Expense
        </button>
      )}
    </div>
  )
}
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition"><XIcon className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}
function ModalFooter({ saving, label, onCancel }) {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <button type="button" onClick={onCancel}
        className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200
                   hover:border-gray-300 rounded-lg transition">Cancel</button>
      <button type="submit" disabled={saving}
        className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700
                   disabled:bg-green-400 text-white text-sm font-semibold rounded-lg transition">
        {saving && <Spinner />}{saving ? 'Saving…' : label}
      </button>
    </div>
  )
}
function ConfirmModal({ message, loading, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={loading ? undefined : onCancel} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <p className="text-sm text-gray-800 font-medium mb-5">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} disabled={loading} className="px-4 py-2 text-sm font-medium text-gray-600
            border border-gray-200 hover:border-gray-300 rounded-lg transition disabled:opacity-50">Cancel</button>
          <button onClick={onConfirm} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700
                       disabled:bg-red-400 text-white text-sm font-semibold rounded-lg transition">
            {loading && <Spinner />}{loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
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
function Th({ children, align = 'left' }) {
  return <th className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-${align} whitespace-nowrap`}>{children}</th>
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
function XIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
}
function ReceiptIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
}
function ListIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
}
