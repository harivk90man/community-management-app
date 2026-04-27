import { useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { usePageData } from '../hooks/usePageData'
import FetchError from '../components/FetchError'

// ─── constants ────────────────────────────────────────────────────────────────

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const TABS = [
  { id: 'balance',    label: 'Balance Sheet' },
  { id: 'income-exp', label: 'Income & Expenditure' },
  { id: 'monthly',    label: 'Monthly Collection' },
  { id: 'receipts',   label: 'Receipt Summary' },
  { id: 'member',     label: 'Member Statement' },
]

const GO_LIVE_YEAR = 2026
const GO_LIVE_MONTH = 5 // May 2026 — no dues tracking before this

function isBeforeGoLive(month, year) {
  return year < GO_LIVE_YEAR || (year === GO_LIVE_YEAR && month < GO_LIVE_MONTH)
}

function getTrackableMonths(year) {
  const curYear = new Date().getFullYear()
  const curMonth = new Date().getMonth() + 1
  const firstMonth = year === GO_LIVE_YEAR ? GO_LIVE_MONTH : (year > GO_LIVE_YEAR ? 1 : 13)
  const lastMonth = year < curYear ? 12 : (year > curYear ? 0 : curMonth)
  return Math.max(0, lastMonth - firstMonth + 1)
}

function getFirstTrackableMonth(year) {
  return year === GO_LIVE_YEAR ? GO_LIVE_MONTH : (year > GO_LIVE_YEAR ? 1 : 13)
}

function fmt(n) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n ?? 0)
}
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function Reports() {
  const { role, villa: myVilla } = useAuth()
  const now = new Date()

  const [tab, setTab]           = useState('balance')
  const [yearFilter, setYear]   = useState(now.getFullYear())
  const [villaFilter, setVilla] = useState(myVilla?.id ?? '')

  const [payments,   setPayments]   = useState([])
  const [expenses,   setExpenses]   = useState([])
  const [villas,     setVillas]     = useState([])
  const [assocConfig, setAssocConfig] = useState({ opening_balance: 0, due_day: 10 })
  const [monthlyDue, setMonthlyDue] = useState(0)

  const { loading, error: fetchError, retry } = usePageData(async () => {
    const [pRes, eRes, vRes, aRes, dRes] = await Promise.all([
      supabase.from('payments').select('villa_id, amount, mode, billing_month, billing_year, paid_on, remarks, recorded_by, villas(villa_number, owner_name)')
        .eq('status', 'approved').order('paid_on', { ascending: false }),
      supabase.from('expenses').select('title, amount, category, expense_date, added_by')
        .order('expense_date', { ascending: false }),
      supabase.from('villas').select('id, villa_number, owner_name, is_active')
        .order('villa_number'),
      supabase.from('association_config').select('opening_balance, due_day').limit(1).single(),
      supabase.from('dues_config').select('monthly_amount').order('effective_from', { ascending: false }).limit(1),
    ])
    if (pRes.error) throw pRes.error
    if (eRes.error) throw eRes.error
    setPayments(pRes.data ?? [])
    setExpenses(eRes.data ?? [])
    setVillas((vRes.data ?? []).sort((a, b) =>
      a.villa_number.localeCompare(b.villa_number, undefined, { numeric: true })
    ))
    if (aRes.data) setAssocConfig(aRes.data)
    if (dRes.data?.[0]) setMonthlyDue(Number(dRes.data[0].monthly_amount) || 0)
  }, [])

  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  if (loading) return <LoadingSkeleton />

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">Financial reports & statements</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={yearFilter} onChange={e => setYear(Number(e.target.value))} className={selectCls}>
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {fetchError && <FetchError message={fetchError} onRetry={retry} />}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
              tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'balance' && (
        <BalanceSheet payments={payments} expenses={expenses} villas={villas}
          assocConfig={assocConfig} monthlyDue={monthlyDue} year={yearFilter} />
      )}
      {tab === 'income-exp' && (
        <IncomeExpenditure payments={payments} expenses={expenses} year={yearFilter} />
      )}
      {tab === 'monthly' && (
        <MonthlyCollection payments={payments} expenses={expenses} year={yearFilter} />
      )}
      {tab === 'receipts' && (
        <ReceiptSummary payments={payments} villas={villas} year={yearFilter} />
      )}
      {tab === 'member' && (
        <MemberStatement payments={payments} villas={villas} monthlyDue={monthlyDue}
          year={yearFilter} villaFilter={villaFilter} setVillaFilter={setVilla}
          role={role} myVillaId={myVilla?.id} />
      )}
    </div>
  )
}

// ─── 1. Balance Sheet ─────────────────────────────────────────────────────────

function BalanceSheet({ payments, expenses, villas, assocConfig, monthlyDue, year }) {
  const opening = Number(assocConfig.opening_balance ?? 0)

  const yearPayments = payments.filter(p => p.billing_year === year)
  const yearExpenses = expenses.filter(e => e.expense_date && new Date(e.expense_date + 'T00:00:00').getFullYear() === year)

  const totalIncome  = yearPayments.reduce((s, p) => s + Number(p.amount), 0)
  const totalExpense = yearExpenses.reduce((s, e) => s + Number(e.amount), 0)

  const activeVillas = villas.filter(v => v.is_active).length
  const curMonth     = new Date().getMonth() + 1
  const trackableMonths = getTrackableMonths(year)
  const expectedIncome = monthlyDue * activeVillas * trackableMonths
  // Count unpaid: only villas that haven't paid in any trackable month
  const firstTrackable = getFirstTrackableMonth(year)
  const paidVillaIds = new Set(yearPayments.filter(p => p.billing_month >= firstTrackable).map(p => p.villa_id))
  const unpaidVillas = trackableMonths > 0 ? activeVillas - paidVillaIds.size : 0
  const receivables    = Math.max(0, expectedIncome - totalIncome)

  const closingBalance = opening + totalIncome - totalExpense

  return (
    <div className="space-y-6">
      <ReportHeader title="Balance Sheet" subtitle={`As of ${MONTHS[curMonth - 1]} ${year}`} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Assets / Income */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="bg-green-50 px-5 py-3 border-b border-green-100">
            <h3 className="text-sm font-bold text-green-800">Income & Assets</h3>
          </div>
          <div className="divide-y divide-gray-50">
            <Row label="Opening Balance" value={opening} />
            <Row label="Maintenance Collections" value={totalIncome} bold />
            <Row label={`Receivables (${unpaidVillas} unpaid villas × ${trackableMonths} mo)`} value={receivables} muted />
            <Row label="Total Assets" value={opening + totalIncome + receivables} bold highlight="green" />
          </div>
        </div>

        {/* Liabilities / Expenses */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="bg-red-50 px-5 py-3 border-b border-red-100">
            <h3 className="text-sm font-bold text-red-800">Expenditure & Liabilities</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {Object.entries(yearExpenses.reduce((acc, e) => {
              acc[e.category || 'Other'] = (acc[e.category || 'Other'] || 0) + Number(e.amount)
              return acc
            }, {})).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
              <Row key={cat} label={cat} value={amt} />
            ))}
            <Row label="Total Expenses" value={totalExpense} bold highlight="red" />
          </div>
        </div>
      </div>

      {/* Net */}
      <div className={`rounded-xl p-5 text-center ${closingBalance >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
        <p className="text-sm text-gray-500 font-medium">Closing Fund Balance</p>
        <p className={`text-3xl font-black mt-1 ${closingBalance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
          ₹{fmt(closingBalance)}
        </p>
        <p className="text-xs text-gray-400 mt-1">Opening ₹{fmt(opening)} + Income ₹{fmt(totalIncome)} − Expenses ₹{fmt(totalExpense)}</p>
      </div>
    </div>
  )
}

// ─── 2. Income & Expenditure ──────────────────────────────────────────────────

function IncomeExpenditure({ payments, expenses, year }) {
  const yearPayments = payments.filter(p => p.billing_year === year)
  const yearExpenses = expenses.filter(e => e.expense_date && new Date(e.expense_date + 'T00:00:00').getFullYear() === year)

  // Income by mode
  const incomeByMode = {}
  yearPayments.forEach(p => { incomeByMode[p.mode] = (incomeByMode[p.mode] || 0) + Number(p.amount) })
  const totalIncome = yearPayments.reduce((s, p) => s + Number(p.amount), 0)

  // Expense by category
  const expByCat = {}
  yearExpenses.forEach(e => { expByCat[e.category || 'Other'] = (expByCat[e.category || 'Other'] || 0) + Number(e.amount) })
  const totalExpense = yearExpenses.reduce((s, e) => s + Number(e.amount), 0)

  return (
    <div className="space-y-6">
      <ReportHeader title="Income & Expenditure Statement" subtitle={`For the year ${year}`} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Income */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="bg-green-50 px-5 py-3 border-b border-green-100">
            <h3 className="text-sm font-bold text-green-800">Income</h3>
          </div>
          <div className="divide-y divide-gray-50">
            <Row label="Maintenance Dues" value={totalIncome} />
            <div className="px-5 py-2">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">By Payment Mode</p>
            </div>
            {Object.entries(incomeByMode).sort((a, b) => b[1] - a[1]).map(([mode, amt]) => (
              <Row key={mode} label={`  ${mode}`} value={amt} muted />
            ))}
            <Row label="Total Income" value={totalIncome} bold highlight="green" />
          </div>
        </div>

        {/* Expenditure */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="bg-red-50 px-5 py-3 border-b border-red-100">
            <h3 className="text-sm font-bold text-red-800">Expenditure</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {Object.entries(expByCat).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
              <Row key={cat} label={cat} value={amt} />
            ))}
            {Object.keys(expByCat).length === 0 && (
              <div className="px-5 py-4 text-sm text-gray-400 text-center">No expenses recorded</div>
            )}
            <Row label="Total Expenditure" value={totalExpense} bold highlight="red" />
          </div>
        </div>
      </div>

      {/* Surplus / Deficit */}
      <div className={`rounded-xl p-5 text-center ${totalIncome >= totalExpense ? 'bg-blue-50 border border-blue-200' : 'bg-orange-50 border border-orange-200'}`}>
        <p className="text-sm text-gray-500 font-medium">{totalIncome >= totalExpense ? 'Surplus' : 'Deficit'}</p>
        <p className={`text-3xl font-black mt-1 ${totalIncome >= totalExpense ? 'text-blue-700' : 'text-orange-700'}`}>
          ₹{fmt(Math.abs(totalIncome - totalExpense))}
        </p>
      </div>
    </div>
  )
}

// ─── 3. Monthly Collection & Expense ──────────────────────────────────────────

function MonthlyCollection({ payments, expenses, year }) {
  const rows = useMemo(() => {
    return MONTHS.map((m, i) => {
      const month = i + 1
      const mp = payments.filter(p => p.billing_year === year && p.billing_month === month)
      const me = expenses.filter(e => {
        if (!e.expense_date) return false
        const d = new Date(e.expense_date + 'T00:00:00')
        return d.getFullYear() === year && d.getMonth() + 1 === month
      })
      return {
        month: m,
        collected: mp.reduce((s, p) => s + Number(p.amount), 0),
        villasPaid: new Set(mp.map(p => p.villa_id)).size,
        expenseTotal: me.reduce((s, e) => s + Number(e.amount), 0),
        net: mp.reduce((s, p) => s + Number(p.amount), 0) - me.reduce((s, e) => s + Number(e.amount), 0),
      }
    })
  }, [payments, expenses, year])

  const grandCollected = rows.reduce((s, r) => s + r.collected, 0)
  const grandExpense   = rows.reduce((s, r) => s + r.expenseTotal, 0)

  return (
    <div className="space-y-6">
      <ReportHeader title="Monthly Collection & Expense" subtitle={`Year ${year}`} />

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <Th>Month</Th><Th align="right">Collected</Th><Th align="right">Villas Paid</Th>
                <Th align="right">Expenses</Th><Th align="right">Net</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(r => (
                <tr key={r.month} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.month}</td>
                  <td className="px-4 py-3 text-right text-green-700 font-semibold">₹{fmt(r.collected)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{r.villasPaid}</td>
                  <td className="px-4 py-3 text-right text-red-600">₹{fmt(r.expenseTotal)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${r.net >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                    ₹{fmt(r.net)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                <td className="px-4 py-3 text-gray-900">Total</td>
                <td className="px-4 py-3 text-right text-green-700">₹{fmt(grandCollected)}</td>
                <td className="px-4 py-3 text-right text-gray-600">—</td>
                <td className="px-4 py-3 text-right text-red-600">₹{fmt(grandExpense)}</td>
                <td className={`px-4 py-3 text-right ${grandCollected - grandExpense >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                  ₹{fmt(grandCollected - grandExpense)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── 4. Receipt Summary ───────────────────────────────────────────────────────

function ReceiptSummary({ payments, villas, year }) {
  const yearPayments = payments.filter(p => p.billing_year === year)

  const villaMap = {}
  villas.forEach(v => { villaMap[v.id] = v })

  // Group by villa
  const grouped = {}
  yearPayments.forEach(p => {
    if (!grouped[p.villa_id]) grouped[p.villa_id] = []
    grouped[p.villa_id].push(p)
  })

  const sortedEntries = Object.entries(grouped).sort((a, b) => {
    const va = villaMap[a[0]]?.villa_number ?? ''
    const vb = villaMap[b[0]]?.villa_number ?? ''
    return va.localeCompare(vb, undefined, { numeric: true })
  })

  return (
    <div className="space-y-6">
      <ReportHeader title="Receipt Summary" subtitle={`All approved payments for ${year}`} />

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <Th>Villa</Th><Th>Owner</Th><Th>Month</Th><Th align="right">Amount</Th>
                <Th>Mode</Th><Th>Paid On</Th><Th>Recorded By</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sortedEntries.map(([villaId, pmts]) => {
                const v = villaMap[villaId]
                return pmts.map((p, i) => (
                  <tr key={`${villaId}-${p.billing_month}-${i}`} className="hover:bg-gray-50 transition-colors">
                    {i === 0 && (
                      <>
                        <td className="px-4 py-3 font-bold text-gray-900" rowSpan={pmts.length}>
                          {v?.villa_number ?? '?'}
                        </td>
                        <td className="px-4 py-3 text-gray-700" rowSpan={pmts.length}>
                          {v?.owner_name ?? '—'}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3 text-gray-600">{MONTH_SHORT[p.billing_month - 1]}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">₹{fmt(p.amount)}</td>
                    <td className="px-4 py-3 text-gray-600">{p.mode}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(p.paid_on)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{p.recorded_by ?? '—'}</td>
                  </tr>
                ))
              })}
              {sortedEntries.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No payments found for {year}</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                <td className="px-4 py-3 text-gray-900" colSpan={3}>Total ({yearPayments.length} receipts)</td>
                <td className="px-4 py-3 text-right text-green-700">
                  ₹{fmt(yearPayments.reduce((s, p) => s + Number(p.amount), 0))}
                </td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── 5. Member Statement ──────────────────────────────────────────────────────

function MemberStatement({ payments, villas, monthlyDue, year, villaFilter, setVillaFilter, role, myVillaId }) {
  // Residents can only see their own villa
  const effectiveVilla = role === 'board' ? villaFilter : (myVillaId ?? '')

  const villa = villas.find(v => v.id === effectiveVilla)
  const villaPayments = payments
    .filter(p => p.villa_id === effectiveVilla && p.billing_year === year)
    .sort((a, b) => a.billing_month - b.billing_month)

  const totalPaid = villaPayments.reduce((s, p) => s + Number(p.amount), 0)
  const curMonth = new Date().getFullYear() === year ? new Date().getMonth() + 1 : 12
  const trackableMonths = getTrackableMonths(year)
  const firstTrackable = getFirstTrackableMonth(year)
  const totalDue = monthlyDue * trackableMonths
  const outstanding = Math.max(0, totalDue - totalPaid)
  const paidMonths = new Set(villaPayments.map(p => p.billing_month))

  return (
    <div className="space-y-6">
      <ReportHeader title="Member Statement" subtitle={villa ? `Villa ${villa.villa_number} — ${villa.owner_name}` : 'Select a villa'} />

      {/* Villa selector (board only) */}
      {role === 'board' && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">Villa:</label>
          <select value={effectiveVilla} onChange={e => setVillaFilter(e.target.value)} className={selectCls + ' min-w-[200px]'}>
            <option value="">Select a villa…</option>
            {villas.map(v => <option key={v.id} value={v.id}>{v.villa_number} — {v.owner_name}</option>)}
          </select>
        </div>
      )}

      {!effectiveVilla ? (
        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
          <p className="text-gray-400">Select a villa to view their statement</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MiniCard label="Total Paid" value={`₹${fmt(totalPaid)}`} color="green" />
            <MiniCard label="Total Due" value={`₹${fmt(totalDue)}`} color="blue" />
            <MiniCard label="Outstanding" value={`₹${fmt(outstanding)}`}
              color={outstanding > 0 ? 'red' : 'green'} />
          </div>

          {/* Month-by-month grid */}
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-2">
            {MONTH_SHORT.map((m, i) => {
              const month = i + 1
              const paid = paidMonths.has(month)
              const isFuture = year === new Date().getFullYear() && month > curMonth
              const notTracked = isBeforeGoLive(month, year) || (year > new Date().getFullYear())
              const payment = villaPayments.find(p => p.billing_month === month)
              return (
                <div key={m} className={`rounded-lg p-2.5 text-center border ${
                  notTracked || isFuture ? 'bg-gray-50 border-gray-100 opacity-50' :
                  paid ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                }`}>
                  <p className={`text-xs font-semibold ${
                    notTracked || isFuture ? 'text-gray-400' : paid ? 'text-green-700' : 'text-red-600'}`}>{m}</p>
                  {notTracked || isFuture ? (
                    <span className="text-[10px] text-gray-400">—</span>
                  ) : paid && payment ? (
                    <p className="text-[10px] text-green-600 font-medium mt-0.5">₹{fmt(payment.amount)}</p>
                  ) : (
                    <p className="text-[10px] text-red-400 font-medium mt-0.5">Unpaid</p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Payment detail table */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <Th>Month</Th><Th align="right">Due</Th><Th align="right">Paid</Th>
                    <Th>Mode</Th><Th>Paid On</Th><Th>Remarks</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {Array.from({ length: curMonth }, (_, i) => i + 1)
                    .filter(month => !isBeforeGoLive(month, year))
                    .map(month => {
                    const p = villaPayments.find(x => x.billing_month === month)
                    return (
                      <tr key={month} className={`hover:bg-gray-50 transition-colors ${!p ? 'bg-red-50/30' : ''}`}>
                        <td className="px-4 py-3 font-medium text-gray-900">{MONTHS[month - 1]}</td>
                        <td className="px-4 py-3 text-right text-gray-600">₹{fmt(monthlyDue)}</td>
                        <td className={`px-4 py-3 text-right font-semibold ${p ? 'text-green-700' : 'text-red-500'}`}>
                          {p ? `₹${fmt(p.amount)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{p?.mode ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{p ? fmtDate(p.paid_on) : '—'}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{p?.remarks ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                    <td className="px-4 py-3 text-gray-900">Total</td>
                    <td className="px-4 py-3 text-right text-gray-600">₹{fmt(totalDue)}</td>
                    <td className="px-4 py-3 text-right text-green-700">₹{fmt(totalPaid)}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── shared components ────────────────────────────────────────────────────────

function ReportHeader({ title, subtitle }) {
  return (
    <div className="mb-2">
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  )
}

function Row({ label, value, bold, muted, highlight }) {
  const valColor = highlight === 'green' ? 'text-green-700' : highlight === 'red' ? 'text-red-700' : 'text-gray-900'
  return (
    <div className={`flex items-center justify-between px-5 py-3 ${bold ? 'bg-gray-50' : ''}`}>
      <span className={`text-sm ${muted ? 'text-gray-400 pl-3' : bold ? 'font-bold text-gray-900' : 'text-gray-700'}`}>{label}</span>
      <span className={`text-sm font-semibold ${bold ? `font-bold ${valColor}` : valColor}`}>₹{fmt(value)}</span>
    </div>
  )
}

function MiniCard({ label, value, color }) {
  const colors = {
    green: 'bg-green-50 border-green-200 text-green-700',
    blue:  'bg-blue-50 border-blue-200 text-blue-700',
    red:   'bg-red-50 border-red-200 text-red-700',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color] ?? colors.green}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="text-xl font-black mt-1">{value}</p>
    </div>
  )
}

function Th({ children, align = 'left' }) {
  return (
    <th className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-${align} whitespace-nowrap`}>
      {children}
    </th>
  )
}

function LoadingSkeleton() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-pulse">
      <div className="h-7 w-32 bg-gray-100 rounded" />
      <div className="h-10 bg-gray-100 rounded-xl" />
      <div className="grid grid-cols-2 gap-6">
        <div className="h-64 bg-gray-100 rounded-xl" />
        <div className="h-64 bg-gray-100 rounded-xl" />
      </div>
      <div className="h-20 bg-gray-100 rounded-xl" />
    </div>
  )
}

// ─── style constants ──────────────────────────────────────────────────────────

const selectCls = `px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white
  focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition`
