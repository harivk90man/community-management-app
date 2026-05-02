import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { usePageData } from '../hooks/usePageData'
import { exportFile } from '../utils/exportFile'
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

function getNow()      { return new Date() }
function getCurMonth() { return getNow().getMonth() + 1 }
function getCurYear()  { return getNow().getFullYear() }
function getToday()    { return getNow().toISOString().slice(0, 10) }
function getYearOptions() { const y = getCurYear(); return Array.from({ length: 5 }, (_, i) => y - i) }

function makeEmptyForm(email) {
  return {
    villa_id:      '',
    amount:        '',
    mode:          'UPI',
    billing_month: getCurMonth(),
    billing_year:  getCurYear(),
    paid_on:       getToday(),
    remarks:       '',
    recorded_by:   email ?? '',
  }
}

const UPI_APPS = [
  { id: 'gpay',    label: 'Google Pay',    pkg: 'com.google.android.apps.nbu.paisa.user', bg: 'bg-blue-50   border-blue-200   text-blue-700   hover:bg-blue-100'   },
  { id: 'phonepe', label: 'PhonePe',       pkg: 'com.phonepe.app',                        bg: 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100' },
  { id: 'paytm',   label: 'Paytm',         pkg: 'net.one97.paytm',                        bg: 'bg-sky-50    border-sky-200    text-sky-700    hover:bg-sky-100'    },
  { id: 'bhim',    label: 'BHIM / Any UPI',pkg: null,                                      bg: 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100' },
]

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmt(n) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)
}

function csvEscape(v) {
  const s = String(v ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"` : s
}

function exportDuesStatus(villas, payments, filterMonth, filterYear) {
  const monthName = MONTHS[filterMonth - 1]
  const paidMap = {}
  payments
    .filter(p => p.billing_month === filterMonth && p.billing_year === filterYear)
    .forEach(p => {
      paidMap[p.villa_id] = {
        amount: Number(p.amount),
        mode: p.mode,
        paid_on: p.paid_on,
        remarks: p.remarks,
      }
    })

  const sorted = [...villas].sort((a, b) => Number(a.villa_number) - Number(b.villa_number))

  const headers = ['Villa', 'Owner', 'Status', 'Amount Paid', 'Mode', 'Paid On', 'Remarks']
  const rows = sorted.map(v => {
    const paid = paidMap[v.id]
    return [
      v.villa_number,
      v.owner_name,
      paid ? 'Paid' : 'Not Paid',
      paid ? paid.amount : '',
      paid ? paid.mode : '',
      paid ? paid.paid_on : '',
      paid ? (paid.remarks ?? '') : '',
    ].map(csvEscape).join(',')
  })

  const paidCount = villas.filter(v => paidMap[v.id]).length
  const unpaidCount = villas.length - paidCount

  const lines = [
    `Ashirvadh Castle Rock - Dues Status Report`,
    `Period: ${monthName} ${filterYear}`,
    `Generated: ${new Date().toLocaleDateString('en-IN')}`,
    `Total Villas: ${villas.length} | Paid: ${paidCount} | Not Paid: ${unpaidCount}`,
    '',
    headers.join(','),
    ...rows,
  ]

  exportFile(`dues_status_${monthName}_${filterYear}.csv`, lines.join('\n'))
}

function buildUpiUrl(upiId, amount, note) {
  // Use generic upi:// intent — launched via native startActivityForResult on Android
  const p = `pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent('Ashirvadh Castle Rock')}&am=${amount}&tn=${encodeURIComponent(note)}&cu=INR`
  return `upi://pay?${p}`
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function Payments() {
  const { villa: myVilla, villaUser, role, user } = useAuth()
  if (role === 'board') return <BoardView user={user} myVilla={myVilla} villaUser={villaUser} />
  return <ResidentView myVilla={myVilla} villaUser={villaUser} user={user} />
}

// ─── board view ───────────────────────────────────────────────────────────────

function BoardView({ user, myVilla, villaUser }) {
  const [payments,        setPayments]        = useState([])
  const [pendingPayments, setPendingPayments] = useState([])
  const [villas,          setVillas]          = useState([])
  const [page,            setPage]            = useState(1)
  const [showForm,        setShowForm]        = useState(false)
  const [editing,         setEditing]         = useState(null)
  const [deletingId,      setDeletingId]      = useState(null)
  const [confirmDelete,   setConfirmDelete]   = useState(null)
  const [dueDay,          setDueDay]          = useState(10)
  const [upiId,           setUpiId]           = useState('')
  const [monthlyAmount,   setMonthlyAmount]   = useState(0)
  const [showUpiModal,    setShowUpiModal]    = useState(false)
  const [upiModalData,    setUpiModalData]    = useState(null)
  const [showRecordModal, setShowRecordModal] = useState(false)
  const [bankDetails,     setBankDetails]     = useState(null)
  const [approvingId,     setApprovingId]     = useState(null)
  const [rejectingId,     setRejectingId]     = useState(null)
  const [undoingId,       setUndoingId]       = useState(null)
  const [confirmApprove,  setConfirmApprove]  = useState(null)
  const [actionError,     setActionError]     = useState('')

  const [filterVilla, setFilterVilla] = useState('')
  const [filterMonth, setFilterMonth] = useState(getCurMonth)
  const [filterYear,  setFilterYear]  = useState(getCurYear)
  const [summary, setSummary] = useState({ collected: 0, paidCount: 0, totalVillas: 0 })

  const { loading, error: fetchError, retry } = usePageData(async () => {
    const [paymentsRes, villasRes, assocRes, duesRes, pendingRes] = await Promise.all([
      supabase.from('payments').select('*, villas(villa_number, owner_name)')
        .eq('status', 'approved').order('paid_on', { ascending: false }),
      supabase.from('villas').select('id, villa_number, owner_name')
        .eq('is_active', true).order('villa_number'),
      supabase.from('association_config').select('due_day, upi_id, bank_account_name, bank_account_number, bank_ifsc, bank_name').limit(1).single(),
      supabase.from('dues_config').select('monthly_amount')
        .order('effective_from', { ascending: false }).limit(1),
      supabase.from('payments').select('*, villas(villa_number, owner_name)')
        .eq('status', 'pending').order('paid_on', { ascending: false }),
    ])
    if (paymentsRes.error) throw paymentsRes.error
    if (villasRes.error)   throw villasRes.error
    setPayments(paymentsRes.data ?? [])
    setPendingPayments(pendingRes.data ?? [])
    setVillas((villasRes.data ?? []).sort((a, b) => Number(a.villa_number) - Number(b.villa_number)))
    if (assocRes.data) {
      setDueDay(assocRes.data.due_day ?? 10); setUpiId(assocRes.data.upi_id ?? '')
      if (assocRes.data.bank_account_number) setBankDetails({ name: assocRes.data.bank_account_name, number: assocRes.data.bank_account_number, ifsc: assocRes.data.bank_ifsc, bank: assocRes.data.bank_name })
    }
    if (duesRes.data?.[0]) setMonthlyAmount(Number(duesRes.data[0].monthly_amount) || 0)
  }, [])

  useEffect(() => {
    const mp = payments.filter(p => p.billing_month === filterMonth && p.billing_year === filterYear)
    setSummary({
      collected:   mp.reduce((s, p) => s + Number(p.amount), 0),
      paidCount:   new Set(mp.map(p => p.villa_id)).size,
      totalVillas: villas.length,
    })
  }, [payments, filterMonth, filterYear, villas.length])

  const filtered = payments.filter(p =>
    (filterVilla ? p.villa_id === filterVilla : true) &&
    p.billing_month === filterMonth && p.billing_year === filterYear
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  useEffect(() => { setPage(1) }, [filterVilla, filterMonth, filterYear])

  function onSaved(saved, isNew) {
    setPayments(prev => isNew ? [saved, ...prev] : prev.map(p => p.id === saved.id ? { ...p, ...saved } : p))
    setShowForm(false); setEditing(null)
  }

  async function handleDelete(p) {
    setDeletingId(p.id); setActionError('')
    try {
      const { error } = await supabase.from('payments').delete().eq('id', p.id)
      if (error) throw error
      setPayments(prev => prev.filter(x => x.id !== p.id))
      setConfirmDelete(null)
    } catch (e) {
      setActionError(`Failed to delete: ${e.message ?? 'Unknown error'}`)
    }
    setDeletingId(null)
  }

  async function logAudit(paymentId, action, reason, details) {
    await supabase.from('payment_audit').insert({
      payment_id: paymentId,
      action,
      performed_by: user?.email ?? 'unknown',
      reason: reason || null,
      details: details || null,
    })
  }

  async function handleApprove(payment) {
    setApprovingId(payment.id); setActionError('')
    try {
      const { data, error } = await supabase
        .from('payments')
        .update({ status: 'approved', approved_by: user?.email ?? null, status_changed_at: new Date().toISOString() })
        .eq('id', payment.id)
        .select('*, villas(villa_number, owner_name)')
        .single()
      if (error) throw error
      setPendingPayments(prev => prev.filter(p => p.id !== payment.id))
      setPayments(prev => [data, ...prev])
      setConfirmApprove(null)
      logAudit(payment.id, 'approved', null, { amount: payment.amount, billing_month: payment.billing_month, billing_year: payment.billing_year })
    } catch (e) {
      setActionError(`Failed to approve: ${e.message ?? 'Unknown error'}`)
    }
    setApprovingId(null)
  }

  async function handleReject(payment, reason) {
    setRejectingId(payment.id); setActionError('')
    try {
      const { error } = await supabase
        .from('payments')
        .update({ status: 'rejected', rejected_by: user?.email ?? null, reject_reason: reason, status_changed_at: new Date().toISOString() })
        .eq('id', payment.id)
      if (error) throw error
      setPendingPayments(prev => prev.filter(p => p.id !== payment.id))
      logAudit(payment.id, 'rejected', reason, { amount: payment.amount, billing_month: payment.billing_month, billing_year: payment.billing_year })
    } catch (e) {
      setActionError(`Failed to reject: ${e.message ?? 'Unknown error'}`)
    }
    setRejectingId(null)
  }

  async function handleUndoApprove(payment) {
    setUndoingId(payment.id); setActionError('')
    try {
      const { data, error } = await supabase
        .from('payments')
        .update({ status: 'pending', approved_by: null, status_changed_at: new Date().toISOString() })
        .eq('id', payment.id)
        .select('*, villas(villa_number, owner_name)')
        .single()
      if (error) throw error
      setPayments(prev => prev.filter(p => p.id !== payment.id))
      setPendingPayments(prev => [data, ...prev])
      logAudit(payment.id, 'undo_approve', null, { amount: payment.amount, billing_month: payment.billing_month, billing_year: payment.billing_year })
    } catch (e) {
      setActionError(`Failed to undo: ${e.message ?? 'Unknown error'}`)
    }
    setUndoingId(null)
  }

  function handlePaymentRecorded(newPayment) {
    setPendingPayments(prev => [newPayment, ...prev])
    setShowRecordModal(false); setUpiModalData(null); setShowUpiModal(false)
  }

  const pending = summary.totalVillas - summary.paidCount
  const GO_LIVE_YEAR = 2026, GO_LIVE_MONTH = 5
  const isBeforeGoLive = filterYear < GO_LIVE_YEAR || (filterYear === GO_LIVE_YEAR && filterMonth < GO_LIVE_MONTH)
  const curMonth = getCurMonth(), curYear = getCurYear()
  const isCurrentMonth = filterMonth === curMonth && filterYear === curYear
  const isPastDueDay   = isBeforeGoLive ? false : (isCurrentMonth ? getNow().getDate() > dueDay : true)
  const paidVillaIds   = new Set(payments.filter(p => p.billing_month === filterMonth && p.billing_year === filterYear).map(p => p.villa_id))
  const unpaidVillas   = isBeforeGoLive ? [] : villas.filter(v => !paidVillaIds.has(v.id))

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Payments</h1>
          <p className="text-sm text-gray-500 mt-0.5">{MONTHS[filterMonth - 1]} {filterYear}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowUpiModal(true)} disabled={!myVilla?.id}
            title={!myVilla?.id ? 'No villa linked to your account' : ''}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                       disabled:bg-gray-400 text-white text-sm font-bold rounded-lg transition">
            <PayIcon className="w-4 h-4" /> Pay My Dues
          </button>
          <button onClick={() => exportDuesStatus(villas, payments, filterMonth, filterYear)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600
                       border border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded-lg transition">
            <DownloadIcon className="w-4 h-4" /> Export
          </button>
          <button onClick={() => { setEditing(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                       text-white text-sm font-semibold rounded-lg transition">
            <PlusIcon className="w-4 h-4" /> Add Payment
          </button>
        </div>
      </div>

      {fetchError && <FetchError message={fetchError} onRetry={retry} />}

      {actionError && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError('')} className="text-red-400 hover:text-red-600 ml-3 shrink-0">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pending Approvals */}
      {pendingPayments.length > 0 && (
        <PendingApprovals
          payments={pendingPayments}
          currentUserEmail={user?.email}
          onApprove={p => setConfirmApprove(p)}
          onReject={handleReject}
          approvingId={approvingId}
          rejectingId={rejectingId}
        />
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <SummaryCard label="Collected This Month" value={`₹${fmt(summary.collected)}`}
          sub={`${summary.paidCount} of ${summary.totalVillas} villas paid`} color="green" icon={CurrencyIcon} />
        <SummaryCard
          label={isPastDueDay && pending > 0 ? 'Defaulters' : 'Pending Villas'} value={pending}
          sub={pending === 0 ? 'All caught up!' : isPastDueDay
            ? `${pending} villa${pending !== 1 ? 's' : ''} past due (${dueDay}th)`
            : `${pending} villa${pending !== 1 ? 's' : ''} yet to pay`}
          color={pending > 0 ? (isPastDueDay ? 'red' : 'amber') : 'green'} icon={FlagIcon} />
        <SummaryCard label="Total Payments" value={filtered.length}
          sub={`entries for ${MONTHS[filterMonth - 1]}`} color="blue" icon={ListIcon} />
      </div>

      {/* Defaulters */}
      {unpaidVillas.length > 0 && (
        <div className={`rounded-xl border p-4 mb-6 ${isPastDueDay ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center gap-2 mb-3">
            <AlertIcon className={`w-5 h-5 ${isPastDueDay ? 'text-red-600' : 'text-amber-600'}`} />
            <h3 className={`text-sm font-bold ${isPastDueDay ? 'text-red-800' : 'text-amber-800'}`}>
              {isPastDueDay
                ? `Defaulters — ${MONTHS[filterMonth - 1]} ${filterYear} (past ${dueDay}th)`
                : `Pending — ${MONTHS[filterMonth - 1]} ${filterYear} (due by ${dueDay}th)`}
            </h3>
            <span className={`ml-auto px-2 py-0.5 text-xs font-bold rounded-full ${isPastDueDay ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'}`}>
              {unpaidVillas.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {unpaidVillas.map(v => (
              <span key={v.id} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
                isPastDueDay ? 'bg-white border border-red-200 text-red-700' : 'bg-white border border-amber-200 text-amber-700'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${isPastDueDay ? 'bg-red-500' : 'bg-amber-500'}`}>
                  {v.villa_number}
                </span>
                {v.owner_name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 mb-4">
        <select value={filterVilla} onChange={e => setFilterVilla(e.target.value)}
          className={selectCls + ' col-span-2'}>
          <option value="">All Villas</option>
          {villas.map(v => <option key={v.id} value={v.id}>{v.villa_number} – {v.owner_name}</option>)}
        </select>
        <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))} className={selectCls}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))} className={selectCls}>
          {getYearOptions().map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {(filterVilla || filterMonth !== curMonth || filterYear !== curYear) && (
          <button onClick={() => { setFilterVilla(''); setFilterMonth(getCurMonth()); setFilterYear(getCurYear()) }}
            className="px-3 py-2 text-sm text-green-700 hover:underline col-span-2 sm:col-span-1">Reset filters</button>
        )}
      </div>

      {/* Table */}
      {loading ? <TableSkeleton cols={8} /> : pageRows.length === 0 ? (
        <EmptyState onAdd={() => { setEditing(null); setShowForm(true) }} />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <Th>Villa</Th><Th>Owner</Th><Th>Amount</Th><Th>Mode</Th>
                    <Th>Billing</Th><Th>Paid On</Th><Th>Recorded By</Th><Th align="right">Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pageRows.map(p => (
                    <PaymentRow key={p.id} payment={p}
                      onEdit={() => { setEditing(p); setShowForm(true) }}
                      onDelete={() => setConfirmDelete(p)}
                      deleting={deletingId === p.id}
                      onUndo={() => handleUndoApprove(p)}
                      undoing={undoingId === p.id} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}
        </>
      )}

      {/* Modals */}
      {showUpiModal && myVilla?.id && (
        <UpiPayModal
          villaNumber={myVilla.villa_number ?? ''}
          userName={villaUser?.name ?? user?.email ?? ''}
          upiId={upiId} bankDetails={bankDetails}
          defaultAmount={monthlyAmount}
          existingPayments={[...payments, ...pendingPayments].filter(p => p.villa_id === myVilla.id)}
          onClose={() => setShowUpiModal(false)}
          onProceed={data => { setUpiModalData(data); setShowRecordModal(true) }}
        />
      )}
      {showRecordModal && upiModalData && (
        <RecordPaymentModal
          villaId={myVilla.id}
          villaNumber={myVilla.villa_number ?? ''}
          userName={villaUser?.name ?? user?.email ?? ''}
          userEmail={user?.email ?? ''}
          upiId={upiId}
          payData={upiModalData}
          onClose={() => { setShowRecordModal(false); setUpiModalData(null) }}
          onRecorded={handlePaymentRecorded}
        />
      )}
      {showForm && (
        <PaymentFormModal editing={editing} villas={villas} user={user}
          onSaved={onSaved} onClose={() => { setShowForm(false); setEditing(null) }} />
      )}
      {confirmDelete && (
        <ConfirmModal
          message={`Delete ₹${fmt(confirmDelete.amount)} payment for Villa ${confirmDelete.villas?.villa_number}?`}
          loading={deletingId === confirmDelete.id}
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)} />
      )}
      {confirmApprove && (
        <ConfirmModal
          message={`Approve ₹${fmt(confirmApprove.amount)} payment for Villa ${confirmApprove.villas?.villa_number} (${MONTHS[confirmApprove.billing_month - 1]} ${confirmApprove.billing_year})?`}
          loading={approvingId === confirmApprove.id}
          onConfirm={() => handleApprove(confirmApprove)}
          onCancel={() => setConfirmApprove(null)}
          confirmLabel="Approve"
          confirmColor="green" />
      )}
    </div>
  )
}

// ─── pending approvals ────────────────────────────────────────────────────────

function PendingApprovals({ payments, currentUserEmail, onApprove, onReject, approvingId, rejectingId }) {
  const [rejectForm, setRejectForm] = useState(null) // payment id being rejected
  const [rejectReason, setRejectReason] = useState('')

  function startReject(p) { setRejectForm(p.id); setRejectReason('') }
  function cancelReject() { setRejectForm(null); setRejectReason('') }
  function submitReject(p) {
    if (!rejectReason.trim()) return
    onReject(p, rejectReason.trim())
    cancelReject()
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <ClockIcon className="w-5 h-5 text-amber-600" />
        <h3 className="text-sm font-bold text-amber-800">Pending Approvals</h3>
        <span className="ml-auto px-2 py-0.5 text-xs font-bold bg-amber-200 text-amber-800 rounded-full">
          {payments.length}
        </span>
      </div>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {payments.map(p => {
          const isOwn       = p.initiated_by === currentUserEmail
          const isApproving = approvingId === p.id
          const isRejecting = rejectingId === p.id
          const showRejectForm = rejectForm === p.id
          return (
            <div key={p.id} className="bg-white border border-amber-100 rounded-lg px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center
                                 text-white font-black text-xs shrink-0">
                  {p.villas?.villa_number ?? '?'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.villas?.owner_name ?? '—'}</p>
                  <p className="text-xs text-gray-500">
                    ₹{fmt(p.amount)} · {MONTHS[p.billing_month - 1]?.slice(0, 3)} {p.billing_year} · {p.mode}
                    {p.initiated_by && ` · by ${p.initiated_by}`}
                  </p>
                </div>
                {isOwn ? (
                  <span className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-100 rounded-lg whitespace-nowrap">
                    Awaiting another admin
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <button onClick={() => onApprove(p)} disabled={isApproving || isRejecting}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white
                                 bg-green-600 hover:bg-green-700 disabled:bg-green-400 rounded-lg transition whitespace-nowrap">
                      {isApproving && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                      {isApproving ? 'Approving…' : 'Approve'}
                    </button>
                    {!showRejectForm && (
                      <button onClick={() => startReject(p)} disabled={isApproving || isRejecting}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600
                                   border border-red-200 hover:bg-red-50 disabled:opacity-40 rounded-lg transition whitespace-nowrap">
                        Reject
                      </button>
                    )}
                  </div>
                )}
              </div>
              {/* Inline reject reason form */}
              {showRejectForm && (
                <div className="mt-3 pt-3 border-t border-amber-100 space-y-2">
                  <p className="text-xs font-medium text-red-700">Reason for rejection:</p>
                  <input type="text" value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                    placeholder="e.g. Wrong amount, duplicate, not received…"
                    className="w-full px-3 py-2 text-sm border border-red-200 rounded-lg
                               focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent" autoFocus />
                  <div className="flex gap-2">
                    <button onClick={cancelReject}
                      className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200
                                 hover:border-gray-300 rounded-lg transition">Cancel</button>
                    <button onClick={() => submitReject(p)} disabled={!rejectReason.trim() || isRejecting}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white
                                 bg-red-600 hover:bg-red-700 disabled:bg-red-300 rounded-lg transition">
                      {isRejecting && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                      {isRejecting ? 'Rejecting…' : 'Confirm Reject'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── resident view ────────────────────────────────────────────────────────────

function ResidentView({ myVilla, villaUser, user }) {
  const [payments,          setPayments]          = useState([])
  const [pendingPayments,   setPendingPayments]   = useState([])
  const [rejectedPayments,  setRejectedPayments]  = useState([])
  const [page,              setPage]              = useState(1)
  const [upiId,             setUpiId]             = useState('')
  const [monthlyAmount,     setMonthlyAmount]     = useState(0)
  const [showUpiModal,      setShowUpiModal]      = useState(false)
  const [upiModalData,      setUpiModalData]      = useState(null)
  const [showRecordModal,   setShowRecordModal]   = useState(false)
  const [bankDetails,       setBankDetails]       = useState(null)

  const { loading, error: fetchError, retry } = usePageData(async () => {
    if (!myVilla?.id) return
    const [approvedRes, pendingRes, rejectedRes, assocRes, duesRes] = await Promise.all([
      supabase.from('payments').select('*, villas(villa_number, owner_name)')
        .eq('villa_id', myVilla.id).eq('status', 'approved').order('paid_on', { ascending: false }),
      supabase.from('payments').select('*, villas(villa_number, owner_name)')
        .eq('villa_id', myVilla.id).eq('status', 'pending').order('paid_on', { ascending: false }),
      supabase.from('payments').select('*, villas(villa_number, owner_name)')
        .eq('villa_id', myVilla.id).eq('status', 'rejected').order('paid_on', { ascending: false }),
      supabase.from('association_config').select('upi_id, bank_account_name, bank_account_number, bank_ifsc, bank_name').limit(1).single(),
      supabase.from('dues_config').select('monthly_amount').order('effective_from', { ascending: false }).limit(1),
    ])
    if (approvedRes.error) throw approvedRes.error
    setPayments(approvedRes.data ?? [])
    setPendingPayments(pendingRes.data ?? [])
    setRejectedPayments(rejectedRes.data ?? [])
    if (assocRes.data?.upi_id) setUpiId(assocRes.data.upi_id)
    if (assocRes.data?.bank_account_number) setBankDetails({ name: assocRes.data.bank_account_name, number: assocRes.data.bank_account_number, ifsc: assocRes.data.bank_ifsc, bank: assocRes.data.bank_name })
    if (duesRes.data?.[0]) setMonthlyAmount(Number(duesRes.data[0].monthly_amount) || 0)
  }, [myVilla?.id])

  const totalPages = Math.max(1, Math.ceil(payments.length / PAGE_SIZE))
  const pageRows   = payments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPaid  = payments.reduce((s, p) => s + Number(p.amount), 0)

  function handlePaymentRecorded(newPayment) {
    setPendingPayments(prev => [newPayment, ...prev])
    setShowRecordModal(false); setUpiModalData(null); setShowUpiModal(false)
  }

  async function handleResubmit(rejected) {
    // Delete the old rejected record from DB, then open Pay Now modal
    await supabase.from('payments').delete().eq('id', rejected.id)
    setRejectedPayments(prev => prev.filter(p => p.id !== rejected.id))
    setShowUpiModal(true)
  }

  async function handleDismissRejected(id) {
    // Soft-dismiss: delete the rejected record so it stops showing
    await supabase.from('payments').delete().eq('id', id)
    setRejectedPayments(prev => prev.filter(p => p.id !== id))
  }

  if (!myVilla) {
    return (
      <div className="p-6 py-24 flex flex-col items-center text-center">
        <p className="text-gray-500">No villa linked to your account.</p>
      </div>
    )
  }

  const userName    = villaUser?.name ?? myVilla.owner_name ?? ''
  const villaNumber = myVilla.villa_number ?? ''

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">My Payments</h1>
          <p className="text-sm text-gray-500 mt-0.5">Villa {villaNumber}</p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="text-right sm:text-right">
            <p className="text-xs text-gray-400">Total paid (all time)</p>
            <p className="text-xl font-bold text-green-700">₹{fmt(totalPaid)}</p>
          </div>
          <button onClick={() => setShowUpiModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700
                       text-white text-sm font-bold rounded-xl shadow-lg hover:shadow-xl transition-all">
            <PayIcon className="w-4 h-4" /> Pay Now
          </button>
        </div>
      </div>

      {fetchError && <FetchError message={fetchError} onRetry={retry} />}

      {/* Rejected payments banner */}
      {rejectedPayments.length > 0 && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertIcon className="w-4 h-4 text-red-600" />
            <p className="text-sm font-semibold text-red-800">Rejected</p>
          </div>
          <div className="space-y-2">
            {rejectedPayments.map(p => (
              <div key={p.id} className="bg-white border border-red-100 rounded-lg px-4 py-3">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-semibold text-gray-900">₹{fmt(p.amount)}</span>
                  <span className="text-gray-500">{MONTHS[p.billing_month - 1]?.slice(0, 3)} {p.billing_year}</span>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${MODE_STYLE[p.mode] ?? 'bg-gray-100 text-gray-600'}`}>
                    {p.mode}
                  </span>
                  <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                    Rejected
                  </span>
                </div>
                {p.reject_reason && (
                  <p className="text-xs text-red-600 mt-2 bg-red-50 px-3 py-1.5 rounded-lg">
                    Reason: {p.reject_reason}
                    {p.rejected_by && <span className="text-red-400"> — by {p.rejected_by}</span>}
                  </p>
                )}
                <div className="flex gap-2 mt-2">
                  <button onClick={() => handleResubmit(p)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white
                               bg-green-600 hover:bg-green-700 rounded-lg transition">
                    <PayIcon className="w-3 h-3" /> Re-submit Payment
                  </button>
                  <button onClick={() => handleDismissRejected(p.id)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-500
                               border border-gray-200 hover:border-gray-300 rounded-lg transition">
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending payments banner */}
      {pendingPayments.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <ClockIcon className="w-4 h-4 text-amber-600" />
            <p className="text-sm font-semibold text-amber-800">Awaiting approval</p>
          </div>
          <div className="space-y-2">
            {pendingPayments.map(p => (
              <div key={p.id} className="bg-white border border-amber-100 rounded-lg px-4 py-2.5
                                         flex items-center gap-3 text-sm">
                <span className="font-semibold text-gray-900">₹{fmt(p.amount)}</span>
                <span className="text-gray-500">{MONTHS[p.billing_month - 1]?.slice(0, 3)} {p.billing_year}</span>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${MODE_STYLE[p.mode] ?? 'bg-gray-100 text-gray-600'}`}>
                  {p.mode}
                </span>
                <span className="ml-auto px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                  Pending
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? <TableSkeleton cols={5} /> : pageRows.length === 0 && pendingPayments.length === 0 && rejectedPayments.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
          <p className="text-gray-500">No payment records found.</p>
        </div>
      ) : pageRows.length > 0 && (
        <>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <Th>Amount</Th><Th>Mode</Th><Th>Billing</Th><Th>Paid On</Th><Th>Remarks</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pageRows.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-gray-900">₹{fmt(p.amount)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${MODE_STYLE[p.mode] ?? 'bg-gray-100 text-gray-600'}`}>
                          {p.mode}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{MONTHS[p.billing_month - 1]?.slice(0, 3)} {p.billing_year}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {p.paid_on ? new Date(p.paid_on + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{p.remarks ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}
        </>
      )}

      {showUpiModal && (
        <UpiPayModal
          villaNumber={villaNumber} userName={userName}
          upiId={upiId} bankDetails={bankDetails} defaultAmount={monthlyAmount}
          existingPayments={[...payments, ...pendingPayments]}
          onClose={() => setShowUpiModal(false)}
          onProceed={data => { setUpiModalData(data); setShowRecordModal(true) }}
        />
      )}
      {showRecordModal && upiModalData && (
        <RecordPaymentModal
          villaId={myVilla.id} villaNumber={villaNumber}
          userName={userName} userEmail={user?.email ?? ''}
          upiId={upiId} payData={upiModalData}
          onClose={() => { setShowRecordModal(false); setUpiModalData(null) }}
          onRecorded={handlePaymentRecorded}
        />
      )}
    </div>
  )
}

// ─── UPI pay modal (modal 1) ──────────────────────────────────────────────────

function UpiPayModal({ villaNumber, userName, upiId, bankDetails, defaultAmount, existingPayments = [], onClose, onProceed }) {
  const [amount,       setAmount]       = useState(defaultAmount > 0 ? String(defaultAmount) : '')
  const [billingMonth, setBillingMonth] = useState(getCurMonth)
  const [billingYear,  setBillingYear]  = useState(getCurYear)
  const [note,         setNote]         = useState('')
  const [payMethod,    setPayMethod]    = useState('upi') // 'upi', 'qr', 'bank'
  const [clickedApp,   setClickedApp]   = useState(null)

  const duplicate = existingPayments.find(
    p => p.billing_month === billingMonth && p.billing_year === billingYear
  )

  useEffect(() => {
    setNote(`Villa ${villaNumber} · ${MONTHS[billingMonth - 1]} ${billingYear} · ${userName}`.slice(0, 50))
  }, [villaNumber, userName, billingMonth, billingYear])

  const amountOk = amount && Number(amount) > 0
  const upiUrl = upiId && amountOk ? buildUpiUrl(upiId, Number(amount), note) : ''

  async function handleAppClick(appId) {
    if (!upiId || !amountOk) return
    const url = buildUpiUrl(upiId, Number(amount), note)
    const app = UPI_APPS.find(a => a.id === appId)

    if (window.Capacitor?.isNativePlatform()) {
      try {
        const { registerPlugin } = await import('@capacitor/core')
        const UpiPay = registerPlugin('UpiPay')
        await UpiPay.pay({ uri: url, package: app?.pkg || null })
      } catch (e) {
        console.warn('Native UPI failed, falling back:', e)
        window.location.href = url
      }
    } else {
      window.open(url, '_blank')
    }
    setClickedApp(appId)
  }

  // Method tabs available
  const methods = [
    { id: 'upi', label: 'UPI' },
    { id: 'qr', label: 'QR Code' },
    ...(bankDetails ? [{ id: 'bank', label: 'Bank Transfer' }] : []),
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Pay Maintenance Dues</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Paying for (month/year) */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Paying for</p>
            <div className="grid grid-cols-2 gap-3">
              <select value={billingMonth} onChange={e => setBillingMonth(Number(e.target.value))} className={inputCls}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select value={billingYear} onChange={e => setBillingYear(Number(e.target.value))} className={inputCls}>
                {getYearOptions().map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* Duplicate warning */}
          {duplicate && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-sm text-amber-700 font-medium">
                You already have a {duplicate.status === 'pending' ? 'pending' : 'recorded'} payment
                of ₹{fmt(duplicate.amount)} for {MONTHS[billingMonth - 1]} {billingYear}.
              </p>
              <p className="text-xs text-amber-600 mt-1">You can still proceed if this is an additional payment.</p>
            </div>
          )}

          {/* Amount */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Amount</p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
              <input type="number" min="1" step="0.01" value={amount}
                onChange={e => setAmount(e.target.value)} placeholder="0.00"
                className={inputCls + ' pl-7 text-lg font-semibold'} />
            </div>
          </div>

          {/* Payment method tabs */}
          {amountOk && (
            <>
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                {methods.map(m => (
                  <button key={m.id} onClick={() => { setPayMethod(m.id); setClickedApp(null) }}
                    className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-all ${
                      payMethod === m.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                    {m.label}
                  </button>
                ))}
              </div>

              {/* ── UPI: Deep link to app ── */}
              {payMethod === 'upi' && !clickedApp && (
                <div className="space-y-3">
                  <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
                    <p className="text-xs text-green-600 font-medium mb-1">Paying to</p>
                    <p className="text-base font-bold text-green-800 font-mono break-all">{upiId}</p>
                    <p className="text-xs text-green-500 mt-1">Ashirvadh Castle Rock</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {UPI_APPS.map(app => (
                      <button key={app.id} onClick={() => handleAppClick(app.id)}
                        disabled={!upiId}
                        className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border
                                    text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed
                                    ${app.bg}`}>
                        <UpiAppIcon appId={app.id} />
                        {app.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {payMethod === 'upi' && clickedApp && (
                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
                      <p className="text-sm text-blue-800 font-medium">
                        Complete the ₹{fmt(Number(amount))} payment, then come back
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setClickedApp(null)}
                      className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600
                                 border border-gray-200 hover:border-gray-300 rounded-lg transition">
                      Try another app
                    </button>
                    <button
                      onClick={() => onProceed({ amount: Number(amount), billingMonth, billingYear, appName: UPI_APPS.find(a => a.id === clickedApp)?.label ?? 'UPI', note })}
                      className="flex-1 px-4 py-2.5 text-sm font-semibold text-white
                                 bg-green-600 hover:bg-green-700 rounded-lg transition">
                      I've paid — record it
                    </button>
                  </div>
                </div>
              )}

              {/* ── QR Code ── */}
              {payMethod === 'qr' && (
                <div className="space-y-3">
                  <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col items-center">
                    <p className="text-xs text-gray-500 mb-3">Scan with any UPI app to pay ₹{fmt(Number(amount))}</p>
                    <QrCode value={upiUrl} />
                    <p className="text-xs text-gray-400 mt-3 font-mono break-all text-center">{upiId}</p>
                  </div>
                  <p className="text-xs text-gray-400 text-center">
                    Use another phone or your UPI app's scan feature
                  </p>
                  <button
                    onClick={() => onProceed({ amount: Number(amount), billingMonth, billingYear, appName: 'UPI (QR)', note })}
                    className="w-full px-4 py-3 text-sm font-semibold text-white
                               bg-green-600 hover:bg-green-700 rounded-xl transition">
                    I've paid — record it
                  </button>
                </div>
              )}

              {/* ── Bank Transfer ── */}
              {payMethod === 'bank' && bankDetails && (
                <div className="space-y-3">
                  <BankDetailsCard bankDetails={bankDetails} />
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
                    <p className="text-xs text-gray-500">Transfer this amount</p>
                    <p className="text-2xl font-black text-gray-900 mt-0.5">₹{fmt(Number(amount))}</p>
                    <p className="text-xs text-gray-400 mt-1">via IMPS / NEFT / bank app</p>
                  </div>
                  <button
                    onClick={() => onProceed({ amount: Number(amount), billingMonth, billingYear, appName: `Bank Transfer (${bankDetails.bank ?? 'IMPS/NEFT'})`, note })}
                    className="w-full px-4 py-3 text-sm font-semibold text-white
                               bg-green-600 hover:bg-green-700 rounded-xl transition">
                    I've transferred — record it
                  </button>
                </div>
              )}
            </>
          )}

          {!amountOk && (
            <p className="text-xs text-red-500 text-center">Enter an amount to see payment options</p>
          )}
        </div>
      </div>
    </div>
  )
}

function QrCode({ value }) {
  if (!value) return null
  return <QRCodeSVG value={value} size={200} level="M" includeMargin />
}

function BankDetailsCard({ bankDetails }) {
  const [copiedField, setCopiedField] = useState('')
  function copy(value, field) {
    navigator.clipboard.writeText(value)
    setCopiedField(field)
    setTimeout(() => setCopiedField(''), 2000)
  }
  const rows = [
    { label: 'Account Name', value: bankDetails.name, key: 'name' },
    { label: 'Account Number', value: bankDetails.number, key: 'number' },
    { label: 'IFSC Code', value: bankDetails.ifsc, key: 'ifsc' },
    { label: 'Bank', value: bankDetails.bank, key: 'bank' },
  ].filter(r => r.value)
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
      <p className="text-xs text-blue-600 font-medium">Transfer to this bank account</p>
      {rows.map(r => (
        <div key={r.key} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-blue-100">
          <div className="min-w-0">
            <p className="text-[10px] text-gray-400 uppercase">{r.label}</p>
            <p className="text-sm font-bold text-gray-900 font-mono break-all">{r.value}</p>
          </div>
          <button onClick={() => copy(r.value, r.key)}
            className="ml-2 px-2 py-1 text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200
                       hover:bg-blue-100 rounded transition shrink-0">
            {copiedField === r.key ? 'Copied!' : 'Copy'}
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── record payment modal (modal 2) ──────────────────────────────────────────

function RecordPaymentModal({ villaId, villaNumber, userName, userEmail, upiId, payData, onClose, onRecorded }) {
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const { amount, billingMonth, billingYear, appName, note } = payData

  async function handleSubmit() {
    setSaving(true); setError('')
    try {
      const { data, error: err } = await supabase
        .from('payments')
        .insert({
          villa_id:      villaId,
          amount,
          mode:          'UPI',
          billing_month: billingMonth,
          billing_year:  billingYear,
          paid_on:       getToday(),
          remarks:       `${appName} · ${note}`,
          recorded_by:   userName || userEmail,
          status:        'pending',
          initiated_by:  userEmail,
          status_changed_at: new Date().toISOString(),
        })
        .select('*, villas(villa_number, owner_name)')
        .single()
      if (err) throw err
      // Log the submission to audit trail
      await supabase.from('payment_audit').insert({
        payment_id: data.id,
        action: 'submitted',
        performed_by: userEmail,
        details: { amount, billing_month: billingMonth, billing_year: billingYear, mode: 'UPI', app: appName },
      })
      onRecorded(data)
    } catch (e) {
      setError(e.message ?? 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={saving ? undefined : onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md">

        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Record Payment</h2>
            <p className="text-xs text-gray-400 mt-0.5">Review details before submitting</p>
          </div>
          <button onClick={onClose} disabled={saving} className="text-gray-400 hover:text-gray-600 transition">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
          )}

          <div className="bg-gray-50 rounded-xl divide-y divide-gray-100 overflow-hidden border border-gray-100">
            <ReviewRow label="Villa"         value={`Villa ${villaNumber}`} />
            <ReviewRow label="UPI ID paid to" value={upiId || '—'} mono />
            <ReviewRow label="Amount"        value={`₹${fmt(amount)}`} highlight />
            <ReviewRow label="For"           value={`${MONTHS[billingMonth - 1]} ${billingYear}`} />
            <ReviewRow label="Paid via"      value={appName} />
            <ReviewRow label="Note"          value={note} />
            <ReviewRow label="Submitted by"  value={userName || userEmail} />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-xs text-amber-700">
              This will be marked <strong>pending</strong> until a board admin approves it.
            </p>
          </div>

          <div className="flex gap-3">
            <button onClick={onClose} disabled={saving}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600
                         border border-gray-200 hover:border-gray-300 rounded-lg transition disabled:opacity-50">
              Go Back
            </button>
            <button onClick={handleSubmit} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5
                         text-sm font-semibold text-white bg-green-600 hover:bg-green-700
                         disabled:bg-green-400 rounded-lg transition">
              {saving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {saving ? 'Submitting…' : 'Submit Payment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReviewRow({ label, value, mono, highlight }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-3">
      <span className="text-xs text-gray-500 font-medium shrink-0">{label}</span>
      <span className={`text-sm text-right break-all ${highlight ? 'font-bold text-green-700' : 'text-gray-800'} ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </span>
    </div>
  )
}

// ─── payment table row ────────────────────────────────────────────────────────

function PaymentRow({ payment: p, onEdit, onDelete, deleting, onUndo, undoing }) {
  // Show undo button for payments approved within the last 24 hours
  const canUndo = p.status_changed_at &&
    (getNow().getTime() - new Date(p.status_changed_at).getTime()) < 24 * 60 * 60 * 1000

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg
                         bg-green-50 text-green-700 font-bold text-sm shrink-0">
          {p.villas?.villa_number ?? '—'}
        </span>
      </td>
      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{p.villas?.owner_name ?? '—'}</td>
      <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">₹{fmt(p.amount)}</td>
      <td className="px-4 py-3">
        <span className={`px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${MODE_STYLE[p.mode] ?? 'bg-gray-100 text-gray-600'}`}>
          {p.mode}
        </span>
      </td>
      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{MONTHS[p.billing_month - 1]?.slice(0, 3)} {p.billing_year}</td>
      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
        {p.paid_on ? new Date(p.paid_on + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
      </td>
      <td className="px-4 py-3 text-gray-500 text-xs">{p.recorded_by || '—'}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          {canUndo && (
            <button onClick={onUndo} disabled={undoing}
              className="px-3 py-1.5 text-xs font-medium text-amber-600 border border-amber-200
                         hover:border-amber-300 hover:bg-amber-50 rounded-lg transition disabled:opacity-50">
              {undoing ? '…' : 'Undo'}
            </button>
          )}
          <button onClick={onEdit}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900
                       border border-gray-200 hover:border-gray-300 rounded-lg transition">Edit</button>
          <button onClick={onDelete} disabled={deleting}
            className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200
                       hover:border-red-300 hover:bg-red-50 rounded-lg transition disabled:opacity-50">
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
      ? { villa_id: editing.villa_id, amount: String(editing.amount), mode: editing.mode,
          billing_month: editing.billing_month, billing_year: editing.billing_year,
          paid_on: editing.paid_on, remarks: editing.remarks ?? '', recorded_by: editing.recorded_by ?? '' }
      : makeEmptyForm(user?.email)
  )
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  function set(field, value) { setForm(prev => ({ ...prev, [field]: value })) }

  async function handleSubmit(e) {
    e.preventDefault(); setError('')
    if (!form.villa_id) { setError('Please select a villa.'); return }
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) { setError('Enter a valid amount.'); return }
    setSaving(true)
    const payload = {
      villa_id: form.villa_id, amount: Number(form.amount), mode: form.mode,
      billing_month: Number(form.billing_month), billing_year: Number(form.billing_year),
      paid_on: form.paid_on, remarks: form.remarks.trim() || null,
      recorded_by: form.recorded_by.trim() || null,
    }
    try {
      if (isEdit) {
        const { data, error: err } = await supabase.from('payments').update(payload)
          .eq('id', editing.id).select('*, villas(villa_number, owner_name)').single()
        if (err) throw err
        onSaved(data, false)
      } else {
        const { data, error: err } = await supabase.from('payments').insert(payload)
          .select('*, villas(villa_number, owner_name)').single()
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
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{isEdit ? 'Edit Payment' : 'Record Payment'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition"><XIcon className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
          <Field label="Villa" required>
            <select required value={form.villa_id} onChange={e => set('villa_id', e.target.value)} className={inputCls}>
              <option value="">Select villa…</option>
              {villas.map(v => <option key={v.id} value={v.id}>{v.villa_number} – {v.owner_name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Amount (₹)" required>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                <input type="number" required min="1" step="0.01" value={form.amount}
                  onChange={e => set('amount', e.target.value)} placeholder="0.00" className={inputCls + ' pl-7'} />
              </div>
            </Field>
            <Field label="Payment Mode" required>
              <select value={form.mode} onChange={e => set('mode', e.target.value)} className={inputCls}>
                {MODES.map(m => <option key={m}>{m}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Month" required>
              <select value={form.billing_month} onChange={e => set('billing_month', Number(e.target.value))} className={inputCls}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </Field>
            <Field label="Year" required>
              <select value={form.billing_year} onChange={e => set('billing_year', Number(e.target.value))} className={inputCls}>
                {getYearOptions().map(y => <option key={y}>{y}</option>)}
              </select>
            </Field>
            <Field label="Paid On" required>
              <input type="date" required value={form.paid_on} onChange={e => set('paid_on', e.target.value)} className={inputCls} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Recorded By">
              <input type="text" value={form.recorded_by} onChange={e => set('recorded_by', e.target.value)}
                placeholder="Your name" className={inputCls} />
            </Field>
            <Field label="Remarks">
              <input type="text" value={form.remarks} onChange={e => set('remarks', e.target.value)}
                placeholder="Optional note" className={inputCls} />
            </Field>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900
                         border border-gray-200 hover:border-gray-300 rounded-lg transition">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700
                         disabled:bg-green-400 text-white text-sm font-semibold rounded-lg transition">
              {saving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── shared small components ──────────────────────────────────────────────────

function SummaryCard({ label, value, sub, color, icon: Icon }) {
  const colors = {
    green: { bg: 'bg-green-50', icon: 'text-green-600', val: 'text-green-700' },
    amber: { bg: 'bg-amber-50', icon: 'text-amber-600', val: 'text-amber-700' },
    blue:  { bg: 'bg-blue-50',  icon: 'text-blue-600',  val: 'text-blue-700'  },
    red:   { bg: 'bg-red-50',   icon: 'text-red-600',   val: 'text-red-700'   },
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
    <button disabled={disabled} onClick={onClick}
      className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium
                 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition">
      {children}
    </button>
  )
}

function ConfirmModal({ message, loading, onConfirm, onCancel, confirmLabel = 'Delete', confirmColor = 'red' }) {
  const colorMap = {
    red:   { bg: 'bg-red-600 hover:bg-red-700 disabled:bg-red-400', loadLabel: 'Deleting…' },
    green: { bg: 'bg-green-600 hover:bg-green-700 disabled:bg-green-400', loadLabel: 'Approving…' },
  }
  const c = colorMap[confirmColor] ?? colorMap.red
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={loading ? undefined : onCancel} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <p className="text-sm text-gray-800 font-medium mb-5">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200
                       hover:border-gray-300 rounded-lg transition disabled:opacity-50">Cancel</button>
          <button onClick={onConfirm} disabled={loading}
            className={`flex items-center gap-2 px-4 py-2 ${c.bg}
                       text-white text-sm font-semibold rounded-lg transition`}>
            {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {loading ? c.loadLabel : confirmLabel}
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
      <button onClick={onAdd}
        className="mt-4 flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                   text-white text-sm font-semibold rounded-lg transition">
        <PlusIcon className="w-4 h-4" /> Record first payment
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
    <th className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-${align} whitespace-nowrap`}>
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

function UpiAppIcon({ appId }) {
  const map = {
    gpay:    { letter: 'G', bg: 'bg-blue-600' },
    phonepe: { letter: 'P', bg: 'bg-purple-600' },
    paytm:   { letter: 'T', bg: 'bg-sky-500' },
    bhim:    { letter: 'U', bg: 'bg-orange-500' },
  }
  const { letter, bg } = map[appId] ?? { letter: '?', bg: 'bg-gray-400' }
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${bg} text-white text-[10px] font-black shrink-0`}>
      {letter}
    </span>
  )
}

function ClockIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
function PlusIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
}
function XIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
}
function DownloadIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
}
function CurrencyIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 8h6m-5 0a3 3 0 110 6H9l3 3m-3-6h6m6 1a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
}
function FlagIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21V3m0 4l9-2 9 2-9 2-9-2z" /></svg>
}
function ListIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
}
function PayIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
}
function AlertIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
}
