// Phone calendar: Monday–Sunday strip above the agenda. Weekends sit on --weekend.
import type { CalEvent } from '@/types'
import { weekKeys, eventsOnDay } from '@/lib/monthGrid'
import { addDaysStr } from '@/lib/allDayDates'
import { IconButton } from '@/components/ui/Button'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface Props {
  selectedKey: string
  todayKey: string
  events: CalEvent[]
  onSelect: (key: string) => void
  colorOf: (ev: CalEvent) => string
}

export default function WeekStrip({ selectedKey, todayKey, events, onSelect, colorOf }: Props) {
  const keys = weekKeys(selectedKey)
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      padding: '4px 4px 8px',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      <IconButton name="chevL" size={32} isz={14} title="Previous week" onClick={() => onSelect(addDaysStr(selectedKey, -7))} />
      {keys.map((key, i) => {
        const selected = key === selectedKey
        const dots = eventsOnDay(events, key).slice(0, 3)
        const label = new Date(`${key}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            aria-label={label}
            aria-pressed={selected}
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '6px 0 8px',
              border: 'none',
              borderRadius: 12,
              background: i >= 5 ? 'var(--weekend)' : 'transparent',
              color: 'var(--text-1)',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-3)' }}>{DOW[i]}</span>
            <span style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 15,
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              boxSizing: 'border-box',
              background: selected ? 'var(--accent)' : 'transparent',
              color: selected ? 'var(--accent-text)' : 'var(--text-1)',
              border: key === todayKey && !selected ? '1px solid var(--text-1)' : 'none',
            }}>
              {Number(key.slice(8))}
            </span>
            <span style={{ display: 'flex', gap: 3, height: 5 }}>
              {dots.map((ev) => (
                <span key={ev.id} style={{ width: 5, height: 5, borderRadius: 3, background: colorOf(ev) }} />
              ))}
            </span>
          </button>
        )
      })}
      <IconButton name="chevR" size={32} isz={14} title="Next week" onClick={() => onSelect(addDaysStr(selectedKey, 7))} />
    </div>
  )
}
