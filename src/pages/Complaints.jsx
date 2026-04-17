import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

// ─── constants ────────────────────────────────────────────────────────────────

const STATUSES    = ['Pending', 'In Progress', 'Resolved']
const PRIORITIES  = ['Low', 'Medium', 'High', 'Urgent']
const TYPES       = ['complaint', 'maintenance']
const CATEGORIES  = ['General', 'Electrical', 'Plumbing', 'Security', 'Cleanliness', 'Noise', 'Other']

const STATUS_STYLE = {
  'Pending':     'bg-yellow-100 text-yellow-700',
  'In Progress': 'bg-blue-100   text-blue-700',
  'Resolved':    'bg-green-100  text-green-700',
}
const STATUS_DOT = {
  'Pending':     'bg-yellow-400',
  'In Progress': 'bg-blue-400',
  'Resolved':    'bg-green-500',
}
const PRIORITY_STYLE = {
  'Urgent': 'bg-red-100    text-red-700',
  'High':   'bg-orange-100 text-orange-700',
  'Medium': 'bg-yellow-100 text-yellow-700',
  'Low':    'bg-gray-100   text-gray-500',
}
const TYPE_STYLE = {
  'complaint':   'bg-red-100  text-red-700',
  'maintenance': 'bg-blue-100 text-blue-700',
}
const TYPE_LABEL = {
  'complaint':   'Complaint',
  'maintenance': 'Maintenance',
}

const EMPTY_RESIDENT_FORM = {
  type:        'complaint',
  title:       '',
  description: '',
  priority:    'Medium',
  category:    'General',
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function Complaints() {
  const { villa: myVilla, role } = useAuth()
  if (role === 'board') return <BoardView />
  return <ResidentView myVilla={myVilla} />
}

// ─── board view ───────────────────────────────────────────────────────────────

function BoardView() {
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading]       = useState(true)
  const [detail, setDetail]         = useState(null)   // complaint open in detail modal
  const [confirmDel, setConfirmDel] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [villas, setVillas]           = useState([])

  // filters
  const [fStatus,   setFStatus]   = useState('')
  const [fPriority, setFPriority] = useState('')
  const [fType,     setFType]     = useState('')
  const [fCategory, setFCategory] = useState('')

  const fetch = useCallback(async () => {
    setLoading(true)
    const [{ data: cData, error }, { data: vData }] = await Promise.all([
      supabase.from('complaints').select('*, villas(villa_number, owner_name)')
        .order('created_at', { ascending: false }),
      supabase.from('villas').select('id, villa_number, owner_name').order('villa_number'),
    ])
    if (!error) setComplaints(cData ?? [])
    setVillas(vData ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  // status count badges
  const counts = STATUSES.reduce((acc, s) => {
    acc[s] = complaints.filter(c => c.status === s).length
    return acc
  }, {})

  const filtered = complaints.filter(c =>
    (!fStatus   || c.status   === fStatus)   &&
    (!fPriority || c.priority === fPriority) &&
    (!fType     || c.type     === fType)     &&
    (!fCategory || c.category === fCategory)
  )

  function onUpdated(updated) {
    setComplaints(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c))
    setDetail(prev => prev?.id === updated.id ? { ...prev, ...updated } : prev)
  }

  async function handleDelete(c) {
    setDeletingId(c.id)
    try {
      const { error } = await supabase.from('complaints').delete().eq('id', c.id)
      if (error) throw error
      setComplaints(prev => prev.filter(x => x.id !== c.id))
    } catch { /* item stays in list */ }
    setDeletingId(null)
    setConfirmDel(null)
  }

  const hasFilters = fStatus || fPriority || fType || fCategory

  return (
    <div className="p-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Complaints & Maintenance</h1>
          <p className="text-sm text-gray-500 mt-0.5">{complaints.length} total requests</p>
        </div>
        <button onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                     text-white text-sm font-semibold rounded-lg transition">
          <PlusIcon className="w-4 h-4" /> Raise Request
        </button>
      </div>

      {/* Status count pills */}
      <div className="flex flex-wrap gap-3 mb-6">
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setFStatus(fStatus === s ? '' : s)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium
                        transition-all ${
                          fStatus === s
                            ? 'border-gray-400 bg-white shadow-sm'
                            : 'border-gray-100 bg-white hover:border-gray-300'
                        }`}
          >
            <span className={`w-2 h-2 rounded-full ${STATUS_DOT[s]}`} />
            <span className="text-gray-700">{s}</span>
            <span className={`px-1.5 py-0.5 text-xs font-bold rounded-md ${STATUS_STYLE[s]}`}>
              {counts[s]}
            </span>
          </button>
        ))}
        {hasFilters && (
          <button
            onClick={() => { setFStatus(''); setFPriority(''); setFType(''); setFCategory('') }}
            className="px-3 py-2 text-sm text-green-700 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-3 mb-5">
        <FilterSelect value={fType}     onChange={setFType}     placeholder="All Types">
          {TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </FilterSelect>
        <FilterSelect value={fPriority} onChange={setFPriority} placeholder="All Priorities">
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </FilterSelect>
        <FilterSelect value={fCategory} onChange={setFCategory} placeholder="All Categories">
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </FilterSelect>
      </div>

      {/* Content */}
      {loading ? (
        <CardSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState message={hasFilters ? 'No complaints match these filters.' : 'No complaints yet.'} />
      ) : (
        <div className="space-y-3">
          {filtered.map(c => (
            <BoardComplaintCard
              key={c.id}
              complaint={c}
              onClick={() => setDetail(c)}
              onDelete={() => setConfirmDel(c)}
              deleting={deletingId === c.id}
            />
          ))}
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <DetailModal
          complaint={detail}
          onUpdated={onUpdated}
          onClose={() => setDetail(null)}
        />
      )}

      {/* Delete confirm */}
      {confirmDel && (
        <ConfirmModal
          message={`Delete "${confirmDel.title}"? This cannot be undone.`}
          loading={deletingId === confirmDel.id}
          onConfirm={() => handleDelete(confirmDel)}
          onCancel={() => setConfirmDel(null)}
        />
      )}

      {/* Board raise modal */}
      {showAddForm && (
        <BoardRaiseModal
          villas={villas}
          onRaised={newC => { setComplaints(prev => [newC, ...prev]); setShowAddForm(false) }}
          onClose={() => setShowAddForm(false)}
        />
      )}
    </div>
  )
}

// ─── board complaint card ─────────────────────────────────────────────────────

function BoardComplaintCard({ complaint: c, onClick, onDelete, deleting }) {
  return (
    <div
      className="bg-white rounded-xl border border-gray-100 p-5 hover:border-gray-200
                 hover:shadow-sm transition-all cursor-pointer group"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-4">

        {/* Left: badges + title */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <TypeBadge type={c.type} />
            <PriorityBadge priority={c.priority} />
            <StatusBadge status={c.status} />
            {c.category && (
              <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 rounded-full">
                {c.category}
              </span>
            )}
          </div>
          <p className="font-semibold text-gray-900 truncate">{c.title}</p>
          {c.description && (
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{c.description}</p>
          )}
          {c.status === 'Resolved' && c.resolved_notes && (
            <div className="mt-2 flex items-start gap-2">
              <CheckIcon className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              <p className="text-xs text-green-700 italic line-clamp-1">{c.resolved_notes}</p>
            </div>
          )}
        </div>

        {/* Right: villa + date + actions */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="text-right">
            <p className="text-sm font-semibold text-gray-800">
              Villa {c.villas?.villa_number ?? '—'}
            </p>
            <p className="text-xs text-gray-400">{c.villas?.owner_name ?? ''}</p>
            <p className="text-xs text-gray-400 mt-1">{fmtDate(c.created_at)}</p>
          </div>
          <div
            className="flex items-center gap-2"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={onClick}
              className="px-3 py-1.5 text-xs font-medium text-green-700 border border-green-200
                         hover:bg-green-50 rounded-lg transition"
            >
              View / Update
            </button>
            <button
              onClick={onDelete}
              disabled={deleting}
              className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200
                         hover:bg-red-50 rounded-lg transition disabled:opacity-50"
            >
              {deleting ? '…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── detail modal (board) ─────────────────────────────────────────────────────

function DetailModal({ complaint, onUpdated, onClose }) {
  const [status, setStatus]             = useState(complaint.status)
  const [resolvedNotes, setResolvedNotes] = useState(complaint.resolved_notes ?? '')
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState('')

  const dirty = status !== complaint.status || resolvedNotes !== (complaint.resolved_notes ?? '')

  async function handleSave() {
    setError('')
    if (status === 'Resolved' && !resolvedNotes.trim()) {
      setError('Please add resolution notes before marking as Resolved.')
      return
    }
    setSaving(true)
    try {
      const { data, error: err } = await supabase
        .from('complaints')
        .update({ status, resolved_notes: resolvedNotes.trim() || null })
        .eq('id', complaint.id)
        .select()
        .single()
      if (err) throw err
      onUpdated(data)
    } catch (e) {
      setError(e.message ?? 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-2 mb-2">
              <TypeBadge type={complaint.type} />
              <PriorityBadge priority={complaint.priority} />
              {complaint.category && (
                <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 rounded-full">
                  {complaint.category}
                </span>
              )}
            </div>
            <h2 className="text-base font-semibold text-gray-900 leading-snug">{complaint.title}</h2>
            <p className="text-xs text-gray-400 mt-1">
              Villa {complaint.villas?.villa_number} · {complaint.villas?.owner_name} · {fmtDate(complaint.created_at)}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition mt-1 shrink-0">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Full description */}
          {complaint.description && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                Description
              </p>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {complaint.description}
              </p>
            </div>
          )}

          {/* Status update */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              Status
            </label>
            <div className="flex gap-2 flex-wrap">
              {STATUSES.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium
                              transition-all ${
                                status === s
                                  ? 'border-gray-400 bg-gray-50 shadow-sm'
                                  : 'border-gray-100 hover:border-gray-300'
                              }`}
                >
                  <span className={`w-2 h-2 rounded-full ${STATUS_DOT[s]}`} />
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Resolved notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              Resolution Notes
              {status === 'Resolved' && <span className="text-red-500 ml-1">*</span>}
            </label>
            <textarea
              value={resolvedNotes}
              onChange={e => setResolvedNotes(e.target.value)}
              rows={3}
              placeholder="Describe what was done to resolve this…"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none
                         focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent
                         transition placeholder-gray-400"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200
                         hover:border-gray-300 rounded-lg transition"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700
                         disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm
                         font-semibold rounded-lg transition"
            >
              {saving && (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── resident view ────────────────────────────────────────────────────────────

function ResidentView({ myVilla }) {
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)

  useEffect(() => {
    if (!myVilla?.id) { setLoading(false); return }
    supabase
      .from('complaints')
      .select('*')
      .eq('villa_id', myVilla.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setComplaints(data ?? [])
        setLoading(false)
      })
  }, [myVilla?.id])

  function onRaised(newC) {
    setComplaints(prev => [newC, ...prev])
    setShowForm(false)
  }

  if (!myVilla) {
    return (
      <div className="p-6 py-24 text-center">
        <p className="text-gray-500">No villa linked to your account.</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">My Complaints & Requests</h1>
          <p className="text-sm text-gray-500 mt-0.5">Villa {myVilla.villa_number}</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                     text-white text-sm font-semibold rounded-lg transition"
        >
          <PlusIcon className="w-4 h-4" />
          Raise Request
        </button>
      </div>

      {loading ? (
        <CardSkeleton />
      ) : complaints.length === 0 ? (
        <EmptyState message="No complaints or requests raised yet.">
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                       text-white text-sm font-semibold rounded-lg transition"
          >
            <PlusIcon className="w-4 h-4" />
            Raise your first request
          </button>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {complaints.map(c => (
            <ResidentComplaintCard key={c.id} complaint={c} />
          ))}
        </div>
      )}

      {showForm && (
        <RaiseComplaintModal
          villaId={myVilla.id}
          onRaised={onRaised}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  )
}

// ─── resident complaint card ──────────────────────────────────────────────────

function ResidentComplaintCard({ complaint: c }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <TypeBadge type={c.type} />
            <PriorityBadge priority={c.priority} />
            <StatusBadge status={c.status} />
            {c.category && (
              <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-500 rounded-full">
                {c.category}
              </span>
            )}
          </div>
          <p className="font-semibold text-gray-900">{c.title}</p>
          {c.description && (
            <p className={`text-sm text-gray-500 mt-1 ${expanded ? '' : 'line-clamp-2'}`}>
              {c.description}
            </p>
          )}
          {c.description && c.description.length > 120 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-xs text-green-600 hover:underline mt-1"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
          {c.status === 'Resolved' && c.resolved_notes && (
            <div className="mt-3 flex items-start gap-2 bg-green-50 rounded-lg px-3 py-2">
              <CheckIcon className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-green-700">Resolution</p>
                <p className="text-xs text-green-700 mt-0.5">{c.resolved_notes}</p>
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400 shrink-0 mt-1">{fmtDate(c.created_at)}</p>
      </div>
    </div>
  )
}

// ─── raise complaint modal (resident) ────────────────────────────────────────

function RaiseComplaintModal({ villaId, onRaised, onClose }) {
  const [form, setForm]     = useState({ ...EMPTY_RESIDENT_FORM })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const { data, error: err } = await supabase
        .from('complaints')
        .insert({
          villa_id:    villaId,
          type:        form.type,
          title:       form.title.trim(),
          description: form.description.trim() || null,
          priority:    form.priority,
          category:    form.category,
          status:      'Pending',
        })
        .select()
        .single()
      if (err) throw err
      onRaised(data)
    } catch (e) {
      setError(e.message ?? 'Failed to submit.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Raise a Request</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Type toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {TYPES.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set('type', t)}
                  className={`flex-1 py-2 text-sm font-medium transition ${
                    form.type === t
                      ? t === 'complaint'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-blue-50 text-blue-700'
                      : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <Field label="Title" required>
            <input
              type="text"
              required
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Brief summary of the issue"
              className={inputCls}
            />
          </Field>

          {/* Description */}
          <Field label="Description">
            <textarea
              rows={3}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Describe the issue in detail…"
              className={inputCls + ' resize-none'}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            {/* Priority */}
            <Field label="Priority">
              <select
                value={form.priority}
                onChange={e => set('priority', e.target.value)}
                className={inputCls}
              >
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </Field>

            {/* Category */}
            <Field label="Category">
              <select
                value={form.category}
                onChange={e => set('category', e.target.value)}
                className={inputCls}
              >
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200
                         hover:border-gray-300 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700
                         disabled:bg-green-400 text-white text-sm font-semibold rounded-lg transition"
            >
              {saving && (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {saving ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── board raise modal ────────────────────────────────────────────────────────

function BoardRaiseModal({ villas, onRaised, onClose }) {
  const [form, setForm]     = useState({ ...EMPTY_RESIDENT_FORM, villa_id: villas[0]?.id ?? '' })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(field, value) { setForm(prev => ({ ...prev, [field]: value })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.villa_id) { setError('Please select a villa.'); return }
    setSaving(true)
    try {
      const { data, error: err } = await supabase
        .from('complaints')
        .insert({
          villa_id:    form.villa_id,
          type:        form.type,
          title:       form.title.trim(),
          description: form.description.trim() || null,
          priority:    form.priority,
          category:    form.category,
          status:      'Pending',
        })
        .select('*, villas(villa_number, owner_name)')
        .single()
      if (err) throw err
      onRaised(data)
    } catch (err) {
      setError(err.message ?? 'Failed to submit.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Raise a Request</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Villa selector */}
          <Field label="Villa" required>
            <select value={form.villa_id} onChange={e => set('villa_id', e.target.value)} className={inputCls}>
              <option value="">Select villa…</option>
              {villas.map(v => (
                <option key={v.id} value={v.id}>
                  Villa {v.villa_number}{v.owner_name ? ` — ${v.owner_name}` : ''}
                </option>
              ))}
            </select>
          </Field>

          {/* Type toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {TYPES.map(t => (
                <button key={t} type="button" onClick={() => set('type', t)}
                  className={`flex-1 py-2 text-sm font-medium transition ${
                    form.type === t
                      ? t === 'complaint' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
                      : 'text-gray-500 hover:bg-gray-50'
                  }`}>
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <Field label="Title" required>
            <input type="text" required value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Brief summary of the issue" className={inputCls} />
          </Field>

          {/* Description */}
          <Field label="Description">
            <textarea rows={3} value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Describe the issue in detail…"
              className={inputCls + ' resize-none'} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Priority">
              <select value={form.priority} onChange={e => set('priority', e.target.value)} className={inputCls}>
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Category">
              <select value={form.category} onChange={e => set('category', e.target.value)} className={inputCls}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200
                         hover:border-gray-300 rounded-lg transition">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700
                         disabled:bg-green-400 text-white text-sm font-semibold rounded-lg transition">
              {saving && (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {saving ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── shared small components ──────────────────────────────────────────────────

function TypeBadge({ type }) {
  return (
    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${TYPE_STYLE[type] ?? 'bg-gray-100 text-gray-500'}`}>
      {TYPE_LABEL[type] ?? type}
    </span>
  )
}

function PriorityBadge({ priority }) {
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${PRIORITY_STYLE[priority] ?? 'bg-gray-100 text-gray-500'}`}>
      {priority}
    </span>
  )
}

function StatusBadge({ status }) {
  return (
    <span className={`flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_STYLE[status] ?? 'bg-gray-100 text-gray-500'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {status}
    </span>
  )
}

function FilterSelect({ value, onChange, placeholder, children }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white
                 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
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

function CardSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex gap-2 mb-3">
            <div className="h-5 w-20 bg-gray-100 rounded-full animate-pulse" />
            <div className="h-5 w-16 bg-gray-100 rounded-full animate-pulse" />
            <div className="h-5 w-20 bg-gray-100 rounded-full animate-pulse" />
          </div>
          <div className="h-4 bg-gray-100 rounded animate-pulse w-2/3 mb-2" />
          <div className="h-3 bg-gray-100 rounded animate-pulse w-full" />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ message, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 py-16 flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <FlagIcon className="w-7 h-7 text-gray-400" />
      </div>
      <p className="text-gray-500 font-medium">{message}</p>
      {children}
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
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200
                       hover:border-gray-300 rounded-lg transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700
                       disabled:bg-red-400 text-white text-sm font-semibold rounded-lg transition"
          >
            {loading && (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── style constants ──────────────────────────────────────────────────────────

const inputCls = `w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
  focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition`

// ─── icons ────────────────────────────────────────────────────────────────────

function PlusIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  )
}
function XIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
function CheckIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}
function FlagIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 21V3m0 4l9-2 9 2-9 2-9-2z" />
    </svg>
  )
}
