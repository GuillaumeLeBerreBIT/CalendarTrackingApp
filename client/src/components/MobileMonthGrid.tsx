import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import type { CalEvent } from '@/types'
import Icon from '@/components/ui/Icon'
import Button from '@/components/ui/Button'

/* ─── Helpers ────────────────────────────────────────────── */

/** Returns YYYY-MM-DD string in local time for a Date object */
function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Returns YYYY-MM for a Date */
function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Number of days in a month */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/**
 * Build the 6-row × 7-col grid for month `year/month`.
 * Weeks start Monday (ISO). Returns flat array of date objects,
 * with `otherMonth: true` for cells outside the target month.
 */
function buildMonthGrid(year: number, month: number): Array<{
  date: Date
  dateStr: string
  otherMonth: boolean
}> {
  const firstDay = new Date(year, month, 1)
  // getDay(): 0=Sun … 6=Sat. Shift so 0=Mon, 6=Sun.
  const startDow = (firstDay.getDay() + 6) % 7
  const dim = daysInMonth(year, month)
  const cells: Array<{ date: Date; dateStr: string; otherMonth: boolean }> = []

  // Days from previous month
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    cells.push({ date: d, dateStr: toDateStr(d), otherMonth: true })
  }
  // Days of current month
  for (let i = 1; i <= dim; i++) {
    const d = new Date(year, month, i)
    cells.push({ date: d, dateStr: toDateStr(d), otherMonth: false })
  }
  // Fill to complete a 6-row grid
  let next = 1
  while (cells.length < 42) {
    const d = new Date(year, month + 1, next++)
    cells.push({ date: d, dateStr: toDateStr(d), otherMonth: true })
  }
  return cells
}

const DOW_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/* ─── Types ──────────────────────────────────────────────── */
interface MobileMonthGridProps {
  /** Controlled current month — the component derives year/month from this */
  currentDate: Date
  /** All filtered events (same list passed to FullCalendar on desktop) */
  events: CalEvent[]
  /** Called when user taps a calendar event row in the day panel */
  onEventClick: (ev: CalEvent) => void
  /** Called when user taps "Add event" on an empty day — provides synthetic DateSelectArg-like value */
  onAddEvent: (dateStr: string) => void
  /** Current user id for RSVP resolution */
  currentUserId?: string | null
  /** Resolve display hex for an event's extendedProps */
  eventHex: (extendedProps?: Record<string, unknown>) => string
}

/* ─── MobileMonthGrid ────────────────────────────────────── */
export default function MobileMonthGrid({
  currentDate,
  events,
  onEventClick,
  onAddEvent,
  currentUserId,
  eventHex,
}: MobileMonthGridProps) {
  const todayStr = toDateStr(new Date())
  const [selectedDateStr, setSelectedDateStr] = useState<string>(
    // Default: today if it's in the visible month, else first of month
    () => {
      const tStr = toDateStr(new Date())
      const mKey = toMonthKey(currentDate)
      if (tStr.startsWith(mKey)) return tStr
      return toMonthKey(currentDate) + '-01'
    }
  )

  // When the visible month changes (external nav), update selectedDateStr
  // to remain valid in the new month
  const prevMonthKey = useRef(toMonthKey(currentDate))
  useEffect(() => {
    const mKey = toMonthKey(currentDate)
    if (mKey !== prevMonthKey.current) {
      prevMonthKey.current = mKey
      // If today is in the new month, select today; else first of month
      const tStr = toDateStr(new Date())
      setSelectedDateStr(tStr.startsWith(mKey) ? tStr : mKey + '-01')
    }
  }, [currentDate])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const cells = useMemo(() => buildMonthGrid(year, month), [year, month])

  // Index events by date string
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    for (const ev of events) {
      const dateStr = ev.start.split('T')[0]
      if (!map.has(dateStr)) map.set(dateStr, [])
      map.get(dateStr)!.push(ev)
    }
    return map
  }, [events])

  // Events for selected day, sorted by time
  const selectedEvents = useMemo(() => {
    const evs = eventsByDate.get(selectedDateStr) ?? []
    return [...evs].sort((a, b) => {
      if (a.allDay && !b.allDay) return -1
      if (!a.allDay && b.allDay) return 1
      return a.start.localeCompare(b.start)
    })
  }, [eventsByDate, selectedDateStr])

  // Day panel header label
  const selectedDateObj = useMemo(() => {
    // Parse local so "2024-06-15" doesn't shift timezone
    const [y, m, d] = selectedDateStr.split('-').map(Number)
    return new Date(y, m - 1, d)
  }, [selectedDateStr])

  const dayPanelHeader = selectedDateObj.toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  /* ── Swipe gesture ────────────────────────────────────── */
  // We report back to parent via onAddEvent/onEventClick; parent owns currentDate.
  // Swipe here needs to call parent's navPrev/navNext. Since those aren't passed as
  // props (they call calRef internally), we provide an onNavigate prop-style pattern
  // via a separate prop pair below. But the spec says parent prev/next buttons still
  // work — and the navPrev/navNext in CalendarPage already update currentDate when
  // MobileMonthGrid is active (we'll patch that below). So swipe can dispatch the
  // same logic by calling a passed-in callback.
  // → We'll use touch events on the grid wrapper.

  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }, [])

  // onNavigate prop — see CalendarPage integration below
  // We'll expose it as prop
  /* handled via props */

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* DOW header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        padding: '6px 8px 0',
        flexShrink: 0,
      }}>
        {DOW_LABELS.map((label, i) => (
          <div key={i} style={{
            textAlign: 'center',
            fontSize: 10.5,
            fontWeight: 700,
            color: 'var(--text-3)',
            letterSpacing: '0.04em',
            padding: '2px 0',
            textTransform: 'uppercase',
          }}>
            {label}
          </div>
        ))}
      </div>

      {/* Month grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          padding: '2px 8px 6px',
          flexShrink: 0,
          gap: 0,
          touchAction: 'pan-y',
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={(e) => {
          if (touchStartX.current == null || touchStartY.current == null) return
          const dx = e.changedTouches[0].clientX - touchStartX.current
          const dy = e.changedTouches[0].clientY - touchStartY.current
          // Only trigger horizontal if dominant axis and threshold met
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            // Dispatch custom event — CalendarPage listens for it
            window.dispatchEvent(new CustomEvent('mobileGridSwipe', {
              detail: { direction: dx < 0 ? 'next' : 'prev' },
            }))
          }
          touchStartX.current = null
          touchStartY.current = null
        }}
      >
        {cells.map(({ dateStr, otherMonth }) => {
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDateStr
          const dayEvs = eventsByDate.get(dateStr) ?? []
          const dotColors = dedupColors(dayEvs.map(ev => eventHex(ev.extendedProps as Record<string, unknown>)), 3)
          const overflowCount = dayEvs.length - 3

          return (
            <button
              key={dateStr}
              aria-label={dateStr}
              aria-pressed={isSelected}
              onClick={() => setSelectedDateStr(dateStr)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: 2,
                padding: '4px 2px 5px',
                border: 'none',
                borderRadius: 'var(--r-sm)',
                background: isSelected && !isToday
                  ? 'var(--accent-soft)'
                  : 'transparent',
                cursor: 'pointer',
                transition: 'background 150ms ease-out',
                minHeight: 44,
                // Prevent horizontal-swipe from triggering button clicks
                WebkitUserSelect: 'none',
                userSelect: 'none',
              }}
            >
              {/* Day number */}
              <span style={{
                width: 26,
                height: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                fontSize: 12.5,
                fontWeight: isToday || isSelected ? 700 : 500,
                color: isToday
                  ? '#fff'
                  : isSelected
                    ? 'var(--accent)'
                    : otherMonth
                      ? 'var(--text-3)'
                      : 'var(--text-2)',
                background: isToday ? 'var(--accent)' : 'transparent',
                flexShrink: 0,
                transition: 'background 150ms ease-out, color 150ms ease-out',
              }}>
                {Number(dateStr.split('-')[2])}
              </span>

              {/* Dots row */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2.5,
                minHeight: 8,
              }}>
                {dotColors.map((color, i) => (
                  <span key={i} style={{
                    width: 4.5,
                    height: 4.5,
                    borderRadius: '50%',
                    background: otherMonth ? 'var(--text-3)' : color,
                    opacity: otherMonth ? 0.35 : 1,
                    flexShrink: 0,
                  }} />
                ))}
                {overflowCount > 0 && (
                  <span style={{
                    fontSize: 8,
                    fontWeight: 700,
                    color: otherMonth ? 'var(--text-3)' : 'var(--accent)',
                    lineHeight: 1,
                  }}>+{overflowCount}</span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border)', flexShrink: 0, margin: '0 16px' }} />

      {/* Day panel */}
      <DayPanel
        dateStr={selectedDateStr}
        headerLabel={dayPanelHeader}
        events={selectedEvents}
        onEventClick={onEventClick}
        onAddEvent={onAddEvent}
        currentUserId={currentUserId}
        eventHex={eventHex}
      />
    </div>
  )
}

/* ─── DayPanel ───────────────────────────────────────────── */
interface DayPanelProps {
  dateStr: string
  headerLabel: string
  events: CalEvent[]
  onEventClick: (ev: CalEvent) => void
  onAddEvent: (dateStr: string) => void
  currentUserId?: string | null
  eventHex: (extendedProps?: Record<string, unknown>) => string
}

function DayPanel({ dateStr, headerLabel, events, onEventClick, onAddEvent, eventHex }: DayPanelProps) {
  // Animate panel content when selected day changes
  const [visible, setVisible] = useState(true)
  const prevDateRef = useRef(dateStr)

  useEffect(() => {
    if (dateStr !== prevDateRef.current) {
      prevDateRef.current = dateStr
      setVisible(false)
      const t = setTimeout(() => setVisible(true), 60)
      return () => clearTimeout(t)
    }
  }, [dateStr])

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Panel header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px 6px',
        flexShrink: 0,
      }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
            {headerLabel}
          </span>
          {events.length > 0 && (
            <span style={{
              marginLeft: 8,
              fontSize: 11.5,
              fontWeight: 600,
              color: 'var(--text-3)',
            }}>
              {events.length} event{events.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Always-present add button — creates an event on the selected day with
            its date prefilled (the empty-state button only shows when the day
            has no events, so this covers days that already have some). */}
        <button
          aria-label="Add event on this day"
          onClick={() => onAddEvent(dateStr)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--border)',
            background: 'var(--surface-2)',
            color: 'var(--accent)',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'background 150ms ease-out',
          }}
          onTouchStart={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-3)' }}
          onTouchEnd={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)' }}
        >
          <Icon name="plus" size={16} sw={2.2} />
        </button>
      </div>

      {/* Events list / empty state */}
      <div
        className="scroll"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 16px 80px',
          // Animate opacity/transform on day change
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(4px)',
          transition: 'opacity 180ms ease-out, transform 180ms ease-out',
        }}
      >
        {events.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
            paddingTop: 28,
          }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 'var(--r-md)',
              background: 'var(--surface-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Icon name="calendar" size={22} style={{ color: 'var(--text-3)' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)' }}>
                Nothing scheduled
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 4 }}>
                Tap to add something
              </div>
            </div>
            <Button
              variant="soft"
              size="sm"
              icon="plus"
              onClick={() => onAddEvent(dateStr)}
            >
              Add event
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {events.map(ev => (
              <EventRow
                key={ev.id}
                ev={ev}
                onEventClick={onEventClick}
                eventHex={eventHex}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── EventRow ───────────────────────────────────────────── */
interface EventRowProps {
  ev: CalEvent
  onEventClick: (ev: CalEvent) => void
  eventHex: (extendedProps?: Record<string, unknown>) => string
}

function EventRow({ ev, onEventClick, eventHex }: EventRowProps) {
  const color = eventHex(ev.extendedProps as Record<string, unknown>)
  const isTentative = ev.extendedProps?.status === 'tentative'
  const isLocked = ev.extendedProps?.status === 'locked'

  const timeStr = ev.allDay
    ? 'All day'
    : ev.start.includes('T')
      ? ev.start.split('T')[1].slice(0, 5)
      : ''

  const groupHint = ev.extendedProps?.groupName as string | undefined
  const participants = ev.extendedProps?.participants as Array<{ userId: string; username: string }> | undefined
  // Show participant hint only if multi-person (group event has groupName; personal shows first username)
  const participantHint = !groupHint && participants && participants.length > 1
    ? participants.slice(0, 2).map(p => p.username).join(', ')
    : undefined
  const hint = groupHint ?? participantHint

  return (
    <button
      onClick={() => onEventClick(ev)}
      aria-label={`${ev.title}, ${timeStr}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: isLocked ? 'var(--surface-2)' : 'var(--surface)',
        border: isTentative
          ? '1px dashed var(--border-2)'
          : isLocked
            ? '1px dashed var(--border-2)'
            : '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        padding: '11px 13px',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        minHeight: 44,
        opacity: isTentative ? 0.8 : isLocked ? 0.7 : 1,
        transition: 'background 150ms ease-out, border-color 150ms ease-out',
      }}
      onTouchStart={e => {
        ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)'
      }}
      onTouchEnd={e => {
        ;(e.currentTarget as HTMLButtonElement).style.background = isLocked ? 'var(--surface-2)' : 'var(--surface)'
      }}
    >
      {/* Color bar */}
      <div style={{
        width: 3,
        alignSelf: 'stretch',
        borderRadius: 99,
        background: color,
        borderStyle: isTentative ? 'dashed' : 'solid',
        flexShrink: 0,
      }} />

      {/* Time */}
      <span style={{
        fontSize: 12,
        fontVariantNumeric: 'tabular-nums',
        color: 'var(--text-3)',
        width: 44,
        flexShrink: 0,
        lineHeight: 1.3,
      }}>
        {timeStr}
      </span>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isLocked && (
            <span style={{ fontSize: 12, flexShrink: 0 }}>🔒</span>
          )}
          <span style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: isLocked ? 'var(--text-2)' : 'var(--text-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {ev.title}
          </span>
          {isTentative && (
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '1px 6px', borderRadius: 'var(--r-full)',
              background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
              fontSize: 10, fontWeight: 700, flexShrink: 0,
            }}>
              Voting
            </span>
          )}
        </div>
        {hint && (
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
            {hint}
          </div>
        )}
      </div>
    </button>
  )
}

/* ─── Utility: deduplicate dot colors ────────────────────── */
function dedupColors(colors: string[], max: number): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const c of colors) {
    if (result.length >= max) break
    if (!seen.has(c)) {
      seen.add(c)
      result.push(c)
    }
  }
  return result
}
