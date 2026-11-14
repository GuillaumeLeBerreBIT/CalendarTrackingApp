// Desktop month view (our own; replaced FullCalendar). Layout comes from lib/monthGrid.ts.
// Multi-day events are one bar per week spanning their days (lanes above the chips).
import type { CalEvent } from '@/types'
import type { MonthCell, MonthWeek } from '@/lib/monthGrid'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface Props {
  weeks: MonthWeek[]
  selectedKey: string
  onSelectDay: (key: string) => void
  onEventClick: (ev: CalEvent) => void
  colorOf: (ev: CalEvent) => string
  /** Phone "Titles" layout: tighter cells, title-only chips */
  compact?: boolean
}

/** Vertical metrics (px). Header and lanes are fixed height so bars can sit over them. */
const METRICS = {
  desktop: { padTop: 5, header: 26, lane: 22, bar: 20, font: 12, dayBox: 24 },
  compact: { padTop: 3, header: 23, lane: 18, bar: 16, font: 10.5, dayBox: 22 },
}

export function timeOf(ev: CalEvent): string {
  return !ev.allDay && ev.start.includes('T') ? ev.start.split('T')[1].slice(0, 5) : ''
}

export function isTentative(ev: CalEvent): boolean {
  return ev.extendedProps?.status === 'tentative'
}

export default function MonthGrid({ weeks, selectedKey, onSelectDay, onEventClick, colorOf, compact = false }: Props) {
  const rows = weeks.length
  const m = compact ? METRICS.compact : METRICS.desktop
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', borderBottom: '1px solid var(--border)' }}>
        {DOW.map((d, i) => (
          <div key={d} style={{
            padding: compact ? '6px 0' : '8px 8px',
            textAlign: compact ? 'center' : 'left',
            fontSize: compact ? 11 : 12,
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
        gridTemplateColumns: 'minmax(0, 1fr)',
        // Phone "Titles": rows grow to fit their chips (nothing clipped) and the grid scrolls
        // (each row at least an equal share of the screen, or 88px, whichever is taller)
        gridTemplateRows: compact ? `repeat(${rows}, minmax(max(88px, calc(100% / ${rows})), auto))` : `repeat(${rows}, minmax(0, 1fr))`,
        overflowY: compact ? 'auto' : undefined,
        alignContent: compact ? 'start' : undefined,
      }}>
        {weeks.map((week, w) => (
          <div key={w} style={{
            position: 'relative',
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            overflow: compact ? 'visible' : 'hidden',
          }}>
            {week.cells.map((c, i) => (
              <DayCell
                key={c.key}
                cell={c}
                index={i}
                lanes={week.lanes}
                selected={c.key === selectedKey}
                compact={compact}
                m={m}
                onSelectDay={onSelectDay}
                onEventClick={onEventClick}
                colorOf={colorOf}
              />
            ))}
            {week.bars.map((bar) => {
              const color = colorOf(bar.ev)
              const tentative = isTentative(bar.ev)
              const span = bar.endCol - bar.startCol + 1
              const r = (on: boolean) => (on ? 0 : 4)
              return (
                <button
                  key={`${bar.ev.id}-${bar.startCol}`}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onEventClick(bar.ev) }}
                  title={bar.ev.title}
                  style={{
                    position: 'absolute',
                    zIndex: 1,
                    top: m.padTop + m.header + bar.lane * m.lane,
                    left: `calc(${bar.startCol} * 100% / 7 + 2px)`,
                    width: `calc(${span} * 100% / 7 - 4px)`,
                    height: m.bar,
                    boxSizing: 'border-box',
                    padding: '0 6px',
                    border: 'none',
                    borderLeft: bar.continuesBefore ? 'none' : `3px ${tentative ? 'dashed' : 'solid'} ${color}`,
                    borderRadius: `${r(bar.continuesBefore)}px ${r(bar.continuesAfter)}px ${r(bar.continuesAfter)}px ${r(bar.continuesBefore)}px`,
                    background: `color-mix(in srgb, ${color} 16%, var(--bg))`,
                    color: 'var(--text-1)',
                    fontSize: m.font,
                    fontWeight: 500,
                    lineHeight: `${m.bar}px`,
                    textAlign: 'left',
                    display: 'block',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    minWidth: 0,
                    opacity: tentative ? 0.6 : 1,
                    cursor: 'pointer',
                  }}
                >
                  {bar.ev.title}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

interface DayCellProps {
  cell: MonthCell
  index: number
  lanes: number
  selected: boolean
  compact: boolean
  m: typeof METRICS.desktop
  onSelectDay: (key: string) => void
  onEventClick: (ev: CalEvent) => void
  colorOf: (ev: CalEvent) => string
}

function DayCell({ cell: c, index: i, lanes, selected, compact, m, onSelectDay, onEventClick, colorOf }: DayCellProps) {
  return (
    <div
      onClick={() => onSelectDay(c.key)}
      style={{
        borderRight: i % 7 === 6 ? 'none' : '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        background: c.isWeekend ? 'var(--weekend)' : 'var(--bg)',
        padding: `${m.padTop}px ${compact ? 2 : 6}px ${compact ? 2 : 4}px`,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        overflow: compact ? 'visible' : 'hidden',
        cursor: 'pointer',
      }}
    >
      <div style={{ height: m.header, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: compact ? 'center' : 'flex-start' }}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelectDay(c.key) }}
          aria-label={`${c.key}${c.events.length ? `, ${c.events.length} events` : ''}`}
          aria-pressed={selected}
          style={{
            width: m.dayBox,
            height: m.dayBox,
            borderRadius: 12,
            flexShrink: 0,
            border: c.isToday && !selected ? '1px solid var(--text-1)' : 'none',
            padding: 0,
            fontSize: compact ? 11.5 : 12,
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
      </div>
      {/* Room for the bars of this week (drawn by MonthGrid, over the columns) */}
      {lanes > 0 && <div style={{ height: lanes * m.lane, flexShrink: 0 }} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, marginTop: 2 }}>
        {c.visible.map((ev) => {
          const color = colorOf(ev)
          const tentative = isTentative(ev)
          const t = timeOf(ev)
          if (compact) {
            return (
              <button
                key={`${ev.id}-${c.key}`}
                type="button"
                onClick={(e) => { e.stopPropagation(); onEventClick(ev) }}
                title={ev.title}
                style={{
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  flexShrink: 0, padding: '1px 3px', border: 'none',
                  borderLeft: `2px ${tentative ? 'dashed' : 'solid'} ${color}`, borderRadius: 3,
                  background: ev.allDay ? `color-mix(in srgb, ${color} 18%, var(--bg))` : 'var(--fill)',
                  color: 'var(--text-1)', fontSize: 10.5, fontWeight: 500, lineHeight: '13px', textAlign: 'left',
                  overflow: 'hidden', wordBreak: 'normal', overflowWrap: 'normal', minWidth: 0,
                  opacity: tentative ? 0.6 : 1, cursor: 'pointer',
                }}
              >
                {ev.title}
              </button>
            )
          }
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
              border: 'none', background: 'transparent', padding: compact ? '0 2px' : '0 4px', textAlign: 'left',
              fontSize: compact ? 10.5 : 12, fontWeight: 500, color: 'var(--text-2)', cursor: 'pointer',
            }}
          >
            {`+${c.more} more`}
          </button>
        )}
      </div>
    </div>
  )
}
