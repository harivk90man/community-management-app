import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// ─── role config ──────────────────────────────────────────────────────────────

const ROLE_ORDER = { President: 1, Secretary: 2, Treasurer: 3 }

function roleSort(a, b) {
  const ra = ROLE_ORDER[a.board_role] ?? 99
  const rb = ROLE_ORDER[b.board_role] ?? 99
  return ra !== rb ? ra - rb : (a.owner_name ?? '').localeCompare(b.owner_name ?? '')
}

const ROLE_STYLE = {
  President:        'bg-yellow-100 text-yellow-800 border-yellow-200',
  Secretary:        'bg-blue-100   text-blue-800   border-blue-200',
  Treasurer:        'bg-purple-100 text-purple-800 border-purple-200',
  'Executive Member': 'bg-green-100  text-green-800  border-green-200',
}

// Avatar colour palette — cycles by card index
const AVATAR_COLORS = [
  'bg-green-600',
  'bg-blue-600',
  'bg-purple-600',
  'bg-orange-500',
  'bg-teal-600',
  'bg-rose-600',
  'bg-indigo-600',
  'bg-amber-600',
]

function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : parts[0].slice(0, 2).toUpperCase()
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function BoardMembers() {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    async function load() {
      const { data, error: err } = await supabase
        .from('villas')
        .select('id, villa_number, owner_name, phone, email, board_role')
        .eq('is_board_member', true)
        .eq('is_active', true)
      if (err) { setError(err.message); setLoading(false); return }
      setMembers((data ?? []).sort(roleSort))
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="p-6 max-w-5xl mx-auto">

      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Association Board Members</h1>
        <p className="text-sm text-gray-500 mt-1">Your elected representatives</p>
      </div>

      {/* States */}
      {loading && <CardSkeleton />}

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && members.length === 0 && (
        <div className="py-16 text-center text-gray-400 text-sm">
          No board members found.
        </div>
      )}

      {/* Grid */}
      {!loading && members.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {members.map((m, i) => (
            <MemberCard key={m.id} member={m} colorClass={AVATAR_COLORS[i % AVATAR_COLORS.length]} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── member card ──────────────────────────────────────────────────────────────

function MemberCard({ member: m, colorClass }) {
  const role = m.board_role || 'Executive Member'
  const roleCls = ROLE_STYLE[role] ?? ROLE_STYLE['Executive Member']

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm
                    hover:shadow-md hover:-translate-y-0.5 transition-all duration-200
                    flex flex-col items-center text-center p-6 gap-3">

      {/* Avatar */}
      <div className={`w-20 h-20 rounded-full ${colorClass} flex items-center justify-center shrink-0`}>
        <span className="text-2xl font-bold text-white tracking-wide">
          {initials(m.owner_name)}
        </span>
      </div>

      {/* Name */}
      <div>
        <p className="text-base font-bold text-gray-900 leading-tight">
          {m.owner_name ?? '—'}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">Villa {m.villa_number}</p>
      </div>

      {/* Role badge */}
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold
                        border ${roleCls}`}>
        {role}
      </span>

      {/* Divider */}
      <div className="w-full border-t border-gray-100 my-1" />

      {/* Contact details */}
      <div className="w-full space-y-2 text-sm">
        {m.phone ? (
          <a href={`tel:${m.phone}`}
            className="flex items-center justify-center gap-2 text-gray-600
                       hover:text-green-700 transition-colors group">
            <PhoneIcon className="w-4 h-4 text-gray-400 group-hover:text-green-600 shrink-0" />
            <span className="truncate">{m.phone}</span>
          </a>
        ) : (
          <div className="flex items-center justify-center gap-2 text-gray-300">
            <PhoneIcon className="w-4 h-4 shrink-0" />
            <span>—</span>
          </div>
        )}

        {m.email ? (
          <a href={`mailto:${m.email}`}
            className="flex items-center justify-center gap-2 text-gray-600
                       hover:text-green-700 transition-colors group">
            <MailIcon className="w-4 h-4 text-gray-400 group-hover:text-green-600 shrink-0" />
            <span className="truncate">{m.email}</span>
          </a>
        ) : (
          <div className="flex items-center justify-center gap-2 text-gray-300">
            <MailIcon className="w-4 h-4 shrink-0" />
            <span>—</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── loading skeleton ─────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-full bg-gray-200" />
          <div className="h-4 w-32 bg-gray-200 rounded" />
          <div className="h-3 w-16 bg-gray-100 rounded" />
          <div className="h-6 w-28 bg-gray-100 rounded-full" />
          <div className="w-full border-t border-gray-100 my-1" />
          <div className="h-3 w-36 bg-gray-100 rounded" />
          <div className="h-3 w-40 bg-gray-100 rounded" />
        </div>
      ))}
    </div>
  )
}

// ─── icons ────────────────────────────────────────────────────────────────────

function PhoneIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  )
}

function MailIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}
