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
import { Segmented, RsvpPill } from '@/components/ui/Primitives'
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
  // Group by date string (YYYY-MM-DD), today and onwards only — the agenda
  // is a "what's coming" view; past events live in the month grid.
  const byDay = useMemo(() => {
    const todayKey = localDateKey(new Date())
    const map = new Map<string, CalEvent[]>()
    for (const ev of events) {
      const day = agendaDayKey(ev, todayKey)
      if (!day) continue
      if (!map.has(day)) map.set(day, [])
      map.get(day)!.push(ev)
    }
    // Sort days ascending
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [events])

  if (byDay.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: 24,
      }}>
        <p style={{ fontSize: 14, color: 'var(--text-3)', textAlign: 'center', margin: 0 }}>
          No upcoming events. Toggle a calendar group above or create one.
        </p>
        {onAddEvent && (
          <button
            onClick={onAddEvent}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '10px 18px', borderRadius: 'var(--r-sm)',
              background: 'var(--accent)', color: 'var(--accent-text)',
              border: 'none', fontSize: 13.5, fontWeight: 650, cursor: 'pointer',
              boxShadow: '0 4px 14px var(--accent-glow)',
            }}
          >
            <Icon name="plus" size={15} sw={2.2} />
            New event
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="scroll" style={{ flex: 1, overflowY: 'auto', padding: '12px 24px 24px' }}>
      {/* New event shortcut at the top of agenda */}
      {onAddEvent && (
        <button
          onClick={onAddEvent}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', padding: '10px 14px', marginBottom: 16,
            borderRadius: 'var(--r-md)', cursor: 'pointer',
            background: 'var(--accent-soft)', border: '1px dashed var(--accent-line)',
            color: 'var(--accent)', fontSize: 13.5, fontWeight: 650,
            transition: 'var(--transition)',
          }}
        >
          <Icon name="plus" size={15} sw={2.2} />
          New event
        </button>
      )}
      {byDay.map(([dateStr, dayEvents]) => {
        const date = new Date(dateStr + 'T00:00:00')
        const dow = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
        const day = date.getDate()
        const isToday = dateStr === localDateKey(new Date())

        return (
          <div key={dateStr} style={{
            display: 'flex',
            gap: 16,
            marginBottom: 18,
          }}>
            {/* Day column */}
            <div style={{
              width: 52,
              flexShrink: 0,
              paddingTop: 11,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.05em' }}>{dow}</span>
              <span style={{
                fontSize: 18,
                fontWeight: 700,
                color: isToday ? 'var(--accent)' : 'var(--text-2)',
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                background: isToday ? 'var(--accent-softer)' : 'transparent',
              }}>{day}</span>
            </div>

            {/* Events */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {dayEvents.map(ev => {
                const color = eventHex(ev.extendedProps as Record<string, unknown>)
                const rawRsvp = ev.extendedProps?.participants?.[0]?.rsvpStatus
                const rsvp = (['going', 'maybe', 'no'] as const).find(v => v === rawRsvp)
                const timeStr = ev.allDay
                  ? 'All day'
                  : ev.start.includes('T')
                    ? ev.start.split('T')[1].slice(0, 5)
                    : ''

                const isTentative = ev.extendedProps?.status === 'tentative'
                const isLocked = ev.extendedProps?.status === 'locked'
                const pactCount = ev.extendedProps?.pactCompletionsCount as number | undefined
                const pactTarget = ev.extendedProps?.pactTargetCompletions as number | undefined
                return (
                  <button
                    key={ev.id}
                    onClick={() => onEventClick(ev)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      background: isLocked ? 'var(--surface-2)' : 'var(--surface)',
                      border: isTentative ? '1px dashed var(--border-2)' : isLocked ? '1px dashed var(--border-2)' : '1px solid var(--border)',
                      borderRadius: 'var(--r-md)',
                      padding: '11px 13px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'var(--transition)',
                      width: '100%',
                      opacity: isTentative ? 0.75 : isLocked ? 0.7 : 1,
                    }}
                    onMouseEnter={e => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)'
                      ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-2)'
                    }}
                    onMouseLeave={e => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)'
                      ;(e.currentTarget as HTMLButtonElement).style.borderColor = isTentative ? 'var(--border-2)' : 'var(--border)'
                    }}
                  >
                    {/* Color bar */}
                    <div style={{
                      width: 4,
                      alignSelf: 'stretch',
                      borderRadius: 99,
                      background: color,
                      flexShrink: 0,
                    }} />

                    {/* Time */}
                    <span style={{
                      fontSize: 12.5,
                      fontVariantNumeric: 'tabular-nums',
                      color: 'var(--text-3)',
                      width: 42,
                      flexShrink: 0,
                    }}>{timeStr}</span>

                    {/* Title + group */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                        {isLocked && <span style={{ fontSize: 13, flexShrink: 0 }}>🔒</span>}
                        <span style={{ fontSize: 14, fontWeight: 600, color: isLocked ? 'var(--text-2)' : 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ev.title}
                        </span>
                        {isTentative && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            padding: '1px 6px', borderRadius: 'var(--r-full)',
                            background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
                            fontSize: 10, fontWeight: 700, flexShrink: 0,
                          }}>
                            Voting
                          </span>
                        )}
                        {isLocked && (
                          <span style={{
                            padding: '1px 6px', borderRadius: 'var(--r-full)',
                            background: 'var(--surface-3)', color: 'var(--text-3)',
                            fontSize: 10, fontWeight: 700, flexShrink: 0,
                          }}>
                            Locked
                          </span>
                        )}
                      </div>
                      {ev.extendedProps?.groupName && (
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                          {ev.extendedProps.groupName}
                        </div>
                      )}
                      {isLocked && pactTarget != null && (
                        <div style={{ marginTop: 6 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-3)', marginBottom: 3 }}>
                            <span>Pact progress</span>
                            <span>{pactCount ?? 0}/{pactTarget}</span>
                          </div>
                          <div style={{ height: 3, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%',
                              width: `${pactTarget > 0 ? Math.min(100, ((pactCount ?? 0) / pactTarget) * 100) : 0}%`,
                              background: color,
                              borderRadius: 99,
                              transition: 'width 0.4s ease',
                            }} />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* RSVP pill */}
                    {rsvp && rsvp !== 'no' && (
                      <RsvpPill status={rsvp} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
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

  // Stats for "this month"
  const monthStats = useMemo(() => {
    const now = new Date()
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const monthEvents = events.filter(ev => ev.start.startsWith(ym))
    const going = monthEvents.filter(ev => {
      const rsvp = ev.extendedProps?.participants?.[0]?.rsvpStatus
      return rsvp === 'going'
    })
    return { total: monthEvents.length, going: going.length }
  }, [events])

  const allEntries = [
    { id: 'self', label: 'Personal', tagName: 'self' },
    ...(counts[GOOGLE_SOURCE_ID] > 0 ? [{ id: GOOGLE_SOURCE_ID, label: 'Google', tagName: GOOGLE_SOURCE_ID }] : []),
    ...groups.map(g => ({ id: String(g.groups_id), label: g.groups_title, tagName: g.tag_name })),
  ]

  return (
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-3)', paddingBottom: 8 }}>
        Calendars
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {allEntries.map(entry => {
          const active = activeGroups.has(entry.id)
          const color = entry.id === GOOGLE_SOURCE_ID ? GOOGLE_COLOR : groupColor(entry.tagName)
          const count = counts[entry.id] ?? 0

          return (
            <button
              key={entry.id}
              onClick={() => onToggle(entry.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '7px 8px',
                borderRadius: 'var(--r-sm)',
                border: active ? '1px solid var(--border)' : '1px solid transparent',
                background: active ? 'var(--surface-3)' : 'transparent',
                cursor: 'pointer',
                transition: 'var(--transition)',
                width: '100%',
                textAlign: 'left',
              }}
            >
              {/* Checkbox square */}
              <div style={{
                width: 16,
                height: 16,
                borderRadius: 5,
                border: `2px solid ${color}`,
                background: active ? color : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'var(--transition)',
              }}>
                {active && <Icon name="check" size={10} sw={3} style={{ color: '#fff' }} />}
              </div>

              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: active ? 'var(--text-1)' : 'var(--text-2)' }}>
                {entry.label}
              </span>

              {count > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Divider + stats */}
      <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8 }}>
        This month
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Group events</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>{monthStats.total}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>You're going</span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--g-work)', fontVariantNumeric: 'tabular-nums' }}>{monthStats.going}</span>
        </div>
      </div>
    </div>
  )
}

/* ─── CalendarPage ───────────────────────────────────────── */
type CalView = 'month' | 'agenda'
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
  // Phones open on the week strip + agenda; desktop on the month grid.
  const [calView, setCalView] = useState<CalView>(() => (window.innerWidth < 1024 ? 'agenda' : 'month'))
  const [currentDate, setCurrentDate] = useState(new Date())
  const todayKey = localDateKey(new Date())
  const [selectedKey, setSelectedKey] = useState(todayKey)
  const [activeGroups, setActiveGroups] = useState<Set<string>>(new Set(['self', GOOGLE_SOURCE_ID]))
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024)
  const loadSeq = useRef(0) // only the latest loadEvents() call may write state

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

  const filterEntries = [
    { id: 'self', label: 'Personal', tagName: 'self' },
    ...(events.some(ev => ev.extendedProps?.externalSource === GOOGLE_SOURCE_ID)
      ? [{ id: GOOGLE_SOURCE_ID, label: 'Google', tagName: GOOGLE_SOURCE_ID }] : []),
    ...groups.map(g => ({ id: String(g.groups_id), label: g.groups_title, tagName: g.tag_name })),
  ]

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
          <div style={{
            padding: '8px 12px 8px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <h1 style={{ flex: 1, fontSize: 22, fontWeight: 700, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.02em' }}>
                {monthLabel}{' '}
                <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>{yearLabel}</span>
              </h1>
              {refreshIndicator}
              <IconButton name="chevL" size={36} isz={16} onClick={navPrev} title="Previous month" />
              <IconButton name="chevR" size={36} isz={16} onClick={navNext} title="Next month" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Segmented
                options={[
                  { value: 'agenda', label: 'Agenda' },
                  { value: 'month', label: 'Month' },
                ]}
                value={calView}
                onChange={v => setCalView(v as CalView)}
                size="sm"
              />
              <Button variant="ghost" size="sm" onClick={navToday}>Today</Button>
              <div style={{ flex: 1 }} />
              <IconButton name="repeat" size={36} onClick={() => navigate('/routines')} title="Routines" />
              <IconButton name="hourglass" size={36} onClick={() => navigate('/countdowns')} title="Countdowns" />
            </div>
          </div>
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
            <IconButton name="chevL" size={34} isz={15} onClick={navPrev} title="Previous month" />
            <IconButton name="chevR" size={34} isz={15} onClick={navNext} title="Next month" />
            <Button variant="outline" size="sm" onClick={navToday}>Today</Button>
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
            <Button variant="ghost" size="sm" icon="repeat" onClick={() => navigate('/routines')}>Routines</Button>
            <Button variant="ghost" size="sm" icon="hourglass" onClick={() => navigate('/countdowns')}>Countdowns</Button>
            <Button variant="primary" size="sm" icon="plus" onClick={() => openCreate(selectedKey)}>New event</Button>
          </div>
        )}

        {/* Mobile: calendar filter chips — colour only in the dot */}
        {isMobile && (
          <div className="no-scrollbar" style={{
            display: 'flex',
            gap: 6,
            padding: '0 16px 10px',
            overflowX: 'auto',
            flexShrink: 0,
          }}>
            {filterEntries.map(entry => {
              const active = activeGroups.has(entry.id)
              const color = entry.id === GOOGLE_SOURCE_ID ? GOOGLE_COLOR : groupColor(entry.tagName)
              return (
                <button
                  key={entry.id}
                  aria-pressed={active}
                  onClick={() => toggleGroup(entry.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 32,
                    padding: '0 12px',
                    borderRadius: 'var(--r-full)',
                    border: '1px solid var(--border-2)',
                    background: 'transparent',
                    color: active ? 'var(--text-1)' : 'var(--text-3)',
                    fontSize: 13,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    transition: 'var(--transition)',
                  }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', boxSizing: 'border-box',
                    background: active ? color : 'transparent',
                    border: active ? 'none' : `1.5px solid ${color}`,
                  }} />
                  {entry.label}
                </button>
              )
            })}
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
          calView === 'month' ? (
            <MobileMonthGrid
              currentDate={currentDate}
              events={filteredEvents}
              onEventClick={handleAgendaEventClick}
              onAddEvent={handleGridAddEvent}
              currentUserId={currentUserId}
              eventHex={eventHex}
            />
          ) : (
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
              footer={
                <GroupFilterPanel
                  groups={groups}
                  events={events}
                  activeGroups={activeGroups}
                  onToggle={toggleGroup}
                />
              }
            />
          </div>
        ))}

        {/* Phone: one primary action, bottom-right above the tab bar */}
        {isMobile && (
          <button
            type="button"
            aria-label="New event"
            onClick={() => openCreate(calView === 'agenda' ? selectedKey : undefined)}
            style={{
              position: 'fixed',
              right: 16,
              bottom: 'calc(84px + env(safe-area-inset-bottom, 0px))',
              width: 56,
              height: 56,
              borderRadius: 18,
              border: 'none',
              background: 'var(--accent)',
              color: 'var(--accent-text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-md)',
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
