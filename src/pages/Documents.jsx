import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const CATEGORIES = ['Certificate', 'Bylaw', 'Minutes', 'NOC', 'Circular', 'Other']
const CAT_STYLE = {
  Certificate: 'bg-green-100  text-green-700',
  Bylaw:       'bg-purple-100 text-purple-700',
  Minutes:     'bg-blue-100   text-blue-700',
  NOC:         'bg-orange-100 text-orange-700',
  Circular:    'bg-teal-100   text-teal-700',
  Other:       'bg-gray-100   text-gray-600',
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const EMPTY_FORM = { title: '', file_url: '', category: 'Circular', uploaded_by: '' }

export default function Documents() {
  const { role, user } = useAuth()
  const [docs, setDocs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('documents').select('*')
      .order('category').order('created_at', { ascending: false })
    setDocs(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  function onSuccess() { setShowForm(false); fetch() }

  async function handleDelete(d) {
    setDeletingId(d.id)
    await supabase.from('documents').delete().eq('id', d.id)
    setDocs(prev => prev.filter(x => x.id !== d.id))
    setDeletingId(null); setConfirmDel(null)
  }

  // group by category
  const grouped = CATEGORIES.reduce((acc, cat) => {
    const items = docs.filter(d => d.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {})
  // catch any uncategorised
  const others = docs.filter(d => !CATEGORIES.includes(d.category))
  if (others.length) grouped['Other'] = [...(grouped['Other'] ?? []), ...others]

  const isEmpty = docs.length === 0

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500 mt-0.5">{docs.length} document{docs.length !== 1 ? 's' : ''}</p>
        </div>
        {role === 'board' && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                       text-white text-sm font-semibold rounded-lg transition">
            <PlusIcon className="w-4 h-4" /> Add Document
          </button>
        )}
      </div>

      {loading ? <GridSkeleton /> : isEmpty ? (
        <EmptyState role={role} onAdd={() => setShowForm(true)} />
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <div className="flex items-center gap-3 mb-3">
                <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${CAT_STYLE[cat] ?? 'bg-gray-100 text-gray-600'}`}>
                  {cat}
                </span>
                <span className="text-xs text-gray-400">{items.length} file{items.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map(d => (
                  <DocumentCard key={d.id} doc={d}
                    canDelete={role === 'board'}
                    onDelete={() => setConfirmDel(d)}
                    deleting={deletingId === d.id}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <AddDocumentModal user={user} onSuccess={onSuccess} onClose={() => setShowForm(false)} />
      )}
      {confirmDel && (
        <ConfirmModal message={`Remove "${confirmDel.title}"?`} loading={deletingId === confirmDel.id}
          onConfirm={() => handleDelete(confirmDel)} onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  )
}

function DocumentCard({ doc: d, canDelete, onDelete, deleting }) {
  const [openModal, setOpenModal] = useState(false)

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col gap-3
                      hover:border-gray-200 hover:shadow-sm transition-all">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full mb-2
              ${CAT_STYLE[d.category] ?? 'bg-gray-100 text-gray-600'}`}>{d.category}</span>
            <p className="font-semibold text-gray-900 text-sm leading-snug">{d.title}</p>
            <p className="text-xs text-gray-400 mt-1">
              {fmtDate(d.created_at)}{d.uploaded_by ? ` · ${d.uploaded_by}` : ''}
            </p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
            <FileIcon className="w-5 h-5 text-gray-400" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpenModal(true)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold
                       bg-green-50 text-green-700 hover:bg-green-100 rounded-lg transition">
            <ExternalLinkIcon className="w-3.5 h-3.5" /> Open
          </button>
          {canDelete && (
            <button onClick={onDelete} disabled={deleting}
              className="px-3 py-2 text-xs font-medium text-red-600 border border-red-200
                         hover:bg-red-50 rounded-lg transition disabled:opacity-50">
              {deleting ? '…' : 'Remove'}
            </button>
          )}
        </div>
      </div>

      {openModal && (
        <DocOpenModal doc={d} onClose={() => setOpenModal(false)} />
      )}
    </>
  )
}

function DocOpenModal({ doc: d, onClose }) {
  // _system opens the OS default browser on Capacitor (Android/iOS) and
  // behaves like _blank on web — neither route touches this app's WebView,
  // so the session stays alive and the page stays responsive.
  function handleOpen() {
    window.open(d.file_url, '_system')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm">

        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
            <FileIcon className="w-5 h-5 text-gray-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-sm leading-snug">{d.title}</p>
            <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full
              ${CAT_STYLE[d.category] ?? 'bg-gray-100 text-gray-600'}`}>
              {d.category}
            </span>
            {d.uploaded_by && (
              <p className="text-xs text-gray-400 mt-1">{d.uploaded_by} · {fmtDate(d.created_at)}</p>
            )}
          </div>
          <button onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition shrink-0">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Actions */}
        <div className="px-5 py-5 space-y-2.5">
          <button
            onClick={handleOpen}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl
                       bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition">
            <ExternalLinkIcon className="w-4 h-4" />
            Open Document
          </button>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm font-medium text-gray-500
                       hover:text-gray-700 transition">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function AddDocumentModal({ user, onSuccess, onClose }) {
  const [form, setForm]     = useState({ ...EMPTY_FORM, uploaded_by: user?.email ?? '' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault(); setError('')
    setSaving(true)
    try {
      const { error: err } = await supabase.from('documents').insert({
        title: form.title.trim(), file_url: form.file_url.trim(),
        category: form.category, uploaded_by: form.uploaded_by.trim() || null,
      })
      if (err) throw err
      onSuccess()
    } catch (err) { setError(err.message ?? 'Failed to save document.') } finally { setSaving(false) }
  }

  return (
    <Modal title="Add Document" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <ErrorBox msg={error} />}
        <Field label="Title" required>
          <input type="text" required value={form.title}
            onChange={e => set('title', e.target.value)} placeholder="Document title" className={inputCls} />
        </Field>
        <Field label="File URL" required>
          <input type="url" required value={form.file_url}
            onChange={e => set('file_url', e.target.value)}
            placeholder="https://drive.google.com/…" className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Category">
            <select value={form.category} onChange={e => set('category', e.target.value)} className={inputCls}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Uploaded By">
            <input type="text" value={form.uploaded_by}
              onChange={e => set('uploaded_by', e.target.value)} placeholder="Your name" className={inputCls} />
          </Field>
        </div>
        <ModalFooter saving={saving} label="Add Document" onCancel={onClose} />
      </form>
    </Modal>
  )
}

// ─── shared ───────────────────────────────────────────────────────────────────

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {[1,2,3,4,5,6].map(i => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
          <div className="h-5 w-20 bg-gray-100 rounded-full animate-pulse" />
          <div className="h-4 w-3/4 bg-gray-100 rounded animate-pulse" />
          <div className="h-8 bg-gray-100 rounded-lg animate-pulse mt-2" />
        </div>
      ))}
    </div>
  )
}
function EmptyState({ role, onAdd }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
        <FileIcon className="w-6 h-6 text-gray-400" />
      </div>
      <p className="text-gray-500 font-medium mb-4">No documents yet.</p>
      {role === 'board' && (
        <button onClick={onAdd}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                     text-white text-sm font-semibold rounded-lg transition mx-auto">
          <PlusIcon className="w-4 h-4" /> Add first document
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
            {loading && <Spinner />}{loading ? 'Removing…' : 'Remove'}
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
function FileIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z" /></svg>
}
function ExternalLinkIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
}
