import { useAuthStore } from '@/store/authStore'

function getLevel(xp: number): number {
  let level = 1
  while (50 * level * (level + 1) <= xp) level++
  return level
}

const RANKS = [
  { minLevel: 16, title: 'Legend' },
  { minLevel: 12, title: 'Master' },
  { minLevel: 8,  title: 'Champion' },
  { minLevel: 5,  title: 'Dedicated' },
  { minLevel: 3,  title: 'Consistent' },
  { minLevel: 1,  title: 'Beginner' },
]

function getRank(level: number): string {
  return RANKS.find((r) => level >= r.minLevel)?.title ?? 'Beginner'
}

export default function XPBar() {
  const totalXp = useAuthStore((s) => s.user?.total_xp ?? 0)
  const level = getLevel(totalXp)
  const rank = getRank(level)
  const nextLevelXp = 50 * level * (level + 1)
  const currentLevelXp = 50 * (level - 1) * level
  const xpInLevel = totalXp - currentLevelXp
  const xpNeeded = nextLevelXp - currentLevelXp
  const pct = Math.min(100, Math.round((xpInLevel / xpNeeded) * 100))

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '14px 18px',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)',
      marginBottom: 24,
    }}>
      <div style={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        background: 'var(--accent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxShadow: '0 0 16px var(--accent-glow)',
      }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>
          {level}
        </span>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)' }}>
              Level {level}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>
              {rank}
            </span>
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
            {xpInLevel} / {xpNeeded} XP
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-3)', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${pct}%`,
            borderRadius: 3,
            background: 'linear-gradient(90deg, var(--accent), var(--accent-hover))',
            transition: 'width 0.4s ease',
          }} />
        </div>
      </div>
    </div>
  )
}
