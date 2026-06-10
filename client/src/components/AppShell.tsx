import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import Icon from '@/components/ui/Icon'
import { Avatar } from '@/components/ui/Avatar'
import { IconButton } from '@/components/ui/Button'
import CountdownPill from '@/components/CountdownPill'
import PWAInstallBanner from '@/components/PWAInstallBanner'
import api from '@/api/client'
import type { CalEvent } from '@/types'

// ── Logo ─────────────────────────────────────────────────────
function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        background: 'var(--accent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <svg width={17} height={17} viewBox="0 0 24 24" fill="none"
          stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="3" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </div>
      <span style={{
        fontSize: 18,
        fontWeight: 800,
        letterSpacing: '-0.03em',
        color: 'var(--text-1)',
        lineHeight: 1,
      }}>
        Eventli
      </span>
    </div>
  )
}

// ── Nav items config ──────────────────────────────────────────
const NAV_ITEMS = [
  { to: '/calendar',  label: 'Calendar', icon: 'calendar', exact: false },
  { to: '/groups',    label: 'Groups',   icon: 'groups',   exact: false },
  { to: '/todo',      label: 'Tasks',    icon: 'task',     exact: false },
  { to: '/habits',    label: 'Habits',   icon: 'flame',    exact: false },
  { to: '/timers',    label: 'Timers',   icon: 'timer',    exact: false },
  { to: '/discovery', label: 'Discover', icon: 'discover', exact: false },
] as const

// ── Format time for "Up Next" card ───────────────────────────
function formatEventTime(event: CalEvent): string {
  if (event.allDay) return 'All day'
  const start = new Date(event.start)
  return start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ── "Up Next" sidebar card ────────────────────────────────────
function UpNextCard({ event }: { event: CalEvent }) {
  const time = formatEventTime(event)
  const venue = event.extendedProps?.groupName || 'Your event'

  return (
    <div style={{
      padding: 13,
      borderRadius: 'var(--r-md)',
      background: 'linear-gradient(150deg, var(--accent-soft), var(--accent-softer))',
      border: '1px solid var(--accent-line)',
    }}>
      <p style={{
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--accent)',
        marginBottom: 6,
      }}>
        UP NEXT · TONIGHT
      </p>
      <p style={{
        fontSize: 14,
        fontWeight: 700,
        color: 'var(--text-1)',
        marginBottom: 4,
        letterSpacing: '-0.01em',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {event.title}
      </p>
      <p style={{
        fontSize: 12,
        color: 'var(--text-2)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        marginBottom: 6,
      }}>
        {time} · {venue}
      </p>
      <CountdownPill targetDate={event.start} />
    </div>
  )
}

// ── Responsive hook ───────────────────────────────────────────
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isMobile
}

// ── Offline banner ────────────────────────────────────────────
function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine)
  const [visible, setVisible] = useState(!navigator.onLine)

  useEffect(() => {
    const goOffline = () => { setOffline(true); setVisible(true) }
    const goOnline  = () => {
      setOffline(false)
      // keep banner briefly to show "back online" state, then hide
      setTimeout(() => setVisible(false), 2000)
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online',  goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online',  goOnline)
    }
  }, [])

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      fontSize: 13,
      fontWeight: 600,
      background: offline ? 'hsl(0 0% 14%)' : 'hsl(152 60% 22%)',
      color: offline ? 'var(--text-2)' : 'hsl(152 80% 70%)',
      borderBottom: `1px solid ${offline ? 'var(--border)' : 'hsl(152 60% 30%)'}`,
      transition: 'background 0.3s, color 0.3s',
    }}>
      <Icon name={offline ? 'wifi-off' : 'check'} size={15} />
      {offline ? "You're offline · Changes won't save" : 'Back online'}
    </div>
  )
}

// ── AppShell ──────────────────────────────────────────────────
export default function AppShell() {
  const { user } = useAuthStore()
  const { unread, fetch: fetchNotifications } = useNotificationStore()
  const location = useLocation()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [upNext, setUpNext] = useState<CalEvent | null>(null)

  // Load notifications (for the bell badge) on mount and whenever the route changes
  useEffect(() => { fetchNotifications() }, [fetchNotifications, location.pathname])

  // Fetch upcoming events on mount
  useEffect(() => {
    api.get('/renderEvents')
      .then(({ data }) => {
        if (!data.success) return
        const events: CalEvent[] = data.events ?? []
        const now = Date.now()
        const upcoming = events
          .filter(e => new Date(e.start).getTime() > now)
          .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
        if (upcoming.length > 0) setUpNext(upcoming[0])
      })
      .catch(() => {})
  }, [])

  // ── Desktop sidebar ─────────────────────────────────────────
  const Sidebar = (
    <aside style={{
      width: 230,
      flexShrink: 0,
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      padding: '18px 12px 14px',
      gap: 0,
      height: '100dvh',
      position: 'sticky',
      top: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '0 4px 20px' }}>
        <Logo />
      </div>

      {/* Nav */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map(({ to, label, icon, exact }) => {
          const isActive = exact
            ? location.pathname === to
            : location.pathname.startsWith(to)
          return (
            <button
              key={to}
              className={`nav-item${isActive ? ' nav-item--on' : ''}`}
              onClick={() => navigate(to)}
            >
              <Icon name={icon} size={20} />
              {label}
            </button>
          )
        })}
      </nav>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Up next card */}
      {upNext && (
        <div style={{ marginBottom: 14 }}>
          <UpNextCard event={upNext} />
        </div>
      )}

      {/* User row */}
      <div style={{
        paddingTop: 12,
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 9,
      }}>
        <Avatar id="you" size={32} name={user?.username} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {user?.username || 'You'}
          </p>
          <p style={{
            fontSize: 11.5,
            color: 'var(--text-3)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {user?.email || ''}
          </p>
        </div>
        <IconButton
          name="bell"
          size={32}
          title="Notifications"
          badge={unread > 0}
          onClick={() => navigate('/notifications')}
        />
        <IconButton
          name="settings"
          size={32}
          title="Settings"
          onClick={() => navigate('/profile')}
        />
      </div>
    </aside>
  )

  // ── Mobile top bar ──────────────────────────────────────────
  const MobileTopBar = (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 16px',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      <Logo />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <IconButton name="bell" badge={unread > 0} title="Notifications" onClick={() => navigate('/notifications')} />
        <IconButton name="discover" title="Discover" onClick={() => navigate('/discovery')} />
      </div>
    </header>
  )

  // ── Mobile bottom nav ───────────────────────────────────────
  const MobileBottomNav = (
    <nav className="safe-bottom" style={{
      display: 'flex',
      borderTop: '1px solid var(--border)',
      background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      flexShrink: 0,
    }}>
      {NAV_ITEMS.map(({ to, label, icon, exact }) => {
        const isActive = exact
          ? location.pathname === to
          : location.pathname.startsWith(to)
        return (
          <button
            key={to}
            onClick={() => navigate(to)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '10px 0 12px',
              minHeight: 44,
              background: 'transparent',
              border: 'none',
              color: isActive ? 'var(--accent)' : 'var(--text-3)',
              fontWeight: isActive ? 700 : 500,
              fontSize: 10.5,
              letterSpacing: '0.01em',
              transition: 'var(--transition)',
              cursor: 'pointer',
            }}
          >
            <Icon
              name={icon}
              size={22}
              style={{ color: isActive ? 'var(--accent)' : 'var(--text-3)' }}
            />
            {label}
          </button>
        )
      })}
    </nav>
  )

  // ── Render ─────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        background: 'var(--bg)',
        overflow: 'hidden',
      }}>
        <OfflineBanner />
        {MobileTopBar}
        {/* Bottom nav is a flex sibling (not an overlay), so the scroll area
            needs no padding compensation — it would render as dead space. */}
        <main className="app-scroll" style={{
          flex: 1,
          overflowY: 'auto',
          minHeight: 0,
        }}>
          <Outlet />
        </main>
        {MobileBottomNav}
        <PWAInstallBanner />
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      height: '100dvh',
      background: 'var(--bg)',
      overflow: 'hidden',
    }}>
      <OfflineBanner />
      {Sidebar}
      <main className="app-scroll" style={{
        flex: 1,
        overflowY: 'auto',
        minWidth: 0,
      }}>
        <Outlet />
      </main>
      <PWAInstallBanner />
    </div>
  )
}
