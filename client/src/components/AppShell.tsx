import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useNotificationStore } from '@/store/notificationStore'
import Icon from '@/components/ui/Icon'
import { IconButton } from '@/components/ui/Button'
import PWAInstallBanner from '@/components/PWAInstallBanner'

// ── Nav items config ──────────────────────────────────────────
// Desktop sidebar uses `label`; the phone bottom nav uses `short` and adds "Me".
const NAV_ITEMS = [
  { to: '/calendar',  label: 'Calendar',         short: 'Calendar', icon: 'calendar', exact: false },
  { to: '/todo',      label: 'Tasks & shopping', short: 'Tasks',    icon: 'task',     exact: false },
  { to: '/groups',    label: 'Groups',           short: 'Groups',   icon: 'groups',   exact: false },
  { to: '/habits',    label: 'Habits',           short: 'Habits',   icon: 'flame',    exact: false },
] as const

const MOBILE_NAV = [
  ...NAV_ITEMS,
  { to: '/profile', label: 'Me', short: 'Me', icon: 'profile', exact: false },
] as const

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
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
      paddingTop: 'calc(10px + env(safe-area-inset-top, 0px))',
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

  // Load notifications (for the bell badge) on mount and whenever the route changes
  useEffect(() => { fetchNotifications() }, [fetchNotifications, location.pathname])

  // ── Desktop sidebar ─────────────────────────────────────────
  const Sidebar = (
    <aside style={{
      width: 220,
      flexShrink: 0,
      background: 'var(--bg-deep)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      padding: '16px 12px',
      gap: 4,
      height: '100%',
      position: 'sticky',
      top: 0,
    }}>
      {/* Wordmark */}
      <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text-1)', padding: '4px 10px 16px' }}>
        eventli
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
              <Icon name={icon} size={18} />
              {label}
            </button>
          )
        })}
      </nav>

      {/* Pages can portal sidebar content here (the calendar filter) */}
      <div id="sidebar-slot" className="scroll" style={{ minHeight: 0, overflowY: 'auto' }} />

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* User row */}
      <div style={{
        padding: '8px 4px 0 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <span style={{
          width: 28, height: 28, borderRadius: 14, background: 'var(--accent)', color: 'var(--accent-text)',
          fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{(user?.username || 'You').slice(0, 2).toUpperCase()}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--text-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {user?.username || 'You'}
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

  // ── Mobile bottom nav ───────────────────────────────────────
  const MobileBottomNav = (
    <nav className="safe-bottom" style={{
      display: 'flex',
      borderTop: '1px solid var(--border)',
      padding: '4px 4px 0',
      background: 'color-mix(in srgb, var(--bg) 96%, transparent)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      flexShrink: 0,
    }}>
      {MOBILE_NAV.map(({ to, short, icon, exact }) => {
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
              justifyContent: 'center',
              gap: 3,
              height: 56,
              background: 'transparent',
              border: 'none',
              color: isActive ? 'var(--text-1)' : 'var(--text-3)',
              fontWeight: 500,
              fontSize: 11,
              transition: 'var(--transition)',
              cursor: 'pointer',
            }}
          >
            <Icon
              name={icon}
              size={22}
              style={{ color: isActive ? 'var(--text-1)' : 'var(--text-3)' }}
            />
            {short}
          </button>
        )
      })}
    </nav>
  )

  // ── Render ─────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="app-viewport" style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
        overflow: 'hidden',
      }}>
        <OfflineBanner />
        {/* Bottom nav is a flex sibling (not an overlay), so the scroll area
            needs no padding compensation — it would render as dead space. */}
        <main className="app-scroll safe-top" style={{
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
    <div className="app-viewport" style={{
      display: 'flex',
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
