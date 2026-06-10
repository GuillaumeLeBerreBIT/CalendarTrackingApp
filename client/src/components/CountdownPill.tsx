import { useCountdown, formatCountdown } from '@/lib/countdown'
import Icon from '@/components/ui/Icon'

interface Props {
  targetDate: string | Date
  label?: string
  size?: 'sm' | 'md'
}

export default function CountdownPill({ targetDate, label, size = 'sm' }: Props) {
  const state = useCountdown(targetDate)
  const text  = formatCountdown(state)

  if (state.expired) return null

  const isSoon = state.days === 0

  return (
    <span style={{
      display:        'inline-flex',
      alignItems:     'center',
      gap:            4,
      padding:        size === 'md' ? '5px 10px' : '3px 8px',
      borderRadius:   999,
      fontSize:       size === 'md' ? 13 : 11.5,
      fontWeight:     700,
      fontVariantNumeric: 'tabular-nums',
      background:     isSoon ? 'hsl(38 100% 50% / 0.15)' : 'var(--accent-soft)',
      color:          isSoon ? 'hsl(38 100% 64%)'         : 'var(--accent)',
      border:         `1px solid ${isSoon ? 'hsl(38 100% 50% / 0.25)' : 'var(--accent-line, var(--accent-soft))'}`,
      flexShrink:     0,
      letterSpacing:  '0.01em',
    }}>
      <Icon name="clock" size={size === 'md' ? 13 : 11} style={{ opacity: 0.85 }} />
      {label && <span style={{ fontWeight: 500, opacity: 0.75 }}>{label}</span>}
      {text}
    </span>
  )
}
