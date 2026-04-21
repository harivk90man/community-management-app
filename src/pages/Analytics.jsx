import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { usePageData } from '../hooks/usePageData'
import FetchError from '../components/FetchError'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from 'recharts'

// ─── constants ────────────────────────────────────────────────────────────────

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const YEARS       = ['2024','2025','2026']
const MODES       = ['UPI','Cash','Bank Transfer','Cheque']

const EXPENSE_CAT_COLORS = {
  Maintenance: '#f97316',
  Utilities:   '#3b82f6',
  Security:    '#ef4444',
  Cleaning:    '#14b8a6',
  Events:      '#a855f7',
  Other:       '#9ca3af',
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n ?? 0)
}
function expYear(d)  { return d ? new Date(d + 'T00:00:00').getFullYear() : null }
function expMonth(d) { return d ? new Date(d + 'T00:00:00').getMonth() + 1 : null }

// ─── main page ────────────────────────────────────────────────────────────────

export default function Analytics() {
  const { role, user, villa: myVilla } = useAuth()

  const now = new Date()
  const [yearFilter, setYearFilter] = useState(String(now.getFullYear()))
  const [payments,   setPayments]   = useState([])
  const [expenses,   setExpenses]   = useState([])
  const [villas,     setVillas]     = useState([])
  const [monthlyDue, setMonthlyDue] = useState(0)

  const { loading, error: fetchError, retry } = usePageData(async () => {
    const [pRes, eRes, vRes, dRes] = await Promise.all([
      supabase.from('payments').select('villa_id, amount, mode, billing_month, billing_year'),
      supabase.from('expenses').select('amount, category, expense_date'),
      supabase.from('villas').select('id, villa_number, owner_name, phone, is_active').order('villa_number'),
      supabase.from('dues_config').select('monthly_amount').order('effective_from', { ascending: false }).limit(1),
    ])
    if (pRes.error) throw pRes.error
    if (eRes.error) throw eRes.error
    if (vRes.error) throw vRes.error
    if (dRes.error) throw dRes.error
    setPayments(pRes.data ?? [])
    setExpenses(eRes.data ?? [])
    setVillas((vRes.data ?? []).filter(x => x.is_active))
    setMonthlyDue(Number(dRes.data?.[0]?.monthly_amount ?? 0))
  }, [])

  if (loading) return <LoadingSkeleton />

  return (
    <div className="p-6 space-y-6">

      {/* Title + global year filter */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">Financial overview · all data from Supabase</p>
        </div>
        <div className="flex items-center gap-3">
          {role === 'board' && (
            <button
              onClick={() => exportReport(payments, expenses, villas, yearFilter)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium
                         text-gray-600 border border-gray-200 hover:border-gray-300
                         hover:bg-gray-50 rounded-lg transition"
            >
              <DownloadIcon className="w-4 h-4" />
              Export Report
            </button>
          )}
          <YearFilter value={yearFilter} onChange={setYearFilter} />
        </div>
      </div>

      {fetchError && <FetchError message={fetchError} onRetry={retry} />}

      {/* 1 — Summary cards */}
      <SummaryCards
        payments={payments} expenses={expenses}
        villas={villas}     yearFilter={yearFilter}
      />

      {/* 2 — Monthly income vs expenses */}
      <ChartSection
        title="Income vs Expenses"
        subtitle={yearFilter === 'all'
          ? 'Yearly totals — all time'
          : `Monthly breakdown — ${yearFilter}`}
      >
        <IncomeExpenseChart payments={payments} expenses={expenses} yearFilter={yearFilter} />
      </ChartSection>

      {/* 3 — Defaulters (board-only — residents see financial overview but not individual defaulter data) */}
      {role === 'board' && (
        <DefaultersSection
          payments={payments} villas={villas}
          monthlyDue={monthlyDue} user={user}
          onPaymentAdded={p => setPayments(prev => [...prev, p])}
        />
      )}

      {/* 4 — Expenses by category */}
      <ChartSection
        title="Expenses by Category"
        subtitle={yearFilter === 'all' ? 'All-time totals per category' : `Totals for ${yearFilter}`}
      >
        <ExpenseCatChart expenses={expenses} yearFilter={yearFilter} />
      </ChartSection>

      {/* 5 — Resident: My Payment Status (visible to all) */}
      {myVilla?.id && (
        <ResidentPaymentStatus
          payments={payments}
          myVillaId={myVilla.id}
          villaNumber={myVilla.villa_number}
          monthlyDue={monthlyDue}
          yearFilter={yearFilter}
        />
      )}

    </div>
  )
}

// ─── export report ───────────────────────────────────────────────────────────

function csvSafe(v) {
  const s = String(v ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

function exportReport(payments, expenses, villas, yearFilter) {
  const yr = yearFilter === 'all' ? null : Number(yearFilter)
  const filtP = yr ? payments.filter(p => p.billing_year === yr) : payments
  const filtE = yr ? expenses.filter(e => expYear(e.expense_date) === yr) : expenses

  // Build a villa_id → villa_number lookup
  const villaMap = {}
  villas.forEach(v => { villaMap[v.id] = v.villa_number })
  function villaNum(id) { return villaMap[id] ?? id }

  const totalIncome   = filtP.reduce((s, p) => s + Number(p.amount), 0)
  const totalExpense  = filtE.reduce((s, e) => s + Number(e.amount), 0)
  const netBalance    = totalIncome - totalExpense

  // Group expenses by category
  const expByCat = {}
  filtE.forEach(e => { expByCat[e.category] = (expByCat[e.category] ?? 0) + Number(e.amount) })

  // Group income by month
  const incByMonth = {}
  filtP.forEach(p => {
    const key = `${MONTH_SHORT[p.billing_month - 1]} ${p.billing_year}`
    incByMonth[key] = (incByMonth[key] ?? 0) + Number(p.amount)
  })

  const period = yr ? String(yr) : 'All Time'
  const csvLines = [
    `Ashirvadh Castle Rock - Financial Report (${period})`,
    `Generated: ${new Date().toLocaleDateString('en-IN')}`,
    '',
    'SUMMARY',
    `Total Income,${totalIncome}`,
    `Total Expenses,${totalExpense}`,
    `Net Balance,${netBalance}`,
    `Active Villas,${villas.length}`,
    `Villas Paid,${new Set(filtP.map(p => p.villa_id)).size}`,
    '',
    'INCOME BY MONTH',
    'Month,Amount',
    ...Object.entries(incByMonth).map(([k, v]) => `${csvSafe(k)},${v}`),
    '',
    'EXPENSES BY CATEGORY',
    'Category,Amount',
    ...Object.entries(expByCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${csvSafe(k)},${v}`),
    '',
    'PAYMENT DETAILS',
    'Villa,Amount,Mode,Month,Year',
    ...filtP.map(p => [villaNum(p.villa_id), p.amount, p.mode, MONTH_SHORT[p.billing_month - 1], p.billing_year].map(csvSafe).join(',')),
    '',
    'EXPENSE DETAILS',
    'Amount,Category,Date',
    ...filtE.map(e => [e.amount, e.category, e.expense_date].map(csvSafe).join(',')),
  ]

  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), {
    href: url,
    download: `ashirvadh_financial_report_${period.replace(/\s/g, '_')}.csv`,
  })
  a.click()
  URL.revokeObjectURL(url)
}

// ─── year filter ──────────────────────────────────────────────────────────────

function YearFilter({ value, onChange }) {
  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
      {[...YEARS, 'all'].map(y => (
        <button key={y} onClick={() => onChange(y)}
          className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
            value === y
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}>
          {y === 'all' ? 'All Time' : y}
        </button>
      ))}
    </div>
  )
}

// ─── 1. summary cards ─────────────────────────────────────────────────────────

function SummaryCards({ payments, expenses, villas, yearFilter }) {
  const filtP = yearFilter === 'all'
    ? payments
    : payments.filter(p => p.billing_year === Number(yearFilter))

  const filtE = yearFilter === 'all'
    ? expenses
    : expenses.filter(e => expYear(e.expense_date) === Number(yearFilter))

  const totalIncome   = filtP.reduce((s, p) => s + Number(p.amount), 0)
  const totalExpenses = filtE.reduce((s, e) => s + Number(e.amount), 0)
  const netBalance    = totalIncome - totalExpenses

  const paidCount      = new Set(filtP.map(p => p.villa_id)).size
  const collectionRate = villas.length > 0 ? Math.round((paidCount / villas.length) * 100) : 0

  const cards = [
    {
      label: 'Total Income',
      value: `₹${fmt(totalIncome)}`,
      sub:   yearFilter === 'all' ? 'All time' : yearFilter,
      bg: 'bg-green-50', border: 'border-green-100', num: 'text-green-700',
      icon: <TrendUpIcon className="w-5 h-5 text-green-600" />,
    },
    {
      label: 'Total Expenses',
      value: `₹${fmt(totalExpenses)}`,
      sub:   yearFilter === 'all' ? 'All time' : yearFilter,
      bg: 'bg-red-50', border: 'border-red-100', num: 'text-red-700',
      icon: <TrendDownIcon className="w-5 h-5 text-red-500" />,
    },
    {
      label: 'Net Balance',
      value: `₹${fmt(netBalance)}`,
      sub:   'Income − Expenses',
      bg: netBalance >= 0 ? 'bg-blue-50'    : 'bg-orange-50',
      border: netBalance >= 0 ? 'border-blue-100' : 'border-orange-100',
      num: netBalance >= 0 ? 'text-blue-700' : 'text-orange-700',
      icon: <ScaleIcon className="w-5 h-5 text-blue-500" />,
    },
    {
      label: 'Collection Rate',
      value: `${collectionRate}%`,
      sub:   `${paidCount} of ${villas.length} villas paid`,
      bg: 'bg-purple-50', border: 'border-purple-100', num: 'text-purple-700',
      icon: <ChartPieIcon className="w-5 h-5 text-purple-500" />,
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map(c => (
        <div key={c.label} className={`rounded-xl border ${c.bg} ${c.border} p-5`}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-600">{c.label}</p>
            <div className="w-9 h-9 rounded-lg bg-white/60 flex items-center justify-center">{c.icon}</div>
          </div>
          <p className={`text-2xl font-black leading-none ${c.num}`}>{c.value}</p>
          <p className="text-xs text-gray-500 mt-1.5">{c.sub}</p>
        </div>
      ))}
    </div>
  )
}

// ─── 2. income vs expenses chart ──────────────────────────────────────────────

function IncomeExpenseChart({ payments, expenses, yearFilter }) {
  const rows = useMemo(() => {
    if (yearFilter === 'all') {
      return YEARS.map(y => {
        const yr      = Number(y)
        const income  = payments.filter(p => p.billing_year === yr).reduce((s, p) => s + Number(p.amount), 0)
        const expense = expenses.filter(e => expYear(e.expense_date) === yr).reduce((s, e) => s + Number(e.amount), 0)
        return { label: y, income, expense }
      })
    }
    const yr = Number(yearFilter)
    return MONTH_SHORT.map((m, i) => {
      const month   = i + 1
      const income  = payments.filter(p => p.billing_year === yr && p.billing_month === month)
        .reduce((s, p) => s + Number(p.amount), 0)
      const expense = expenses.filter(e => expYear(e.expense_date) === yr && expMonth(e.expense_date) === month)
        .reduce((s, e) => s + Number(e.amount), 0)
      return { label: m, income, expense }
    })
  }, [payments, expenses, yearFilter])

  if (!rows.some(r => r.income > 0 || r.expense > 0)) return <EmptyChart />

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rows} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false}
          tickFormatter={v => v >= 1000 ? `₹${(v/1000).toFixed(0)}k` : `₹${v}`} />
        <Tooltip
          formatter={(v, name) => [`₹${fmt(v)}`, name === 'income' ? 'Income' : 'Expenses']}
          contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13 }} />
        <Legend formatter={n => n === 'income' ? 'Income' : 'Expenses'}
          wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
        <Bar dataKey="income"  fill="#22c55e" radius={[4,4,0,0]} />
        <Bar dataKey="expense" fill="#f87171" radius={[4,4,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── 3. defaulters ────────────────────────────────────────────────────────────

function DefaultersSection({ payments, villas, monthlyDue, user, onPaymentAdded }) {
  const _now = new Date()
  const currentYear  = _now.getFullYear()
  const currentMonth = _now.getMonth() + 1

  const [defMonth,    setDefMonth]    = useState(currentMonth)
  const [defYear,     setDefYear]     = useState(currentYear)
  const [search,      setSearch]      = useState('')
  const [quickPay,    setQuickPay]    = useState(null)
  const [successMsg,  setSuccessMsg]  = useState('')

  // How many months to count for "missed" — only from go-live onwards
  const firstTrackable = defYear === GO_LIVE_YEAR ? GO_LIVE_MONTH : (defYear > GO_LIVE_YEAR ? 1 : 13)
  const lastTrackable = defYear < currentYear ? 12 : defYear > currentYear ? 0 : currentMonth
  const monthsInYear = Math.max(0, lastTrackable - firstTrackable + 1)
  const preGoLive = isBeforeGoLive(defMonth, defYear)

  const paidIds = useMemo(() =>
    new Set(
      payments
        .filter(p => p.billing_month === defMonth && p.billing_year === defYear)
        .map(p => p.villa_id)
    ),
    [payments, defMonth, defYear]
  )

  const defaulters = useMemo(() => {
    if (preGoLive) return [] // no defaulters before go-live
    return villas
      .filter(v => !paidIds.has(v.id))
      .filter(v => !search || v.villa_number.toLowerCase().includes(search.toLowerCase()))
      .map(v => {
        const missed = Array.from({ length: 12 }, (_, i) => i + 1)
          .filter(m => !isBeforeGoLive(m, defYear)) // only count trackable months
          .filter(m => defYear < currentYear ? true : m <= currentMonth) // don't count future months
          .filter(m => !payments.some(p => p.villa_id === v.id && p.billing_month === m && p.billing_year === defYear))
          .length
        return { ...v, missed }
      })
      .sort((a, b) => b.missed - a.missed)
  }, [villas, paidIds, payments, defYear, monthsInYear, search, preGoLive, currentMonth]
  )

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">

      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Defaulters</h2>
          <p className="text-xs text-gray-500 mt-0.5">Villas that have not paid for the selected month</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={defMonth} onChange={e => setDefMonth(Number(e.target.value))} className={selectCls}>
            {MONTH_SHORT.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={defYear} onChange={e => setDefYear(Number(e.target.value))} className={selectCls}>
            {YEARS.map(y => <option key={y} value={Number(y)}>{y}</option>)}
          </select>
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input type="text" placeholder="Villa no." value={search}
              onChange={e => setSearch(e.target.value)}
              className={selectCls + ' pl-8 w-28'} />
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap gap-6 mb-5 px-4 py-3 bg-gray-50 rounded-lg">
        <Stat label="Defaulters" value={String(defaulters.length)} color="text-red-600" />
        <div className="w-px bg-gray-200 self-stretch" />
        <Stat label="Outstanding"
          value={monthlyDue > 0 ? `₹${fmt(defaulters.length * monthlyDue)}` : '—'}
          color="text-orange-600" />
        <div className="w-px bg-gray-200 self-stretch" />
        <Stat label="Monthly Due"
          value={monthlyDue > 0 ? `₹${fmt(monthlyDue)}` : 'Not set'}
          color="text-gray-700" />
      </div>

      {/* Table or empty */}
      {preGoLive ? (
        <div className="py-10 text-center">
          <p className="text-gray-400 font-medium">
            Tracking starts from May 2026. No data for {MONTH_SHORT[defMonth - 1]} {defYear}.
          </p>
        </div>
      ) : defaulters.length === 0 ? (
        <div className="py-10 text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
            <CheckCircleIcon className="w-6 h-6 text-green-600" />
          </div>
          <p className="text-gray-500 font-medium">
            All villas have paid for {MONTH_SHORT[defMonth - 1]} {defYear}!
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <Th>Villa</Th>
                <Th>Owner</Th>
                <Th>Phone</Th>
                <Th align="center">Months Missed ({defYear})</Th>
                <Th align="right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {defaulters.map((v, i) => (
                <tr key={v.id}
                  className={`border-b border-gray-50 hover:bg-gray-50/60 transition-colors ${i % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
                  <td className="py-3 px-3 font-semibold text-gray-900">Villa {v.villa_number}</td>
                  <td className="py-3 px-3 text-gray-700">{v.owner_name ?? '—'}</td>
                  <td className="py-3 px-3">
                    {v.phone
                      ? <a href={`tel:${v.phone}`} className="text-green-700 hover:underline">{v.phone}</a>
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className={`inline-block px-2.5 py-1 text-xs font-bold rounded-full ${
                      v.missed >= 4 ? 'bg-red-100 text-red-700'
                      : v.missed >= 2 ? 'bg-orange-100 text-orange-700'
                      : 'bg-yellow-100 text-yellow-700'
                    }`}>{v.missed} / {monthsInYear}</span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button onClick={() => setQuickPay(v)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-green-600
                                 hover:bg-green-700 rounded-lg transition">
                      + Add Payment
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {quickPay && (
        <QuickPayModal
          villa={quickPay}
          billingMonth={defMonth}
          billingYear={defYear}
          monthlyDue={monthlyDue}
          user={user}
          onSaved={p => {
            const villaNum = quickPay.villa_number
            setQuickPay(null)
            onPaymentAdded(p)
            setSuccessMsg(`Payment recorded for Villa ${villaNum}`)
            setTimeout(() => setSuccessMsg(''), 3500)
          }}
          onClose={() => setQuickPay(null)}
        />
      )}

      {/* Success toast */}
      {successMsg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2
                        px-5 py-3 bg-green-600 text-white text-sm font-medium
                        rounded-xl shadow-lg">
          <CheckCircleIcon className="w-4 h-4 shrink-0" />
          {successMsg}
        </div>
      )}
    </div>
  )
}

// ─── quick pay modal ──────────────────────────────────────────────────────────

function QuickPayModal({ villa, billingMonth, billingYear, monthlyDue, user, onSaved, onClose }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    amount:  String(monthlyDue || ''),
    mode:    'UPI',
    paid_on: today,
    remarks: '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload = {
        villa_id:      villa.id,
        amount:        Number(form.amount),
        mode:          form.mode,
        billing_month: billingMonth,
        billing_year:  billingYear,
        paid_on:       form.paid_on,
        remarks:       form.remarks.trim() || null,
        recorded_by:   user?.email ?? null,
      }
      const { error: err } = await supabase.from('payments').insert(payload)
      if (err) throw err
      // Pass back just the fields Analytics needs so paidIds updates immediately
      onSaved({ villa_id: villa.id, amount: payload.amount, mode: payload.mode,
                billing_month: billingMonth, billing_year: billingYear })
    } catch (err) {
      setError(err.message ?? 'Failed to record payment.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Record Payment</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Villa {villa.villa_number}
              {villa.owner_name ? ` · ${villa.owner_name}` : ''}
            </p>
            <p className="text-xs text-gray-400">
              {MONTH_SHORT[billingMonth - 1]} {billingYear}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount (₹)" required>
              <input type="number" required min="0" step="0.01"
                value={form.amount} onChange={e => set('amount', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Mode">
              <select value={form.mode} onChange={e => set('mode', e.target.value)} className={inputCls}>
                {MODES.map(m => <option key={m}>{m}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Paid On" required>
            <input type="date" required value={form.paid_on}
              onChange={e => set('paid_on', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Remarks">
            <input type="text" value={form.remarks}
              onChange={e => set('remarks', e.target.value)}
              placeholder="Optional note" className={inputCls} />
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200
                         hover:border-gray-300 rounded-lg transition">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700
                         disabled:bg-green-400 text-white text-sm font-semibold rounded-lg transition">
              {saving && <Spinner />}{saving ? 'Saving…' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── 4. expenses by category chart ───────────────────────────────────────────

function ExpenseCatChart({ expenses, yearFilter }) {
  const rows = useMemo(() => {
    const filt = yearFilter === 'all'
      ? expenses
      : expenses.filter(e => expYear(e.expense_date) === Number(yearFilter))
    const map = {}
    filt.forEach(e => { map[e.category] = (map[e.category] ?? 0) + Number(e.amount) })
    return Object.entries(map).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total)
  }, [expenses, yearFilter])

  if (!rows.length) return <EmptyChart />

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 44)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false}
          tickFormatter={v => v >= 1000 ? `₹${(v/1000).toFixed(0)}k` : `₹${v}`} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }}
          axisLine={false} tickLine={false} width={100} />
        <Tooltip formatter={v => [`₹${fmt(v)}`, 'Total']}
          contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13 }} />
        <Bar dataKey="total" radius={[0,4,4,0]}>
          {rows.map(r => <Cell key={r.name} fill={EXPENSE_CAT_COLORS[r.name] ?? '#9ca3af'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── 5. resident payment status ──────────────────────────────────────────────

// Go-live: May 2026 — no tracking before this
const GO_LIVE_YEAR = 2026
const GO_LIVE_MONTH = 5

function isBeforeGoLive(month, year) {
  return year < GO_LIVE_YEAR || (year === GO_LIVE_YEAR && month < GO_LIVE_MONTH)
}

function ResidentPaymentStatus({ payments, myVillaId, villaNumber, monthlyDue, yearFilter }) {
  const yr = yearFilter === 'all' ? new Date().getFullYear() : Number(yearFilter)
  const currentMonth = new Date().getMonth() + 1
  const currentYear = new Date().getFullYear()

  const myPayments = useMemo(() =>
    payments.filter(p => p.villa_id === myVillaId && p.billing_year === yr),
    [payments, myVillaId, yr]
  )

  const paidMonths = useMemo(() =>
    new Set(myPayments.map(p => p.billing_month)),
    [myPayments]
  )

  // Only count months from go-live onwards
  const firstTrackableMonth = yr === GO_LIVE_YEAR ? GO_LIVE_MONTH : (yr > GO_LIVE_YEAR ? 1 : 13)
  const lastTrackableMonth = yr < currentYear ? 12 : yr > currentYear ? 0 : currentMonth
  const monthsToShow = Math.max(0, lastTrackableMonth - firstTrackableMonth + 1)

  const totalPaid = myPayments.reduce((s, p) => s + Number(p.amount), 0)
  const totalDue  = monthlyDue * monthsToShow
  const outstanding = Math.max(0, totalDue - totalPaid)

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900">My Payment Status</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Villa {villaNumber} · {yr}
          </p>
        </div>
        <div className="flex gap-6">
          <div className="text-right">
            <p className="text-xs text-gray-400">Paid</p>
            <p className="text-lg font-bold text-green-700">₹{fmt(totalPaid)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Outstanding</p>
            <p className={`text-lg font-bold ${outstanding > 0 ? 'text-red-600' : 'text-green-700'}`}>
              ₹{fmt(outstanding)}
            </p>
          </div>
        </div>
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-2">
        {MONTH_SHORT.map((m, i) => {
          const monthNum = i + 1
          const paid = paidMonths.has(monthNum)
          const isFuture = yr === currentYear && monthNum > currentMonth
          const isCurrent = yr === currentYear && monthNum === currentMonth
          const notTracked = isBeforeGoLive(monthNum, yr) || (yr > currentYear)
          const payment = myPayments.find(p => p.billing_month === monthNum)

          return (
            <div
              key={m}
              className={`rounded-lg p-2.5 text-center border transition-all
                ${notTracked || isFuture ? 'bg-gray-50 border-gray-100 opacity-50' :
                  paid ? 'bg-green-50 border-green-200' :
                  isCurrent ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-300' :
                  'bg-red-50 border-red-200'}`}
            >
              <p className={`text-xs font-semibold ${
                notTracked || isFuture ? 'text-gray-400' :
                paid ? 'text-green-700' : 'text-red-600'}`}>
                {m}
              </p>
              {notTracked || isFuture ? (
                <span className="text-[10px] text-gray-400">—</span>
              ) : paid ? (
                <CheckMiniIcon className="w-4 h-4 text-green-500 mx-auto mt-1" />
              ) : (
                <XMiniIcon className="w-4 h-4 text-red-400 mx-auto mt-1" />
              )}
              {paid && payment && (
                <p className="text-[10px] text-green-600 font-medium mt-0.5">
                  ₹{fmt(payment.amount)}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {monthlyDue > 0 && (
        <p className="text-xs text-gray-400 mt-3">
          Monthly due: ₹{fmt(monthlyDue)} · {paidMonths.size} of {monthsToShow} months paid
        </p>
      )}
    </div>
  )
}

function CheckMiniIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
}
function XMiniIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
}

// ─── layout helpers ───────────────────────────────────────────────────────────

function ChartSection({ title, subtitle, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function EmptyChart() {
  return <div className="h-40 flex items-center justify-center text-sm text-gray-400">No data yet.</div>
}

function LoadingSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="flex justify-between">
        <div className="h-6 w-32 bg-gray-100 rounded" />
        <div className="h-9 w-64 bg-gray-100 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-28 bg-gray-100 rounded-xl" />)}
      </div>
      <div className="h-72 bg-gray-100 rounded-xl" />
      <div className="h-64 bg-gray-100 rounded-xl" />
      <div className="h-48 bg-gray-100 rounded-xl" />
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  )
}

function Th({ children, align = 'left' }) {
  return (
    <th className={`py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-${align}`}>
      {children}
    </th>
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

function Spinner() {
  return <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
}

// ─── style constants ──────────────────────────────────────────────────────────

const selectCls = `px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white
  focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition`

const inputCls = `w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
  focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition`

// ─── icons ────────────────────────────────────────────────────────────────────

function TrendUpIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
}
function TrendDownIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" /></svg>
}
function ScaleIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>
}
function ChartPieIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>
}
function CheckCircleIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
}
function XIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
}
function DownloadIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
}
function SearchIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
}
