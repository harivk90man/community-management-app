import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function Dashboard() {
  const { villa, role } = useAuth()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      const now = new Date()
      const month = now.getMonth() + 1
      const year = now.getFullYear()

      const [villasRes, paymentsRes, complaintsRes, announcementsRes] = await Promise.all([
        supabase.from('villas').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('payments').select('id', { count: 'exact', head: true })
          .eq('billing_month', month).eq('billing_year', year),
        supabase.from('complaints').select('id', { count: 'exact', head: true })
          .eq('status', 'Pending'),
        supabase.from('announcements').select('id', { count: 'exact', head: true })
          .eq('is_pinned', false)
          .or(`ends_at.is.null,ends_at.gte.${now.toISOString()}`),
      ])

      setStats({
        totalVillas:         villasRes.count   ?? 0,
        paymentsThisMonth:   paymentsRes.count ?? 0,
        openComplaints:      complaintsRes.count ?? 0,
        activeAnnouncements: announcementsRes.count ?? 0,
      })
      setLoading(false)
    }

    fetchStats()
  }, [])

  const STAT_CARDS = [
    {
      label: 'Total Villas',
      value: stats?.totalVillas,
      icon: BuildingIcon,
      bg: 'bg-blue-50',
      iconColor: 'text-blue-600',
    },
    {
      label: 'Payments This Month',
      value: stats?.paymentsThisMonth,
      icon: CurrencyIcon,
      bg: 'bg-green-50',
      iconColor: 'text-green-600',
    },
    {
      label: 'Open Complaints',
      value: stats?.openComplaints,
      icon: FlagIcon,
      bg: 'bg-amber-50',
      iconColor: 'text-amber-600',
    },
    {
      label: 'Active Announcements',
      value: stats?.activeAnnouncements,
      icon: MegaphoneIcon,
      bg: 'bg-purple-50',
      iconColor: 'text-purple-600',
    },
  ]

  return (
    <div className="p-6 max-w-5xl mx-auto">

      {/* Welcome header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back{villa?.owner_name ? `, ${villa.owner_name}` : ''}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Ashirvadh Castle Rock Association
          {villa && (
            <span className="ml-2 text-gray-400">· Villa {villa.villa_number}</span>
          )}
          {role === 'board' && (
            <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
              Board Member{villa?.board_role ? ` · ${villa.board_role}` : ''}
            </span>
          )}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map(card => (
          <StatCard key={card.label} {...card} loading={loading} />
        ))}
      </div>

      {/* Quick info */}
      <div className="mt-8 bg-white rounded-xl border border-gray-100 p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Your Villa Details</h2>
        {villa ? (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <Detail label="Villa Number" value={villa.villa_number} />
            <Detail label="Owner Name"   value={villa.owner_name} />
            <Detail label="Email"        value={villa.email ?? '—'} />
            <Detail label="Phone"        value={villa.phone ?? '—'} />
            {villa.is_rented && (
              <>
                <Detail label="Tenant Name"  value={villa.tenant_name ?? '—'} />
                <Detail label="Tenant Phone" value={villa.tenant_phone ?? '—'} />
              </>
            )}
            <Detail
              label="Status"
              value={
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                  ${villa.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {villa.is_active ? 'Active' : 'Inactive'}
                </span>
              }
            />
            {villa.is_rented && (
              <Detail
                label="Occupancy"
                value={<span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Rented</span>}
              />
            )}
          </dl>
        ) : (
          <p className="text-sm text-gray-400">No villa linked to your account.</p>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, icon: Icon, bg, iconColor, loading }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-center gap-4">
      <div className={`${bg} w-11 h-11 rounded-lg flex items-center justify-center shrink-0`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div>
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        {loading ? (
          <div className="mt-1 h-6 w-10 bg-gray-100 rounded animate-pulse" />
        ) : (
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        )}
      </div>
    </div>
  )
}

function Detail({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-gray-800">{value}</dd>
    </div>
  )
}

// Icons
function BuildingIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3M9 7h1m-1 4h1m4-4h1m-1 4h1M9 21v-4a1 1 0 011-1h4a1 1 0 011 1v4" />
    </svg>
  )
}
function CurrencyIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M17 9V7a4 4 0 00-8 0v2M5 9h14l1 12H4L5 9z" />
    </svg>
  )
}
function FlagIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 3v18M3 6l9-3 9 3-9 3-9-3z" />
    </svg>
  )
}
function MegaphoneIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
    </svg>
  )
}
