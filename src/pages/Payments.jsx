import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { usePageData } from '../hooks/usePageData'
import FetchError from '../components/FetchError'

// ─── constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque']

const MODE_STYLE = {
  'UPI':           'bg-green-100 text-green-700',
  'Bank Transfer': 'bg-blue-100  text-blue-700',
  'Cash':          'bg-orange-100 text-orange-700',
  'Cheque':        'bg-purple-100 text-purple-700',
}

const now      = new Date()
const CUR_MONTH = now.getMonth() + 1
const CUR_YEAR  = now.getFullYear()

const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CUR_YEAR - i)

const EMPTY_FORM = {
  villa_id:      '',
  amount:        '',
  mode:          'UPI',
  billing_month: CUR_MONTH,
  billing_year:  CUR_YEAR,
  paid_on:       new Date().toISOString().slice(0, 10),
  remarks:       '',
  recorded_by:   '',
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)
}

function csvEscape(v) {
  const s = String(v ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

function exportCSV(rows) {
  const headers = ['Villa','Owner','Amount','Mode','Month','Year','Paid On','Remarks','Recorded By']
  const lines = [
    headers.join(','),
    ...rows.map(r => [
      r.villas?.villa_number,
      r.villas?.owner_name,
      r.amount,
      r.mode,
      MONTHS[r.billing_month - 1],
      r.billing_year,
      r.paid_on,
      r.remarks,
      r.recorded_by,
    ].map(csvEscape).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), {
    href: url, download: `payments_${CUR_YEAR}_${CUR_MONTH}.csv`,
  })
  a.click()
  URL.revokeObjectURL(url)
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function Payments() {
  const { villa: myVilla, villaUser, role, user } = useAuth()
  if (role === 'board') return <BoardView user={user} myVilla={myVilla} />
  return <ResidentView myVilla={myVilla} />
}

// ─── board view ───────────────────────────────────────────────────────────────

function BoardView({ user, myVilla }) {
  const [payments, setPayments]   = useState([])
  const [villas, setVillas]       = useState([])
  const [page, setPage]           = useState(1)
  const [showForm, setShowForm]   = useState(false)
  const [editing, setEditing]     = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null) // payment row to delete
  const [paying, setPaying]       = useState(false)
  const [payMsg, setPayMsg]       = useState({ type: '', text: '' })
  const [dueDay, setDueDay]       = useState(10)

  // filters
  const [filterVilla, setFilterVilla] = useState('')
  const [filterMonth, setFilterMonth] = useState(CUR_MONTH)
  const [filterYear,  setFilterYear]  = useState(CUR_YEAR)

  // summary data (for current filter month/year)
  const [summary, setSummary] = useState({ collected: 0, paidCount: 0, totalVillas: 0 })

  const { loading, error: fetchError, retry } = usePageData(async () => {
    const [paymentsRes, villasRes, assocRes] = await Promise.all([
      supabase
        .from('payments')
        .select('*, villas(villa_number, owner_name)')
        .order('paid_on', { ascending: false }),
      supabase
        .from('villas')
        .select('id, villa_number, owner_name')
        .eq('is_active', true)
        .order('villa_number'),
      supabase
        .from('association_config')
        .select('due_day')
        .limit(1)
        .single(),
    ])
    if (paymentsRes.error) throw paymentsRes.error
    if (villasRes.error) throw villasRes.error
    setPayments(paymentsRes.data ?? [])
    setVillas(villasRes.data ?? [])
    if (assocRes.data) setDueDay(assocRes.data.due_day ?? 10)
  }, [])

  // recompute summary whenever payments/filter month-year changes
  useEffect(() => {
    const monthPayments = payments.filter(
      p => p.billing_month === filterMonth && p.billing_year === filterYear
    )
    const collected  = monthPayments.reduce((s, p) => s + Number(p.amount), 0)
    const paidVillas = new Set(monthPayments.map(p => p.villa_id))
    setSummary({ collected, paidCount: paidVillas.size, totalVillas: villas.length })
  }, [payments, filterMonth, filterYear, villas.length])

  // filtered + paginated slice
  const filtered = payments.filter(p => {
    const matchVilla = filterVilla
      ? p.villa_id === filterVilla
      : true
    const matchMonth = p.billing_month === filterMonth
    const matchYear  = p.billing_year  === filterYear
    return matchVilla && matchMonth && matchYear
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // reset to page 1 whenever filters change
  useEffect(() => { setPage(1) }, [filterVilla, filterMonth, filterYear])

  function onSaved(saved, isNew) {
    setPayments(prev =>
      isNew
        ? [saved, ...prev]
        : prev.map(p => p.id === saved.id ? { ...p, ...saved } : p)
    )
    setShowForm(false)
    setEditing(null)
  }

  async function handleDelete(p) {
    setDeletingId(p.id)
    try {
      const { error } = await supabase.from('payments').delete().eq('id', p.id)
      if (error) throw error
      setPayments(prev => prev.filter(x => x.id !== p.id))
    } catch { /* item stays in list */ }
    setDeletingId(null)
    setConfirmDelete(null)
  }

  const pending = summary.totalVillas - summary.paidCount

  // Defaulter logic: only from May 2026 onwards (go-live month)
  const GO_LIVE_YEAR = 2026
  const GO_LIVE_MONTH = 5 // May
  const isBeforeGoLive = filterYear < GO_LIVE_YEAR || (filterYear === GO_LIVE_YEAR && filterMonth < GO_LIVE_MONTH)
  const isCurrentMonth = filterMonth === CUR_MONTH && filterYear === CUR_YEAR
  const isPastDueDay = isBeforeGoLive ? false : (isCurrentMonth ? now.getDate() > dueDay : true)
  const paidVillaIds = new Set(
    payments
      .filter(p => p.billing_month === filterMonth && p.billing_year === filterYear)
      .map(p => p.villa_id)
  )
  const unpaidVillas = isBeforeGoLive ? [] : villas.filter(v => !paidVillaIds.has(v.id))

  async function handleBoardPayNow() {
    if (!myVilla?.id) { setPayMsg({ type: 'error', text: 'No villa linked to your account.' }); return }
    setPaying(true)
    setPayMsg({ type: '', text: '' })

    const { data: duesData } = await supabase
      .from('dues_config').select('monthly_amount')
      .order('effective_from', { ascending: false }).limit(1)

    const amount = Number(duesData?.[0]?.monthly_amount ?? 0)
    if (!amount) { setPayMsg({ type: 'error', text: 'Monthly dues not configured.' }); setPaying(false); return }

    const razorpayKey = import.meta.env.VITE_RAZORPAY_KEY_ID
    if (!razorpayKey) { setPayMsg({ type: 'error', text: 'Payment gateway not configured yet.' }); setPaying(false); return }

    try {
      const rzp = new window.Razorpay({
        key: razorpayKey,
        amount: amount * 100,
        currency: 'INR',
        name: 'Ashirvadh Castle Rock',
        description: `Maintenance dues – ${MONTHS[CUR_MONTH - 1]} ${CUR_YEAR}`,
        prefill: { name: villaUser?.name ?? myVilla.owner_name ?? '', email: villaUser?.email ?? myVilla.email ?? '', contact: villaUser?.phone ?? myVilla.phone ?? '' },
        theme: { color: '#16a34a' },
        handler: async (response) => {
          try {
            const { data, error } = await supabase.from('payments').insert({
              villa_id: myVilla.id, amount, mode: 'UPI',
              billing_month: CUR_MONTH, billing_year: CUR_YEAR,
              paid_on: new Date().toISOString().slice(0, 10),
              remarks: `Razorpay: ${response.razorpay_payment_id}`,
              recorded_by: 'Online Payment',
            }).select('*, villas(villa_number, owner_name)').single()
            if (error) throw error
            setPayments(prev => [data, ...prev])
            setPayMsg({ type: 'success', text: `Payment of ₹${fmt(amount)} successful!` })
            setTimeout(() => setPayMsg({ type: '', text: '' }), 5000)
          } catch { setPayMsg({ type: 'error', text: 'Payment succeeded but recording failed. Contact admin.' }) }
          setPaying(false)
        },
        modal: { ondismiss: () => setPaying(false) },
      })
      rzp.open()
    } catch { setPayMsg({ type: 'error', text: 'Failed to open payment gateway.' }); setPaying(false) }
  }

  return (
    <div className="p-6">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Payments</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {MONTHS[filterMonth - 1]} {filterYear}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleBoardPayNow}
            disabled={paying || !import.meta.env.VITE_RAZORPAY_KEY_ID}
            className="relative flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                       disabled:bg-gray-400 text-white text-sm font-bold rounded-lg transition"
          >
            {paying ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <PayIcon className="w-4 h-4" />
            )}
            {paying ? 'Processing…' : 'Pay My Dues'}
            {!import.meta.env.VITE_RAZORPAY_KEY_ID && (
              <span className="absolute -top-2 -right-2 px-1.5 py-0.5 text-[10px] font-bold
                               bg-amber-400 text-amber-900 rounded-full">Soon</span>
            )}
          </button>
          <button
            onClick={() => exportCSV(filtered)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium
                       text-gray-600 border border-gray-200 hover:border-gray-300
                       hover:bg-gray-50 rounded-lg transition"
          >
            <DownloadIcon className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={() => { setEditing(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                       text-white text-sm font-semibold rounded-lg transition"
          >
            <PlusIcon className="w-4 h-4" />
            Add Payment
          </button>
        </div>
      </div>

      {fetchError && <FetchError message={fetchError} onRetry={retry} />}

      {payMsg.text && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${payMsg.type === 'error' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-700'}`}>
          {payMsg.text}
        </div>
      )}

      {/* Summary bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <SummaryCard
          label="Collected This Month"
          value={`₹${fmt(summary.collected)}`}
          sub={`${summary.paidCount} of ${summary.totalVillas} villas paid`}
          color="green"
          icon={CurrencyIcon}
        />
        <SummaryCard
          label={isPastDueDay && pending > 0 ? 'Defaulters' : 'Pending Villas'}
          value={pending}
          sub={pending === 0
            ? 'All caught up!'
            : isPastDueDay
              ? `${pending} villa${pending !== 1 ? 's' : ''} past due (${dueDay}th)`
              : `${pending} villa${pending !== 1 ? 's' : ''} yet to pay`}
          color={pending > 0 ? (isPastDueDay ? 'red' : 'amber') : 'green'}
          icon={FlagIcon}
        />
        <SummaryCard
          label="Total Payments"
          value={filtered.length}
          sub={`entries for ${MONTHS[filterMonth - 1]}`}
          color="blue"
          icon={ListIcon}
        />
      </div>

      {/* Defaulters / Unpaid list */}
      {unpaidVillas.length > 0 && (
        <div className={`rounded-xl border p-4 mb-6 ${
          isPastDueDay
            ? 'bg-red-50 border-red-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          <div className="flex items-center gap-2 mb-3">
            <AlertIcon className={`w-5 h-5 ${isPastDueDay ? 'text-red-600' : 'text-amber-600'}`} />
            <h3 className={`text-sm font-bold ${isPastDueDay ? 'text-red-800' : 'text-amber-800'}`}>
              {isPastDueDay
                ? `Defaulters — ${MONTHS[filterMonth - 1]} ${filterYear} (past ${dueDay}th)`
                : `Pending — ${MONTHS[filterMonth - 1]} ${filterYear} (due by ${dueDay}th)`}
            </h3>
            <span className={`ml-auto px-2 py-0.5 text-xs font-bold rounded-full ${
              isPastDueDay
                ? 'bg-red-200 text-red-800'
                : 'bg-amber-200 text-amber-800'
            }`}>
              {unpaidVillas.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {unpaidVillas.map(v => (
              <span key={v.id} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
                isPastDueDay
                  ? 'bg-white border border-red-200 text-red-700'
                  : 'bg-white border border-amber-200 text-amber-700'
              }`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
                  isPastDueDay ? 'bg-red-500' : 'bg-amber-500'
                }`}>
                  {v.villa_number}
                </span>
                {v.owner_name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={filterVilla}
          onChange={e => setFilterVilla(e.target.value)}
          className={selectCls}
        >
          <option value="">All Villas</option>
          {villas.map(v => (
            <option key={v.id} value={v.id}>
              {v.villa_number} – {v.owner_name}
            </option>
          ))}
        </select>

        <select
          value={filterMonth}
          onChange={e => setFilterMonth(Number(e.target.value))}
          className={selectCls}
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>

        <select
          value={filterYear}
          onChange={e => setFilterYear(Number(e.target.value))}
          className={selectCls}
        >
          {YEAR_OPTIONS.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        {(filterVilla || filterMonth !== CUR_MONTH || filterYear !== CUR_YEAR) && (
          <button
            onClick={() => { setFilterVilla(''); setFilterMonth(CUR_MONTH); setFilterYear(CUR_YEAR) }}
            className="px-3 py-2 text-sm text-green-700 hover:underline"
          >
            Reset filters
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <TableSkeleton cols={8} />
      ) : pageRows.length === 0 ? (
        <EmptyState onAdd={() => { setEditing(null); setShowForm(true) }} />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <Th>Villa</Th>
                    <Th>Owner</Th>
                    <Th>Amount</Th>
                    <Th>Mode</Th>
                    <Th>Billing</Th>
                    <Th>Paid On</Th>
                    <Th>Recorded By</Th>
                    <Th align="right">Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pageRows.map(p => (
                    <PaymentRow
                      key={p.id}
                      payment={p}
                      onEdit={() => { setEditing(p); setShowForm(true) }}
                      onDelete={() => setConfirmDelete(p)}
                      deleting={deletingId === p.id}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          )}
        </>
      )}

      {/* Add / Edit modal */}
      {showForm && (
        <PaymentFormModal
          editing={editing}
          villas={villas}
          user={user}
          onSaved={onSaved}
          onClose={() => { setShowForm(false); setEditing(null) }}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <ConfirmModal
          message={`Delete ₹${fmt(confirmDelete.amount)} payment for Villa ${confirmDelete.villas?.villa_number}?`}
          loading={deletingId === confirmDelete.id}
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}

// ─── payment table row ────────────────────────────────────────────────────────

function PaymentRow({ payment: p, onEdit, onDelete, deleting }) {
  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg
                         bg-green-50 text-green-700 font-bold text-sm shrink-0">
          {p.villas?.villa_number ?? '—'}
        </span>
      </td>
      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
        {p.villas?.owner_name ?? '—'}
      </td>
      <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">
        ₹{fmt(p.amount)}
      </td>
      <td className="px-4 py-3">
        <span className={`px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap
          ${MODE_STYLE[p.mode] ?? 'bg-gray-100 text-gray-600'}`}>
          {p.mode}
        </span>
      </td>
      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
        {MONTHS[p.billing_month - 1]?.slice(0, 3)} {p.billing_year}
      </td>
      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
        {p.paid_on
          ? new Date(p.paid_on + 'T00:00:00').toLocaleDateString('en-IN', {
              day: '2-digit', month: 'short', year: 'numeric',
            })
          : '—'}
      </td>
      <td className="px-4 py-3 text-gray-500 text-xs">
        {p.recorded_by || '—'}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onEdit}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900
                       border border-gray-200 hover:border-gray-300 rounded-lg transition"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200
                       hover:border-red-300 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
          >
            {deleting ? '…' : 'Delete'}
          </button>
        </div>
      </td>
    </tr>
  )
}

// ─── add / edit modal ─────────────────────────────────────────────────────────

function PaymentFormModal({ editing, villas, user, onSaved, onClose }) {
  const isEdit = Boolean(editing)

  const [form, setForm]     = useState(
    isEdit
      ? {
          villa_id:      editing.villa_id,
          amount:        String(editing.amount),
          mode:          editing.mode,
          billing_month: editing.billing_month,
          billing_year:  editing.billing_year,
          paid_on:       editing.paid_on,
          remarks:       editing.remarks ?? '',
          recorded_by:   editing.recorded_by ?? '',
        }
      : { ...EMPTY_FORM, recorded_by: user?.email ?? '' }
  )
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.villa_id)  { setError('Please select a villa.'); return }
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) {
      setError('Enter a valid amount.')
      return
    }

    setSaving(true)
    const payload = {
      villa_id:      form.villa_id,
      amount:        Number(form.amount),
      mode:          form.mode,
      billing_month: Number(form.billing_month),
      billing_year:  Number(form.billing_year),
      paid_on:       form.paid_on,
      remarks:       form.remarks.trim() || null,
      recorded_by:   form.recorded_by.trim() || null,
    }

    try {
      if (isEdit) {
        const { data, error: err } = await supabase
          .from('payments')
          .update(payload)
          .eq('id', editing.id)
          .select('*, villas(villa_number, owner_name)')
          .single()
        if (err) throw err
        onSaved(data, false)
      } else {
        const { data, error: err } = await supabase
          .from('payments')
          .insert(payload)
          .select('*, villas(villa_number, owner_name)')
          .single()
        if (err) throw err
        onSaved(data, true)
      }
    } catch (err) {
      setError(err.message ?? 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg
                      max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Edit Payment' : 'Record Payment'}
          </h2>
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

          {/* Villa select */}
          <Field label="Villa" required>
            <select
              required
              value={form.villa_id}
              onChange={e => set('villa_id', e.target.value)}
              className={inputCls}
            >
              <option value="">Select villa…</option>
              {villas.map(v => (
                <option key={v.id} value={v.id}>
                  {v.villa_number} – {v.owner_name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            {/* Amount */}
            <Field label="Amount (₹)" required>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                <input
                  type="number"
                  required
                  min="1"
                  step="0.01"
                  value={form.amount}
                  onChange={e => set('amount', e.target.value)}
                  placeholder="0.00"
                  className={inputCls + ' pl-7'}
                />
              </div>
            </Field>

            {/* Mode */}
            <Field label="Payment Mode" required>
              <select
                value={form.mode}
                onChange={e => set('mode', e.target.value)}
                className={inputCls}
              >
                {MODES.map(m => <option key={m}>{m}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* Month */}
            <Field label="Month" required>
              <select
                value={form.billing_month}
                onChange={e => set('billing_month', Number(e.target.value))}
                className={inputCls}
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </Field>

            {/* Year */}
            <Field label="Year" required>
              <select
                value={form.billing_year}
                onChange={e => set('billing_year', Number(e.target.value))}
                className={inputCls}
              >
                {YEAR_OPTIONS.map(y => <option key={y}>{y}</option>)}
              </select>
            </Field>

            {/* Paid on */}
            <Field label="Paid On" required>
              <input
                type="date"
                required
                value={form.paid_on}
                onChange={e => set('paid_on', e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Recorded by */}
            <Field label="Recorded By">
              <input
                type="text"
                value={form.recorded_by}
                onChange={e => set('recorded_by', e.target.value)}
                placeholder="Your name"
                className={inputCls}
              />
            </Field>

            {/* Remarks */}
            <Field label="Remarks">
              <input
                type="text"
                value={form.remarks}
                onChange={e => set('remarks', e.target.value)}
                placeholder="Optional note"
                className={inputCls}
              />
            </Field>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900
                         border border-gray-200 hover:border-gray-300 rounded-lg transition"
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
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── resident view ────────────────────────────────────────────────────────────

function ResidentView({ myVilla }) {
  const [payments, setPayments] = useState([])
  const [page, setPage]         = useState(1)
  const [paying, setPaying]     = useState(false)
  const [paySuccess, setPaySuccess] = useState('')
  const [payError, setPayError] = useState('')

  const { loading, error: fetchError, retry } = usePageData(async () => {
    if (!myVilla?.id) return
    const { data, error } = await supabase
      .from('payments')
      .select('*, villas(villa_number, owner_name)')
      .eq('villa_id', myVilla.id)
      .order('paid_on', { ascending: false })
    if (error) throw error
    setPayments(data ?? [])
  }, [myVilla?.id])

  const totalPages = Math.max(1, Math.ceil(payments.length / PAGE_SIZE))
  const pageRows   = payments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPaid  = payments.reduce((s, p) => s + Number(p.amount), 0)

  async function handlePayNow() {
    setPaying(true)
    setPayError('')
    setPaySuccess('')

    // Fetch the current monthly due amount
    const { data: duesData } = await supabase
      .from('dues_config')
      .select('monthly_amount')
      .order('effective_from', { ascending: false })
      .limit(1)

    const amount = Number(duesData?.[0]?.monthly_amount ?? 0)
    if (!amount) {
      setPayError('Monthly dues amount is not configured yet. Contact your board.')
      setPaying(false)
      return
    }

    const razorpayKey = import.meta.env.VITE_RAZORPAY_KEY_ID
    if (!razorpayKey) {
      setPayError('Payment gateway is not configured yet. Contact your board.')
      setPaying(false)
      return
    }

    const options = {
      key: razorpayKey,
      amount: amount * 100, // Razorpay expects paise
      currency: 'INR',
      name: 'Ashirvadh Castle Rock',
      description: `Maintenance dues – ${MONTHS[CUR_MONTH - 1]} ${CUR_YEAR}`,
      prefill: {
        name: villaUser?.name ?? myVilla.owner_name ?? '',
        email: villaUser?.email ?? myVilla.email ?? '',
        contact: villaUser?.phone ?? myVilla.phone ?? '',
      },
      theme: { color: '#16a34a' },
      handler: async function (response) {
        // Payment succeeded — record it in Supabase
        try {
          const { data, error } = await supabase.from('payments').insert({
            villa_id: myVilla.id,
            amount,
            mode: 'UPI',
            billing_month: CUR_MONTH,
            billing_year: CUR_YEAR,
            paid_on: new Date().toISOString().slice(0, 10),
            remarks: `Razorpay: ${response.razorpay_payment_id}`,
            recorded_by: 'Online Payment',
          }).select('*, villas(villa_number, owner_name)').single()
          if (error) throw error
          setPayments(prev => [data, ...prev])
          setPaySuccess(`Payment of ₹${fmt(amount)} successful!`)
          setTimeout(() => setPaySuccess(''), 5000)
        } catch {
          setPayError('Payment was successful but recording failed. Contact board with your payment ID.')
        }
        setPaying(false)
      },
      modal: {
        ondismiss: () => setPaying(false),
      },
    }

    try {
      const rzp = new window.Razorpay(options)
      rzp.open()
    } catch {
      setPayError('Failed to open payment gateway.')
      setPaying(false)
    }
  }

  if (!myVilla) {
    return (
      <div className="p-6 py-24 flex flex-col items-center text-center">
        <p className="text-gray-500">No villa linked to your account.</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">My Payments</h1>
          <p className="text-sm text-gray-500 mt-0.5">Villa {myVilla.villa_number}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-gray-400">Total paid (all time)</p>
            <p className="text-xl font-bold text-green-700">₹{fmt(totalPaid)}</p>
          </div>
          <button
            onClick={handlePayNow}
            disabled={paying || !import.meta.env.VITE_RAZORPAY_KEY_ID}
            className="relative flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700
                       disabled:bg-gray-400 text-white text-sm font-bold rounded-xl shadow-lg
                       hover:shadow-xl transition-all"
          >
            {paying ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <PayIcon className="w-4 h-4" />
            )}
            {paying ? 'Processing…' : 'Pay Now'}
            {!import.meta.env.VITE_RAZORPAY_KEY_ID && (
              <span className="absolute -top-2 -right-2 px-1.5 py-0.5 text-[10px] font-bold
                               bg-amber-400 text-amber-900 rounded-full">Soon</span>
            )}
          </button>
        </div>
      </div>

      {fetchError && <FetchError message={fetchError} onRetry={retry} />}

      {payError && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{payError}</div>
      )}
      {paySuccess && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">{paySuccess}</div>
      )}

      {loading ? (
        <TableSkeleton cols={5} />
      ) : pageRows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
          <p className="text-gray-500">No payment records found.</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <Th>Amount</Th>
                    <Th>Mode</Th>
                    <Th>Billing</Th>
                    <Th>Paid On</Th>
                    <Th>Remarks</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pageRows.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-gray-900">₹{fmt(p.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full
                          ${MODE_STYLE[p.mode] ?? 'bg-gray-100 text-gray-600'}`}>
                          {p.mode}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {MONTHS[p.billing_month - 1]?.slice(0, 3)} {p.billing_year}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {p.paid_on
                          ? new Date(p.paid_on + 'T00:00:00').toLocaleDateString('en-IN', {
                              day: '2-digit', month: 'short', year: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{p.remarks ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          )}
        </>
      )}
    </div>
  )
}

// ─── shared small components ──────────────────────────────────────────────────

function SummaryCard({ label, value, sub, color, icon: Icon }) {
  const colors = {
    green: { bg: 'bg-green-50',  icon: 'text-green-600',  val: 'text-green-700' },
    amber: { bg: 'bg-amber-50',  icon: 'text-amber-600',  val: 'text-amber-700' },
    blue:  { bg: 'bg-blue-50',   icon: 'text-blue-600',   val: 'text-blue-700'  },
    red:   { bg: 'bg-red-50',    icon: 'text-red-600',    val: 'text-red-700'   },
  }
  const c = colors[color] ?? colors.green
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-center gap-4">
      <div className={`${c.bg} w-11 h-11 rounded-lg flex items-center justify-center shrink-0`}>
        <Icon className={`w-5 h-5 ${c.icon}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className={`text-xl font-bold ${c.val} leading-tight`}>{value}</p>
        <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>
      </div>
    </div>
  )
}

function Pagination({ page, totalPages, onChange }) {
  return (
    <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
      <span>Page {page} of {totalPages}</span>
      <div className="flex gap-2">
        <PagBtn disabled={page === 1}          onClick={() => onChange(page - 1)}>← Prev</PagBtn>
        <PagBtn disabled={page === totalPages} onClick={() => onChange(page + 1)}>Next →</PagBtn>
      </div>
    </div>
  )
}

function PagBtn({ disabled, onClick, children }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium
                 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
    >
      {children}
    </button>
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

function TableSkeleton({ cols }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="divide-y divide-gray-50">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <div className="w-9 h-9 rounded-lg bg-gray-100 animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 bg-gray-100 rounded animate-pulse w-32" />
              <div className="h-3 bg-gray-100 rounded animate-pulse w-48" />
            </div>
            {cols > 4 && <div className="h-6 w-16 bg-gray-100 rounded-full animate-pulse" />}
            {cols > 5 && <div className="h-6 w-20 bg-gray-100 rounded animate-pulse" />}
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyState({ onAdd }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 py-16 flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <CurrencyIcon className="w-7 h-7 text-gray-400" />
      </div>
      <p className="text-gray-500 font-medium">No payments for this period</p>
      <button
        onClick={onAdd}
        className="mt-4 flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                   text-white text-sm font-semibold rounded-lg transition"
      >
        <PlusIcon className="w-4 h-4" />
        Record first payment
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

function Th({ children, align = 'left' }) {
  return (
    <th className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase
                    tracking-wide text-${align} whitespace-nowrap`}>
      {children}
    </th>
  )
}

// ─── style constants ──────────────────────────────────────────────────────────

const inputCls = `w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
  focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition`

const selectCls = `px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white
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
function DownloadIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  )
}
function CurrencyIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 8h6m-5 0a3 3 0 110 6H9l3 3m-3-6h6m6 1a9 9 0 11-18 0 9 9 0 0118 0z" />
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
function ListIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  )
}
function PayIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
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
