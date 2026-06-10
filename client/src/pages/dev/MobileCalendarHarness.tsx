/**
 * DEV-ONLY: Harness for visually testing MobileMonthGrid.
 * Only imported / rendered when import.meta.env.DEV is true.
 * Route: /dev/mobile-calendar
 */
import { useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import MobileMonthGrid from '@/components/MobileMonthGrid'
import { makeRenderEventContent } from '@/pages/CalendarPage'
import type { CalEvent } from '@/types'

/* ── Realistic mock events ──────────────────────────────── */
// Build relative to "today" so they're always in the current month
function today(): Date { return new Date() }
function dateStr(offsetDays: number): string {
  const d = new Date(today())
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().split('T')[0]
}
function isoWithTime(offsetDays: number, hh: number, mm: number): string {
  const d = new Date(today())
  d.setDate(d.getDate() + offsetDays)
  return `${d.toISOString().split('T')[0]}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`
}

const MOCK_EVENTS: CalEvent[] = [
  // Today — 2 events
  {
    id: '1',
    title: 'Team standup',
    start: isoWithTime(0, 9, 30),
    allDay: false,
    extendedProps: {
      groupName: 'Work',
      groupsId: 'g1',
      resolvedHex: '#22d3aa',
      participants: [
        { userId: 'u1', username: 'me', rsvpStatus: 'going' },
        { userId: 'u2', username: 'alice', rsvpStatus: 'going' },
      ],
      status: 'confirmed',
    },
  },
  {
    id: '2',
    title: 'Lunch with Sarah',
    start: isoWithTime(0, 12, 30),
    allDay: false,
    extendedProps: {
      groupName: 'Friends',
      groupsId: 'g2',
      resolvedHex: '#ec4899',
      participants: [
        { userId: 'u1', username: 'me', rsvpStatus: 'going' },
        { userId: 'u3', username: 'sarah', rsvpStatus: 'going' },
      ],
      status: 'confirmed',
    },
  },
  // Tomorrow — all-day + timed
  {
    id: '3',
    title: 'Code review',
    start: isoWithTime(1, 14, 0),
    allDay: false,
    extendedProps: {
      groupName: 'Work',
      groupsId: 'g1',
      resolvedHex: '#22d3aa',
      participants: [{ userId: 'u1', username: 'me', rsvpStatus: 'going' }],
      status: 'confirmed',
    },
  },
  {
    id: '4',
    title: "Alice's birthday",
    start: dateStr(1),
    allDay: true,
    extendedProps: {
      groupName: 'Friends',
      groupsId: 'g2',
      resolvedHex: '#ec4899',
      participants: [{ userId: 'u1', username: 'me', rsvpStatus: 'going' }],
      status: 'confirmed',
    },
  },
  // +3 days — tentative event
  {
    id: '5',
    title: 'Team dinner — vote open',
    start: isoWithTime(3, 19, 0),
    allDay: false,
    extendedProps: {
      groupName: 'Work',
      groupsId: 'g1',
      resolvedHex: '#22d3aa',
      participants: [
        { userId: 'u1', username: 'me', rsvpStatus: 'maybe' },
        { userId: 'u2', username: 'alice', rsvpStatus: 'going' },
      ],
      status: 'tentative',
    },
  },
  // +3 days — extra event on same day (overflow dot)
  {
    id: '6',
    title: 'Climbing session',
    start: isoWithTime(3, 18, 0),
    allDay: false,
    extendedProps: {
      groupName: 'Climb',
      groupsId: 'g3',
      resolvedHex: '#38bdf8',
      participants: [{ userId: 'u1', username: 'me', rsvpStatus: 'going' }],
      status: 'confirmed',
    },
  },
  // +3 days — 3rd event (triggers +1 overflow)
  {
    id: '6b',
    title: 'Weekly retro',
    start: isoWithTime(3, 10, 0),
    allDay: false,
    extendedProps: {
      groupName: 'Work',
      groupsId: 'g1',
      resolvedHex: '#22d3aa',
      participants: [{ userId: 'u1', username: 'me', rsvpStatus: 'going' }],
      status: 'confirmed',
    },
  },
  // +5 days — personal event
  {
    id: '7',
    title: 'Dentist appointment',
    start: isoWithTime(5, 10, 0),
    allDay: false,
    extendedProps: {
      resolvedHex: '#7c6ef2',
      participants: [{ userId: 'u1', username: 'me', rsvpStatus: 'going' }],
      status: 'confirmed',
    },
  },
  // +8 days
  {
    id: '8',
    title: 'Book club',
    start: isoWithTime(8, 20, 0),
    allDay: false,
    extendedProps: {
      groupName: 'Book',
      groupsId: 'g4',
      resolvedHex: '#c084fc',
      participants: [
        { userId: 'u1', username: 'me', rsvpStatus: 'going' },
        { userId: 'u5', username: 'bob', rsvpStatus: 'going' },
      ],
      status: 'confirmed',
    },
  },
  // +10 days — locked pact event
  {
    id: '9',
    title: 'Marathon training',
    start: dateStr(10),
    allDay: true,
    extendedProps: {
      groupName: 'Friends',
      groupsId: 'g2',
      resolvedHex: '#ec4899',
      participants: [{ userId: 'u1', username: 'me', rsvpStatus: 'going' }],
      status: 'locked',
      pactId: 1,
      pactCompletionsCount: 3,
      pactTargetCompletions: 10,
    },
  },
  // +12 days
  {
    id: '10',
    title: 'Product demo',
    start: isoWithTime(12, 15, 0),
    allDay: false,
    extendedProps: {
      groupName: 'Work',
      groupsId: 'g1',
      resolvedHex: '#22d3aa',
      participants: [
        { userId: 'u1', username: 'me', rsvpStatus: 'going' },
        { userId: 'u2', username: 'alice', rsvpStatus: 'going' },
      ],
      status: 'confirmed',
    },
  },
  // -3 days (earlier this month or last month)
  {
    id: '11',
    title: 'Sprint planning',
    start: isoWithTime(-3, 10, 0),
    allDay: false,
    extendedProps: {
      groupName: 'Work',
      groupsId: 'g1',
      resolvedHex: '#22d3aa',
      participants: [{ userId: 'u1', username: 'me', rsvpStatus: 'going' }],
      status: 'confirmed',
    },
  },
  // -1 day
  {
    id: '12',
    title: 'Yoga class',
    start: isoWithTime(-1, 7, 30),
    allDay: false,
    extendedProps: {
      resolvedHex: '#f97316',
      participants: [{ userId: 'u1', username: 'me', rsvpStatus: 'going' }],
      status: 'confirmed',
    },
  },
  // +15 days
  {
    id: '13',
    title: 'Family dinner',
    start: isoWithTime(15, 19, 30),
    allDay: false,
    extendedProps: {
      groupName: 'Family',
      groupsId: 'g5',
      resolvedHex: '#f59e0b',
      participants: [
        { userId: 'u1', username: 'me', rsvpStatus: 'going' },
        { userId: 'u6', username: 'mum', rsvpStatus: 'going' },
      ],
      status: 'confirmed',
    },
  },
  // +20 days
  {
    id: '14',
    title: 'Conference: React Summit',
    start: dateStr(20),
    allDay: true,
    extendedProps: {
      resolvedHex: '#7c6ef2',
      participants: [{ userId: 'u1', username: 'me', rsvpStatus: 'going' }],
      status: 'confirmed',
    },
  },
  // +21 days (all-day continuation)
  {
    id: '15',
    title: 'Conference: React Summit',
    start: dateStr(21),
    allDay: true,
    extendedProps: {
      resolvedHex: '#7c6ef2',
      participants: [{ userId: 'u1', username: 'me', rsvpStatus: 'going' }],
      status: 'confirmed',
    },
  },
]

/* ─── eventHex helper (minimal version for harness) ─────── */
function eventHex(extendedProps?: Record<string, unknown>): string {
  if (!extendedProps) return '#7c6ef2'
  if (extendedProps.resolvedHex) return extendedProps.resolvedHex as string
  return '#7c6ef2'
}

/* ─── Harness page ───────────────────────────────────────── */
export default function MobileCalendarHarness() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [mobileLayout, setMobileLayout] = useState<'compact' | 'detailed'>('compact')
  const [log, setLog] = useState<string[]>([])

  function addLog(msg: string) {
    setLog(prev => [msg, ...prev].slice(0, 8))
  }

  function navPrev() {
    setCurrentDate(d => {
      const n = new Date(d)
      n.setMonth(n.getMonth() - 1)
      return n
    })
  }

  function navNext() {
    setCurrentDate(d => {
      const n = new Date(d)
      n.setMonth(n.getMonth() + 1)
      return n
    })
  }

  const monthLabel = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div style={{
      width: '100vw',
      height: '100dvh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* DEV toolbar */}
      <div style={{
        background: 'var(--surface-2)',
        borderBottom: '1px solid var(--border)',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
          DEV
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', flex: 1 }}>
          MobileMonthGrid harness — 375×812
        </span>
        {/* Layout toggle */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => setMobileLayout('compact')}
            style={{
              padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6,
              border: 'none', cursor: 'pointer',
              background: mobileLayout === 'compact' ? 'var(--accent)' : 'var(--surface-3)',
              color: mobileLayout === 'compact' ? '#fff' : 'var(--text-3)',
            }}
          >
            Compact
          </button>
          <button
            onClick={() => setMobileLayout('detailed')}
            style={{
              padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6,
              border: 'none', cursor: 'pointer',
              background: mobileLayout === 'detailed' ? 'var(--accent)' : 'var(--surface-3)',
              color: mobileLayout === 'detailed' ? '#fff' : 'var(--text-3)',
            }}
          >
            Detailed
          </button>
        </div>
      </div>

      {/* Simulated mobile frame header */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        flexShrink: 0,
        background: 'var(--surface)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button
            onClick={navPrev}
            style={{ width: 40, height: 40, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-2)', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >‹</button>
          <h1 style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
            {monthLabel}
          </h1>
          <button
            onClick={navNext}
            style={{ width: 40, height: 40, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-2)', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >›</button>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={() => setCurrentDate(new Date())}
            style={{ padding: '5px 11px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer' }}
          >Today</button>
        </div>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {mobileLayout === 'compact' ? (
          <MobileMonthGrid
            currentDate={currentDate}
            events={MOCK_EVENTS}
            onEventClick={ev => addLog(`Event click: ${ev.title}`)}
            onAddEvent={d => addLog(`Add event: ${d}`)}
            currentUserId="u1"
            eventHex={eventHex}
          />
        ) : (
          <div className="mobile-detailed" style={{ height: '100%', padding: '0 0 8px' }}>
            <FullCalendar
              key={currentDate.toISOString()}
              plugins={[dayGridPlugin]}
              initialView="dayGridMonth"
              initialDate={currentDate}
              headerToolbar={false}
              firstDay={1}
              events={MOCK_EVENTS}
              height="100%"
              dayMaxEvents={4}
              eventContent={makeRenderEventContent(true, 'detailed')}
              eventClassNames={(arg) =>
                arg.event.extendedProps?.status === 'tentative' ? ['fc-event-tentative'] : []
              }
              eventDidMount={(info) => {
                const hex = eventHex(info.event.extendedProps as Record<string, unknown>)
                const bgAlpha = hex.startsWith('hsl(') && hex.endsWith(')')
                  ? hex.slice(0, -1) + ' / 0.12)'
                  : hex + '1e'
                info.el.style.setProperty('--fc-event-bg-color', bgAlpha)
                info.el.style.setProperty('--fc-event-border-color', hex)
              }}
              eventClick={(info) => addLog(`Event click: ${info.event.title}`)}
            />
          </div>
        )}
      </div>

      {/* Event log */}
      {log.length > 0 && (
        <div style={{
          background: 'var(--surface-2)',
          borderTop: '1px solid var(--border)',
          padding: '8px 12px',
          flexShrink: 0,
          maxHeight: 120,
          overflowY: 'auto',
        }}>
          {log.map((msg, i) => (
            <div key={i} style={{ fontSize: 11, color: i === 0 ? 'var(--accent)' : 'var(--text-3)', padding: '1px 0' }}>
              {msg}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
