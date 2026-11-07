// Desktop month view (our own; replaced FullCalendar). Layout comes from lib/monthGrid.ts.
import type { CalEvent } from '@/types'
import type { MonthCell } from '@/lib/monthGrid'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface Props {
  cells: MonthCell[]
  selectedKey: string
  onSelectDay: (key: string) => void
  onEventClick: (ev: CalEvent) => void
  colorOf: (ev: CalEvent) => string
}

export function timeOf(ev: CalEvent): string {
  return !ev.allDay && ev.start.includes('T') ? ev.start.split('T')[1].slice(0, 5) : ''
}

export function isTentative(ev: CalEvent): boolean {
  return ev.extendedProps?.status === 'tentative'
}

export default function MonthGrid({ cells, selectedKey, onSelectDay, onEventClick, colorOf }: Props) {
  const rows = cells.length / 7
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', borderBottom: '1px solid var(--border)' }}>
        {DOW.map((d, i) => (
          <div key={d} style={{
            padding: '8px 8px',
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--text-3)',
            background: i >= 5 ? 'var(--weekend)' : 'transparent',
          }}>{d}</div>
        ))}
      </div>
      <div style={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}>
        {cells.map((c, i) => {
          const selected = c.key === selectedKey
          return (
            <div
              key={c.key}
              onClick={() => onSelectDay(c.key)}
              style={{
                borderRight: i % 7 === 6 ? 'none' : '1px solid var(--border)',
                borderBottom: '1px solid var(--border)',
                background: c.isWeekend ? 'var(--weekend)' : 'var(--bg)',
                padding: '5px 6px 4px',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                minWidth: 0,
                overflow: 'hidden',
                cursor: 'pointer',
              }}
            >
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelectDay(c.key) }}
                aria-label={`${c.key}${c.events.length ? `, ${c.events.length} events` : ''}`}
                aria-pressed={selected}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  border: c.isToday && !selected ? '1px solid var(--text-1)' : 'none',
                  padding: 0,
                  marginBottom: 2,
                  fontSize: 12,
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: selected ? 'var(--accent)' : 'transparent',
                  color: selected ? 'var(--accent-text)' : (c.inMonth ? 'var(--text-1)' : 'var(--text-3)'),
                  opacity: c.inMonth || selected ? 1 : 0.6,
                  cursor: 'pointer',
                }}
              >
                {c.day}
              </button>
              {c.visible.map((ev) => {
                const color = colorOf(ev)
                const tentative = isTentative(ev)
                const t = timeOf(ev)
                return (
                  <button
                    key={`${ev.id}-${c.key}`}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onEventClick(ev) }}
                    title={ev.title}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      height: 20,
                      flexShrink: 0,
                      padding: '0 4px',
                      border: 'none',
                      borderRadius: 5,
                      background: ev.allDay ? 'var(--fill)' : 'transparent',
                      color: 'var(--text-1)',
                      fontSize: 12,
                      textAlign: 'left',
                      minWidth: 0,
                      opacity: tentative ? 0.6 : 1,
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{
                      width: 6, height: 6, borderRadius: 3, flexShrink: 0, boxSizing: 'border-box',
                      background: tentative ? 'transparent' : color,
                      border: tentative ? `1.5px dashed ${color}` : 'none',
                    }} />
                    {t && <span style={{ color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{t}</span>}
                    <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</span>
                  </button>
                )
              })}
              {c.more > 0 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSelectDay(c.key) }}
                  style={{
                    border: 'none', background: 'transparent', padding: '0 4px', textAlign: 'left',
                    fontSize: 12, fontWeight: 500, color: 'var(--text-2)', cursor: 'pointer',
                  }}
                >
                  +{c.more} more
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
