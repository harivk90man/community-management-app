import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const NAV_ITEMS = [
  { to: '/',               label: 'Dashboard',          icon: HomeIcon },
  { to: '/villas',         label: 'Villas',             icon: BuildingIcon },
  { to: '/payments',       label: 'Payments',           icon: CurrencyIcon },
  { to: '/complaints',     label: 'Complaints',         icon: FlagIcon },
  { to: '/announcements',  label: 'Announcements',      icon: MegaphoneIcon },
  { to: '/board-members',  label: 'Board Members',      icon: BadgeIcon },
  { to: '/documents',      label: 'Documents',          icon: DocumentIcon },
  { to: '/visitors',       label: 'Visitors',           icon: UsersIcon },
  { to: '/vendors',        label: 'Vendors',            icon: BriefcaseIcon },
  { to: '/emergency',      label: 'Emergency Contacts', icon: PhoneIcon },
  { to: '/polls',          label: 'Polls',              icon: ChartIcon },
  { to: '/analytics',     label: 'Analytics',          icon: AnalyticsIcon },
]

const BOARD_ONLY_ITEMS = [
  { to: '/expenses',    label: 'Expenses',    icon: ReceiptIcon },
  { to: '/dues-config', label: 'Dues Config', icon: CogIcon },
]

// Bottom nav shows 5 most-used pages (icons only on mobile)
const BOTTOM_NAV = [
  { to: '/',              label: 'Dashboard',     icon: HomeIcon },
  { to: '/villas',        label: 'Villas',        icon: BuildingIcon },
  { to: '/payments',      label: 'Payments',      icon: CurrencyIcon },
  { to: '/complaints',    label: 'Complaints',    icon: FlagIcon },
  { to: '/announcements', label: 'Announcements', icon: MegaphoneIcon },
]

export default function Layout() {
  const { villa, role, logout } = useAuth()
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [badges, setBadges] = useState({ complaints: 0, announcements: 0 })

  useEffect(() => {
    async function fetchBadges() {
      const [{ count: pendingComplaints }, { count: activeAnnouncements }] = await Promise.all([
        supabase.from('complaints').select('*', { count: 'exact', head: true }).eq('status', 'Pending'),
        supabase.from('announcements').select('*', { count: 'exact', head: true })
          .in('audience', ['All', 'Owners'])
          .or(`ends_at.is.null,ends_at.gte.${new Date().toISOString()}`),
      ])
      setBadges({
        complaints: pendingComplaints ?? 0,
        announcements: activeAnnouncements ?? 0,
      })
    }
    fetchBadges()
    const interval = setInterval(fetchBadges, 60000)
    return () => clearInterval(interval)
  }, [])

  async function handleLogout() {
    setDrawerOpen(false)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ── Desktop Sidebar (hidden on mobile) ── */}
      <aside className="hidden md:flex w-64 flex-col bg-white border-r border-gray-100 shrink-0">

        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-600 flex items-center justify-center shrink-0">
              <HouseIcon className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 leading-tight truncate">Ashirvadh</p>
              <p className="text-xs text-gray-400 leading-tight truncate">Castle Rock Association</p>
            </div>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV_ITEMS.map(item => (
            <SidebarLink key={item.to} {...item}
              badge={item.to === '/complaints' ? badges.complaints
                   : item.to === '/announcements' ? badges.announcements : 0} />
          ))}
          {role === 'board' && (
            <>
              <div className="px-3 pt-4 pb-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Board</p>
              </div>
              {BOARD_ONLY_ITEMS.map(item => (
                <SidebarLink key={item.to} {...item} />
              ))}
            </>
          )}
        </nav>

        {/* Branding */}
        <div className="px-4 pb-2">
          <p className="text-xs text-gray-400 text-center">Built by Hariharan · v1.0</p>
        </div>

        {/* User footer */}
        <div className="border-t border-gray-100 px-4 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
              <span className="text-sm font-semibold text-green-700">
                {villa?.owner_name?.[0]?.toUpperCase() ?? '?'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{villa?.owner_name ?? 'Resident'}</p>
              <p className="text-xs text-gray-400 truncate">Villa {villa?.villa_number ?? '—'}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top bar */}
        <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-4 md:px-6 shrink-0">

          {/* Mobile: logo + name */}
          <div className="flex items-center gap-2.5 md:hidden">
            <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center shrink-0">
              <HouseIcon className="w-4 h-4 text-white" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold text-gray-900">Ashirvadh</p>
              <p className="text-xs text-gray-400">Castle Rock</p>
            </div>
          </div>

          {/* Desktop: empty left placeholder */}
          <div className="hidden md:block" />

          {/* Desktop right: user info + sign out */}
          <div className="hidden md:flex items-center gap-4">
            <span className="text-sm text-gray-500">
              {villa?.owner_name ?? ''}{villa ? ` · Villa ${villa.villa_number}` : ''}
              {role === 'board' && (
                <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                  Board
                </span>
              )}
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition"
            >
              <LogoutIcon className="w-4 h-4" />
              <span>Sign out</span>
            </button>
          </div>

          {/* Mobile: hamburger button */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="md:hidden p-1.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition"
            aria-label="Open menu"
          >
            <MenuIcon className="w-5 h-5" />
          </button>
        </header>

        {/* Page content — extra bottom padding on mobile to clear the bottom nav */}
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          <Outlet />
        </main>
      </div>

      {/* ── Mobile Drawer ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer panel */}
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-2xl flex flex-col">

            {/* Drawer header: logo + close */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-green-600 flex items-center justify-center shrink-0">
                  <HouseIcon className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 leading-tight">Ashirvadh</p>
                  <p className="text-xs text-gray-400 leading-tight">Castle Rock Association</p>
                </div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
                aria-label="Close menu"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* User info */}
            <div className="px-4 py-3 bg-green-50 border-b border-green-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-green-600 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-white">
                    {villa?.owner_name?.[0]?.toUpperCase() ?? '?'}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {villa?.owner_name ?? 'Resident'}
                  </p>
                  <p className="text-xs text-gray-500">
                    Villa {villa?.villa_number ?? '—'}
                    {role === 'board' && (
                      <span className="ml-1.5 px-1.5 py-0.5 text-xs font-medium bg-green-200 text-green-800 rounded-full">
                        Board
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Nav links */}
            <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
              {NAV_ITEMS.map(item => (
                <DrawerLink key={item.to} {...item} onClose={() => setDrawerOpen(false)}
                  badge={item.to === '/complaints' ? badges.complaints
                       : item.to === '/announcements' ? badges.announcements : 0} />
              ))}
              {role === 'board' && (
                <>
                  <div className="px-3 pt-4 pb-1">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Board</p>
                  </div>
                  {BOARD_ONLY_ITEMS.map(item => (
                    <DrawerLink key={item.to} {...item} onClose={() => setDrawerOpen(false)} />
                  ))}
                </>
              )}
            </nav>

            {/* Branding + sign out */}
            <div className="border-t border-gray-100">
              <div className="px-4 pt-2 pb-1">
                <p className="text-xs text-gray-400 text-center">Built by Hariharan · v1.0</p>
              </div>
              <div className="px-3 pb-4">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                             text-sm font-medium text-red-600 hover:bg-red-50 transition"
                >
                  <LogoutIcon className="w-4 h-4 shrink-0" />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile Bottom Navigation ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200
                      md:hidden flex items-stretch h-16">
        {BOTTOM_NAV.map(item => (
          <BottomNavItem key={item.to} {...item} />
        ))}
      </nav>
    </div>
  )
}

// ── Link components ────────────────────────────────────────────────────────────

function SidebarLink({ to, label, icon: Icon, badge = 0 }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-green-50 text-green-700'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`
      }
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1">{label}</span>
      {badge > 0 && (
        <span className="ml-auto px-1.5 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full min-w-[20px] text-center">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  )
}

function DrawerLink({ to, label, icon: Icon, onClose, badge = 0 }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onClose}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-green-50 text-green-700'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`
      }
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1">{label}</span>
      {badge > 0 && (
        <span className="ml-auto px-1.5 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full min-w-[20px] text-center">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  )
}

function BottomNavItem({ to, label, icon: Icon }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
          isActive ? 'text-green-600' : 'text-gray-400 hover:text-gray-600'
        }`
      }
    >
      <Icon className="w-5 h-5 shrink-0" />
      <span className="text-[10px] font-medium">{label}</span>
    </NavLink>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function HouseIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 22V12h6v10" />
    </svg>
  )
}
function MenuIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
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
function HomeIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 22V12h6v10" />
    </svg>
  )
}
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
function BadgeIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}
function DocumentIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}
function UsersIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M17 20h5v-2a4 4 0 00-5-5M9 20H4v-2a4 4 0 015-5m6 0a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  )
}
function BriefcaseIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}
function PhoneIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  )
}
function ChartIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}
function ReceiptIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  )
}
function CogIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}
function AnalyticsIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
    </svg>
  )
}
function LogoutIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  )
}
