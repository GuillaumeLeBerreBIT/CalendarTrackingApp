const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

interface HabitHeatmapProps {
  completionHistory: string[]
  color: string
  onLogToday?: () => void
  completedToday?: boolean
}

export default function HabitHeatmap({ completionHistory, color, onLogToday, completedToday }: HabitHeatmapProps) {
  const completionSet = new Set(completionHistory)

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)

  // Monday of this week
  const todayDow = now.getUTCDay()
  const daysFromMonday = todayDow === 0 ? 6 : todayDow - 1
  const thisMonday = new Date(now)
  thisMonday.setUTCDate(now.getUTCDate() - daysFromMonday)
  thisMonday.setUTCHours(0, 0, 0, 0)

  const WEEKS = 16  // ~4 months — larger squares, easier to tap on mobile
  const DAYS  = 7

  const startDate = new Date(thisMonday)
  startDate.setUTCDate(startDate.getUTCDate() - (WEEKS - 1) * 7)

  // grid[dayOfWeek][weekIndex]
  const grid: Array<Array<{ date: string; filled: boolean; isToday: boolean; isFuture: boolean }>> = []

  for (let day = 0; day < DAYS; day++) {
    const row = []
    for (let week = 0; week < WEEKS; week++) {
      const d = new Date(startDate)
      d.setUTCDate(startDate.getUTCDate() + week * 7 + day)
      const dateStr = d.toISOString().slice(0, 10)
      row.push({
        date: dateStr,
        filled: completionSet.has(dateStr),
        isToday: dateStr === todayStr,
        isFuture: dateStr > todayStr,
      })
    }
    grid.push(row)
  }

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'flex-start', width: '100%' }}>
      {/* Day labels */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
        {DAY_LABELS.map((label, i) => (
          <span key={i} style={{
            fontSize: 9,
            color: 'var(--text-3)',
            height: 14,
            display: 'flex',
            alignItems: 'center',
            userSelect: 'none',
            lineHeight: 1,
          }}>
            {label}
          </span>
        ))}
      </div>

      {/* Grid fills remaining width — each cell uses flex:1 so columns expand equally */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {grid.map((row, dayIdx) => (
          <div key={dayIdx} style={{ display: 'flex', gap: 2 }}>
            {row.map((cell, weekIdx) => {
              const isClickable = cell.isToday && !!onLogToday
              const bg = cell.isFuture
                ? 'transparent'
                : cell.filled
                  ? color
                  : 'var(--surface-3)'

              return (
                <div
                  key={weekIdx}
                  title={cell.isToday ? (completedToday ? 'Done today — click to undo' : 'Log today') : cell.date}
                  onClick={isClickable ? onLogToday : undefined}
                  style={{
                    flex: 1,
                    height: 14,
                    borderRadius: 3,
                    background: bg,
                    outline: cell.isToday ? `2px solid ${color}` : 'none',
                    outlineOffset: 1,
                    opacity: cell.isFuture ? 0 : 1,
                    cursor: isClickable ? 'pointer' : 'default',
                    transition: 'background 0.15s, transform 0.1s',
                    transform: isClickable ? 'scale(1.15)' : 'none',
                    boxShadow: cell.isToday
                      ? `0 0 6px ${color}80`
                      : cell.filled && !cell.isFuture
                        ? `0 0 3px ${color}40`
                        : 'none',
                  }}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
