import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePageData } from '../hooks/usePageData'
import FetchError from '../components/FetchError'

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const EVENT_COLORS = {
  announcement: { dot: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  complaint:    { dot: 'bg-red-400',  bg: 'bg-red-50',  text: 'text-red-700',  border: 'border-red-200' },
  payment:      { dot: 'bg-green-500', bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
}

function startOfMonth(y, m) { return new Date(y, m, 1) }
function daysInMonth(y, m)  { return new Date(y, m + 1, 0).getDate() }

function fmtDate(d) {
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function Calendar() {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [events, setEvents] = useState([])
  const [selectedDay, setSelectedDay] = useState(null)

  const { loading, error: fetchError, retry } = usePageData(async () => {
    const startDate = new Date(year, month, 1).toISOString()
    const endDate   = new Date(year, month + 1, 0, 23, 59, 59).toISOString()

    const [annRes, compRes] = await Promise.all([
      supabase.from('announcements').select('id, title, audience, starts_at, ends_at, is_pinned, created_at')
        .or(`starts_at.is.null,starts_at.lte.${endDate}`)
        .or(`ends_at.is.null,ends_at.gte.${startDate}`)
        .order('created_at', { ascending: false }),
      supabase.from('complaints').select('id, title, status, priority, created_at')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false }),
    ])

    if (annRes.error) throw annRes.error
    if (compRes.error) throw compRes.error

    const mapped = []

    // Map announcements — place on starts_at or created_at
    for (const a of (annRes.data ?? [])) {
      const date = a.starts_at ?? a.created_at
      if (!date) continue
      mapped.push({
        id: `ann-${a.id}`, type: 'announcement',
        title: a.title, date: new Date(date),
        endDate: a.ends_at ? new Date(a.ends_at) : null,
        pinned: a.is_pinned, audience: a.audience,
      })
    }

    // Map complaints
    for (const c of (compRes.data ?? [])) {
      mapped.push({
        id: `comp-${c.id}`, type: 'complaint',
        title: c.title, date: new Date(c.created_at),
        status: c.status, priority: c.priority,
      })
    }

    setEvents(mapped)
  }, [year, month])

  // Build calendar grid
  const firstDay  = startOfMonth(year, month).getDay()
  const totalDays = daysInMonth(year, month)
  const today     = new Date()
  const isToday   = (d) => today.getFullYear() === year && today.getMonth() === month && today.getDate() === d

  // Group events by day number
  const eventsByDay = useMemo(() => {
    const map = {}
    for (const e of events) {
      const d = e.date
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate()
        if (!map[day]) map[day] = []
        map[day].push(e)
      }
    }
    return map
  }, [events, year, month])

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
    setSelectedDay(null)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setSelectedDay(null)
  }
  function goToday() {
    setYear(now.getFullYear()); setMonth(now.getMonth()); setSelectedDay(now.getDate())
  }

  const selectedEvents = selectedDay ? (eventsByDay[selectedDay] ?? []) : []

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Calendar</h1>
          <p className="text-sm text-gray-500 mt-0.5">Community events & announcements</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goToday}
            className="px-3 py-1.5 text-sm font-medium text-green-700 border border-green-200
                       hover:bg-green-50 rounded-lg transition">
            Today
          </button>
        </div>
      </div>

      {fetchError && <FetchError message={fetchError} onRetry={retry} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar grid */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 overflow-hidden">
          {/* Month nav */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition">
              <ChevronLeftIcon className="w-5 h-5 text-gray-600" />
            </button>
            <h2 className="text-base font-semibold text-gray-900">
              {MONTH_NAMES[month]} {year}
            </h2>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition">
              <ChevronRightIcon className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-gray-50">
            {DAY_LABELS.map(d => (
              <div key={d} className="px-1 py-2.5 text-center text-xs font-semibold text-gray-400 uppercase">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          {loading ? (
            <div className="h-72 flex items-center justify-center">
              <span className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {/* Empty cells before first day */}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`e-${i}`} className="h-20 border-b border-r border-gray-50 bg-gray-50/30" />
              ))}

              {/* Day cells */}
              {Array.from({ length: totalDays }).map((_, i) => {
                const day = i + 1
                const dayEvents = eventsByDay[day] ?? []
                const active = selectedDay === day
                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(active ? null : day)}
                    className={`h-20 border-b border-r border-gray-50 p-1.5 text-left
                               hover:bg-green-50/50 transition-colors flex flex-col
                               ${active ? 'bg-green-50 ring-2 ring-green-500 ring-inset' : ''}`}
                  >
                    <span className={`text-xs font-semibold leading-none
                      ${isToday(day) ? 'w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center' : 'text-gray-700'}`}>
                      {day}
                    </span>
                    {dayEvents.length > 0 && (
                      <div className="flex gap-0.5 mt-auto flex-wrap">
                        {dayEvents.slice(0, 3).map(e => (
                          <span key={e.id} className={`w-1.5 h-1.5 rounded-full ${EVENT_COLORS[e.type]?.dot ?? 'bg-gray-400'}`} />
                        ))}
                        {dayEvents.length > 3 && (
                          <span className="text-[9px] text-gray-400 font-medium">+{dayEvents.length - 3}</span>
                        )}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-4 px-5 py-3 border-t border-gray-50">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-xs text-gray-500">Announcement</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-xs text-gray-500">Complaint</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs text-gray-500">Payment</span>
            </div>
          </div>
        </div>

        {/* Right panel — selected day events */}
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          {selectedDay ? (
            <>
              <h3 className="font-semibold text-gray-900 mb-1">
                {MONTH_NAMES[month]} {selectedDay}, {year}
              </h3>
              <p className="text-xs text-gray-400 mb-4">
                {selectedEvents.length} event{selectedEvents.length !== 1 ? 's' : ''}
              </p>
              {selectedEvents.length === 0 ? (
                <p className="text-sm text-gray-400 py-8 text-center">No events on this day.</p>
              ) : (
                <div className="space-y-3">
                  {selectedEvents.map(e => {
                    const colors = EVENT_COLORS[e.type] ?? EVENT_COLORS.announcement
                    return (
                      <div key={e.id} className={`${colors.bg} border ${colors.border} rounded-lg p-3`}>
                        <div className="flex items-start gap-2">
                          <span className={`w-2 h-2 mt-1.5 rounded-full ${colors.dot} shrink-0`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold ${colors.text}`}>{e.title}</p>
                            <p className="text-xs text-gray-500 mt-0.5 capitalize">{e.type}</p>
                            {e.status && (
                              <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium bg-white/60 rounded-full">
                                {e.status}
                              </span>
                            )}
                            {e.endDate && (
                              <p className="text-xs text-gray-400 mt-1">
                                Until {fmtDate(e.endDate)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="py-12 text-center">
              <CalendarIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Select a day to view events</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ChevronLeftIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
}
function ChevronRightIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
}
function CalendarIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
}
