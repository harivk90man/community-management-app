import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const CATEGORIES = ['Plumber', 'Electrician', 'Carpenter', 'Painter', 'Cleaner', 'Security', 'Other']
const CAT_STYLE = {
  Plumber:     'bg-blue-100   text-blue-700',
  Electrician: 'bg-yellow-100 text-yellow-700',
  Carpenter:   'bg-orange-100 text-orange-700',
  Painter:     'bg-purple-100 text-purple-700',
  Cleaner:     'bg-teal-100   text-teal-700',
  Security:    'bg-red-100    text-red-700',
  Other:       'bg-gray-100   text-gray-600',
}

const EMPTY_FORM = { name: '', category: 'Plumber', phone: '', email: '', rating: '0', added_by: '' }

export default function Vendors() {
  const { role, user } = useAuth()
  const [vendors, setVendors]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [filterCat, setFilterCat]   = useState('')

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('vendors').select('*')
      .order('category').order('name')
    setVendors(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  function onSaved(saved, isNew) {
    setVendors(prev => isNew ? [...prev, saved].sort((a,b) => a.name.localeCompare(b.name)) : prev.map(x => x.id === saved.id ? saved : x))
    setShowForm(false); setEditing(null)
  }

  async function handleDelete(v) {
    setDeletingId(v.id)
    await supabase.from('vendors').delete().eq('id', v.id)
    setVendors(prev => prev.filter(x => x.id !== v.id))
    setDeletingId(null); setConfirmDel(null)
  }

  const displayed = filterCat ? vendors.filter(v => v.category === filterCat) : vendors

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Vendors</h1>
          <p className="text-sm text-gray-500 mt-0.5">{vendors.length} registered</p>
        </div>
        {role === 'board' && (
          <button onClick={() => { setEditing(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                       text-white text-sm font-semibold rounded-lg transition">
            <PlusIcon className="w-4 h-4" /> Add Vendor
          </button>
        )}
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        <FilterPill active={!filterCat} onClick={() => setFilterCat('')} label="All" />
        {CATEGORIES.map(c => (
          <FilterPill key={c} active={filterCat === c}
            onClick={() => setFilterCat(filterCat === c ? '' : c)} label={c} />
        ))}
      </div>

      {loading ? <GridSkeleton /> : displayed.length === 0 ? (
        <EmptyState role={role} onAdd={() => { setEditing(null); setShowForm(true) }} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayed.map(v => (
            <VendorCard key={v.id} vendor={v} canEdit={role === 'board'}
              onEdit={() => { setEditing(v); setShowForm(true) }}
              onDelete={() => setConfirmDel(v)}
              deleting={deletingId === v.id}
            />
          ))}
        </div>
      )}

      {showForm && (
        <VendorFormModal editing={editing} user={user} onSaved={onSaved}
          onClose={() => { setShowForm(false); setEditing(null) }} />
      )}
      {confirmDel && (
        <ConfirmModal message={`Delete vendor "${confirmDel.name}"?`}
          loading={deletingId === confirmDel.id}
          onConfirm={() => handleDelete(confirmDel)} onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  )
}

function VendorCard({ vendor: v, canEdit, onEdit, onDelete, deleting }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 hover:border-gray-200
                    hover:shadow-sm transition-all flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full mb-2
            ${CAT_STYLE[v.category] ?? 'bg-gray-100 text-gray-600'}`}>{v.category}</span>
          <p className="font-semibold text-gray-900 leading-tight">{v.name}</p>
          <StarRating value={v.rating ?? 0} />
        </div>
        <div className="w-11 h-11 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
          <WrenchIcon className="w-5 h-5 text-gray-400" />
        </div>
      </div>

      <div className="space-y-1.5 text-sm">
        {v.phone && (
          <a href={`tel:${v.phone}`}
            className="flex items-center gap-2 text-gray-600 hover:text-green-700 transition">
            <PhoneIcon className="w-3.5 h-3.5 text-gray-400" />
            {v.phone}
          </a>
        )}
        {v.email && (
          <a href={`mailto:${v.email}`}
            className="flex items-center gap-2 text-gray-600 hover:text-green-700 transition truncate">
            <MailIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="truncate">{v.email}</span>
          </a>
        )}
      </div>

      {canEdit && (
        <div className="flex gap-2 pt-1 border-t border-gray-50">
          <button onClick={onEdit}
            className="flex-1 py-1.5 text-xs font-medium text-gray-600 border border-gray-200
                       hover:border-gray-300 rounded-lg transition">Edit</button>
          <button onClick={onDelete} disabled={deleting}
            className="flex-1 py-1.5 text-xs font-medium text-red-600 border border-red-200
                       hover:bg-red-50 rounded-lg transition disabled:opacity-50">
            {deleting ? '…' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  )
}

function StarRating({ value }) {
  return (
    <div className="flex items-center gap-0.5 mt-1">
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} className={`w-3.5 h-3.5 ${i <= Math.round(value) ? 'text-amber-400' : 'text-gray-200'}`}
          fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      {value > 0 && <span className="text-xs text-gray-400 ml-1">{Number(value).toFixed(1)}</span>}
    </div>
  )
}

function VendorFormModal({ editing, user, onSaved, onClose }) {
  const isEdit = Boolean(editing)
  const [form, setForm] = useState(isEdit ? {
    name: editing.name, category: editing.category,
    phone: editing.phone ?? '', email: editing.email ?? '',
    rating: String(editing.rating ?? 0), added_by: editing.added_by ?? '',
  } : { ...EMPTY_FORM, added_by: user?.email ?? '' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault(); setError('')
    setSaving(true)
    const payload = {
      name: form.name.trim(), category: form.category,
      phone: form.phone.trim() || null, email: form.email.trim() || null,
      rating: form.rating ? Number(form.rating) : null,
      added_by: form.added_by.trim() || null,
    }
    try {
      if (isEdit) {
        const { data, error: err } = await supabase.from('vendors')
          .update(payload).eq('id', editing.id).select().single()
        if (err) throw err; onSaved(data, false)
      } else {
        const { data, error: err } = await supabase.from('vendors')
          .insert(payload).select().single()
        if (err) throw err; onSaved(data, true)
      }
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <Modal title={isEdit ? 'Edit Vendor' : 'Add Vendor'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <ErrorBox msg={error} />}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name" required>
            <input type="text" required value={form.name}
              onChange={e => set('name', e.target.value)} placeholder="Vendor name" className={inputCls} />
          </Field>
          <Field label="Category">
            <select value={form.category} onChange={e => set('category', e.target.value)} className={inputCls}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Phone">
            <input type="tel" value={form.phone}
              onChange={e => set('phone', e.target.value)} placeholder="+91 98765 43210" className={inputCls} />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email}
              onChange={e => set('email', e.target.value)} placeholder="vendor@email.com" className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Rating (0–5)">
            <input type="number" min="0" max="5" step="0.5" value={form.rating}
              onChange={e => set('rating', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Added By">
            <input type="text" value={form.added_by}
              onChange={e => set('added_by', e.target.value)} placeholder="Your name" className={inputCls} />
          </Field>
        </div>
        <ModalFooter saving={saving} label={isEdit ? 'Save Changes' : 'Add Vendor'} onCancel={onClose} />
      </form>
    </Modal>
  )
}

// ─── shared ───────────────────────────────────────────────────────────────────

function FilterPill({ active, onClick, label }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition
        ${active ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
      {label}
    </button>
  )
}
function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1,2,3,4,5,6].map(i => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <div className="h-5 w-20 bg-gray-100 rounded-full animate-pulse" />
          <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
          <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
        </div>
      ))}
    </div>
  )
}
function EmptyState({ role, onAdd }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
        <WrenchIcon className="w-6 h-6 text-gray-400" />
      </div>
      <p className="text-gray-500 font-medium mb-4">No vendors found.</p>
      {role === 'board' && (
        <button onClick={onAdd}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                     text-white text-sm font-semibold rounded-lg transition mx-auto">
          <PlusIcon className="w-4 h-4" /> Add first vendor
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
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <p className="text-sm text-gray-800 font-medium mb-5">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-600
            border border-gray-200 hover:border-gray-300 rounded-lg transition">Cancel</button>
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
function WrenchIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
}
function PhoneIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
}
function MailIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
}
