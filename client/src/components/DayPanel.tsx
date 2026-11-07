// Right-hand panel on the desktop calendar: the selected day's events.
import type { ReactNode } from 'react'
import type { CalEvent } from '@/types'
import Button from '@/components/ui/Button'
import { timeOf, isTentative } from '@/components/MonthGrid'

interface Props {
  dateKey: string
  events: CalEvent[]
  onEventClick: (ev: CalEvent) => void
  onAdd: () => void
  colorOf: (ev: CalEvent) => string
  /** Rendered under the day's events (the calendar filter) */
  footer?: ReactNode
}

function timeRange(ev: CalEvent): string {
  if (ev.allDay) return 'All day'
  const start = timeOf(ev)
  const end = ev.end?.includes('T') ? ev.end.split('T')[1].slice(0, 5) : ''
  return end && end !== start ? `${start} – ${end}` : start
}

export default function DayPanel({ dateKey, events, onEventClick, onAdd, colorOf, footer }: Props) {
  const date = new Date(`${dateKey}T00:00:00`)
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' })
  const dayMonth = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })

  return (
    <aside className="scroll" style={{
      width: 300,
      flexShrink: 0,
      borderLeft: '1px solid var(--border)',
      background: 'var(--bg-deep)',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
    }}>
      <div style={{ padding: '18px 18px 8px' }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-3)' }}>{weekday}</p>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)' }}>{dayMonth}</h2>
      </div>

      <div style={{ padding: '4px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {events.map((ev) => {
          const color = colorOf(ev)
          const group = ev.extendedProps?.groupName || 'Personal'
          return (
            <button
              key={ev.id}
              type="button"
              onClick={() => onEventClick(ev)}
              style={{
                textAlign: 'left',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-lg)',
                padding: '11px 13px',
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
                color: 'var(--text-1)',
                opacity: isTentative(ev) ? 0.7 : 1,
                cursor: 'pointer',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 500, color: 'var(--text-2)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />
                {group} · {timeRange(ev)}
                {isTentative(ev) && <span style={{ color: 'var(--text-3)' }}>· tentative</span>}
              </span>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{ev.title}</span>
              {ev.extendedProps?.location && (
                <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{ev.extendedProps.location}</span>
              )}
            </button>
          )
        })}
        {events.length === 0 && (
          <div style={{ padding: '20px 8px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <p style={{ fontSize: 14, color: 'var(--text-3)' }}>Nothing planned.</p>
            <Button variant="outline" size="sm" icon="plus" onClick={onAdd}>Add an event</Button>
          </div>
        )}
      </div>

      {footer && (
        <div style={{ marginTop: 'auto', padding: '12px 16px 16px', borderTop: '1px solid var(--border)' }}>
          {footer}
        </div>
      )}
    </aside>
  )
}
