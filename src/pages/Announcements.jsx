import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const AUDIENCES = ['All', 'Owners', 'Board']

const AUDIENCE_STYLE = {
  All:    'bg-green-100  text-green-700',
  Owners: 'bg-blue-100   text-blue-700',
  Board:  'bg-purple-100 text-purple-700',
}

function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const EMPTY_FORM = { title: '', body: '', audience: 'All', is_pinned: false, starts_at: '', ends_at: '' }

export default function Announcements() {
  const { role, user } = useAuth()
  return role === 'board' ? <BoardView user={user} /> : <ResidentView />
}

// ─── board view ───────────────────────────────────────────────────────────────

function BoardView({ user }) {
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [editing, setEditing]     = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
    setItems(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  function onSaved(saved, isNew) {
    setItems(prev => {
      const list = isNew ? [saved, ...prev] : prev.map(x => x.id === saved.id ? saved : x)
      return [...list].sort((a, b) => b.is_pinned - a.is_pinned || new Date(b.created_at) - new Date(a.created_at))
    })
    setShowForm(false); setEditing(null)
  }

  async function handleDelete(a) {
    setDeletingId(a.id)
    await supabase.from('announcements').delete().eq('id', a.id)
    setItems(prev => prev.filter(x => x.id !== a.id))
    setDeletingId(null); setConfirmDel(null)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Announcements</h1>
          <p className="text-sm text-gray-500 mt-0.5">{items.length} total</p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                     text-white text-sm font-semibold rounded-lg transition">
          <PlusIcon className="w-4 h-4" /> New Announcement
        </button>
      </div>

      {loading ? <CardSkeleton /> : items.length === 0 ? <EmptyState message="No announcements yet." /> : (
        <div className="space-y-3">
          {items.map(a => (
            <AnnouncementCard key={a.id} item={a}
              actions={
                <div className="flex gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                  <button onClick={() => { setEditing(a); setShowForm(true) }}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200
                               hover:border-gray-300 rounded-lg transition">Edit</button>
                  <button onClick={() => setConfirmDel(a)} disabled={deletingId === a.id}
                    className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200
                               hover:bg-red-50 rounded-lg transition disabled:opacity-50">
                    {deletingId === a.id ? '…' : 'Delete'}
                  </button>
                </div>
              }
            />
          ))}
        </div>
      )}

      {showForm && (
        <AnnouncementFormModal editing={editing} user={user}
          onSaved={onSaved} onClose={() => { setShowForm(false); setEditing(null) }} />
      )}
      {confirmDel && (
        <ConfirmModal message={`Delete "${confirmDel.title}"?`} loading={deletingId === confirmDel.id}
          onConfirm={() => handleDelete(confirmDel)} onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  )
}

// ─── resident view ────────────────────────────────────────────────────────────

function ResidentView() {
  const [items, setItems]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const now = new Date().toISOString()
    supabase.from('announcements').select('*')
      .in('audience', ['All', 'Owners'])
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data }) => { setItems(data ?? []); setLoading(false) })
  }, [])

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Announcements</h1>
      {loading ? <CardSkeleton /> : items.length === 0
        ? <EmptyState message="No announcements right now." />
        : <div className="space-y-3">{items.map(a => <AnnouncementCard key={a.id} item={a} />)}</div>
      }
    </div>
  )
}

// ─── shared card ──────────────────────────────────────────────────────────────

function AnnouncementCard({ item: a, actions }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className={`bg-white rounded-xl border p-5 transition-all
      ${a.is_pinned ? 'border-green-200 shadow-sm' : 'border-gray-100'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {a.is_pinned && (
              <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-semibold
                               bg-green-100 text-green-700 rounded-full">
                <PinIcon className="w-3 h-3" /> Pinned
              </span>
            )}
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full
              ${AUDIENCE_STYLE[a.audience] ?? 'bg-gray-100 text-gray-500'}`}>
              {a.audience}
            </span>
            {a.starts_at && (
              <span className="text-xs text-gray-400">From {fmtDate(a.starts_at)}</span>
            )}
            {a.ends_at && (
              <span className="text-xs text-gray-400">Until {fmtDate(a.ends_at)}</span>
            )}
          </div>
          <p className="font-semibold text-gray-900">{a.title}</p>
          <p className={`text-sm text-gray-600 mt-1 whitespace-pre-wrap leading-relaxed
            ${expanded ? '' : 'line-clamp-3'}`}>{a.body}</p>
          {a.body?.length > 200 && (
            <button onClick={() => setExpanded(e => !e)}
              className="text-xs text-green-600 hover:underline mt-1">
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
        <div className="flex flex-col items-end gap-3 shrink-0">
          <p className="text-xs text-gray-400">{fmtDate(a.created_at)}</p>
          {actions}
        </div>
      </div>
    </div>
  )
}

// ─── form modal ───────────────────────────────────────────────────────────────

function AnnouncementFormModal({ editing, user, onSaved, onClose }) {
  const isEdit = Boolean(editing)
  const [form, setForm] = useState(isEdit ? {
    title: editing.title, body: editing.body, audience: editing.audience,
    is_pinned: editing.is_pinned,
    starts_at: editing.starts_at ? editing.starts_at.slice(0, 16) : '',
    ends_at:   editing.ends_at   ? editing.ends_at.slice(0, 16)   : '',
  } : { ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault(); setError('')
    setSaving(true)
    const payload = {
      title: form.title.trim(), body: form.body.trim(),
      audience: form.audience, is_pinned: form.is_pinned,
      starts_at: form.starts_at || null, ends_at: form.ends_at || null,
      created_by: isEdit ? editing.created_by : (user?.email ?? null),
    }
    try {
      if (isEdit) {
        const { data, error: err } = await supabase.from('announcements')
          .update(payload).eq('id', editing.id).select().single()
        if (err) throw err; onSaved(data, false)
      } else {
        const { data, error: err } = await supabase.from('announcements')
          .insert(payload).select().single()
        if (err) throw err; onSaved(data, true)
      }
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <Modal title={isEdit ? 'Edit Announcement' : 'New Announcement'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <ErrorBox msg={error} />}
        <Field label="Title" required>
          <input type="text" required value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder="Announcement title" className={inputCls} />
        </Field>
        <Field label="Body" required>
          <textarea required rows={4} value={form.body}
            onChange={e => set('body', e.target.value)}
            placeholder="Write the announcement…"
            className={inputCls + ' resize-none'} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Audience">
            <select value={form.audience} onChange={e => set('audience', e.target.value)} className={inputCls}>
              {AUDIENCES.map(a => <option key={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="Pin to top">
            <div className="flex items-center h-[38px]">
              <Toggle checked={form.is_pinned} onChange={v => set('is_pinned', v)} label="Pin announcement" />
            </div>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Show from (optional)">
            <input type="datetime-local" value={form.starts_at}
              onChange={e => set('starts_at', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Expires at (optional)">
            <input type="datetime-local" value={form.ends_at}
              onChange={e => set('ends_at', e.target.value)} className={inputCls} />
          </Field>
        </div>
        <ModalFooter saving={saving} label={isEdit ? 'Save Changes' : 'Publish'} onCancel={onClose} />
      </form>
    </Modal>
  )
}

// ─── shared primitives ────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="space-y-3">
      {[1,2,3].map(i => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex gap-2 mb-3">
            <div className="h-5 w-16 bg-gray-100 rounded-full animate-pulse" />
            <div className="h-5 w-20 bg-gray-100 rounded-full animate-pulse" />
          </div>
          <div className="h-4 w-2/3 bg-gray-100 rounded animate-pulse mb-2" />
          <div className="h-3 w-full bg-gray-100 rounded animate-pulse" />
        </div>
      ))}
    </div>
  )
}
function EmptyState({ message }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
        <MegaphoneIcon className="w-6 h-6 text-gray-400" />
      </div>
      <p className="text-gray-500 font-medium">{message}</p>
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
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <XIcon className="w-5 h-5" />
          </button>
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
function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <div onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition-colors ${checked ? 'bg-green-600' : 'bg-gray-200'}`}>
        <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform
          ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </div>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </label>
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
function PinIcon({ className }) {
  return <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6h2v-6h5v-2l-2-2z" /></svg>
}
function MegaphoneIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>
}
