import { MOCK_MEMBERS } from '@/lib/mockData'

interface AvatarProps {
  id: string
  size?: number
  ring?: boolean
  ringColor?: string
  hue?: number
  label?: string
  name?: string
}

// Deterministic string → hue (0–359) so a given user always gets the same color.
function hashHue(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % 360
}

export function Avatar({ id, size = 28, ring = false, ringColor, hue, label, name }: AvatarProps) {
  const mock = MOCK_MEMBERS[id]
  const isYou = id === 'you'

  // Resolve the displayed initial: explicit name → mock → id[0] → '?'
  // (name wins so the logged-in user's real initial shows even for id="you")
  const initial = name?.[0]?.toUpperCase() || mock?.first?.[0] || id?.[0]?.toUpperCase() || '?'

  // Resolve hue: mock → explicit prop → stable hash of id → 252
  const resolvedHue = mock?.hue ?? hue ?? (id ? hashHue(id) : 252)

  const bg = isYou
    ? 'var(--accent)'
    : `linear-gradient(140deg, hsl(${resolvedHue} 62% 56%), hsl(${(resolvedHue + 38) % 360} 60% 46%))`

  return (
    <div
      title={label ?? name ?? mock?.name ?? id}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flex: '0 0 auto',
        background: bg,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.36,
        fontWeight: 700,
        letterSpacing: '-0.02em',
        boxShadow: ring ? `0 0 0 2px ${ringColor || 'var(--surface)'}` : 'none',
        userSelect: 'none',
      }}
    >
      {initial}
    </div>
  )
}

interface AvatarStackProps {
  ids: string[]
  size?: number
  max?: number
  ringColor?: string
  overlap?: number
  names?: Record<string, string>
}

export function AvatarStack({ ids, size = 28, max = 4, ringColor, overlap = 0.34, names }: AvatarStackProps) {
  const shown = ids.slice(0, max)
  const extra = ids.length - shown.length

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {shown.map((id, i) => (
        <div key={id} style={{ marginLeft: i === 0 ? 0 : -(size * overlap), zIndex: i, position: 'relative' }}>
          <Avatar id={id} size={size} ring ringColor={ringColor} name={names?.[id]} />
        </div>
      ))}
      {extra > 0 && (
        <div style={{
          marginLeft: -(size * overlap),
          zIndex: max,
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'var(--surface-3)',
          color: 'var(--text-2)',
          boxShadow: `0 0 0 2px ${ringColor || 'var(--surface)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.32,
          fontWeight: 700,
        }}>
          +{extra}
        </div>
      )}
    </div>
  )
}
