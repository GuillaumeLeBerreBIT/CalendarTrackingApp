import { useState, useEffect, type FormEvent } from 'react'
import { useAuthStore } from '@/store/authStore'
import api from '@/api/client'
import Icon from '@/components/ui/Icon'
import Button from '@/components/ui/Button'
import { Section, Tag, Progress } from '@/components/ui/Primitives'
import { Link } from 'react-router-dom'
import { subscribeToPush } from '@/lib/pushNotifications'
import { BILLING_ENABLED } from '@/lib/billing'
import type { NotificationPrefs, ProfileStats } from '@/types'

// ── Toggle switch ───────────────────────────────────────────────────────────────
function Switch({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onChange}
      style={{
        width: 42,
        height: 24,
        borderRadius: 99,
        border: 'none',
        cursor: 'pointer',
        background: on ? 'var(--accent)' : 'var(--surface-3)',
        position: 'relative',
        transition: 'var(--transition)',
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute',
        top: 3,
        left: on ? 21 : 3,
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: '#fff',
        transition: 'var(--transition)',
      }} />
    </button>
  )
}

// Browser's IANA zone, e.g. "Europe/Paris" — sent with daily-summary saves.
const BROWSER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

// Snap a "HH:MM" string to the nearest 15-minute grid point (mirrors the
// server's normalizeTime so the optimistic UI matches what gets stored).
function snap15(t: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t)
  if (!m) return t
  let hh = +m[1]
  let mm = Math.round(+m[2] / 15) * 15
  if (mm === 60) { mm = 0; hh = (hh + 1) % 24 }
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

type NotifToggleKey = 'group_invites' | 'event_invites' | 'rsvp_replies' | 'event_changes'

const NOTIF_PREF_ROWS: { key: NotifToggleKey; label: string; sub: string }[] = [
  { key: 'group_invites', label: 'Group invites', sub: 'When someone invites you to a group' },
  { key: 'event_invites', label: 'Event invites', sub: 'When you\'re added to a group event' },
  { key: 'rsvp_replies',  label: 'RSVP replies',  sub: 'When people respond to your events' },
  { key: 'event_changes', label: 'Event changes', sub: 'When an event you\'re in is edited or cancelled' },
]

// Maps a subscribeToPush() failure reason → user-facing explanation.
const PUSH_ERROR_COPY: Record<string, string> = {
  unsupported: 'This device or browser can’t receive push notifications. On iPhone/iPad you must first add Eventli to your Home Screen and open it from there (iOS 16.4+).',
  'insecure-context': 'Push needs a secure (HTTPS) connection. Open Eventli over https://.',
  'permission-denied': 'Notifications are blocked for Eventli. Enable them in your browser/OS settings for this site, then try again.',
  'permission-dismissed': 'The permission prompt wasn’t granted. Tap Enable again and choose Allow.',
  'no-vapid-key': 'The server isn’t configured for push yet (missing VAPID key). Contact the admin.',
  'subscribe-failed': 'Could not register with the push service. Try again in a moment.',
  'server-failed': 'Subscribed on this device but the server didn’t save it. Try again.',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--surface-2)',
  border: '1px solid var(--border-2)',
  borderRadius: 'var(--r-sm)',
  padding: '9px 12px',
  fontSize: 13.5,
  color: 'var(--text-1)',
  outline: 'none',
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ n, label }: { n: number | string; label: string }) {
  return (
    <div style={{
      padding: '18px 16px',
      borderRadius: 'var(--r-lg)',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: 28,
        fontWeight: 800,
        color: 'var(--text-1)',
        letterSpacing: '-0.03em',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1,
      }}>
        {n}
      </div>
      <div style={{
        fontSize: 12,
        color: 'var(--text-3)',
        marginTop: 6,
        fontWeight: 500,
      }}>
        {label}
      </div>
    </div>
  )
}

// ── Settings row ──────────────────────────────────────────────────────────────
interface SettingsRowProps {
  icon: string
  title: string
  subtitle: string
  first?: boolean
}

function SettingsRow({ icon, title, subtitle, first = false }: SettingsRowProps) {
  const [hover, setHover] = useState(false)
  return (
    <div
      role="button"
      tabIndex={0}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '13px 16px',
        minHeight: 44,
        borderTop: first ? 'none' : '1px solid var(--border)',
        cursor: 'pointer',
        background: hover ? 'var(--surface-2)' : 'transparent',
        transition: 'var(--transition)',
      }}
    >
      {/* Icon square */}
      <div style={{
        width: 36,
        height: 36,
        borderRadius: 'var(--r-sm)',
        background: 'var(--surface-3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: 'var(--accent)',
      }}>
        <Icon name={icon} size={17} sw={1.8} />
      </div>
      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{title}</p>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>{subtitle}</p>
      </div>
      {/* Chevron */}
      <Icon name="chevR" size={15} sw={2} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { user, fetchMe, logout } = useAuthStore()
  const [editing, setEditing] = useState(false)
  const [username, setUsername] = useState(user?.username ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  // ── iCal import ──────────────────────────────────────────────────────────────
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const [editingCity, setEditingCity] = useState(false)
  const [city, setCity] = useState(user?.city ?? '')
  const [savingCity, setSavingCity] = useState(false)

  const [searchable, setSearchable] = useState<boolean>(user?.searchable ?? true)
  const [privacyOpen, setPrivacyOpen] = useState(false)

  async function handleSearchableToggle(next: boolean) {
    setSearchable(next)
    api.patch('/profile', { searchable: next }).catch(() => setSearchable(!next))
  }

  // ── Stripe billing portal ─────────────────────────────────────────────────────
  const [portalLoading, setPortalLoading] = useState(false)

  async function handleManageBilling() {
    setPortalLoading(true)
    try {
      const { data } = await api.post('/billing/portal')
      if (data.success && data.url) window.location.href = data.url
    } catch {
      setMessage('Could not open billing portal. Please try again.')
      setIsError(true)
    } finally {
      setPortalLoading(false)
    }
  }

  // ── Data export & account deletion (GDPR) ─────────────────────────────────────
  const [exporting, setExporting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  async function handleExport() {
    setExporting(true)
    try {
      const res = await api.get('/account/export', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'eventli-data.json'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setMessage('Could not export your data. Please try again.')
      setIsError(true)
    } finally {
      setExporting(false)
    }
  }

  async function handleDeleteAccount(e: FormEvent) {
    e.preventDefault()
    setDeleting(true)
    setDeleteError('')
    try {
      const { data } = await api.post('/account/delete', { password: deletePassword })
      if (data.success) {
        // Account is gone — drop client state and bounce to login.
        window.location.href = '/login'
      } else {
        setDeleteError(data.error ?? 'Could not delete your account.')
      }
    } catch (err: any) {
      setDeleteError(err?.response?.data?.error ?? 'Could not delete your account.')
    } finally {
      setDeleting(false)
    }
  }

  // ── Plan & usage ─────────────────────────────────────────────────────────────
  interface Usage {
    plan: string
    alwaysFree: boolean
    tier: string
    groups: { used: number; max: number }
    eventsThisMonth: { used: number; max: number }
  }
  const [usage, setUsage] = useState<Usage | null>(null)
  useEffect(() => {
    api.get('/usage')
      .then(({ data }) => {
        if (data.success) setUsage({
          plan: data.plan,
          alwaysFree: !!data.alwaysFree,
          tier: data.tier,
          groups: data.groups,
          eventsThisMonth: data.eventsThisMonth,
        })
      })
      .catch(() => {})
  }, [])

  const [stats, setStats] = useState<ProfileStats | null>(null)
  useEffect(() => {
    api.get('/profile/stats')
      .then(({ data }) => {
        if (data.success) setStats({
          eventsThisMonth: data.eventsThisMonth ?? 0,
          groups: data.groups ?? 0,
        })
      })
      .catch(() => {})
  }, [])

  // ── iCal calendar subscription ──────────────────────────────────────────────
  const [calToken, setCalToken] = useState<{ token: string | null; url: string | null; webcal: string | null } | null>(null)
  const [genLink, setGenLink] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    api.get('/calendar/token')
      .then(({ data }) => {
        if (data.success) setCalToken({ token: data.token, url: data.url, webcal: data.webcal })
      })
      .catch(() => {})
  }, [])

  async function generateCalLink() {
    setGenLink(true)
    try {
      const { data } = await api.post('/calendar/token')
      if (data.success) setCalToken({ token: data.token, url: data.url, webcal: data.webcal })
    } catch {
      // ignore
    } finally {
      setGenLink(false)
    }
  }

  async function copyCalUrl() {
    if (!calToken?.url) return
    try {
      await navigator.clipboard.writeText(calToken.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // clipboard unavailable
    }
  }

  // ── Google Calendar 2-way sync (Plus) ──────────────────────────────────
  const [gcal, setGcal] = useState<{ configured: boolean; connected: boolean; lastSyncAt: string | null } | null>(null)
  const [gcalBusy, setGcalBusy] = useState(false)
  const [gcalNotice, setGcalNotice] = useState<string | null>(null)

  function loadGcalStatus() {
    api.get('/calendar/google/status')
      .then(({ data }) => { if (data.success) setGcal({ configured: data.configured, connected: data.connected, lastSyncAt: data.lastSyncAt }) })
      .catch(() => {})
  }
  useEffect(() => {
    loadGcalStatus()
    // Surface the result of the OAuth redirect, then clean the URL.
    const params = new URLSearchParams(window.location.search)
    if (params.get('gcal') === 'connected') setGcalNotice('Google Calendar connected — your events are syncing.')
    else if (params.get('gcal') === 'error') setGcalNotice('Could not connect Google Calendar. Please try again.')
    if (params.has('gcal')) window.history.replaceState({}, '', window.location.pathname)
  }, [])

  async function connectGoogle() {
    setGcalBusy(true)
    try {
      const { data } = await api.get('/calendar/google/auth')
      if (data.success && data.url) window.location.href = data.url
    } catch {
      // 403 UPGRADE_REQUIRED is handled by the axios interceptor (upgrade modal)
    } finally {
      setGcalBusy(false)
    }
  }

  async function disconnectGoogle() {
    setGcalBusy(true)
    try {
      await api.delete('/calendar/google')
      setGcal(g => g ? { ...g, connected: false, lastSyncAt: null } : g)
      setGcalCalendars([])
    } catch {
      // ignore
    } finally {
      setGcalBusy(false)
    }
  }

  // ── Pull: which Google calendars to import ──────────────────────────────
  type GCalCalendar = { id: string; summary: string; primary: boolean; enabled: boolean; lastPulledAt: string | null }
  const [gcalCalendars, setGcalCalendars] = useState<GCalCalendar[]>([])
  const [gcalCalLoading, setGcalCalLoading] = useState(false)
  const [gcalReconnect, setGcalReconnect] = useState(false)
  const [togglingCal, setTogglingCal] = useState<string | null>(null)

  function loadGcalCalendars() {
    setGcalCalLoading(true)
    setGcalReconnect(false)
    api.get('/calendar/google/calendars')
      .then(({ data }) => { if (data.success) setGcalCalendars(data.calendars) })
      .catch((err) => { if (err?.response?.data?.code === 'RECONNECT_REQUIRED') setGcalReconnect(true) })
      .finally(() => setGcalCalLoading(false))
  }
  useEffect(() => {
    if (gcal?.connected) loadGcalCalendars()
  }, [gcal?.connected])

  async function toggleCalendar(id: string, enabled: boolean) {
    setTogglingCal(id)
    // optimistic
    setGcalCalendars(cs => cs.map(c => c.id === id ? { ...c, enabled } : c))
    try {
      await api.post(`/calendar/google/calendars/${encodeURIComponent(id)}`, { enabled })
    } catch {
      setGcalCalendars(cs => cs.map(c => c.id === id ? { ...c, enabled: !enabled } : c)) // revert
    } finally {
      setTogglingCal(null)
    }
  }

  async function handleCalendarImport(e: FormEvent) {
    e.preventDefault()
    if (!importFile) return
    setImporting(true)
    setImportResult(null)
    setImportError(null)
    try {
      const form = new FormData()
      form.append('ics', importFile)
      const { data } = await api.post('/calendar/import', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      if (data.success) {
        const count = data.imported ?? 0
        setImportResult(`Imported ${count} event${count === 1 ? '' : 's'}`)
        setImportFile(null)
        ;(document.getElementById('ics-file-input') as HTMLInputElement | null)?.value === '' ||
          ((document.getElementById('ics-file-input') as HTMLInputElement).value = '')
        setTimeout(() => setImportResult(null), 4000)
      } else {
        setImportError(data.error ?? 'Import failed.')
      }
    } catch {
      setImportError('Import failed. Please check the file and try again.')
    } finally {
      setImporting(false)
    }
  }

  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushLoading, setPushLoading] = useState(false)
  const [pushMsg, setPushMsg] = useState('')
  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready
        .then(reg => reg.pushManager.getSubscription())
        .then(sub => setPushEnabled(!!sub))
        .catch(() => {})
    }
  }, [])

  async function handleEnablePush() {
    setPushLoading(true)
    setPushMsg('')
    try {
      const result = await subscribeToPush()
      if (result.ok) {
        setPushEnabled(true)
        setPushMsg('')
      } else {
        setPushEnabled(false)
        setPushMsg(PUSH_ERROR_COPY[result.reason] ?? `Couldn’t enable push (${result.reason}).`)
      }
    } finally {
      setPushLoading(false)
    }
  }

  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null)
  useEffect(() => {
    api.get('/notification-prefs')
      .then(({ data }) => { if (data.success) setPrefs({
        group_invites: data.prefs.group_invites !== false,
        event_invites: data.prefs.event_invites !== false,
        rsvp_replies: data.prefs.rsvp_replies !== false,
        event_changes: data.prefs.event_changes !== false,
        daily_summary_enabled: data.prefs.daily_summary_enabled === true,
        daily_summary_time: data.prefs.daily_summary_time || '08:00',
      }) })
      .catch(() => {})
  }, [])

  async function togglePref(key: NotifToggleKey) {
    if (!prefs) return
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next) // optimistic
    try {
      await api.patch('/notification-prefs', { prefs: { [key]: next[key] } })
    } catch {
      setPrefs(prefs) // revert on failure
    }
  }

  // The daily-summary time is stored/sent in the user's own timezone; capture it
  // from the browser on every save so it stays current across travel/DST.
  async function updateSummary(patch: Partial<Pick<NotificationPrefs, 'daily_summary_enabled' | 'daily_summary_time'>>) {
    if (!prefs) return
    const prev = prefs
    setPrefs({ ...prefs, ...patch }) // optimistic
    try {
      await api.patch('/notification-prefs', {
        prefs: { ...patch, ...(BROWSER_TZ ? { timezone: BROWSER_TZ } : {}) },
      })
    } catch {
      setPrefs(prev) // revert on failure
    }
  }

  const letter = (user?.username?.[0] ?? user?.email?.[0] ?? 'Y').toUpperCase()

  const memberSince = user?.memberSince
    ? new Date(user.memberSince).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
    : null

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    setIsError(false)
    try {
      const { data } = await api.patch('/profile/username', { username })
      if (data.success) {
        await fetchMe()
        setEditing(false)
        setMessage('Username updated successfully.')
      } else {
        setIsError(true)
        setMessage('Failed to update username.')
      }
    } catch {
      setIsError(true)
      setMessage('Failed to update username.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveCity(e: FormEvent) {
    e.preventDefault()
    setSavingCity(true)
    setMessage('')
    setIsError(false)
    try {
      const { data } = await api.patch('/profile/city', { city })
      if (data.success) {
        await fetchMe()
        setEditingCity(false)
        setMessage('Home city updated.')
      } else {
        setIsError(true)
        setMessage('Failed to update city.')
      }
    } catch {
      setIsError(true)
      setMessage('Failed to update city.')
    } finally {
      setSavingCity(false)
    }
  }

  return (
    <div style={{ padding: 'clamp(16px, 4vw, 28px) clamp(16px, 3vw, 24px)', maxWidth: 520, margin: '0 auto' }}>
      {/* Avatar + name hero */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32, textAlign: 'center' }}>
        <div style={{
          width: 84,
          height: 84,
          borderRadius: '50%',
          background: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 34,
          fontWeight: 800,
          letterSpacing: '-0.02em',
          marginBottom: 14,
          boxShadow: '0 8px 24px var(--accent-glow)',
          userSelect: 'none',
        }}>
          {letter}
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.02em' }}>
          {user?.username ?? 'Your Profile'}
        </h1>
        {user?.email && (
          <p style={{ fontSize: 13.5, color: 'var(--text-3)', margin: '4px 0 0' }}>{user.email}</p>
        )}
        {memberSince && (
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '3px 0 0' }}>Member since {memberSince}</p>
        )}
      </div>

      {/* Stats grid */}
      {!user ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 32 }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 90, borderRadius: 'var(--r-lg)' }} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 32 }}>
          <StatCard n={stats?.eventsThisMonth ?? 0} label="Events this month" />
          <StatCard n={stats?.groups ?? 0} label="Groups" />
        </div>
      )}

      {/* Plan & usage */}
      {usage && (
        <Section title="Plan & usage">
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-lg)',
            padding: '16px',
          }}>
            {(usage.plan === 'plus' || usage.alwaysFree) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
                <Tag tone="free">
                  <Icon name="sparkle" size={12} />
                  Plus — unlimited
                </Tag>
                <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
                  Unlimited groups and events. Thanks for being on Plus!
                </p>
                {BILLING_ENABLED && !usage.alwaysFree && (
                  <button
                    onClick={handleManageBilling}
                    disabled={portalLoading}
                    style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--accent)', background: 'none', border: 'none', cursor: portalLoading ? 'not-allowed' : 'pointer', padding: 0, opacity: portalLoading ? 0.6 : 1 }}
                  >
                    {portalLoading ? 'Opening…' : 'Manage billing →'}
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
                    <span style={{ fontSize: 13, fontWeight: 650, color: 'var(--text-2)' }}>Groups</span>
                    <span style={{ fontSize: 12, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                      {usage.groups.used} / {usage.groups.max}
                    </span>
                  </div>
                  <Progress value={usage.groups.used} total={usage.groups.max} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
                    <span style={{ fontSize: 13, fontWeight: 650, color: 'var(--text-2)' }}>Events this month</span>
                    <span style={{ fontSize: 12, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                      {usage.eventsThisMonth.used} / {usage.eventsThisMonth.max}
                    </span>
                  </div>
                  <Progress value={usage.eventsThisMonth.used} total={usage.eventsThisMonth.max} />
                </div>
                {BILLING_ENABLED && (
                  <Link
                    to="/pricing"
                    style={{
                      fontSize: 12.5,
                      fontWeight: 650,
                      color: 'var(--accent)',
                      textDecoration: 'none',
                      alignSelf: 'flex-start',
                    }}
                  >
                    Upgrade to Plus →
                  </Link>
                )}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Account section */}
      <Section title="Account">
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          overflow: 'hidden',
        }}>
          {/* Email row */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <p style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>
              Email
            </p>
            <p style={{ fontSize: 14, color: 'var(--text-1)', margin: 0 }}>{user?.email}</p>
          </div>

          {/* Username row */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <p style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
              Username
            </p>
            {editing ? (
              <form onSubmit={handleSave} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                  autoFocus
                />
                <Button type="submit" variant="primary" size="sm" disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { setEditing(false); setUsername(user?.username ?? '') }}
                >
                  Cancel
                </Button>
              </form>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontSize: 14, color: 'var(--text-1)', margin: 0 }}>{user?.username}</p>
                <button
                  onClick={() => { setEditing(true); setMessage('') }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12.5,
                    fontWeight: 650,
                    color: 'var(--accent)',
                    padding: '4px 6px',
                  }}
                >
                  Edit
                </button>
              </div>
            )}
          </div>

          {/* Home city row — default location for the Discover feed */}
          <div style={{ padding: '14px 16px' }}>
            <p style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
              Home city
            </p>
            {editingCity ? (
              <form onSubmit={handleSaveCity} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Brussels"
                  style={{ ...inputStyle, flex: 1 }}
                  autoFocus
                />
                <Button type="submit" variant="primary" size="sm" disabled={savingCity}>
                  {savingCity ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { setEditingCity(false); setCity(user?.city ?? '') }}
                >
                  Cancel
                </Button>
              </form>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontSize: 14, color: user?.city ? 'var(--text-1)' : 'var(--text-3)', margin: 0 }}>
                  {user?.city || 'Not set — Discover shows all of Belgium'}
                </p>
                <button
                  onClick={() => { setEditingCity(true); setMessage('') }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12.5,
                    fontWeight: 650,
                    color: 'var(--accent)',
                    padding: '4px 6px',
                  }}
                >
                  Edit
                </button>
              </div>
            )}
          </div>
        </div>

        {message && (
          <p style={{
            marginTop: 10,
            fontSize: 13,
            padding: '9px 13px',
            borderRadius: 'var(--r-sm)',
            background: isError ? 'rgba(244,63,94,0.1)' : 'rgba(34,211,170,0.1)',
            color: isError ? '#fb7185' : 'var(--g-work)',
            border: `1px solid ${isError ? 'rgba(244,63,94,0.2)' : 'rgba(34,211,170,0.2)'}`,
          }}>
            {message}
          </p>
        )}
      </Section>

      {/* Notification preferences */}
      <Section title="Notifications">
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          overflow: 'hidden',
        }}>
          {/* Push subscription row */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 14,
            padding: '13px 16px',
            minHeight: 44,
            borderBottom: '1px solid var(--border)',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Push notifications</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>
                {pushEnabled ? 'Enabled on this device' : 'Get alerts on this device'}
              </p>
            </div>
            {pushEnabled ? (
              <span style={{ fontSize: 12, fontWeight: 650, color: 'var(--g-work)', flexShrink: 0 }}>Enabled ✓</span>
            ) : (
              <Button variant="primary" size="sm" onClick={handleEnablePush} disabled={pushLoading}>
                {pushLoading ? 'Enabling…' : 'Enable'}
              </Button>
            )}
            {pushMsg ? (
              <p style={{
                flexBasis: '100%',
                fontSize: 12,
                color: '#fb7185',
                margin: '4px 0 0',
                lineHeight: 1.5,
              }}>
                {pushMsg}
              </p>
            ) : null}
          </div>

          {NOTIF_PREF_ROWS.map((row, i) => (
            <div
              key={row.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '13px 16px',
                minHeight: 44,
                borderTop: i === 0 ? 'none' : '1px solid var(--border)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{row.label}</p>
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>{row.sub}</p>
              </div>
              <Switch on={prefs ? prefs[row.key] : true} onChange={() => togglePref(row.key)} />
            </div>
          ))}

          {/* Daily "events today" summary */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '13px 16px',
            minHeight: 44,
            borderTop: '1px solid var(--border)',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Daily summary</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>A morning push listing that day’s events</p>
            </div>
            <Switch
              on={prefs ? prefs.daily_summary_enabled : false}
              onChange={() => updateSummary({ daily_summary_enabled: !prefs?.daily_summary_enabled })}
            />
          </div>

          {prefs?.daily_summary_enabled && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '13px 16px',
              minHeight: 44,
              borderTop: '1px solid var(--border)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Summary time</p>
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>
                  Sent at this time in your timezone ({BROWSER_TZ})
                </p>
              </div>
              <input
                type="time"
                step={900}
                value={prefs.daily_summary_time}
                onChange={e => updateSummary({ daily_summary_time: snap15(e.target.value) })}
                style={{
                  background: 'var(--surface-3)',
                  border: '1px solid var(--border-2)',
                  borderRadius: 'var(--r-sm)',
                  padding: '8px 10px',
                  fontSize: 14,
                  color: 'var(--text-1)',
                  fontFamily: 'inherit',
                  minHeight: 40,
                }}
              />
            </div>
          )}
        </div>
      </Section>

      {/* Calendar sync */}
      <Section title="Calendar sync">
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          padding: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: calToken?.url ? 14 : 0 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--r-sm)',
              background: 'var(--surface-3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: 'var(--accent)',
            }}>
              <Icon name="calendar" size={17} sw={1.8} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Subscribe to your calendar</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0', lineHeight: 1.5 }}>
                Add this URL to Google or Apple Calendar to see your Eventli events. This is a read-only feed.
              </p>
            </div>
          </div>

          {calToken?.url ? (
            <>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--surface-2)',
                border: '1px solid var(--border-2)',
                borderRadius: 'var(--r-sm)',
                padding: '8px 8px 8px 12px',
              }}>
                <span style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 12.5,
                  color: 'var(--text-2)',
                  fontFamily: 'monospace',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {calToken.url}
                </span>
                <Button variant="secondary" size="sm" icon="share" onClick={copyCalUrl}>
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </>
          ) : (
            <div style={{ marginTop: 14 }}>
              <Button variant="primary" size="sm" icon="plus" onClick={generateCalLink} disabled={genLink}>
                {genLink ? 'Generating…' : 'Generate subscribe link'}
              </Button>
            </div>
          )}

          {/* ── Google Calendar 2-way sync (Plus) ── */}
          {gcal?.configured && (
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 'var(--r-sm)',
                  background: 'var(--surface-3)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', flexShrink: 0, color: 'var(--accent)',
                }}>
                  <Icon name="calendar" size={17} sw={1.8} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Google Calendar</p>
                    <Tag tone="ghost">Plus</Tag>
                    {gcal.connected && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        fontSize: 11.5, fontWeight: 650, color: 'var(--g-work)',
                      }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--g-work)' }} />
                        Connected
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0', lineHeight: 1.5 }}>
                    {gcal.connected
                      ? 'Your Eventli events are mirrored into a dedicated "Eventli" calendar in Google — created, updated and removed automatically.'
                      : 'Connect to push your Eventli events live into your Google Calendar.'}
                    {gcal.connected && gcal.lastSyncAt && (
                      <> Last synced {new Date(gcal.lastSyncAt).toLocaleString()}.</>
                    )}
                  </p>
                </div>
              </div>

              {gcalNotice && (
                <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '0 0 10px' }}>{gcalNotice}</p>
              )}

              {gcal.connected ? (
                <Button variant="outline" size="sm" icon="close" onClick={disconnectGoogle} disabled={gcalBusy}>
                  {gcalBusy ? 'Working…' : 'Disconnect'}
                </Button>
              ) : (
                <Button variant="primary" size="sm" icon="plus" onClick={connectGoogle} disabled={gcalBusy}>
                  {gcalBusy ? 'Connecting…' : 'Connect Google Calendar'}
                </Button>
              )}

              {/* Import: choose which Google calendars to pull into Eventli */}
              {gcal.connected && (
                <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 2px' }}>Import into Eventli</p>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 10px', lineHeight: 1.5 }}>
                    Pick which Google calendars show up in Eventli. Imported events are read-only copies.
                  </p>

                  {gcalReconnect ? (
                    <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
                      Reconnect to grant calendar access, then choose calendars to import.{' '}
                      <button onClick={connectGoogle} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontWeight: 650, fontSize: 12.5, cursor: 'pointer' }}>
                        Reconnect
                      </button>
                    </div>
                  ) : gcalCalLoading ? (
                    <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>Loading calendars…</p>
                  ) : gcalCalendars.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>No calendars found.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {gcalCalendars.map((c, i) => (
                        <div key={c.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
                          borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 550, color: 'var(--text-1)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {c.summary}{c.primary ? ' · Primary' : ''}
                            </p>
                            {c.enabled && c.lastPulledAt && (
                              <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '2px 0 0' }}>
                                Last imported {new Date(c.lastPulledAt).toLocaleString()}
                              </p>
                            )}
                          </div>
                          <div style={{ opacity: togglingCal === c.id ? 0.5 : 1, pointerEvents: togglingCal === c.id ? 'none' : 'auto' }}>
                            <Switch on={c.enabled} onChange={() => toggleCalendar(c.id, !c.enabled)} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Import calendar divider ── */}
          <div style={{
            borderTop: '1px solid var(--border)',
            marginTop: 16,
            paddingTop: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 12 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--r-sm)',
                background: 'var(--surface-3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: 'var(--accent)',
              }}>
                <Icon name="arrowR" size={17} sw={1.8} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Import Calendar</p>
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0', lineHeight: 1.5 }}>
                  Import events from Google Calendar, Apple Calendar, or Outlook (.ics files)
                </p>
              </div>
            </div>

            <form onSubmit={handleCalendarImport} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--surface-2)',
                border: '1px solid var(--border-2)',
                borderRadius: 'var(--r-sm)',
                padding: '8px 10px',
              }}>
                <Icon name="calendar" size={14} sw={1.8} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                <span style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 13,
                  color: importFile ? 'var(--text-1)' : 'var(--text-3)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {importFile ? importFile.name : 'No file chosen'}
                </span>
                <label style={{
                  cursor: 'pointer',
                  fontSize: 12.5,
                  fontWeight: 650,
                  color: 'var(--accent)',
                  padding: '4px 6px',
                  borderRadius: 'var(--r-sm)',
                  transition: 'var(--transition)',
                  flexShrink: 0,
                }}>
                  Browse
                  <input
                    id="ics-file-input"
                    type="file"
                    accept=".ics"
                    style={{ display: 'none' }}
                    onChange={e => setImportFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>

              <div>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!importFile || importing}
                >
                  {importing ? 'Importing…' : 'Import'}
                </Button>
              </div>
            </form>

            {importResult && (
              <p style={{
                marginTop: 10,
                fontSize: 13,
                padding: '9px 13px',
                borderRadius: 'var(--r-sm)',
                background: 'rgba(34,211,170,0.1)',
                color: 'var(--g-work)',
                border: '1px solid rgba(34,211,170,0.2)',
              }}>
                ✓ {importResult}
              </p>
            )}

            {importError && (
              <p style={{
                marginTop: 10,
                fontSize: 13,
                padding: '9px 13px',
                borderRadius: 'var(--r-sm)',
                background: 'rgba(244,63,94,0.1)',
                color: '#fb7185',
                border: '1px solid rgba(244,63,94,0.2)',
              }}>
                {importError}
              </p>
            )}
          </div>
        </div>
      </Section>

      {/* Settings section */}
      <Section title="Settings">
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          overflow: 'hidden',
        }}>
          <SettingsRow
            icon="pin"
            title="Location & radius"
            subtitle={user?.city ? `Default area: ${user.city}` : 'Set your home city in Account above'}
            first
          />
          {/* Privacy row — interactive */}
          <div>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setPrivacyOpen(o => !o)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setPrivacyOpen(o => !o) }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '13px 16px',
                minHeight: 44,
                borderTop: '1px solid var(--border)',
                cursor: 'pointer',
                transition: 'var(--transition)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
            >
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--r-sm)',
                background: 'var(--surface-3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: 'var(--accent)',
              }}>
                <Icon name="users" size={17} sw={1.8} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Privacy</p>
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>Control who can see your activity</p>
              </div>
              <Icon
                name="chevD"
                size={15}
                sw={2}
                style={{
                  color: 'var(--text-3)',
                  flexShrink: 0,
                  transform: privacyOpen ? 'rotate(180deg)' : 'none',
                  transition: 'var(--transition)',
                }}
              />
            </div>

            {privacyOpen && (
              <div style={{
                padding: '14px 16px',
                borderTop: '1px solid var(--border)',
                background: 'var(--surface-2)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 2px' }}>
                    Discoverable
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
                    Allow others to find me by username or email
                  </p>
                </div>
                <Switch on={searchable} onChange={() => handleSearchableToggle(!searchable)} />
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Privacy & data (GDPR) */}
      <Section title="Privacy & data">
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          overflow: 'hidden',
        }}>
          {/* Export */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', minHeight: 44 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Export my data</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>Download a JSON copy of everything we hold about you</p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleExport} disabled={exporting}>
              {exporting ? 'Preparing…' : 'Export'}
            </Button>
          </div>
          {/* Privacy policy link */}
          <Link
            to="/privacy"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '13px 16px',
              minHeight: 44,
              borderTop: '1px solid var(--border)',
              textDecoration: 'none',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Privacy policy</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>How we handle your data and your GDPR rights</p>
            </div>
            <Icon name="chevR" size={15} sw={2} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          </Link>
        </div>
      </Section>

      {/* Danger zone — account deletion */}
      <Section title="Danger zone">
        <div style={{
          background: 'var(--surface)',
          border: '1px solid rgba(244,63,94,0.25)',
          borderRadius: 'var(--r-lg)',
          padding: '16px',
        }}>
          {!deleteOpen ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Delete account</p>
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0', lineHeight: 1.5 }}>
                  Permanently erase your account and personal data. This cannot be undone.
                </p>
              </div>
              <Button variant="danger" size="sm" onClick={() => { setDeleteOpen(true); setDeleteError('') }}>
                Delete
              </Button>
            </div>
          ) : (
            <form onSubmit={handleDeleteAccount} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.55 }}>
                This permanently deletes your account, groups you created, events, habits and all
                personal data. Enter your password to confirm.
              </p>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                style={inputStyle}
                autoFocus
              />
              {deleteError && (
                <p style={{ fontSize: 12.5, color: '#fb7185', margin: 0 }}>{deleteError}</p>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <Button type="submit" variant="danger" size="sm" disabled={deleting || !deletePassword}>
                  {deleting ? 'Deleting…' : 'Permanently delete'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { setDeleteOpen(false); setDeletePassword(''); setDeleteError('') }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      </Section>

      {/* Sign out */}
      <Button
        variant="secondary"
        full
        size="lg"
        icon="external"
        onClick={logout}
        style={{ marginTop: 8 }}
      >
        Log out
      </Button>
    </div>
  )
}
