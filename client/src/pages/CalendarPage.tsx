import { useEffect, useRef, useState, useMemo } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import type { DateSelectArg, EventClickArg, EventDropArg } from '@fullcalendar/core'
import type { EventResizeDoneArg } from '@fullcalendar/interaction'
import api from '@/api/client'
import type { CalEvent, Group } from '@/types'
import EventModal from '@/components/EventModal'
import EventFormModal from '@/components/EventFormModal'
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

function groupColor(tagName?: string): string {
  if (!tagName) return 'var(--accent)'
  const key = tagName.toLowerCase().replace(/[^a-z]/g, '')
  return GROUP_COLORS[key] ?? 'var(--accent)'
}

/* ─── AgendaList ─────────────────────────────────────────── */
interface AgendaListProps {
  events: CalEvent[]
  onEventClick: (ev: CalEvent) => void
}

function AgendaList({ events, onEventClick }: AgendaListProps) {
  // Group by date string (YYYY-MM-DD)
  const byDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    for (const ev of events) {
      const day = ev.start.split('T')[0]
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
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-3)',
        fontSize: 14,
      }}>
        No events to show. Toggle a calendar group or add a new event.
      </div>
    )
  }

  return (
    <div className="scroll" style={{ flex: 1, overflowY: 'auto', padding: '12px 24px 24px' }}>
      {byDay.map(([dateStr, dayEvents]) => {
        const date = new Date(dateStr + 'T00:00:00')
        const dow = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
        const day = date.getDate()
        const isToday = dateStr === new Date().toISOString().split('T')[0]

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
                const color = groupColor(ev.extendedProps?.groupName)
                const rawRsvp = ev.extendedProps?.participants?.[0]?.rsvpStatus
                const rsvp = (['going', 'maybe', 'no'] as const).find(v => v === rawRsvp)
                const timeStr = ev.allDay
                  ? 'All day'
                  : ev.start.includes('T')
                    ? ev.start.split('T')[1].slice(0, 5)
                    : ''

                return (
                  <button
                    key={ev.id}
                    onClick={() => onEventClick(ev)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-md)',
                      padding: '11px 13px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'var(--transition)',
                      width: '100%',
                    }}
                    onMouseEnter={e => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)'
                      ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-2)'
                    }}
                    onMouseLeave={e => {
                      ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)'
                      ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'
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
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.title}
                      </div>
                      {ev.extendedProps?.groupName && (
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                          {ev.extendedProps.groupName}
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
    const map: Record<string, number> = { self: 0 }
    for (const g of groups) map[g.groups_id] = 0
    for (const ev of events) {
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
          const color = groupColor(entry.tagName)
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
  const { userId: currentUserId } = useAuthStore()
  const [events, setEvents] = useState<CalEvent[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [groupsLoaded, setGroupsLoaded] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('none')
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null)
  const [editEvent, setEditEvent] = useState<CalEvent | null>(null)
  const [selectInfo, setSelectInfo] = useState<DateSelectArg | null>(null)
  const [calView, setCalView] = useState<CalView>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [activeGroups, setActiveGroups] = useState<Set<string>>(new Set(['self']))
  const [isMobile, setIsMobile] = useState(false)
  const calRef = useRef<FullCalendar>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  async function loadEvents() {
    setLoading(true)
    try {
      const { data } = await api.get('/renderEvents')
      if (data.success) {
        setEvents(data.events)
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
      const gid = String(ev.extendedProps?.groupsId ?? '')
      if (!gid) return activeGroups.has('self')
      return activeGroups.has(gid)
    })
  }, [events, activeGroups, groupsLoaded])

  // Month label
  const monthLabel = currentDate.toLocaleDateString('en-US', { month: 'long' })
  const yearLabel = currentDate.getFullYear()

  function navPrev() {
    if (calView === 'month') {
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
    if (calView === 'month') {
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
    if (calView === 'month') {
      calRef.current?.getApi().today()
    }
    setCurrentDate(new Date())
  }

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

          {/* Right: view toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Mobile: new event button */}
            {isMobile && (
              <IconButton
                name="plus"
                size={36}
                onClick={() => { setSelectedEvent(null); setSelectInfo(null); setModalMode('create') }}
                title="New event"
              />
            )}
            <Segmented
              options={[
                { value: 'month', label: 'Month', icon: 'grid' },
                { value: 'agenda', label: 'Agenda', icon: 'list' },
              ]}
              value={calView}
              onChange={v => setCalView(v as CalView)}
              size="sm"
            />
          </div>
        </div>

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
              ...groups.map(g => ({ id: String(g.groups_id), label: g.groups_title, tagName: g.tag_name })),
            ].map(entry => {
              const active = activeGroups.has(entry.id)
              const color = groupColor(entry.tagName)
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
          <div style={{ flex: 1, overflow: 'hidden', padding: '0 0 16px' }}>
            <FullCalendar
              ref={calRef}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
              initialView="dayGridMonth"
              headerToolbar={false}
              events={filteredEvents}
              selectable
              editable
              droppable
              select={handleDateSelect}
              eventClick={handleEventClick}
              eventDrop={handleEventDrop}
              eventResize={handleEventResize}
              datesSet={handleDatesSet}
              height="100%"
              eventContent={makeRenderEventContent(currentUserId)}
            />
          </div>
        ) : (
          <AgendaList
            events={filteredEvents}
            onEventClick={handleAgendaEventClick}
          />
        ))}
      </div>

      {modalMode === 'create' && (
        <EventFormModal
          event={null}
          selectInfo={selectInfo}
          groups={groups}
          currentUserId={currentUserId}
          onClose={closeModal}
          onSaved={() => { closeModal(); loadEvents() }}
        />
      )}

      {modalMode === 'view' && selectedEvent && (
        <EventModal
          data={selectedEvent}
          onClose={closeModal}
          onEdit={() => { setEditEvent(selectedEvent); setModalMode('edit') }}
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
function makeRenderEventContent(currentUserId: string | null | undefined) {
  return function renderEventContent(info: { event: { title: string; allDay: boolean; startStr: string; extendedProps: Record<string, unknown> } }) {
    const { event } = info
    const color = groupColor(event.extendedProps?.groupName as string | undefined)
    const timeStr = (!event.allDay && event.startStr.includes('T'))
      ? event.startStr.split('T')[1].slice(0, 5)
      : ''

    const participants = event.extendedProps?.participants as Array<{ userId: string; rsvpStatus: string }> | undefined
    const myRsvp = participants?.find(p => p.userId === currentUserId)?.rsvpStatus
    const eventType = event.extendedProps?.eventType as string | undefined

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 4px',
        overflow: 'hidden',
        width: '100%',
        transition: 'transform var(--transition)',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateX(1px)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'none' }}
      >
        {eventType === 'social' ? (
          <Icon name="users" size={9} sw={2} style={{ color, flexShrink: 0 }} />
        ) : (
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: color,
            flexShrink: 0,
          }} />
        )}
        {myRsvp && myRsvp !== 'going' && (
          <span style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            flexShrink: 0,
            background: myRsvp === 'maybe' ? '#f59e0b' : 'var(--text-3)',
            opacity: myRsvp === 'pending' ? 0.6 : 1,
          }} />
        )}
        {timeStr && (
          <span style={{
            fontSize: 10.5,
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--text-3)',
            flexShrink: 0,
          }}>{timeStr}</span>
        )}
        <span style={{
          fontSize: 11.5,
          fontWeight: 600,
          color: 'var(--text-1)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>{event.title}</span>
      </div>
    )
  }
}
