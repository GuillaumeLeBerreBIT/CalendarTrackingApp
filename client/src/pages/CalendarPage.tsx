import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/api/client'
import type { CalEvent, DateSelection, Group } from '@/types'
import EventModal from '@/components/EventModal'
import EventFormModal from '@/components/EventFormModal'
import MobileMonthGrid from '@/components/MobileMonthGrid'
import MonthGrid from '@/components/MonthGrid'
import DayPanel from '@/components/DayPanel'
import WeekStrip from '@/components/WeekStrip'
import { addDaysStr } from '@/lib/allDayDates'
import { normalizeApiEvent, agendaDayKey, eventWindow } from '@/lib/calendarEvents'
import { buildMonthGrid, eventsOnDay } from '@/lib/monthGrid'
import Button, { IconButton } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Primitives'
import { createPortal } from 'react-dom'
import Sheet from '@/components/ui/Sheet'
import { InsetGroup, InsetRow } from '@/components/ui/Controls'
import { useNotificationStore } from '@/store/notificationStore'
import Icon from '@/components/ui/Icon'
import { useAuthStore } from '@/store/authStore'

/* ─── Group color resolution ─────────────────────────────── */
const GROUP_COLORS: Record<string, string> = {
  family:  'var(--g-family)',
  friends: 'var(--g-friends)',
  work:    'var(--g-work)',
  climb:   'var(--g-climb)',
  book:    'var(--g-book)',
  self:    'var(--accent)',
}

// Google-imported events get their own filter "calendar" + a distinct colour.
const GOOGLE_SOURCE_ID = 'google'
const GOOGLE_COLOR = '#4285F4'

function groupColor(tagName?: string, groupId?: string | number): string {
  if (!tagName && !groupId) return 'var(--accent)'
  const key = (tagName ?? '').toLowerCase().replace(/[^a-z]/g, '')
  if (GROUP_COLORS[key]) return GROUP_COLORS[key]
  // Custom group → use hex fallback (CSS vars can't be generated dynamically)
  if (groupId) {
    const hash = String(groupId).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
    return EXTRA_GROUP_PALETTE[hash % EXTRA_GROUP_PALETTE.length]
  }
  return 'var(--accent)'
}

/* ─── Hex group color lookup (for FullCalendar backgroundColor) ── */
const HEX_GROUP_COLORS: Record<string, string> = {
  family:  '#f59e0b',
  friends: '#ec4899',
  work:    '#22d3aa',
  climb:   '#38bdf8',
  book:    '#c084fc',
  self:    '#7c6ef2',
}

// Palette for custom group names not in the standard map
const EXTRA_GROUP_PALETTE = [
  '#f97316', '#a855f7', '#06b6d4', '#84cc16', '#eab308', '#f43f5e',
]

function hexGroupColor(groupName?: string, groupId?: string | number): string {
  if (!groupId && !groupName) return '#7c6ef2'
  const key = (groupName ?? '').toLowerCase().replace(/[^a-z]/g, '')
  if (HEX_GROUP_COLORS[key]) return HEX_GROUP_COLORS[key]
  if (groupId) {
    const hash = String(groupId).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
    return EXTRA_GROUP_PALETTE[hash % EXTRA_GROUP_PALETTE.length]
  }
  return '#7c6ef2'
}

// Deterministic hue from userId — same algorithm as Avatar.tsx so colors match.
function hashHue(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0
  return Math.abs(hash) % 360
}

// Returns the resolved hex for an event. After loadEvents() the color is stored as
// extendedProps.resolvedHex so all renderers stay in sync with the DB-stored member color.
function eventHex(extendedProps?: Record<string, unknown>): string {
  if (!extendedProps) return '#7c6ef2'
  if (extendedProps.externalSource === GOOGLE_SOURCE_ID) return GOOGLE_COLOR
  if (extendedProps.resolvedHex) return extendedProps.resolvedHex as string
  // Fallback for events not yet remapped (e.g. newly added before reload)
  const participants = extendedProps.participants as Array<{ userId: string }> | undefined
  if (participants && participants.length > 1) {
    return hexGroupColor(
      extendedProps.groupName as string | undefined,
      extendedProps.groupsId as string | undefined
    )
  }
  const hue = extendedProps.createdBy ? hashHue(extendedProps.createdBy as string) : 252
  return `hsl(${hue} 62% 56%)`
}

/* ─── AgendaList ─────────────────────────────────────────── */
interface AgendaListProps {
  events: CalEvent[]
  onEventClick: (ev: CalEvent) => void
  onAddEvent?: () => void
}

// Local-time YYYY-MM-DD (toISOString would shift the date around midnight)
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function AgendaList({ events, onEventClick, onAddEvent }: AgendaListProps) {
  // Today and onwards only: the agenda is a "what's coming" view; past events live in the month grid.
  const todayKey = localDateKey(new Date())
  const byDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    for (const ev of events) {
      const day = agendaDayKey(ev, todayKey)
      if (!day) continue
      if (!map.has(day)) map.set(day, [])
      map.get(day)!.push(ev)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [events, todayKey])

  if (byDay.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
        <p style={{ fontSize: 14, color: 'var(--text-3)', textAlign: 'center' }}>Nothing coming up.</p>
        {onAddEvent && <Button variant="secondary" icon="plus" onClick={onAddEvent}>Add an event</Button>}
      </div>
    )
  }

  const tomorrowKey = localDateKey(new Date(Date.now() + 86400000))
  return (
    <div className="scroll" style={{ flex: 1, overflowY: 'auto', paddingBottom: 140 }}>
      {byDay.map(([dateStr, dayEvents]) => {
        const nice = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
        const label = dateStr === todayKey ? `Today · ${nice}` : dateStr === tomorrowKey ? `Tomorrow · ${nice}` : nice
        return (
          <section key={dateStr}>
            <h2 style={{ margin: 0, padding: '16px 16px 6px', fontSize: 13, fontWeight: 600, color: 'var(--text-2)', letterSpacing: 0 }}>{label}</h2>
            {dayEvents.map(ev => {
              const color = eventHex(ev.extendedProps as Record<string, unknown>)
              const timeStr = ev.allDay ? 'All day' : ev.start.includes('T') ? ev.start.split('T')[1].slice(0, 5) : ''
              const isTentative = ev.extendedProps?.status === 'tentative'
              const isLocked = ev.extendedProps?.status === 'locked'
              const pactCount = ev.extendedProps?.pactCompletionsCount as number | undefined
              const pactTarget = ev.extendedProps?.pactTargetCompletions as number | undefined
              const going = (ev.extendedProps?.participants ?? []).filter(p => p.rsvpStatus === 'going').length
              const meta = [
                ev.extendedProps?.groupName || 'Just me',
                isTentative ? 'Voting open' : null,
                isLocked ? `Locked · ${pactCount ?? 0}/${pactTarget ?? 0}` : null,
                !isTentative && !isLocked && going > 1 ? `${going} going` : null,
              ].filter(Boolean).join(' · ')
              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => onEventClick(ev)}
                  className="row-hover"
                  style={{
                    display: 'flex', gap: 12, alignItems: 'stretch', width: '100%', minHeight: 44,
                    padding: '10px 16px', border: 0, background: 'transparent', textAlign: 'left',
                    color: 'var(--text-1)', cursor: 'pointer', opacity: isLocked ? 0.7 : 1,
                  }}
                >
                  <span style={{ width: 48, flex: '0 0 48px', fontSize: 13, fontWeight: 500, color: 'var(--text-2)', paddingTop: 1, fontVariantNumeric: 'tabular-nums' }}>{timeStr}</span>
                  <span style={{
                    width: 3, flex: '0 0 3px', borderRadius: 2, boxSizing: 'border-box',
                    background: isTentative ? 'transparent' : color,
                    borderLeft: isTentative ? `3px dashed ${color}` : 'none',
                  }} />
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{meta}</span>
                  </span>
                </button>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}

/* ─── GroupFilterPanel ───────────────────────────────────── */
interface GroupFilterPanelProps {
  groups: Group[]
  events: CalEvent[]
  activeGroups: Set<string>
  onToggle: (id: string) => void
}

function GroupFilterPanel({ groups, events, activeGroups, onToggle }: GroupFilterPanelProps) {
  // Count events per group
  const counts = useMemo(() => {
    const map: Record<string, number> = { self: 0, [GOOGLE_SOURCE_ID]: 0 }
    for (const g of groups) map[g.groups_id] = 0
    for (const ev of events) {
      if (ev.extendedProps?.externalSource === GOOGLE_SOURCE_ID) { map[GOOGLE_SOURCE_ID] += 1; continue }
      const gid = ev.extendedProps?.groupsId
      if (!gid) map['self'] = (map['self'] ?? 0) + 1
      else if (gid in map) map[gid] = (map[gid] ?? 0) + 1
    }
    return map
  }, [groups, events])

  const allEntries = [
    { id: 'self', label: 'Personal', tagName: 'self' },
    ...(counts[GOOGLE_SOURCE_ID] > 0 ? [{ id: GOOGLE_SOURCE_ID, label: 'Google', tagName: GOOGLE_SOURCE_ID }] : []),
    ...groups.map(g => ({ id: String(g.groups_id), label: g.groups_title, tagName: g.tag_name })),
  ]

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', padding: '20px 10px 6px' }}>Calendars</div>
      {allEntries.map(entry => {
        const active = activeGroups.has(entry.id)
        const color = entry.id === GOOGLE_SOURCE_ID ? GOOGLE_COLOR : groupColor(entry.tagName)
        const count = counts[entry.id] ?? 0
        return (
          <button
            key={entry.id}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(entry.id)}
            className="menu-item"
            style={{
              display: 'flex', alignItems: 'center', gap: 10, height: 32, padding: '0 10px', width: '100%',
              border: 0, background: 'transparent', borderRadius: 8, fontSize: 14, textAlign: 'left',
              color: active ? 'var(--text-1)' : 'var(--text-3)', cursor: 'pointer',
            }}
          >
            <span style={{
              width: 16, height: 16, borderRadius: 4, boxSizing: 'border-box', flexShrink: 0,
              border: active ? 'none' : `1.5px solid ${color}`, background: active ? color : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              // Ink boxes (personal / groups without a colour) invert with the theme
              color: color.startsWith('var(') ? 'var(--accent-text)' : '#fff',
            }}>
              {active && <Icon name="check" size={10} sw={3.2} />}
            </span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.label}</span>
            {count > 0 && <span style={{ fontSize: 12, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>}
          </button>
        )
      })}
    </div>
  )
}

/* ─── CalendarPage ───────────────────────────────────────── */
type CalView = 'month' | 'agenda'
/** Phone month layout: dots (compact) or titles in each day (detailed). Same key as before the revamp. */
type MobileLayout = 'compact' | 'detailed'
const MOBILE_LAYOUT_KEY = 'eventli.mobileMonthLayout'
type ModalMode = 'none' | 'create' | 'view' | 'edit'

export default function CalendarPage() {
  const navigate = useNavigate()
  const { userId: currentUserId } = useAuthStore()
  const [events, setEvents] = useState<CalEvent[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  // `loading` = cold-open skeleton only; `refreshing` = silent post-mutation refetch.
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [groupsLoaded, setGroupsLoaded] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('none')
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null)
  const [editEvent, setEditEvent] = useState<CalEvent | null>(null)
  const [selectInfo, setSelectInfo] = useState<DateSelection | null>(null)
  // Phone and desktop both open on the month (phone: Titles layout by default)
  const [calView, setCalView] = useState<CalView>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const todayKey = localDateKey(new Date())
  const [selectedKey, setSelectedKey] = useState(todayKey)
  const [activeGroups, setActiveGroups] = useState<Set<string>>(new Set(['self', GOOGLE_SOURCE_ID]))
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024)
  const loadSeq = useRef(0) // only the latest loadEvents() call may write state
  const [moreOpen, setMoreOpen] = useState(false)
  const [mobileLayout, setMobileLayout] = useState<MobileLayout>(() => {
    try {
      const stored = localStorage.getItem(MOBILE_LAYOUT_KEY)
      if (stored === 'compact' || stored === 'detailed') return stored
    } catch { /* storage blocked */ }
    return 'detailed'
  })
  useEffect(() => {
    try { localStorage.setItem(MOBILE_LAYOUT_KEY, mobileLayout) } catch { /* storage blocked */ }
  }, [mobileLayout])
  const touchX = useRef<number | null>(null)
  const unread = useNotificationStore(st => st.unread)
  // Desktop: the calendar filter lives in the app sidebar (AppShell renders #sidebar-slot)
  const [sidebarSlot, setSidebarSlot] = useState<HTMLElement | null>(null)
  useEffect(() => { setSidebarSlot(document.getElementById('sidebar-slot')) }, [isMobile])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Listen for swipe events from MobileMonthGrid
  useEffect(() => {
    const handler = (e: Event) => {
      const { direction } = (e as CustomEvent<{ direction: 'prev' | 'next' }>).detail
      if (direction === 'prev') navPrev()
      else navNext()
    }
    window.addEventListener('mobileGridSwipe', handler)
    return () => window.removeEventListener('mobileGridSwipe', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calView, currentDate])

  async function loadEvents(opts?: { silent?: boolean }) {
    const silent = opts?.silent === true
    const seq = ++loadSeq.current
    // Show the pill only if the refetch is still outstanding after a beat.
    let pillTimer: ReturnType<typeof setTimeout> | undefined
    if (silent) pillTimer = setTimeout(() => {
      if (seq === loadSeq.current) setRefreshing(true)
    }, 180)
    else setLoading(true)
    try {
      const { data } = await api.get('/renderEvents', { params: eventWindow(currentDate) })
      if (seq !== loadSeq.current) return
      setLoadError(!data.success)
      if (data.success) {
        const remapped = (data.events as CalEvent[]).map((ev) => {
          const parts = (ev.extendedProps?.participants as Array<{ userId: string }> | undefined) ?? []
          let hex: string
          if (ev.extendedProps?.externalSource === GOOGLE_SOURCE_ID) {
            hex = GOOGLE_COLOR
          } else if (parts.length <= 1) {
            // Use the DB-stored per-member color (profiles_groups.color) returned by backend
            hex = ev.backgroundColor && ev.backgroundColor !== '#3D82F6' && ev.backgroundColor !== '#6B7280'
              ? ev.backgroundColor
              : eventHex(ev.extendedProps as Record<string, unknown>)
          } else {
            // Multi-person → group color from our design system
            hex = hexGroupColor(
              ev.extendedProps?.groupName as string | undefined,
              ev.extendedProps?.groupsId as string | undefined
            )
          }
          return normalizeApiEvent({
            ...ev,
            backgroundColor: hex + '22',
            borderColor: hex,
            extendedProps: { ...(ev.extendedProps ?? {}), resolvedHex: hex },
          })
        })
        setEvents(remapped)
        if (data.groupsTagNames && typeof data.groupsTagNames === 'object' && !Array.isArray(data.groupsTagNames)) {
          setActiveGroups(prev => {
            const next = new Set(prev)
            Object.keys(data.groupsTagNames).forEach(id => next.add(String(id)))
            return next
          })
        }
      }
    } catch {
      // 401 is handled by the auth interceptor; anything else is shown to the user.
      if (seq === loadSeq.current) setLoadError(true)
    } finally {
      if (pillTimer) clearTimeout(pillTimer)
      // The latest load clears both indicators: a silent load can supersede a
      // spinner load (month change during the first fetch, StrictMode re-run).
      if (seq === loadSeq.current) {
        setRefreshing(false)
        setLoading(false)
      }
    }
  }

  // Refetch when the visible month changes; the first load shows the spinner.
  const monthKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`
  const firstLoad = useRef(true)
  useEffect(() => {
    loadEvents({ silent: !firstLoad.current })
    firstLoad.current = false
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey])

  useEffect(() => {
    // Load groups for the filter panel (groups_id, groups_title, tag_name)
    api.get('/groups').then(({ data }) => {
      if (data.success && Array.isArray(data.userGroups)) {
        const loaded: Group[] = data.userGroups.map((g: { groupInfo: { groupId: string; title: string; description: string; tag: string } }) => ({
          groups_id: String(g.groupInfo.groupId),
          groups_title: g.groupInfo.title,
          groups_description: g.groupInfo.description,
          tag_name: g.groupInfo.tag,
        }))
        setGroups(loaded)
        setActiveGroups(prev => {
          const next = new Set(prev)
          loaded.forEach((g: Group) => next.add(String(g.groups_id)))
          return next
        })
      }
      setGroupsLoaded(true)
    }).catch(() => { setGroupsLoaded(true) })
  }, [])

  function handleAgendaEventClick(ev: CalEvent) {
    setSelectedEvent(ev)
    setSelectInfo(null)
    setModalMode('view')
  }

  function closeModal() {
    setModalMode('none')
    setSelectedEvent(null)
    setEditEvent(null)
    setSelectInfo(null)
  }

  function toggleGroup(id: string) {
    setActiveGroups(prev => {
      const next = new Set(prev)
      const sid = String(id)
      if (next.has(sid)) next.delete(sid)
      else next.add(sid)
      return next
    })
  }

  // Filter events for the calendar views based on active groups.
  const filteredEvents = useMemo(() => {
    if (!groupsLoaded) return events  // show everything until user can see the filter panel
    return events.filter(ev => {
      if (ev.extendedProps?.externalSource === GOOGLE_SOURCE_ID) return activeGroups.has(GOOGLE_SOURCE_ID)
      const gid = String(ev.extendedProps?.groupsId ?? '')
      if (!gid) return activeGroups.has('self')
      return activeGroups.has(gid)
    })
  }, [events, activeGroups, groupsLoaded])

  const monthCells = useMemo(
    () => buildMonthGrid(currentDate.getFullYear(), currentDate.getMonth(), filteredEvents, todayKey),
    [currentDate, filteredEvents, todayKey],
  )
  // Phone "Titles" month: 3 chips, then "+N more" (rows grow to fit)
  const phoneMonthCells = useMemo(
    () => buildMonthGrid(currentDate.getFullYear(), currentDate.getMonth(), filteredEvents, todayKey, 3),
    [currentDate, filteredEvents, todayKey],
  )
  const selectedDayEvents = useMemo(() => eventsOnDay(filteredEvents, selectedKey), [filteredEvents, selectedKey])
  const colorOf = useCallback((ev: CalEvent) => eventHex(ev.extendedProps as Record<string, unknown>), [])

  // Selecting a day in another month moves the month (and the fetch window) with it.
  function selectDay(key: string) {
    setSelectedKey(key)
    const d = new Date(`${key}T00:00:00`)
    if (d.getFullYear() !== currentDate.getFullYear() || d.getMonth() !== currentDate.getMonth()) {
      setCurrentDate(d)
    }
  }

  // Month label
  const monthLabel = currentDate.toLocaleDateString('en-US', { month: 'long' })
  const yearLabel = currentDate.getFullYear()

  // Live region stays mounted so the transition is announced; the dot is decorative.
  const refreshIndicator = (
    <>
      <span className="sr-only" role="status" aria-live="polite">
        {refreshing ? 'Updating events' : ''}
      </span>
      {refreshing && (
        <span
          aria-hidden="true"
          title="Updating…"
          style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: 'var(--accent)',
            animation: 'pulse-dot 1.1s ease-in-out infinite',
          }}
        />
      )}
    </>
  )

  function shiftMonth(delta: number) {
    setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + delta, 1))
  }
  const navPrev = () => shiftMonth(-1)
  const navNext = () => shiftMonth(1)

  function navToday() {
    setCurrentDate(new Date())
    setSelectedKey(todayKey)
  }

  function openCreate(dateKey?: string) {
    if (dateKey) handleGridAddEvent(dateKey)
    else { setSelectedEvent(null); setSelectInfo(null); setModalMode('create') }
  }

  // New event prefilled with one all-day date (endStr exclusive, see DateSelection)
  const handleGridAddEvent = useCallback((dateStr: string) => {
    const start = new Date(dateStr + 'T00:00:00')
    const end = new Date(dateStr + 'T00:00:00')
    end.setDate(end.getDate() + 1)
    setSelectedEvent(null)
    setSelectInfo({
      start,
      end,
      startStr: dateStr,
      endStr: addDaysStr(dateStr, 1),
      allDay: true,
    })
    setModalMode('create')
  }, [])

  // Phone agenda: events from the selected day onward (AgendaList drops past days itself).
  const agendaFromSelected = useMemo(
    () => filteredEvents.filter(ev => (ev.end ?? ev.start).split('T')[0] >= selectedKey),
    [filteredEvents, selectedKey],
  )

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      overflow: 'hidden',
      background: 'var(--bg)',
    }}>
      {/* ── Main area ────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

        {/* Header */}
        {isMobile ? (
          <header style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '12px 8px 4px 16px', flexShrink: 0 }}>
            <h1 style={{ flex: 1, fontSize: 22, fontWeight: 700, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.02em' }}>
              {monthLabel} <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>{yearLabel}</span>
            </h1>
            {refreshIndicator}
            <IconButton
              name={calView === 'agenda' ? 'grid' : 'list'}
              size={44} isz={20}
              title={calView === 'agenda' ? 'Month view' : 'Agenda view'}
              onClick={() => setCalView(calView === 'agenda' ? 'month' : 'agenda')}
            />
            <IconButton name="bell" size={44} isz={20} title="Notifications" badge={unread > 0} onClick={() => navigate('/notifications')} />
            <IconButton name="dots" size={44} isz={20} title="More" onClick={() => setMoreOpen(true)} />
          </header>
        ) : (
          <div style={{
            padding: '12px 16px 12px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            flexShrink: 0,
            gap: 8,
          }}>
            <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-1)', margin: '0 6px 0 0', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
              {monthLabel} {yearLabel}
            </h1>
            <IconButton name="chevL" size={36} isz={16} onClick={navPrev} title="Previous month" />
            <IconButton name="chevR" size={36} isz={16} onClick={navNext} title="Next month" />
            <Button variant="secondary" size="sm" onClick={navToday}>Today</Button>
            {refreshIndicator}
            <div style={{ flex: 1 }} />
            <Segmented
              options={[
                { value: 'month', label: 'Month' },
                { value: 'agenda', label: 'Agenda' },
              ]}
              value={calView}
              onChange={v => setCalView(v as CalView)}
              size="sm"
            />
            <IconButton name="repeat" size={36} isz={17} title="Routines" onClick={() => navigate('/routines')} />
            <IconButton name="hourglass" size={36} isz={17} title="Countdowns" onClick={() => navigate('/countdowns')} />
            <Button variant="primary" icon="plus" onClick={() => openCreate(selectedKey)}>New event</Button>
          </div>
        )}

        {loadError && !loading && (
          <div
            role="alert"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              margin: '8px 16px', padding: '10px 14px', borderRadius: 'var(--r-md)',
              background: 'var(--fill)',
              color: 'var(--text-2)', fontSize: 13.5,
            }}
          >
            Couldn't load your events.
            <Button variant="outline" size="sm" onClick={() => loadEvents()}>Retry</Button>
          </div>
        )}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-3)', fontSize: 14 }}>
            Loading events…
          </div>
        )}

        {/* Calendar area */}
        {!loading && (isMobile ? (
          calView === 'month' ? (<>
            <div style={{ padding: '0 16px 8px', flexShrink: 0 }}>
              <Segmented
                label="Month layout"
                options={[{ value: 'detailed', label: 'Titles' }, { value: 'compact', label: 'Dots' }]}
                value={mobileLayout}
                onChange={(v) => setMobileLayout(v as MobileLayout)}
              />
            </div>
            {mobileLayout === 'detailed' ? (
              <div
                style={{ flex: 1, minHeight: 0, display: 'flex', touchAction: 'pan-y' }}
                onTouchStart={(e) => { touchX.current = e.touches[0].clientX }}
                onTouchEnd={(e) => {
                  if (touchX.current === null) return
                  const dx = e.changedTouches[0].clientX - touchX.current
                  touchX.current = null
                  if (Math.abs(dx) > 60) { if (dx < 0) navNext(); else navPrev() }
                }}
              >
                <MonthGrid
                  compact
                  cells={phoneMonthCells}
                  selectedKey={selectedKey}
                  onSelectDay={(key) => { selectDay(key); setCalView('agenda') }}
                  onEventClick={handleAgendaEventClick}
                  colorOf={colorOf}
                />
              </div>
            ) : (
            <MobileMonthGrid
              currentDate={currentDate}
              events={filteredEvents}
              onEventClick={handleAgendaEventClick}
              onAddEvent={handleGridAddEvent}
              currentUserId={currentUserId}
              eventHex={eventHex}
            />
            )}
          </>) : (
            <>
              <WeekStrip
                selectedKey={selectedKey}
                todayKey={todayKey}
                events={filteredEvents}
                onSelect={selectDay}
                colorOf={colorOf}
              />
              <AgendaList
                events={agendaFromSelected}
                onEventClick={handleAgendaEventClick}
                onAddEvent={() => openCreate(selectedKey)}
              />
            </>
          )
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            {calView === 'month' ? (
              <MonthGrid
                cells={monthCells}
                selectedKey={selectedKey}
                onSelectDay={setSelectedKey}
                onEventClick={handleAgendaEventClick}
                colorOf={colorOf}
              />
            ) : (
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <AgendaList
                  events={filteredEvents}
                  onEventClick={handleAgendaEventClick}
                  onAddEvent={() => openCreate()}
                />
              </div>
            )}
            <DayPanel
              dateKey={selectedKey}
              events={selectedDayEvents}
              onEventClick={handleAgendaEventClick}
              onAdd={() => openCreate(selectedKey)}
              colorOf={colorOf}
            />
          </div>
        ))}

        {!isMobile && sidebarSlot && createPortal(
          <GroupFilterPanel groups={groups} events={events} activeGroups={activeGroups} onToggle={toggleGroup} />,
          sidebarSlot,
        )}

        {/* Phone: "more" — today, calendars, routines, countdowns */}
        {isMobile && moreOpen && (
          <Sheet title="Calendar" onClose={() => setMoreOpen(false)}>
            <div style={{ padding: '12px 16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <InsetGroup>
                <InsetRow first label="Go to today" chevron onClick={() => { navToday(); setMoreOpen(false) }} />
                <InsetRow label="Routines" chevron onClick={() => navigate('/routines')} />
                <InsetRow label="Countdowns" chevron onClick={() => navigate('/countdowns')} />
              </InsetGroup>
              <InsetGroup style={{ padding: '0 4px 6px' }}>
                <GroupFilterPanel groups={groups} events={events} activeGroups={activeGroups} onToggle={toggleGroup} />
              </InsetGroup>
            </div>
          </Sheet>
        )}

        {/* Phone: one primary action, bottom-right above the tab bar */}
        {isMobile && (
          <button
            type="button"
            aria-label="New event"
            onClick={() => openCreate(calView === 'agenda' ? selectedKey : undefined)}
            style={{
              position: 'fixed',
              right: 16,
              bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))',
              width: 56,
              height: 56,
              borderRadius: 18,
              border: 'none',
              background: 'var(--accent)',
              color: 'var(--accent-text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 16px rgba(17,17,20,0.22)',
              zIndex: 20,
              cursor: 'pointer',
            }}
          >
            <Icon name="plus" size={24} sw={2.2} />
          </button>
        )}
      </div>

      {modalMode === 'create' && (
        <EventFormModal
          event={null}
          selectInfo={selectInfo}
          groups={groups}
          currentUserId={currentUserId}
          onClose={closeModal}
          onSaved={() => { closeModal(); loadEvents({ silent: true }) }}
        />
      )}

      {modalMode === 'view' && selectedEvent && (
        <EventModal
          data={selectedEvent}
          onClose={closeModal}
          onEdit={() => { setEditEvent(selectedEvent); setModalMode('edit') }}
          onDeleted={() => { closeModal(); loadEvents({ silent: true }) }}
          currentUserId={currentUserId ?? undefined}
          onRsvp={() => loadEvents({ silent: true })}
        />
      )}

      {modalMode === 'edit' && editEvent && (
        <EventFormModal
          event={editEvent}
          selectInfo={null}
          groups={groups}
          currentUserId={currentUserId}
          onClose={closeModal}
          onSaved={() => { closeModal(); loadEvents({ silent: true }) }}
        />
      )}
    </div>
  )
}
