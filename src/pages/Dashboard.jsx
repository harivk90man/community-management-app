import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { usePageData } from '../hooks/usePageData'
import FetchError from '../components/FetchError'

function fmt(n) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)
}

export default function Dashboard() {
  const { villa, villaUser, user, role } = useAuth()
  const displayName = villaUser?.name ?? villa?.owner_name
  const isPhoneUser = user?.email?.endsWith('@villaapp.local')
  const [stats, setStats] = useState(null)

  const { loading, error: fetchError, retry } = usePageData(async () => {
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    const [villasRes, paymentsRes, complaintsRes, announcementsRes, assocRes, allPaymentsRes, expensesRes] = await Promise.all([
      supabase.from('villas').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('payments').select('id, villa_id', { count: 'exact' })
        .eq('billing_month', month).eq('billing_year', year),
      supabase.from('complaints').select('id', { count: 'exact', head: true })
        .eq('status', 'Pending'),
      supabase.from('announcements').select('id', { count: 'exact', head: true })
        .eq('is_pinned', false)
        .or(`ends_at.is.null,ends_at.gte.${now.toISOString()}`),
      supabase.from('association_config').select('opening_balance, due_day').limit(1).single(),
      supabase.from('payments').select('amount'),
      supabase.from('expenses').select('amount'),
    ])

    if (villasRes.error) throw villasRes.error
    if (paymentsRes.error) throw paymentsRes.error
    if (complaintsRes.error) throw complaintsRes.error
    if (announcementsRes.error) throw announcementsRes.error

    // Fund calculation
    const openingBalance = Number(assocRes.data?.opening_balance ?? 0)
    const dueDay = assocRes.data?.due_day ?? 10
    const totalCollected = (allPaymentsRes.data ?? []).reduce((s, p) => s + Number(p.amount), 0)
    const totalExpenses = (expensesRes.data ?? []).reduce((s, e) => s + Number(e.amount), 0)
    const fundBalance = openingBalance + totalCollected - totalExpenses

    // Defaulter count: only from May 2026 onwards (go-live month)
    const paidVillaIds = new Set((paymentsRes.data ?? []).map(p => p.villa_id))
    const totalVillas = villasRes.count ?? 0
    const paidCount = paidVillaIds.size
    const unpaidCount = totalVillas - paidCount
    const isBeforeGoLive = year < 2026 || (year === 2026 && month < 5)
    const isPastDueDay = isBeforeGoLive ? false : now.getDate() > dueDay

    setStats({
      totalVillas,
      paymentsThisMonth:   paymentsRes.count ?? 0,
      openComplaints:      complaintsRes.count ?? 0,
      activeAnnouncements: announcementsRes.count ?? 0,
      fundBalance,
      defaulters: isPastDueDay ? unpaidCount : 0,
      unpaidCount,
      dueDay,
      isPastDueDay,
      isBeforeGoLive,
    })
  }, [])

  const STAT_CARDS = [
    {
      label: 'Fund Balance',
      value: stats ? `₹${fmt(stats.fundBalance)}` : null,
      icon: WalletIcon,
      bg: stats?.fundBalance >= 0 ? 'bg-green-50' : 'bg-red-50',
      iconColor: stats?.fundBalance >= 0 ? 'text-green-600' : 'text-red-600',
    },
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
    ...(!stats?.isBeforeGoLive && stats?.isPastDueDay && stats?.defaulters > 0 ? [{
      label: `Defaulters (past ${stats.dueDay}th)`,
      value: stats.defaulters,
      icon: AlertIcon,
      bg: 'bg-red-50',
      iconColor: 'text-red-600',
    }] : !stats?.isBeforeGoLive && stats?.unpaidCount > 0 ? [{
      label: 'Pending Payments',
      value: stats.unpaidCount,
      icon: FlagIcon,
      bg: 'bg-amber-50',
      iconColor: 'text-amber-600',
    }] : []),
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
          Welcome back{displayName ? `, ${displayName}` : ''}
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

      {fetchError && <FetchError message={fetchError} onRetry={retry} />}

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
            <Detail label="Name"         value={displayName ?? '—'} />
            <Detail label="Email"        value={villaUser?.email ?? villa.email ?? '—'} />
            <Detail label="Phone"        value={villaUser?.phone ?? villa.phone ?? '—'} />
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

      {/* Recovery email for phone users */}
      {isPhoneUser && <RecoveryEmailCard />}
    </div>
  )
}

function RecoveryEmailCard() {
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [saving, setSaving]               = useState(false)
  const [message, setMessage]             = useState({ type: '', text: '' })

  async function handleSubmit(e) {
    e.preventDefault()
    setMessage({ type: '', text: '' })
    setSaving(true)

    try {
      // Update Supabase auth email — this sends a confirmation email
      const { error } = await supabase.auth.updateUser({
        email: recoveryEmail.trim(),
      })
      if (error) throw error
      setMessage({
        type: 'success',
        text: 'Confirmation email sent! Check your inbox and click the link to confirm. After that, you can use this email to reset your password.',
      })
      setRecoveryEmail('')
    } catch (err) {
      setMessage({ type: 'error', text: err.message ?? 'Failed to update email.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-6 bg-white rounded-xl border border-amber-200 p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
          <MailIcon className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-800">Add Recovery Email</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            You signed up with your phone number. Add an email so you can reset your password if you forget it.
          </p>
        </div>
      </div>

      {message.text && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
          message.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-3">
        <input type="email" required value={recoveryEmail}
          onChange={e => setRecoveryEmail(e.target.value)}
          placeholder="your.email@example.com"
          className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition" />
        <button type="submit" disabled={saving || !recoveryEmail.trim()}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400
                     text-white text-sm font-semibold rounded-lg transition shrink-0 flex items-center gap-2">
          {saving && (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
          {saving ? 'Sending…' : 'Add email'}
        </button>
      </form>
    </div>
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
function WalletIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 10h18V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2v-4M16 14a1 1 0 100-2 1 1 0 000 2z" />
    </svg>
  )
}
function AlertIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
    </svg>
  )
}
