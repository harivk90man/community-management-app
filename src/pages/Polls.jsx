import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { usePageData } from '../hooks/usePageData'
import FetchError from '../components/FetchError'

function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isPollActive(poll) {
  if (!poll.is_active) return false
  if (poll.closes_at && new Date(poll.closes_at) < new Date()) return false
  return true
}

function countVotes(votes, options) {
  const total = votes.length
  return options.map(opt => ({
    option: opt,
    count:  votes.filter(v => v.selected_option === opt).length,
    pct:    total ? Math.round(votes.filter(v => v.selected_option === opt).length / total * 100) : 0,
  }))
}

const EMPTY_FORM = { question: '', options: '', closes_at: '' }

export default function Polls() {
  const { villa: myVilla, role, user } = useAuth()
  const [tab, setTab]           = useState('active')    // 'active' | 'closed'
  const [polls, setPolls]       = useState([])
  const [myVotes, setMyVotes]   = useState([])          // poll_votes for myVilla
  const [showForm, setShowForm] = useState(false)
  const [voting, setVoting]     = useState({})           // { [pollId]: option }
  const [submitting, setSubmitting] = useState(null)
  const [voteError, setVoteError]   = useState('')
  const [closing, setClosing]   = useState(null)

  const { loading, error: fetchError, retry } = usePageData(async () => {
    const [pollsRes, votesRes] = await Promise.all([
      supabase.from('polls').select('*, poll_votes(*)').order('created_at', { ascending: false }),
      myVilla?.id
        ? supabase.from('poll_votes').select('poll_id,selected_option').eq('villa_id', myVilla.id)
        : Promise.resolve({ data: [] }),
    ])
    if (pollsRes.error) throw pollsRes.error
    if (votesRes.error) throw votesRes.error
    setPolls(pollsRes.data ?? [])
    setMyVotes(votesRes.data ?? [])
  }, [myVilla?.id])

  function onPollCreated(poll) {
    setPolls(prev => [{ ...poll, poll_votes: [] }, ...prev])
    setShowForm(false)
  }

  async function handleVote(pollId, option) {
    if (!myVilla?.id) return
    setSubmitting(pollId)
    setVoteError('')
    try {
      const { error } = await supabase.from('poll_votes').insert({
        poll_id: pollId, villa_id: myVilla.id, selected_option: option,
      })
      if (error) throw error
      setMyVotes(prev => [...prev, { poll_id: pollId, selected_option: option }])
      setPolls(prev => prev.map(p => p.id === pollId
        ? { ...p, poll_votes: [...(p.poll_votes ?? []), { poll_id: pollId, villa_id: myVilla.id, selected_option: option }] }
        : p
      ))
    } catch (e) { setVoteError(e.message ?? 'Failed to submit vote.') } finally { setSubmitting(null) }
  }

  async function handleClose(pollId) {
    setClosing(pollId)
    await supabase.from('polls').update({ is_active: false }).eq('id', pollId)
    setPolls(prev => prev.map(p => p.id === pollId ? { ...p, is_active: false } : p))
    setClosing(null)
  }

  const activePolls = polls.filter(p => isPollActive(p))
  const closedPolls = polls.filter(p => !isPollActive(p))
  const displayed   = tab === 'active' ? activePolls : closedPolls

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Polls</h1>
          <p className="text-sm text-gray-500 mt-0.5">{activePolls.length} active · {closedPolls.length} closed</p>
        </div>
        {role === 'board' && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                       text-white text-sm font-semibold rounded-lg transition">
            <PlusIcon className="w-4 h-4" /> Create Poll
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-6">
        {['active', 'closed'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 text-sm font-medium rounded-lg transition capitalize
              ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'active' ? `Active (${activePolls.length})` : `Closed (${closedPolls.length})`}
          </button>
        ))}
      </div>

      {fetchError && <FetchError message={fetchError} onRetry={retry} />}

      {voteError && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {voteError}
        </div>
      )}

      {loading ? <PollSkeleton /> : displayed.length === 0 ? (
        <EmptyState message={tab === 'active' ? 'No active polls.' : 'No closed polls yet.'} />
      ) : (
        <div className="space-y-4 max-w-2xl">
          {displayed.map(poll => {
            const myVote = myVotes.find(v => v.poll_id === poll.id)
            const votes  = poll.poll_votes ?? []
            const opts   = Array.isArray(poll.options) ? poll.options : []
            const results = countVotes(votes, opts)
            const showResults = role === 'board' || !!myVote || !isPollActive(poll)

            return (
              <PollCard
                key={poll.id}
                poll={poll}
                results={results}
                totalVotes={votes.length}
                myVote={myVote}
                showResults={showResults}
                selectedOption={voting[poll.id] ?? ''}
                onSelectOption={opt => setVoting(v => ({ ...v, [poll.id]: opt }))}
                onVote={() => handleVote(poll.id, voting[poll.id])}
                submitting={submitting === poll.id}
                canClose={role === 'board' && isPollActive(poll)}
                onClose={() => handleClose(poll.id)}
                closing={closing === poll.id}
              />
            )
          })}
        </div>
      )}

      {showForm && (
        <CreatePollModal user={user} onCreated={onPollCreated} onClose={() => setShowForm(false)} />
      )}
    </div>
  )
}

// ─── poll card ────────────────────────────────────────────────────────────────

function PollCard({ poll, results, totalVotes, myVote, showResults, selectedOption,
                    onSelectOption, onVote, submitting, canClose, onClose, closing }) {
  const active = isPollActive(poll)

  return (
    <div className={`bg-white rounded-xl border p-5 ${active ? 'border-gray-100' : 'border-gray-100 opacity-90'}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 text-xs font-semibold rounded-full
              ${active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {active ? 'Active' : 'Closed'}
            </span>
            <span className="text-xs text-gray-400">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</span>
            {poll.closes_at && (
              <span className="text-xs text-gray-400">
                {active ? `Closes ${fmtDate(poll.closes_at)}` : `Closed ${fmtDate(poll.closes_at)}`}
              </span>
            )}
          </div>
          <p className="font-semibold text-gray-900">{poll.question}</p>
        </div>
        {canClose && (
          <button onClick={onClose} disabled={closing}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200
                       hover:border-gray-300 rounded-lg transition disabled:opacity-50 shrink-0">
            {closing ? '…' : 'Close Poll'}
          </button>
        )}
      </div>

      {/* Options: voting or results */}
      {showResults ? (
        <ResultsBars results={results} totalVotes={totalVotes} myVote={myVote?.selected_option} />
      ) : (
        <div className="space-y-2">
          {results.map(r => (
            <button key={r.option} onClick={() => onSelectOption(r.option)}
              className={`w-full text-left px-4 py-3 rounded-lg border text-sm font-medium transition
                ${selectedOption === r.option
                  ? 'border-green-500 bg-green-50 text-green-800'
                  : 'border-gray-200 hover:border-gray-300 text-gray-700'}`}>
              {r.option}
            </button>
          ))}
          <button onClick={onVote} disabled={!selectedOption || submitting}
            className="mt-2 flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
                       disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold
                       rounded-lg transition">
            {submitting && <Spinner />}{submitting ? 'Submitting…' : 'Submit Vote'}
          </button>
        </div>
      )}

      {myVote && (
        <p className="mt-3 text-xs text-green-600">
          ✓ You voted: <span className="font-semibold">{myVote.selected_option}</span>
        </p>
      )}
    </div>
  )
}

function ResultsBars({ results, totalVotes, myVote }) {
  return (
    <div className="space-y-2.5">
      {results.map(r => (
        <div key={r.option}>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className={`font-medium ${r.option === myVote ? 'text-green-700' : 'text-gray-700'}`}>
              {r.option}
              {r.option === myVote && <span className="ml-1 text-xs text-green-600">(your vote)</span>}
            </span>
            <span className="text-gray-500 text-xs">{r.count} · {r.pct}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500
                ${r.option === myVote ? 'bg-green-500' : 'bg-green-200'}`}
              style={{ width: totalVotes ? `${r.pct}%` : '0%' }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── create poll modal ────────────────────────────────────────────────────────

function CreatePollModal({ user, onCreated, onClose }) {
  const [form, setForm]     = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSubmit(e) {
    e.preventDefault(); setError('')
    const opts = form.options.split(',').map(o => o.trim()).filter(Boolean)
    if (opts.length < 2) { setError('Enter at least 2 comma-separated options.'); return }
    setSaving(true)
    try {
      const { data, error: err } = await supabase.from('polls').insert({
        question:   form.question.trim(),
        options:    opts,
        closes_at:  form.closes_at || null,
        is_active:  true,
        created_by: user?.email ?? null,
      }).select().single()
      if (err) throw err; onCreated(data)
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <Modal title="Create Poll" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <ErrorBox msg={error} />}
        <Field label="Question" required>
          <input type="text" required value={form.question}
            onChange={e => set('question', e.target.value)}
            placeholder="What would you like to ask?" className={inputCls} />
        </Field>
        <Field label="Options (comma-separated)" required>
          <input type="text" required value={form.options}
            onChange={e => set('options', e.target.value)}
            placeholder="e.g. Yes, No, Abstain" className={inputCls} />
          <p className="text-xs text-gray-400">Separate each option with a comma</p>
        </Field>
        <Field label="Closes At (optional)">
          <input type="datetime-local" value={form.closes_at}
            onChange={e => set('closes_at', e.target.value)} className={inputCls} />
        </Field>

        {/* Preview */}
        {form.options && (
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs font-medium text-gray-500 mb-2">Preview options:</p>
            <div className="flex flex-wrap gap-1.5">
              {form.options.split(',').map(o => o.trim()).filter(Boolean).map((o, i) => (
                <span key={i} className="px-2.5 py-1 text-xs bg-white border border-gray-200 rounded-lg text-gray-700">
                  {o}
                </span>
              ))}
            </div>
          </div>
        )}

        <ModalFooter saving={saving} label="Create Poll" onCancel={onClose} />
      </form>
    </Modal>
  )
}

// ─── shared ───────────────────────────────────────────────────────────────────

function PollSkeleton() {
  return (
    <div className="space-y-4 max-w-2xl">
      {[1,2].map(i => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div className="h-5 w-3/4 bg-gray-100 rounded animate-pulse" />
          <div className="space-y-2">
            {[1,2,3].map(j => <div key={j} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}
          </div>
        </div>
      ))}
    </div>
  )
}
function EmptyState({ message }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 py-16 text-center max-w-2xl">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
        <ChartIcon className="w-6 h-6 text-gray-400" />
      </div>
      <p className="text-gray-500 font-medium">{message}</p>
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
        {saving && <Spinner />}{saving ? 'Saving…' : label}
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
function ErrorBox({ msg }) {
  return <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{msg}</div>
}
function Spinner() {
  return <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
}
const inputCls = `w-full px-3 py-2 text-sm border border-gray-200 rounded-lg
  focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition`
function PlusIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
}
function XIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
}
function ChartIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
}
