import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function GlobalSearch({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const navigate = useNavigate()
  const debounceRef = useRef(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  function handleChange(value) {
    setQuery(value)
    clearTimeout(debounceRef.current)
    if (value.trim().length < 2) { setResults([]); return }

    debounceRef.current = setTimeout(() => search(value.trim()), 300)
  }

  async function search(q) {
    setLoading(true)
    const like = `%${q}%`

    const [complaints, announcements, documents, vendors, villas] = await Promise.all([
      supabase.from('complaints').select('id, title, status').ilike('title', like).limit(5),
      supabase.from('announcements').select('id, title, audience').ilike('title', like).limit(5),
      supabase.from('documents').select('id, title, category').ilike('title', like).limit(5),
      supabase.from('vendors').select('id, name, category').ilike('name', like).limit(5),
      supabase.from('villas').select('id, villa_number, owner_name').or(`villa_number.ilike.${like},owner_name.ilike.${like}`).limit(5),
    ])

    const mapped = []

    for (const c of (complaints.data ?? [])) {
      mapped.push({ type: 'complaint', label: c.title, sub: c.status, path: '/complaints', icon: FlagIcon })
    }
    for (const a of (announcements.data ?? [])) {
      mapped.push({ type: 'announcement', label: a.title, sub: a.audience, path: '/announcements', icon: MegaphoneIcon })
    }
    for (const d of (documents.data ?? [])) {
      mapped.push({ type: 'document', label: d.title, sub: d.category, path: '/documents', icon: DocumentIcon })
    }
    for (const v of (vendors.data ?? [])) {
      mapped.push({ type: 'vendor', label: v.name, sub: v.category, path: '/vendors', icon: WrenchIcon })
    }
    for (const v of (villas.data ?? [])) {
      mapped.push({ type: 'villa', label: `Villa ${v.villa_number}`, sub: v.owner_name, path: '/villas', icon: BuildingIcon })
    }

    setResults(mapped)
    setLoading(false)
  }

  function handleSelect(result) {
    onClose()
    navigate(result.path)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center pt-20 px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">

        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <SearchIcon className="w-5 h-5 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => handleChange(e.target.value)}
            placeholder="Search complaints, announcements, documents, vendors, villas…"
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none"
          />
          {loading && (
            <span className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin shrink-0" />
          )}
          <button onClick={onClose} className="text-xs text-gray-400 border border-gray-200 px-1.5 py-0.5 rounded font-mono">
            Esc
          </button>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {query.length < 2 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-gray-400">Type at least 2 characters to search</p>
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="py-10 text-center">
              <p className="text-sm text-gray-400">No results for "{query}"</p>
            </div>
          ) : (
            <div className="py-2">
              {results.map((r, i) => {
                const Icon = r.icon
                return (
                  <button
                    key={`${r.type}-${i}`}
                    onClick={() => handleSelect(r)}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{r.label}</p>
                      <p className="text-xs text-gray-400">{r.sub} · {r.type}</p>
                    </div>
                    <ArrowIcon className="w-4 h-4 text-gray-300 shrink-0" />
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SearchIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
}
function ArrowIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
}
function FlagIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21V3m0 4l9-2 9 2-9 2-9-2z" /></svg>
}
function MegaphoneIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>
}
function DocumentIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
}
function WrenchIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
}
function BuildingIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3M9 7h1m-1 4h1m4-4h1m-1 4h1M9 21v-4a1 1 0 011-1h4a1 1 0 011 1v4" /></svg>
}
