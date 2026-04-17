import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

function fmtDT(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const EMPTY_FORM = {
  villa_id: '', visitor_name: '', purpose: '',
  checked_in: new Date().toISOString().slice(0, 16),
  checked_out: '', approved_by: '',
}

export default function Visitors() {
  const { villa: myVilla, role, user } = useAuth()
  return role === 'board' ? <BoardView user={user} /> : <ResidentView myVilla={myVilla} />
}

// ─── board view ───────────────────────────────────────────────────────────────

function BoardView({ user }) {
  const [visitors, setVisitors] = useState([])
  const [villas, setVillas]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [filterActive, setFilterActive] = useState(false)

  const fetch = useCallback(async () => {
    setLoading(true)
    const [vRes, viRes] = await Promise.all([
      supabase.from('villas').select('id,villa_number,owner_name').eq('is_active', true).order('villa_number'),
      supabase.from('visitors').select('*, villas(villa_number,owner_name)').order('checked_in', { ascending: false }),
    ])
    setVillas(vRes.data ?? [])
    setVisitors(viRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  function onSaved(saved, isNew) {
    setVisitors(prev => isNew ? [saved, ...prev] : prev.map(x => x.id === saved.id ? saved : x))
    setShowForm(false); setEditing(null)
  }

  async function handleDelete(v) {
    setDeletingId(v.id)
    try {
      const { error } = await supabase.from('visitors').delete().eq('id', v.id)
      if (error) throw error
      setVisitors(prev => prev.filter(x => x.id !== v.id))
    } catch { /* item stays in list */ }
    setDeletingId(null); setConfirmDel(null)
  }

  const displayed = filterActive
    ? visitors.filter(v => !v.checked_out)
    : visitors

  const insideCount = visitors.filter(v => !v.checked_out).length

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Visitors</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {visitors.length} total
            {insideCount > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700 rounded-full">
                {insideCount} still inside
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterActive(f => !f)}
            className={`px-3 py-2 text-sm font-medium rounded-lg border transition
              ${filterActive
                ? 'bg-amber-50 text-amber-700 border-amber-300'
                : 'text-gray-600 border-gray-200 hover:border-gray-300'}`}
          >
            {filterActive ? 'Showing: Inside only' : 'Show inside only'}
          </button>
          <button onClick={() => { setEditing(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                       text-white text-sm font-semibold rounded-lg transition">
            <PlusIcon className="w-4 h-4" /> Add Visitor
          </button>
        </div>
      </div>

      {loading ? <TableSkeleton /> : displayed.length === 0 ? (
        <EmptyState message={filterActive ? 'No visitors currently inside.' : 'No visitor records.'} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <Th>Villa</Th><Th>Visitor</Th><Th>Purpose</Th>
                  <Th>Checked In</Th><Th>Checked Out</Th><Th>Approved By</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {displayed.map(v => (
                  <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg
                                       bg-green-50 text-green-700 font-bold text-sm">
                        {v.villas?.villa_number ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{v.visitor_name}</p>
                      <p className="text-xs text-gray-400">{v.villas?.owner_name ?? ''}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{v.purpose || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                      {fmtDT(v.checked_in) ?? '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {v.checked_out
                        ? <span className="text-xs text-gray-600">{fmtDT(v.checked_out)}</span>
                        : <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                            Still inside
                          </span>
                      }
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{v.approved_by || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => { setEditing(v); setShowForm(true) }}
                          className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200
                                     hover:border-gray-300 rounded-lg transition">Edit</button>
                        <button onClick={() => setConfirmDel(v)} disabled={deletingId === v.id}
                          className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200
                                     hover:bg-red-50 rounded-lg transition disabled:opacity-50">
                          {deletingId === v.id ? '…' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <VisitorFormModal editing={editing} villas={villas} user={user}
          onSaved={onSaved} onClose={() => { setShowForm(false); setEditing(null) }} />
      )}
      {confirmDel && (
        <ConfirmModal message={`Delete visitor record for ${confirmDel.visitor_name}?`}
          loading={deletingId === confirmDel.id}
          onConfirm={() => handleDelete(confirmDel)} onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  )
}

// ─── resident view ────────────────────────────────────────────────────────────

function ResidentView({ myVilla }) {
  const [visitors, setVisitors] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!myVilla?.id) { setLoading(false); return }
    supabase.from('visitors').select('*').eq('villa_id', myVilla.id)
      .order('checked_in', { ascending: false })
      .then(({ data }) => { setVisitors(data ?? []); setLoading(false) })
  }, [myVilla?.id])

  if (!myVilla) return <div className="p-6 py-24 text-center"><p className="text-gray-500">No villa linked to your account.</p></div>

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">My Visitors</h1>
      {loading ? <TableSkeleton /> : visitors.length === 0 ? (
        <EmptyState message="No visitor records for your villa." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <Th>Visitor</Th><Th>Purpose</Th><Th>Checked In</Th><Th>Checked Out</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visitors.map(v => (
                  <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{v.visitor_name}</td>
                    <td className="px-4 py-3 text-gray-600">{v.purpose || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{fmtDT(v.checked_in) ?? '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {v.checked_out
                        ? <span className="text-xs text-gray-600">{fmtDT(v.checked_out)}</span>
                        : <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">Still inside</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── form modal ───────────────────────────────────────────────────────────────

function VisitorFormModal({ editing, villas, user, onSaved, onClose }) {
  const isEdit = Boolean(editing)
  const [form, setForm] = useState(isEdit ? {
    villa_id:     editing.villa_id,
    visitor_name: editing.visitor_name,
    purpose:      editing.purpose ?? '',
    checked_in:   editing.checked_in?.slice(0, 16) ?? '',
    checked_out:  editing.checked_out?.slice(0, 16) ?? '',
    approved_by:  editing.approved_by ?? '',
  } : { ...EMPTY_FORM, approved_by: user?.email ?? '' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault(); setError('')
    if (!form.villa_id) { setError('Select a villa.'); return }
    setSaving(true)
    const payload = {
      villa_id:     form.villa_id,
      visitor_name: form.visitor_name.trim(),
      purpose:      form.purpose.trim() || null,
      checked_in:   form.checked_in || null,
      checked_out:  form.checked_out || null,
      approved_by:  form.approved_by.trim() || null,
    }
    try {
      if (isEdit) {
        const { data, error: err } = await supabase.from('visitors')
          .update(payload).eq('id', editing.id)
          .select('*, villas(villa_number,owner_name)').single()
        if (err) throw err; onSaved(data, false)
      } else {
        const { data, error: err } = await supabase.from('visitors')
          .insert(payload).select('*, villas(villa_number,owner_name)').single()
        if (err) throw err; onSaved(data, true)
      }
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <Modal title={isEdit ? 'Edit Visitor' : 'Add Visitor'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <ErrorBox msg={error} />}
        <Field label="Villa" required>
          <select required value={form.villa_id} onChange={e => set('villa_id', e.target.value)} className={inputCls}>
            <option value="">Select villa…</option>
            {villas.map(v => <option key={v.id} value={v.id}>{v.villa_number} – {v.owner_name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Visitor Name" required>
            <input type="text" required value={form.visitor_name}
              onChange={e => set('visitor_name', e.target.value)} placeholder="Full name" className={inputCls} />
          </Field>
          <Field label="Purpose">
            <input type="text" value={form.purpose}
              onChange={e => set('purpose', e.target.value)} placeholder="e.g. Delivery, Guest" className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Checked In">
            <input type="datetime-local" value={form.checked_in}
              onChange={e => set('checked_in', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Checked Out">
            <input type="datetime-local" value={form.checked_out}
              onChange={e => set('checked_out', e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="Approved By">
          <input type="text" value={form.approved_by}
            onChange={e => set('approved_by', e.target.value)} placeholder="Your name" className={inputCls} />
        </Field>
        <ModalFooter saving={saving} label={isEdit ? 'Save Changes' : 'Add Visitor'} onCancel={onClose} />
      </form>
    </Modal>
  )
}

// ─── shared ───────────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-100">
      {[1,2,3,4].map(i => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-gray-50">
          <div className="w-9 h-9 bg-gray-100 rounded-lg animate-pulse" />
          <div className="space-y-1.5 flex-1">
            <div className="h-3.5 w-32 bg-gray-100 rounded animate-pulse" />
            <div className="h-3 w-48 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}
function EmptyState({ message }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
        <UserIcon className="w-6 h-6 text-gray-400" />
      </div>
      <p className="text-gray-500 font-medium">{message}</p>
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
function UserIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
}
