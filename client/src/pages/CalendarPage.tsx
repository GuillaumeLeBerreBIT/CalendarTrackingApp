import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import type { DateSelectArg, EventClickArg, EventDropArg } from '@fullcalendar/core'
import type { EventResizeDoneArg, DateClickArg } from '@fullcalendar/interaction'
import api from '@/api/client'
import type { CalEvent, Group } from '@/types'
import EventModal from '@/components/EventModal'
import EventFormModal from '@/components/EventFormModal'
import MobileMonthGrid from '@/components/MobileMonthGrid'
import { parseNL, type ParsedEvent } from '@/lib/nlParser'
import Button, { IconButton } from '@/components/ui/Button'
import { Segmented, RsvpPill } from '@/components/ui/Primitives'
import Icon from '@/components/ui/Icon'
import { useAuthStore } from '@/store/authStore'

const MOBILE_LAYOUT_KEY = 'eventli.mobileMonthLayout'
type MobileLayout = 'compact' | 'detailed'

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
      const day = ev.start.split('T')[0]
      if (day < todayKey) continue
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
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', paddingBottom: 8 }}>
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
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 8 }}>
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
  const [loading, setLoading] = useState(true)
  const [groupsLoaded, setGroupsLoaded] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('none')
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null)
  const [editEvent, setEditEvent] = useState<CalEvent | null>(null)
  const [selectInfo, setSelectInfo] = useState<DateSelectArg | null>(null)
  const [nlPrefill, setNlPrefill] = useState<ParsedEvent | null>(null)
  const [quickAddText, setQuickAddText] = useState('')
  const [calView, setCalView] = useState<CalView>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [activeGroups, setActiveGroups] = useState<Set<string>>(new Set(['self', GOOGLE_SOURCE_ID]))
  const [isMobile, setIsMobile] = useState(false)
  const [mobileLayout, setMobileLayout] = useState<MobileLayout>(() => {
    try {
      const stored = localStorage.getItem(MOBILE_LAYOUT_KEY)
      if (stored === 'compact' || stored === 'detailed') return stored
    } catch { /* ignore */ }
    return 'compact'
  })
  const calRef = useRef<FullCalendar>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Persist mobileLayout to localStorage
  useEffect(() => {
    try { localStorage.setItem(MOBILE_LAYOUT_KEY, mobileLayout) } catch { /* ignore */ }
  }, [mobileLayout])

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

  async function loadEvents() {
    setLoading(true)
    try {
      const { data } = await api.get('/renderEvents')
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
          return {
            ...ev,
            backgroundColor: hex + '22',
            borderColor: hex,
            extendedProps: { ...(ev.extendedProps ?? {}), resolvedHex: hex },
          }
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
      // silently fail — auth interceptor handles 401
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEvents()
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

  function handleDateSelect(info: DateSelectArg) {
    setSelectedEvent(null)
    setSelectInfo(info)
    setModalMode('create')
  }

  // Single tap/click on a day cell → create modal with that date prefilled.
  // `select` only fires after a long-press on touch, so `dateClick` is what
  // makes tap-to-create work on mobile (detailed layout) as well as desktop.
  function handleDateClick(info: DateClickArg) {
    setNlPrefill(null)
    handleGridAddEvent(info.dateStr.split('T')[0])
  }

  function handleEventClick(info: EventClickArg) {
    const ev = events.find((e) => String(e.id) === String(info.event.id))
    if (ev) {
      setSelectedEvent(ev)
      setSelectInfo(null)
      setModalMode('view')
    }
  }

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

  async function handleEventDrop(info: EventDropArg) {
    const { event } = info
    try {
      await api.patch(`/parseEvent/${event.id}`, {
        startDate: event.startStr.split('T')[0],
        endDate: event.endStr ? event.endStr.split('T')[0] : event.startStr.split('T')[0],
        startTime: event.allDay ? null : event.startStr.split('T')[1]?.slice(0, 5),
        endTime: event.allDay ? null : event.endStr?.split('T')[1]?.slice(0, 5),
        allDay: event.allDay,
      })
      loadEvents()
    } catch {
      info.revert()
    }
  }

  async function handleEventResize(info: EventResizeDoneArg) {
    const { event } = info
    try {
      await api.patch(`/parseEvent/${event.id}`, {
        startDate: event.startStr.split('T')[0],
        endDate: event.endStr ? event.endStr.split('T')[0] : event.startStr.split('T')[0],
        startTime: event.allDay ? null : event.startStr.split('T')[1]?.slice(0, 5),
        endTime: event.allDay ? null : event.endStr?.split('T')[1]?.slice(0, 5),
        allDay: event.allDay,
      })
      loadEvents()
    } catch {
      info.revert()
    }
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

  // Filter events for FullCalendar based on active groups
  const filteredEvents = useMemo(() => {
    if (!groupsLoaded) return events  // show everything until user can see the filter panel
    return events.filter(ev => {
      if (ev.extendedProps?.externalSource === GOOGLE_SOURCE_ID) return activeGroups.has(GOOGLE_SOURCE_ID)
      const gid = String(ev.extendedProps?.groupsId ?? '')
      if (!gid) return activeGroups.has('self')
      return activeGroups.has(gid)
    })
  }, [events, activeGroups, groupsLoaded])

  // Month label
  const monthLabel = currentDate.toLocaleDateString('en-US', { month: 'long' })
  const yearLabel = currentDate.getFullYear()

  // Whether the compact grid is mounted (no calRef available)
  const isCompactGridActive = isMobile && calView === 'month' && mobileLayout === 'compact'

  function navPrev() {
    if (calView === 'month' && !isCompactGridActive) {
      calRef.current?.getApi().prev()
      setCurrentDate(calRef.current?.getApi().getDate() ?? currentDate)
    } else {
      setCurrentDate(d => {
        const n = new Date(d)
        n.setMonth(n.getMonth() - 1)
        return n
      })
    }
  }

  function navNext() {
    if (calView === 'month' && !isCompactGridActive) {
      calRef.current?.getApi().next()
      setCurrentDate(calRef.current?.getApi().getDate() ?? currentDate)
    } else {
      setCurrentDate(d => {
        const n = new Date(d)
        n.setMonth(n.getMonth() + 1)
        return n
      })
    }
  }

  function navToday() {
    if (calView === 'month' && !isCompactGridActive) {
      calRef.current?.getApi().today()
    }
    setCurrentDate(new Date())
  }

  // Stable callback for MobileMonthGrid "add event" — creates a synthetic DateSelectArg-like object
  const handleGridAddEvent = useCallback((dateStr: string) => {
    // Build a minimal synthetic selectInfo that EventFormModal understands
    const start = new Date(dateStr + 'T00:00:00')
    const end = new Date(dateStr + 'T00:00:00')
    end.setDate(end.getDate() + 1)
    setSelectedEvent(null)
    setSelectInfo({
      start,
      end,
      startStr: dateStr,
      endStr: dateStr,
      allDay: true,
      jsEvent: null as never,
      view: null as never,
    })
    setModalMode('create')
  }, [])

  // Sync currentDate when FullCalendar nav fires internally
  function handleDatesSet() {
    if (calRef.current) {
      setCurrentDate(calRef.current.getApi().getDate())
    }
  }

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      overflow: 'hidden',
      background: 'var(--bg)',
    }}>
      <style>{`
        .fc-event-tentative {
          opacity: 0.6 !important;
          border-style: dashed !important;
          background: transparent !important;
          border-width: 2px !important;
        }
      `}</style>
      {/* ── Left panel (desktop only) ─────────────────────── */}
      {!isMobile && (
        <aside style={{
          width: 248,
          flexShrink: 0,
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          padding: '20px 16px',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          gap: 0,
        }} className="scroll">
          <Button
            variant="primary"
            full
            icon="plus"
            size="md"
            style={{ marginBottom: 18 }}
            onClick={() => { setSelectedEvent(null); setSelectInfo(null); setModalMode('create') }}
          >
            New event
          </Button>

          <GroupFilterPanel
            groups={groups}
            events={events}
            activeGroups={activeGroups}
            onToggle={toggleGroup}
          />
        </aside>
      )}

      {/* ── Main area ────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

        {/* Header */}
        {isMobile ? (
          /* ── Mobile: 2-row layout so controls aren't clipped ── */
          <div style={{
            padding: '10px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            flexShrink: 0,
          }}>
            {/* Row 1: Today · Month Year · ‹ ›
                Today lives up here (balanced against the chevron group) so the
                view controls below fit on a single tidy row. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Button variant="ghost" size="sm" onClick={navToday} style={{ flexShrink: 0 }}>Today</Button>
              <h1 style={{
                flex: 1, textAlign: 'center',
                fontSize: 17, fontWeight: 700, color: 'var(--text-1)',
                margin: 0, letterSpacing: '-0.02em',
              }}>
                {monthLabel}{' '}
                <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>{yearLabel}</span>
              </h1>
              <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                <IconButton name="chevL" size={36} isz={16} onClick={navPrev} title="Previous" />
                <IconButton name="chevR" size={36} isz={16} onClick={navNext} title="Next" />
              </div>
            </div>
            {/* Row 2: [Month|Agenda] · · · [layout toggle] [countdowns] [+]
                With Today moved to Row 1 these controls fit on one row without
                wrapping, so the "+" primary action is never clipped. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Segmented
                options={[
                  { value: 'month', label: 'Month', icon: 'grid' },
                  { value: 'agenda', label: 'Agenda', icon: 'list' },
                ]}
                value={calView}
                onChange={v => setCalView(v as CalView)}
                size="sm"
              />
              <div style={{ flex: 1 }} />
              {/* Layout toggle — only visible when showing month on mobile */}
              {calView === 'month' && (
                <div
                  role="group"
                  aria-label="Calendar layout"
                  style={{
                    display: 'inline-flex',
                    gap: 2,
                    padding: 3,
                    background: 'var(--surface-3)',
                    borderRadius: 'var(--r-sm)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {/* Compact: dot-grid icon */}
                  <button
                    aria-label="Compact layout"
                    aria-pressed={mobileLayout === 'compact'}
                    onClick={() => setMobileLayout('compact')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 32,
                      height: 32,
                      borderRadius: 'calc(var(--r-sm) - 3px)',
                      border: 'none',
                      background: mobileLayout === 'compact' ? 'var(--surface-hi)' : 'transparent',
                      color: mobileLayout === 'compact' ? 'var(--accent)' : 'var(--text-3)',
                      cursor: 'pointer',
                      transition: 'var(--transition)',
                    }}
                  >
                    <Icon name="grid" size={14} />
                  </button>
                  {/* Detailed: pills / list icon */}
                  <button
                    aria-label="Detailed layout"
                    aria-pressed={mobileLayout === 'detailed'}
                    onClick={() => setMobileLayout('detailed')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 32,
                      height: 32,
                      borderRadius: 'calc(var(--r-sm) - 3px)',
                      border: 'none',
                      background: mobileLayout === 'detailed' ? 'var(--surface-hi)' : 'transparent',
                      color: mobileLayout === 'detailed' ? 'var(--accent)' : 'var(--text-3)',
                      cursor: 'pointer',
                      transition: 'var(--transition)',
                    }}
                  >
                    <Icon name="list" size={14} />
                  </button>
                </div>
              )}
              <IconButton
                name="timer"
                size={36}
                onClick={() => navigate('/countdowns')}
                title="Countdowns"
              />
              <IconButton
                name="plus"
                size={36}
                onClick={() => { setSelectedEvent(null); setSelectInfo(null); setModalMode('create') }}
                title="New event"
              />
            </div>
          </div>
        ) : (
          /* ── Desktop: original single-row layout ── */
          <div style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            gap: 12,
          }}>
            {/* Left: title + nav */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.03em', whiteSpace: 'nowrap' }}>
                {monthLabel}{' '}
                <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>{yearLabel}</span>
              </h1>
              <div style={{ display: 'flex', gap: 2, marginLeft: 6 }}>
                <IconButton name="chevL" size={34} isz={15} onClick={navPrev} title="Previous" />
                <IconButton name="chevR" size={34} isz={15} onClick={navNext} title="Next" />
              </div>
              <Button variant="ghost" size="sm" onClick={navToday}>Today</Button>
            </div>

            {/* Right: view toggle + countdowns */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Segmented
                options={[
                  { value: 'month', label: 'Month', icon: 'grid' },
                  { value: 'agenda', label: 'Agenda', icon: 'list' },
                ]}
                value={calView}
                onChange={v => setCalView(v as CalView)}
                size="sm"
              />
              <IconButton name="timer" size={34} isz={15} onClick={() => navigate('/countdowns')} title="Countdowns" />
            </div>
          </div>
        )}

        {/* Quick-add bar */}
        {!isMobile && (
          <form
            onSubmit={e => {
              e.preventDefault()
              if (!quickAddText.trim()) return
              const parsed = parseNL(quickAddText)
              setNlPrefill(parsed)
              setSelectInfo(null)
              setModalMode('create')
              setQuickAddText('')
            }}
            style={{
              padding: '10px 24px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              gap: 8,
              flexShrink: 0,
            }}
          >
            <input
              value={quickAddText}
              onChange={e => setQuickAddText(e.target.value)}
              placeholder="Quick add: &quot;Lunch Friday 1pm at Marco's&quot;"
              style={{
                flex: 1,
                background: 'var(--surface-2)',
                border: '1px solid var(--border-2)',
                borderRadius: 'var(--r-sm)',
                padding: '9px 14px',
                fontSize: 13.5,
                color: 'var(--text-1)',
                outline: 'none',
                minHeight: 40,
              }}
            />
            <button type="submit" style={{
              padding: '0 16px',
              borderRadius: 'var(--r-sm)',
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 600,
              fontSize: 13.5,
              border: 'none',
              cursor: 'pointer',
              minHeight: 40,
            }}>
              Add
            </button>
          </form>
        )}

        {/* Mobile: group filter pills */}
        {isMobile && (
          <div className="no-scrollbar" style={{
            display: 'flex',
            gap: 6,
            padding: '10px 16px',
            overflowX: 'auto',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            {[
              { id: 'self', label: 'Personal', tagName: 'self' },
              ...(events.some(ev => ev.extendedProps?.externalSource === GOOGLE_SOURCE_ID)
                ? [{ id: GOOGLE_SOURCE_ID, label: 'Google', tagName: GOOGLE_SOURCE_ID }] : []),
              ...groups.map(g => ({ id: String(g.groups_id), label: g.groups_title, tagName: g.tag_name })),
            ].map(entry => {
              const active = activeGroups.has(entry.id)
              const color = entry.id === GOOGLE_SOURCE_ID ? GOOGLE_COLOR : groupColor(entry.tagName)
              return (
                <button
                  key={entry.id}
                  onClick={() => toggleGroup(entry.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 11px',
                    borderRadius: 'var(--r-full)',
                    border: `1px solid ${active ? color : 'var(--border)'}`,
                    background: active ? `${color}18` : 'var(--surface)',
                    color: active ? color : 'var(--text-3)',
                    fontSize: 12,
                    fontWeight: 650,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    transition: 'var(--transition)',
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                  {entry.label}
                </button>
              )
            })}
          </div>
        )}

        {/* Loading indicator */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-3)', fontSize: 14 }}>
            Loading events…
          </div>
        )}

        {/* Calendar area */}
        {!loading && (calView === 'month' ? (
          isCompactGridActive ? (
            /* ── Compact dot-grid layout ── */
            <MobileMonthGrid
              currentDate={currentDate}
              events={filteredEvents}
              onEventClick={handleAgendaEventClick}
              onAddEvent={handleGridAddEvent}
              currentUserId={currentUserId}
              eventHex={eventHex}
            />
          ) : (
            /* ── FullCalendar month view (desktop + mobile-detailed) ── */
            <div
              className={isMobile && mobileLayout === 'detailed' ? 'mobile-detailed' : undefined}
              style={{ flex: 1, overflow: 'hidden', padding: '0 0 16px' }}
            >
              <FullCalendar
                ref={calRef}
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
                initialView="dayGridMonth"
                headerToolbar={false}
                firstDay={1}
                events={filteredEvents}
                // On mobile, range-select needs a long-press that also triggers the
                // native text magnifier ("weirdly zoomed" view). Disable it so a clean
                // single tap fires dateClick → prefilled form, just like the + button.
                selectable={!isMobile}
                editable
                droppable
                select={handleDateSelect}
                dateClick={handleDateClick}
                eventClick={handleEventClick}
                eventDrop={handleEventDrop}
                eventResize={handleEventResize}
                datesSet={handleDatesSet}
                height="100%"
                dayMaxEvents={isMobile ? 4 : false}
                eventContent={makeRenderEventContent(isMobile, mobileLayout)}
                eventClassNames={(arg) => {
                  if (arg.event.extendedProps?.status === 'tentative') return ['fc-event-tentative']
                  return []
                }}
                eventDidMount={(info) => {
                  const hex = eventHex(info.event.extendedProps as Record<string, unknown>)
                  const isTentative = info.event.extendedProps?.status === 'tentative'
                  // Compute transparent bg — handle both #rrggbb and hsl(...) formats.
                  // Tentative events get a fainter fill so they read as unconfirmed.
                  const alpha = isTentative ? 0.07 : 0.12
                  const bgAlpha = hex.startsWith('hsl(') && hex.endsWith(')')
                    ? hex.slice(0, -1) + ` / ${alpha})`
                    : hex + (isTentative ? '12' : '1e')
                  // Feed CSS custom properties — index.css reads these on .fc-daygrid-event
                  info.el.style.setProperty('--fc-event-bg-color', bgAlpha)
                  info.el.style.setProperty('--fc-event-border-color', hex)
                  if (isTentative) {
                    // Dashed outline + reduced opacity (opacity comes from the
                    // .fc-event-tentative rule in index.css)
                    info.el.classList.add('fc-event-tentative')
                    info.el.style.borderStyle = 'dashed'
                  }
                }}
              />
            </div>
          )
        ) : (
          <AgendaList
            events={filteredEvents}
            onEventClick={handleAgendaEventClick}
            onAddEvent={() => { setSelectedEvent(null); setSelectInfo(null); setModalMode('create') }}
          />
        ))}
      </div>

      {modalMode === 'create' && (
        <EventFormModal
          event={null}
          selectInfo={selectInfo}
          groups={groups}
          currentUserId={currentUserId}
          prefill={nlPrefill ?? undefined}
          onClose={() => { setNlPrefill(null); closeModal() }}
          onSaved={() => { setNlPrefill(null); closeModal(); loadEvents() }}
        />
      )}

      {modalMode === 'view' && selectedEvent && (
        <EventModal
          data={selectedEvent}
          onClose={closeModal}
          onEdit={() => { setEditEvent(selectedEvent); setModalMode('edit') }}
          onDeleted={() => { closeModal(); loadEvents() }}
          currentUserId={currentUserId ?? undefined}
          onRsvp={loadEvents}
        />
      )}

      {modalMode === 'edit' && editEvent && (
        <EventFormModal
          event={editEvent}
          selectInfo={null}
          groups={groups}
          currentUserId={currentUserId}
          onClose={closeModal}
          onSaved={() => { closeModal(); loadEvents() }}
        />
      )}
    </div>
  )
}

/* ─── Custom FullCalendar event renderer factory ─────────── */
export function makeRenderEventContent(
  isMobile = false,
  mobileLayout: MobileLayout = 'compact',
) {
  return function renderEventContent(info: { event: { id: string; title: string; allDay: boolean; startStr: string; extendedProps: Record<string, unknown> } }) {
    const { event } = info
    // On phones the cell is too narrow for time + title — the title is the
    // information that matters, the time lives in the event modal/agenda.
    // In detailed mode on mobile we also skip the time prefix.
    const timeStr = (!isMobile && !event.allDay && event.startStr.includes('T'))
      ? event.startStr.split('T')[1].slice(0, 5)
      : ''
    const isRecurring = !!event.extendedProps?.isRecurring

    // No leading type indicator on any size: the colored left border on
    // .fc-daygrid-event conveys the event color, and tentative events keep
    // their dashed border styling via CSS.
    const isDetailedMobile = isMobile && mobileLayout === 'detailed'

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: isDetailedMobile ? 0 : isMobile ? 3 : 4,
        padding: isDetailedMobile ? '1px 0 1px 2px' : isMobile ? '1px 3px' : '1px 5px',
        overflow: 'hidden',
        width: '100%',
      }}>
        {/* Time */}
        {timeStr && (
          <span style={{
            fontSize: 10, fontVariantNumeric: 'tabular-nums',
            color: 'var(--text-3)', flexShrink: 0,
          }}>{timeStr}</span>
        )}

        {/* Title — detailed mobile mimics Klender: fine regular-weight type
            that clips at the cell edge (no ellipsis stealing characters) */}
        <span style={{
          fontSize: isDetailedMobile ? 9.5 : isMobile ? 10.5 : 11.5,
          fontWeight: isDetailedMobile ? 500 : 600,
          lineHeight: isDetailedMobile ? 1.5 : undefined,
          color: 'var(--text-1)',
          overflow: 'hidden',
          textOverflow: 'clip',
          whiteSpace: 'nowrap',
          flex: 1,
        }}>{event.title}</span>

        {/* Recurring indicator — 'refresh' not in IconPaths, use a dot */}
        {isRecurring && !isMobile && (
          <span style={{ color: 'var(--text-3)', flexShrink: 0, opacity: 0.7, fontSize: 9 }}>↻</span>
        )}
      </div>
    )
  }
}
