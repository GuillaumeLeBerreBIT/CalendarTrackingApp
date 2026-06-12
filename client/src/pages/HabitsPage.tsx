import { useEffect, useState, type FormEvent } from 'react'
import { useHabitStore } from '@/store/habitStore'
import api from '@/api/client'
import Button from '@/components/ui/Button'
import Icon from '@/components/ui/Icon'
import { Tag, Empty, Segmented } from '@/components/ui/Primitives'
import HabitHeatmap from '@/components/HabitHeatmap'
import WeeklyArc from '@/components/WeeklyArc'
import type { GroupChallenge } from '@/types'

// ── Shared styles ─────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--surface-2)',
  border: '1px solid var(--border-2)',
  borderRadius: 'var(--r-sm)',
  padding: '9px 12px',
  fontSize: 13.5,
  color: 'var(--text-1)',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 650,
  color: 'var(--text-3)',
  marginBottom: 6,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
}

// ── Preset pickers ────────────────────────────────────────────────────────────
const PRESET_EMOJIS = ['⚡', '🏃', '📚', '💪', '🧘', '🎯']
const PRESET_COLORS = [
  'var(--accent)',
  '#f59e0b',
  '#ec4899',
  '#22d3aa',
  '#38bdf8',
  '#c084fc',
]

// ── Modal wrapper ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', padding: 16,
    }}>
      <div style={{
        background: 'var(--surface)',
        borderRadius: 'var(--r-xl)',
        border: '1px solid var(--border-2)',
        boxShadow: 'var(--shadow-lg)',
        width: '100%',
        maxWidth: 420,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  )
}

// ── Log confirmation toast ────────────────────────────────────────────────────
function LogToast({ weeklyHit }: { weeklyHit?: boolean }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 100,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 100,
      padding: '10px 18px',
      borderRadius: 'var(--r-full)',
      background: 'var(--accent)',
      color: '#fff',
      fontSize: 14,
      fontWeight: 700,
      boxShadow: '0 4px 20px var(--accent-glow)',
      pointerEvents: 'none',
      animation: 'log-toast-in 0.25s ease, log-toast-out 0.3s ease 1.5s forwards',
      whiteSpace: 'nowrap',
    }}>
      {weeklyHit ? 'Weekly goal hit ✓' : 'Logged ✓'}
    </div>
  )
}

// ── HabitCard ─────────────────────────────────────────────────────────────────
interface HabitCardProps {
  habit_id: number
  title: string
  frequency: 'daily' | 'weekly'
  emoji: string
  color: string
  streak: number
  completedToday: boolean
  completionHistory: string[]
  currentWeekTarget?: number | null
  currentWeekCompletions?: number | null
  onLog: (id: number) => void
  onDelete: (id: number) => void
  confirmingDelete: boolean
  onConfirmDelete: (id: number) => void
  onCancelDelete: () => void
}

function HabitCard({
  habit_id, title, frequency, emoji, color, streak,
  completedToday, completionHistory,
  currentWeekTarget, currentWeekCompletions,
  onLog, onDelete, confirmingDelete, onConfirmDelete, onCancelDelete,
}: HabitCardProps) {
  const showFlame = streak >= 7
  const hasWeeklyTarget = !!currentWeekTarget && currentWeekTarget > 0

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)',
      padding: '18px 20px',
      marginBottom: 12,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 24, lineHeight: 1, flexShrink: 0 }}>{emoji}</span>
        <span style={{
          fontSize: 16, fontWeight: 700, color: 'var(--text-1)',
          flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {title}
        </span>
        <Tag tone="neutral">{frequency === 'daily' ? 'Daily' : 'Weekly'}</Tag>
        {confirmingDelete ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              onClick={() => onDelete(habit_id)}
              style={{
                background: 'hsl(0 70% 50% / 0.15)',
                border: '1px solid hsl(0 70% 50% / 0.35)',
                borderRadius: 'var(--r-sm)',
                color: 'hsl(0 70% 65%)',
                fontSize: 12, fontWeight: 650,
                padding: '4px 10px', cursor: 'pointer',
              }}
            >
              Delete
            </button>
            <button
              onClick={onCancelDelete}
              style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', padding: '4px 6px' }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => onConfirmDelete(habit_id)}
            title="Delete habit"
            style={{
              background: 'none', border: 'none', color: 'var(--text-3)',
              cursor: 'pointer', padding: 4, display: 'flex',
              borderRadius: 'var(--r-sm)', flexShrink: 0,
            }}
          >
            <Icon name="trash" size={16} />
          </button>
        )}
      </div>

      {/* Streak row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{showFlame ? '🔥' : '⚡'}</span>
        <span style={{
          fontSize: 26, fontWeight: 800, color,
          letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', flexShrink: 0,
        }}>
          {streak}
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 500, flexShrink: 0 }}>day streak</span>
        {hasWeeklyTarget ? (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <WeeklyArc completions={currentWeekCompletions ?? 0} target={currentWeekTarget!} color={color} size={40} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>this week</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 500 }}>{currentWeekCompletions ?? 0}/{currentWeekTarget}×</div>
            </div>
          </div>
        ) : (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: completedToday ? color : 'var(--text-3)', fontWeight: completedToday ? 700 : 400 }}>
            {completedToday ? '✓ logged today — tap grid to undo' : 'tap today\'s cell to log'}
          </span>
        )}
      </div>
      {hasWeeklyTarget && (
        <div style={{ fontSize: 10.5, color: completedToday ? color : 'var(--text-3)', fontWeight: completedToday ? 600 : 400, marginBottom: 2, textAlign: 'right' }}>
          {completedToday ? '✓ logged today — tap grid to undo' : 'tap today\'s cell to log'}
        </div>
      )}

      {/* Heatmap — today's cell is the log/un-log button */}
      <HabitHeatmap
        completionHistory={completionHistory}
        color={color}
        onLogToday={() => onLog(habit_id)}
        completedToday={completedToday}
      />
    </div>
  )
}

// ── CreateHabitModal ──────────────────────────────────────────────────────────
function CreateHabitModal({ onClose }: { onClose: () => void }) {
  const { createHabit } = useHabitStore()
  const [title, setTitle] = useState('')
  const [frequency, setFrequency] = useState<'daily' | 'weekly'>('daily')
  const [emoji, setEmoji] = useState('⚡')
  const [color, setColor] = useState('var(--accent)')
  const [weeklyTarget, setWeeklyTarget] = useState<number | null>(null)
  const [progressive, setProgressive] = useState(false)
  const [saving, setSaving] = useState(false)

  // Group / challenge linking
  const [groups, setGroups] = useState<{ groups_id: string; groups_title: string }[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [challenges, setChallenges] = useState<GroupChallenge[]>([])
  const [selectedChallengeId, setSelectedChallengeId] = useState<string>('')
  const [contributionValue, setContributionValue] = useState(1)

  useEffect(() => {
    api.get('/groups').then(({ data }) => {
      if (data.success) {
        setGroups((data.groups ?? []).map((g: { groupInfo: { groupId: number; title: string } }) => ({
          groups_id: String(g.groupInfo.groupId),
          groups_title: g.groupInfo.title,
        })))
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    setChallenges([])
    setSelectedChallengeId('')
    if (!selectedGroupId) return
    api.get(`/groups/${selectedGroupId}/challenges`).then(({ data }) => {
      if (data.success) setChallenges((data.challenges ?? []).filter((c: GroupChallenge) => c.is_active))
    }).catch(() => {})
  }, [selectedGroupId])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      await createHabit({
        title: title.trim(), frequency, emoji, color,
        weekly_target: weeklyTarget,
        target_increment: weeklyTarget && progressive ? 1 : 0,
        groups_id: selectedGroupId || null,
        challenge_id: selectedChallengeId ? parseInt(selectedChallengeId, 10) : null,
        contribution_value: selectedChallengeId ? contributionValue : undefined,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
    appearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236f6f87' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    paddingRight: 32,
  }

  return (
    <Modal title="New Habit" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <label style={labelStyle}>Title</label>
          <input
            style={inputStyle}
            placeholder="e.g. Morning run"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div>
          <label style={labelStyle}>Frequency</label>
          <Segmented
            options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }]}
            value={frequency}
            onChange={(v) => setFrequency(v as 'daily' | 'weekly')}
          />
        </div>

        <div>
          <label style={labelStyle}>Emoji</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PRESET_EMOJIS.map((e) => (
              <button key={e} type="button" onClick={() => setEmoji(e)} style={{
                width: 40, height: 40, borderRadius: 'var(--r-sm)',
                border: emoji === e ? '2px solid var(--accent)' : '1px solid var(--border-2)',
                background: emoji === e ? 'var(--accent-soft)' : 'var(--surface-2)',
                fontSize: 20, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'var(--transition)',
              }}>
                {e}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Color</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PRESET_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} style={{
                width: 30, height: 30, borderRadius: '50%', background: c,
                border: color === c ? '3px solid var(--text-1)' : '2px solid transparent',
                cursor: 'pointer',
                outline: color === c ? '2px solid var(--accent)' : 'none',
                outlineOffset: 2,
                transition: 'var(--transition)', flexShrink: 0,
              }} />
            ))}
          </div>
        </div>

        {/* Weekly goal */}
        <div>
          <label style={labelStyle}>Weekly goal (optional)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="number" min={0} max={14} placeholder="e.g. 3"
              value={weeklyTarget ?? ''}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                setWeeklyTarget(isNaN(v) || v === 0 ? null : Math.min(14, v))
              }}
              style={{ ...inputStyle, width: 80 }}
            />
            <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>completions / week</span>
          </div>
          {weeklyTarget && weeklyTarget > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={progressive}
                onChange={(e) => setProgressive(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                Progressive — increase target by 1 each week
              </span>
            </label>
          )}
        </div>

        {/* Group sharing */}
        {groups.length > 0 && (
          <div>
            <label style={labelStyle}>Share with group (optional)</label>
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              style={selectStyle}
            >
              <option value="">None — keep private</option>
              {groups.map((g) => (
                <option key={g.groups_id} value={g.groups_id}>{g.groups_title}</option>
              ))}
            </select>
          </div>
        )}

        {/* Challenge linking — only shown when a group with active challenges is selected */}
        {selectedGroupId && challenges.length > 0 && (
          <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-md)', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={labelStyle}>Counts toward challenge (optional)</label>
              <select
                value={selectedChallengeId}
                onChange={(e) => setSelectedChallengeId(e.target.value)}
                style={selectStyle}
              >
                <option value="">None</option>
                {challenges.map((c) => (
                  <option key={c.challenge_id} value={String(c.challenge_id)}>
                    {c.title} ({c.current_value}/{c.target_value} {c.unit})
                  </option>
                ))}
              </select>
            </div>
            {selectedChallengeId && (
              <div>
                <label style={labelStyle}>Contribution per log</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="number" min={1} max={100}
                    value={contributionValue}
                    onChange={(e) => setContributionValue(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    style={{ ...inputStyle, width: 80 }}
                  />
                  <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
                    {challenges.find((c) => String(c.challenge_id) === selectedChallengeId)?.unit ?? 'units'} per completion
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {selectedGroupId && challenges.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
            No active challenges in this group yet.
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
          <Button variant="ghost" size="md" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="md" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Create Habit'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ── HabitsPage ────────────────────────────────────────────────────────────────
export default function HabitsPage() {
  const { habits, loading, fetchHabits, logToday, deleteHabit } = useHabitStore()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [logFlash, setLogFlash] = useState<{ weeklyHit: boolean } | null>(null)

  useEffect(() => {
    fetchHabits()
  }, [fetchHabits])

  async function handleLog(id: number) {
    const result = await logToday(id)
    if (result.completedToday) {
      setLogFlash({ weeklyHit: !!result.weeklyTargetHit })
      setTimeout(() => setLogFlash(null), 2000)
    }
  }

  return (
    <>
      {/* Log confirmation toast */}
      {logFlash && <LogToast weeklyHit={logFlash.weeklyHit} />}

      <div style={{
        maxWidth: 680,
        margin: '0 auto',
        padding: 'clamp(20px,4vw,32px) clamp(16px,3vw,24px)',
      }}>
        {/* Header */}
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 24, gap: 12,
        }}>
          <h1 style={{
            fontSize: 'clamp(22px,4vw,28px)', fontWeight: 800,
            color: 'var(--text-1)', letterSpacing: '-0.03em', margin: 0,
          }}>
            Habits
          </h1>
          <Button variant="primary" size="md" onClick={() => setShowCreateModal(true)}>
            <Icon name="plus" size={16} />
            New Habit
          </Button>
        </header>

        {/* Content */}
        {loading && habits.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            Loading…
          </div>
        ) : habits.length === 0 ? (
          <Empty text="No habits yet — start your first one!" />
        ) : (
          habits.map((habit) => (
            <HabitCard
              key={habit.habit_id}
              habit_id={habit.habit_id}
              title={habit.title}
              frequency={habit.frequency}
              emoji={habit.emoji}
              color={habit.color}
              streak={habit.streak}
              completedToday={habit.completedToday}
              completionHistory={habit.completionHistory ?? []}
              currentWeekTarget={habit.currentWeekTarget}
              currentWeekCompletions={habit.currentWeekCompletions}
              onLog={handleLog}
              onDelete={(id) => { deleteHabit(id); setDeletingId(null) }}
              confirmingDelete={deletingId === habit.habit_id}
              onConfirmDelete={(id) => setDeletingId(id)}
              onCancelDelete={() => setDeletingId(null)}
            />
          ))
        )}

        {showCreateModal && <CreateHabitModal onClose={() => setShowCreateModal(false)} />}
      </div>

      <style>{`
        @keyframes log-toast-in {
          from { opacity: 0; transform: translateX(-50%) translateY(12px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes log-toast-out {
          from { opacity: 1; }
          to   { opacity: 0; transform: translateX(-50%) translateY(-8px); }
        }
      `}</style>
    </>
  )
}
