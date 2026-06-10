interface WeeklyArcProps {
  completions: number
  target: number
  color: string
  size?: number
}

export default function WeeklyArc({ completions, target, color, size = 44 }: WeeklyArcProps) {
  const r = (size - 6) / 2
  const circumference = 2 * Math.PI * r
  const progress = target > 0 ? Math.min(completions / target, 1) : 0
  const dashOffset = circumference * (1 - progress)
  const done = completions >= target

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={4}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{
            transition: 'stroke-dashoffset 0.4s ease',
            filter: done ? `drop-shadow(0 0 4px ${color}80)` : 'none',
          }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        lineHeight: 1,
      }}>
        <span style={{
          fontSize: size < 40 ? 9 : 10,
          fontWeight: 700,
          color: done ? color : 'var(--text-1)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {completions}/{target}
        </span>
      </div>
      {done && (
        <style>{`
          @keyframes arc-pulse {
            0%, 100% { opacity: 1; }
            50%       { opacity: 0.6; }
          }
        `}</style>
      )}
    </div>
  )
}
