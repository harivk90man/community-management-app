import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { usePageData } from '../hooks/usePageData'
import FetchError from '../components/FetchError'

const CATEGORIES = ['Medical', 'Fire', 'Police', 'Electricity', 'Water', 'Security', 'Other']
const CAT_STYLE = {
  Medical:     { bg: 'bg-red-50',     border: 'border-red-100',    badge: 'bg-red-100    text-red-700',    icon: 'text-red-500' },
  Fire:        { bg: 'bg-orange-50',  border: 'border-orange-100', badge: 'bg-orange-100 text-orange-700', icon: 'text-orange-500' },
  Police:      { bg: 'bg-blue-50',    border: 'border-blue-100',   badge: 'bg-blue-100   text-blue-700',   icon: 'text-blue-500' },
  Electricity: { bg: 'bg-yellow-50',  border: 'border-yellow-100', badge: 'bg-yellow-100 text-yellow-700', icon: 'text-yellow-600' },
  Water:       { bg: 'bg-cyan-50',    border: 'border-cyan-100',   badge: 'bg-cyan-100   text-cyan-700',   icon: 'text-cyan-600' },
  Security:    { bg: 'bg-purple-50',  border: 'border-purple-100', badge: 'bg-purple-100 text-purple-700', icon: 'text-purple-500' },
  Other:       { bg: 'bg-gray-50',    border: 'border-gray-100',   badge: 'bg-gray-100   text-gray-600',   icon: 'text-gray-400' },
}

const EMPTY_FORM = { label: '', phone: '', category: 'Medical', display_order: '0' }

export default function EmergencyContacts() {
  const { role } = useAuth()
  const [contacts, setContacts] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const { loading, error: fetchError, retry } = usePageData(async () => {
    const { data, error } = await supabase.from('emergency_contacts').select('*')
      .order('category').order('display_order').order('label')
    if (error) throw error
    setContacts(data ?? [])
  }, [])

  function onSaved(saved, isNew) {
    setContacts(prev => {
      const list = isNew ? [...prev, saved] : prev.map(x => x.id === saved.id ? saved : x)
      return list.sort((a, b) =>
        a.category.localeCompare(b.category) || a.display_order - b.display_order
      )
    })
    setShowForm(false); setEditing(null)
  }

  async function handleDelete(c) {
    setDeletingId(c.id)
    try {
      const { error } = await supabase.from('emergency_contacts').delete().eq('id', c.id)
      if (error) throw error
      setContacts(prev => prev.filter(x => x.id !== c.id))
    } catch { /* item stays in list */ }
    setDeletingId(null); setConfirmDel(null)
  }

  // group by category
  const grouped = CATEGORIES.reduce((acc, cat) => {
    const items = contacts.filter(c => c.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {})
  const uncategorised = contacts.filter(c => !CATEGORIES.includes(c.category))
  if (uncategorised.length) grouped['Other'] = [...(grouped['Other'] ?? []), ...uncategorised]

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Emergency Contacts</h1>
          <p className="text-sm text-gray-500 mt-0.5">{contacts.length} contacts</p>
        </div>
        {role === 'board' && (
          <button onClick={() => { setEditing(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                       text-white text-sm font-semibold rounded-lg transition">
            <PlusIcon className="w-4 h-4" /> Add Contact
          </button>
        )}
      </div>

      {fetchError && <FetchError message={fetchError} onRetry={retry} />}

      {loading ? <GridSkeleton /> : contacts.length === 0 ? (
        <EmptyState role={role} onAdd={() => setShowForm(true)} />
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([cat, items]) => {
            const style = CAT_STYLE[cat] ?? CAT_STYLE.Other
            return (
              <div key={cat}>
                <div className="flex items-center gap-3 mb-3">
                  <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${style.badge}`}>
                    {cat}
                  </span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map(c => (
                    <ContactCard key={c.id} contact={c} style={style}
                      canEdit={role === 'board'}
                      onEdit={() => { setEditing(c); setShowForm(true) }}
                      onDelete={() => setConfirmDel(c)}
                      deleting={deletingId === c.id}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <ContactFormModal editing={editing} onSaved={onSaved}
          onClose={() => { setShowForm(false); setEditing(null) }} />
      )}
      {confirmDel && (
        <ConfirmModal message={`Delete "${confirmDel.label}"?`}
          loading={deletingId === confirmDel.id}
          onConfirm={() => handleDelete(confirmDel)} onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  )
}

function ContactCard({ contact: c, style, canEdit, onEdit, onDelete, deleting }) {
  return (
    <div className={`rounded-xl border ${style.bg} ${style.border} p-5 flex flex-col gap-3`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900 text-sm">{c.label}</p>
        </div>
        <div className={`w-9 h-9 rounded-lg bg-white/60 flex items-center justify-center shrink-0`}>
          <PhoneIcon className={`w-4 h-4 ${style.icon}`} />
        </div>
      </div>

      {/* Large phone number */}
      <a href={`tel:${c.phone}`}
        className="text-2xl font-black text-gray-900 hover:text-green-700 transition tracking-tight leading-none">
        {c.phone}
      </a>

      {canEdit && (
        <div className="flex gap-2 pt-1 border-t border-black/5">
          <button onClick={onEdit}
            className="flex-1 py-1.5 text-xs font-medium text-gray-600 bg-white/70
                       hover:bg-white rounded-lg transition">Edit</button>
          <button onClick={onDelete} disabled={deleting}
            className="flex-1 py-1.5 text-xs font-medium text-red-600 bg-white/70
                       hover:bg-white rounded-lg transition disabled:opacity-50">
            {deleting ? '…' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  )
}

function ContactFormModal({ editing, onSaved, onClose }) {
  const isEdit = Boolean(editing)
  const [form, setForm] = useState(isEdit ? {
    label: editing.label, phone: editing.phone,
    category: editing.category, display_order: String(editing.display_order ?? 0),
  } : { ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault(); setError('')
    setSaving(true)
    const payload = {
      label: form.label.trim(), phone: form.phone.trim(),
      category: form.category, display_order: Number(form.display_order) || 0,
    }
    try {
      if (isEdit) {
        const { data, error: err } = await supabase.from('emergency_contacts')
          .update(payload).eq('id', editing.id).select().single()
        if (err) throw err; onSaved(data, false)
      } else {
        const { data, error: err } = await supabase.from('emergency_contacts')
          .insert(payload).select().single()
        if (err) throw err; onSaved(data, true)
      }
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <Modal title={isEdit ? 'Edit Contact' : 'Add Contact'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <ErrorBox msg={error} />}
        <Field label="Label" required>
          <input type="text" required value={form.label}
            onChange={e => set('label', e.target.value)}
            placeholder="e.g. Ambulance, Fire Station" className={inputCls} />
        </Field>
        <Field label="Phone Number" required>
          <input type="tel" required value={form.phone}
            onChange={e => set('phone', e.target.value)}
            placeholder="e.g. 108, +91 98765 43210" className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Category">
            <select value={form.category} onChange={e => set('category', e.target.value)} className={inputCls}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Display Order">
            <input type="number" min="0" step="1" value={form.display_order}
              onChange={e => set('display_order', e.target.value)}
              placeholder="0" className={inputCls} />
          </Field>
        </div>
        <ModalFooter saving={saving} label={isEdit ? 'Save Changes' : 'Add Contact'} onCancel={onClose} />
      </form>
    </Modal>
  )
}

// ─── shared ───────────────────────────────────────────────────────────────────

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {[1,2,3,4,5,6].map(i => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <div className="h-4 w-28 bg-gray-100 rounded animate-pulse" />
          <div className="h-8 w-32 bg-gray-100 rounded animate-pulse" />
        </div>
      ))}
    </div>
  )
}
function EmptyState({ role, onAdd }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
        <PhoneIcon className="w-6 h-6 text-gray-400" />
      </div>
      <p className="text-gray-500 font-medium mb-4">No emergency contacts yet.</p>
      {role === 'board' && (
        <button onClick={onAdd}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                     text-white text-sm font-semibold rounded-lg transition mx-auto">
          <PlusIcon className="w-4 h-4" /> Add first contact
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
function PhoneIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
}
