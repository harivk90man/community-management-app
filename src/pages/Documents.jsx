import { useCallback, useEffect, useRef, useState } from 'react'
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

const BUCKET = 'documents'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getFileExt(name) {
  return (name ?? '').split('.').pop().toLowerCase()
}

function isViewableInBrowser(ext) {
  return ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)
}

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function Documents() {
  const { role, user } = useAuth()
  const [docs, setDocs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showUrlForm, setShowUrlForm] = useState(false)
  const [viewing, setViewing]   = useState(null)   // doc being viewed in-app
  const [confirmDel, setConfirmDel] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const fetchDocs = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('documents').select('*')
      .order('category').order('created_at', { ascending: false })
    setDocs(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  function onSuccess() { setShowForm(false); fetchDocs() }

  async function handleDelete(d) {
    setDeletingId(d.id)
    try {
      // Delete file from storage if it's a storage path (not an external URL)
      if (d.storage_path) {
        await supabase.storage.from(BUCKET).remove([d.storage_path])
      }
      const { error } = await supabase.from('documents').delete().eq('id', d.id)
      if (error) throw error
      setDocs(prev => prev.filter(x => x.id !== d.id))
    } catch { /* item stays in list */ }
    setDeletingId(null); setConfirmDel(null)
  }

  // group by category
  const grouped = CATEGORIES.reduce((acc, cat) => {
    const items = docs.filter(d => d.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {})
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
            <PlusIcon className="w-4 h-4" /> Upload Document
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
                    onView={() => setViewing(d)}
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
        <UploadDocumentModal user={user} onSuccess={onSuccess} onClose={() => setShowForm(false)}
          onFallbackUrl={() => { setShowForm(false); setShowUrlForm(true) }} />
      )}
      {showUrlForm && (
        <AddByUrlModal user={user} onSuccess={onSuccess} onClose={() => setShowUrlForm(false)} />
      )}
      {viewing && (
        <DocumentViewer doc={viewing} onClose={() => setViewing(null)} />
      )}
      {confirmDel && (
        <ConfirmModal message={`Remove "${confirmDel.title}"?`} loading={deletingId === confirmDel.id}
          onConfirm={() => handleDelete(confirmDel)} onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  )
}

// ─── document card ───────────────────────────────────────────────────────────

function DocumentCard({ doc: d, canDelete, onView, onDelete, deleting }) {
  const ext = getFileExt(d.file_name ?? d.file_url ?? '')
  const isImage = ['png','jpg','jpeg','gif','webp'].includes(ext)

  return (
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
          {d.file_size && (
            <p className="text-xs text-gray-400">{fmtSize(d.file_size)} · .{ext}</p>
          )}
        </div>
        <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
          {isImage ? <ImageIcon className="w-5 h-5 text-gray-400" /> : ext === 'pdf' ? <PdfIcon className="w-5 h-5 text-red-400" /> : <FileIcon className="w-5 h-5 text-gray-400" />}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onView}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold
                     bg-green-50 text-green-700 hover:bg-green-100 rounded-lg transition">
          <EyeIcon className="w-3.5 h-3.5" /> View
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
  )
}

// ─── in-app document viewer ──────────────────────────────────────────────────

function DocumentViewer({ doc, onClose }) {
  const [url, setUrl]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')

      // If it has a storage_path, get a signed URL from Supabase Storage
      if (doc.storage_path) {
        const { data, error: err } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(doc.storage_path, 3600) // 1 hour
        if (err) {
          setError('Failed to load document.')
          setLoading(false)
          return
        }
        setUrl(data.signedUrl)
      } else if (doc.file_url) {
        // Legacy: external URL
        setUrl(doc.file_url)
      } else {
        setError('No file found for this document.')
      }
      setLoading(false)
    }
    load()
  }, [doc])

  const ext = getFileExt(doc.file_name ?? doc.file_url ?? doc.storage_path ?? '')
  const isImage = ['png','jpg','jpeg','gif','webp','svg'].includes(ext)
  const isPdf   = ext === 'pdf'
  const canEmbed = isViewableInBrowser(ext)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`px-2 py-0.5 text-xs font-medium rounded-full
            ${CAT_STYLE[doc.category] ?? 'bg-gray-100 text-gray-600'}`}>{doc.category}</span>
          <p className="font-semibold text-gray-900 text-sm truncate">{doc.title}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {url && (
            <a
              href={url}
              download={doc.file_name ?? doc.title}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                         text-gray-600 border border-gray-200 hover:border-gray-300
                         hover:bg-gray-50 rounded-lg transition"
            >
              <DownloadIcon className="w-3.5 h-3.5" /> Download
            </a>
          )}
          <button onClick={onClose}
            className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition">
            <XIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4">
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <span className="w-8 h-8 border-3 border-green-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-white/70">Loading document…</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl p-8 text-center max-w-sm">
            <FileIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">{error}</p>
          </div>
        ) : isImage ? (
          <img
            src={url}
            alt={doc.title}
            className="max-w-full max-h-full rounded-lg shadow-2xl object-contain"
          />
        ) : isPdf || canEmbed ? (
          <iframe
            src={url}
            title={doc.title}
            className="w-full h-full max-w-4xl rounded-lg shadow-2xl bg-white"
            style={{ minHeight: '70vh' }}
          />
        ) : (
          <div className="bg-white rounded-xl p-8 text-center max-w-sm">
            <FileIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-900 font-medium mb-2">{doc.title}</p>
            <p className="text-xs text-gray-400 mb-4">
              This file type (.{ext}) cannot be previewed in the browser.
            </p>
            <a
              href={url}
              download={doc.file_name ?? doc.title}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                         text-white text-sm font-semibold rounded-lg transition"
            >
              <DownloadIcon className="w-4 h-4" /> Download File
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── upload modal ────────────────────────────────────────────────────────────

function UploadDocumentModal({ user, onSuccess, onClose, onFallbackUrl }) {
  const [title, setTitle]       = useState('')
  const [category, setCategory] = useState('Circular')
  const [uploadedBy, setUploadedBy] = useState(user?.email ?? '')
  const [file, setFile]         = useState(null)
  const [saving, setSaving]     = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError]       = useState('')
  const fileRef = useRef(null)

  function handleFileChange(e) {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > MAX_FILE_SIZE) {
      setError(`File too large (${fmtSize(f.size)}). Maximum is ${fmtSize(MAX_FILE_SIZE)}.`)
      return
    }
    setFile(f)
    setError('')
    // Auto-fill title from filename if empty
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!file) { setError('Please select a file to upload.'); return }
    if (!title.trim()) { setError('Please enter a title.'); return }

    setSaving(true)
    setProgress(0)

    try {
      // 1. Upload file to Supabase Storage
      const ext = getFileExt(file.name)
      const storagePath = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

      setProgress(20)

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadErr) {
        // Specific help for missing bucket
        if (uploadErr.message?.includes('not found') || uploadErr.message?.includes('Bucket')) {
          throw new Error(
            'Storage bucket "documents" not found. Go to Supabase Dashboard → Storage → New Bucket → name it "documents" (public).'
          )
        }
        throw uploadErr
      }
      setProgress(70)

      // 2. Get the public URL for backward compatibility
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)

      // 3. Insert document record
      const { error: dbErr } = await supabase.from('documents').insert({
        title: title.trim(),
        file_url: urlData?.publicUrl ?? '',
        storage_path: storagePath,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        category,
        uploaded_by: uploadedBy.trim() || null,
      })

      if (dbErr) {
        // If DB insert fails (missing columns), give specific guidance
        if (dbErr.message?.includes('storage_path') || dbErr.message?.includes('file_name')) {
          throw new Error(
            'Database needs new columns. Run in Supabase SQL Editor: ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_path TEXT, ADD COLUMN IF NOT EXISTS file_name TEXT, ADD COLUMN IF NOT EXISTS file_size BIGINT, ADD COLUMN IF NOT EXISTS file_type TEXT;'
          )
        }
        throw dbErr
      }
      setProgress(100)
      onSuccess()
    } catch (err) {
      setError(err.message ?? 'Upload failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Upload Document" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <ErrorBox msg={error} />}

        {/* File picker */}
        <Field label="File" required>
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center
                       hover:border-green-400 hover:bg-green-50/30 transition cursor-pointer"
          >
            {file ? (
              <div className="flex items-center gap-3 justify-center">
                <FileIcon className="w-8 h-8 text-green-600" />
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-400">{fmtSize(file.size)}</p>
                </div>
              </div>
            ) : (
              <>
                <UploadIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500 font-medium">Click to select a file</p>
                <p className="text-xs text-gray-400 mt-1">PDF, images, docs — max {fmtSize(MAX_FILE_SIZE)}</p>
              </>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.txt"
            onChange={handleFileChange}
          />
        </Field>

        <Field label="Title" required>
          <input type="text" required value={title}
            onChange={e => setTitle(e.target.value)} placeholder="Document title" className={inputCls} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Category">
            <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Uploaded By">
            <input type="text" value={uploadedBy}
              onChange={e => setUploadedBy(e.target.value)} placeholder="Your name" className={inputCls} />
          </Field>
        </div>

        {/* Progress bar */}
        {saving && (
          <div className="space-y-1">
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 text-right">{progress}%</p>
          </div>
        )}

        <ModalFooter saving={saving} label="Upload" onCancel={onClose} />

        {onFallbackUrl && (
          <button type="button" onClick={onFallbackUrl}
            className="w-full mt-2 text-xs text-gray-400 hover:text-gray-600 transition text-center">
            Or add by URL instead
          </button>
        )}
      </form>
    </Modal>
  )
}

// ─── add by URL fallback ─────────────────────────────────────────────────────

function AddByUrlModal({ user, onSuccess, onClose }) {
  const [form, setForm] = useState({ title: '', file_url: '', category: 'Circular', uploaded_by: user?.email ?? '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
    } catch (err) { setError(err.message ?? 'Failed to save.') } finally { setSaving(false) }
  }

  return (
    <Modal title="Add Document (URL)" onClose={onClose}>
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
          <PlusIcon className="w-4 h-4" /> Upload first document
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
        {saving && <Spinner />}{saving ? 'Uploading…' : label}
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

// ─── icons ───────────────────────────────────────────────────────────────────

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
function EyeIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
}
function DownloadIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
}
function UploadIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
}
function ImageIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
}
function PdfIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
}
