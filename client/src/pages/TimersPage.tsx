import { useState, useEffect, useRef } from 'react'
import { useTimerStore } from '@/store/timerStore'
import { useCountdown, formatCountdown } from '@/lib/countdown'
import Icon from '@/components/ui/Icon'
import Button from '@/components/ui/Button'

// ── Types ──────────────────────────────────────────────────────────────────────
interface Timer {
  timer_id: number
  type: 'countdown' | 'interval'
  title: string
  emoji: string
  target_date?: string
  duration_seconds?: number
}

// ── Audio beep ─────────────────────────────────────────────────────────────────
function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.8)
  } catch { /* silently fail */ }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatTime(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const PRESETS = [
  { label: '5m',      seconds: 300  },
  { label: '10m',     seconds: 600  },
  { label: '15m',     seconds: 900  },
  { label: '25m',     seconds: 1500 },
  { label: '30m',     seconds: 1800 },
  { label: '45m',     seconds: 2700 },
  { label: '1h',      seconds: 3600 },
]

// ── Progress ring ──────────────────────────────────────────────────────────────
const CIRCUMFERENCE = 2 * Math.PI * 54

function ProgressRing({ remaining, total, finished }: {
  remaining: number
  total: number
  finished: boolean
}) {
  const progress = total > 0 ? remaining / total : 1
  const dashoffset = CIRCUMFERENCE * (1 - progress)

  return (
    <svg width={128} height={128} viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={60} cy={60} r={54} fill="none" stroke="var(--surface-3)" strokeWidth={8} />
      <circle
        cx={60} cy={60} r={54} fill="none"
        stroke={finished ? 'hsl(38 100% 64%)' : 'var(--accent)'}
        strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={dashoffset}
        style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
      />
    </svg>
  )
}

// ── Countdown card ─────────────────────────────────────────────────────────────
function CountdownCard({ timer, onDelete }: { timer: Timer; onDelete: (id: number) => void }) {
  const state = useCountdown(timer.target_date!)
  const text = formatCountdown(state)
  const isSoon = !state.expired && state.days === 0

  const formattedDate = (() => {
    if (!timer.target_date) return ''
    return new Date(timer.target_date).toLocaleString(undefined, {
      weekday: 'short', day: 'numeric', month: 'short',
      year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  })()

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 44px 14px 16px',
      borderRadius: 'var(--r-md)',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      position: 'relative',
    }}>
      <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{timer.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 15, fontWeight: 700, color: 'var(--text-1)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          marginBottom: 2,
        }}>
          {timer.title}
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{formattedDate}</p>
      </div>

      {state.expired ? (
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', flexShrink: 0 }}>
          Finished 🎉
        </span>
      ) : (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '5px 10px', borderRadius: 999, fontSize: 13, fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          background: isSoon ? 'hsl(38 100% 50% / 0.15)' : 'var(--accent-soft)',
          color: isSoon ? 'hsl(38 100% 64%)' : 'var(--accent)',
          border: `1px solid ${isSoon ? 'hsl(38 100% 50% / 0.25)' : 'var(--accent-line, var(--accent-soft))'}`,
          flexShrink: 0,
        }}>
          <Icon name="clock" size={13} style={{ opacity: 0.85 }} />
          {text}
        </span>
      )}

      <button
        onClick={() => onDelete(timer.timer_id)}
        style={{
          position: 'absolute', top: 8, right: 8,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-3)', padding: 4, borderRadius: 4,
          lineHeight: 1, display: 'flex', alignItems: 'center',
        }}
        title="Delete"
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}

// ── Shared form styles ─────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  borderRadius: 'var(--r-sm)',
  border: '1px solid var(--border-2)',
  background: 'var(--surface-2)',
  color: 'var(--text-1)', fontSize: 14,
  outline: 'none', boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)',
  letterSpacing: '0.04em', textTransform: 'uppercase',
  marginBottom: 6, display: 'block',
}

// ── Add Countdown Modal ────────────────────────────────────────────────────────
const COUNTDOWN_EMOJIS = ['🏖️', '🎂', '✈️', '🎓', '🏆', '🎯']

function AddCountdownModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (data: Omit<Timer, 'timer_id'>) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState('🏖️')
  const [customEmoji, setCustomEmoji] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [saving, setSaving] = useState(false)

  const activeEmoji = customEmoji || emoji

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !date) return
    setSaving(true)
    try {
      const target_date = time ? `${date}T${time}:00` : `${date}T00:00:00`
      await onCreate({ type: 'countdown', title: title.trim(), emoji: activeEmoji, target_date })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'flex-end',
        background: 'hsl(0 0% 0% / 0.5)',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: '100%', maxWidth: 480, margin: '0 auto',
        background: 'var(--surface)', borderRadius: 'var(--r-lg) var(--r-lg) 0 0',
        padding: '20px 20px 32px', display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>
            Add Countdown
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Title</label>
            <input
              style={inputStyle}
              placeholder="e.g. Summer vacation"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div>
            <label style={labelStyle}>Emoji</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {COUNTDOWN_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => { setEmoji(e); setCustomEmoji('') }}
                  style={{
                    fontSize: 22, width: 44, height: 44, borderRadius: 'var(--r-sm)',
                    background: emoji === e && !customEmoji ? 'var(--accent-soft)' : 'var(--surface-2)',
                    border: `1px solid ${emoji === e && !customEmoji ? 'var(--accent)' : 'var(--border)'}`,
                    cursor: 'pointer', transition: 'var(--transition)',
                  }}
                >
                  {e}
                </button>
              ))}
              <input
                style={{ ...inputStyle, width: 72, textAlign: 'center', fontSize: 20, padding: '8px 10px' }}
                placeholder="✏️"
                value={customEmoji}
                onChange={(e) => setCustomEmoji(e.target.value.slice(0, 2))}
                title="Custom emoji"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Date *</label>
              <input
                type="date"
                style={inputStyle}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>Time (optional)</label>
              <input
                type="time"
                style={inputStyle}
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          <Button variant="primary" size="lg" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Add Countdown'}
          </Button>
        </form>
      </div>
    </div>
  )
}

// ── TimersPage ─────────────────────────────────────────────────────────────────
export default function TimersPage() {
  const { timers, loading, fetchTimers, createTimer, deleteTimer } = useTimerStore()

  // ── Interval timer local state ─────────────────────────────────────────────
  const [totalSeconds, setTotalSeconds]       = useState(0)
  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const [running, setRunning]                 = useState(false)
  const [finished, setFinished]               = useState(false)
  const [showCustom, setShowCustom]           = useState(false)
  const [customMinutes, setCustomMinutes]     = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Countdown modal ────────────────────────────────────────────────────────
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => { fetchTimers() }, [fetchTimers])

  // ── Interval tick ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!running) return
    intervalRef.current = setInterval(() => {
      setRemainingSeconds((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current!)
          setRunning(false)
          setFinished(true)
          playBeep()
          navigator.vibrate?.([200, 100, 200])
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current!)
  }, [running])

  const loadPreset = (seconds: number) => {
    clearInterval(intervalRef.current!)
    setRunning(false)
    setFinished(false)
    setTotalSeconds(seconds)
    setRemainingSeconds(seconds)
    setShowCustom(false)
  }

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const mins = parseInt(customMinutes, 10)
    if (mins > 0) loadPreset(mins * 60)
    setCustomMinutes('')
  }

  const savedIntervals = timers.filter((t) => t.type === 'interval')
  const countdowns = timers
    .filter((t) => t.type === 'countdown')
    .sort((a, b) => new Date(a.target_date!).getTime() - new Date(b.target_date!).getTime())

  const noTimer = totalSeconds === 0

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px 40px' }}>
      {/* Page header */}
      <h1 style={{
        fontSize: 26, fontWeight: 900, color: 'var(--text-1)',
        letterSpacing: '-0.03em', marginBottom: 28,
      }}>
        Timers & Countdowns
      </h1>

      {/* ── Section 1: Interval timer ── */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{
          fontSize: 13, fontWeight: 700, color: 'var(--text-3)',
          letterSpacing: '0.07em', textTransform: 'uppercase',
          marginBottom: 20,
        }}>
          Timer
        </h2>

        {/* Ring widget */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
          padding: '28px 20px',
          borderRadius: 'var(--r-lg)',
          background: 'var(--surface)',
          border: `1px solid ${running ? 'var(--accent)' : 'var(--border)'}`,
          marginBottom: 20,
          transition: 'border-color 0.3s',
        }}>
          {/* Ring + time */}
          <div style={{ position: 'relative', width: 128, height: 128 }}>
            <ProgressRing remaining={remainingSeconds} total={totalSeconds} finished={finished} />
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                fontSize: noTimer ? 14 : remainingSeconds >= 3600 ? 22 : 30,
                fontWeight: 800,
                color: finished ? 'hsl(38 100% 64%)' : 'var(--text-1)',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.04em',
              }}>
                {noTimer ? '—' : finished ? 'Done!' : formatTime(remainingSeconds)}
              </span>
            </div>
          </div>

          {/* Status label */}
          <p style={{
            fontSize: 12, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
            color: running ? 'var(--accent)' : finished ? 'hsl(38 100% 64%)' : 'var(--text-3)',
            margin: '-8px 0 -4px',
          }}>
            {noTimer ? 'Pick a duration below' : running ? '● Running' : finished ? 'Time\'s up! 🎉' : 'Ready — tap Start'}
          </p>

          {/* Controls */}
          <div style={{ display: 'flex', gap: 10 }}>
            {!running ? (
              <button
                onClick={() => { if (!noTimer && !finished) setRunning(true) }}
                disabled={noTimer || finished}
                style={{
                  padding: '9px 24px', borderRadius: 999, fontWeight: 700, fontSize: 14,
                  background: noTimer || finished ? 'var(--surface-3)' : 'var(--accent)',
                  color: noTimer || finished ? 'var(--text-3)' : '#fff',
                  border: 'none',
                  cursor: noTimer || finished ? 'default' : 'pointer',
                  transition: 'var(--transition)',
                }}
              >
                Start
              </button>
            ) : (
              <button
                onClick={() => setRunning(false)}
                style={{
                  padding: '9px 24px', borderRadius: 999, fontWeight: 700, fontSize: 14,
                  background: 'var(--surface-3)', color: 'var(--text-1)',
                  border: '1px solid var(--border-2)', cursor: 'pointer',
                  transition: 'var(--transition)',
                }}
              >
                Pause
              </button>
            )}
            {!noTimer && (
              <button
                onClick={() => {
                  clearInterval(intervalRef.current!)
                  setRunning(false)
                  setFinished(false)
                  setRemainingSeconds(totalSeconds)
                }}
                style={{
                  padding: '9px 18px', borderRadius: 999, fontWeight: 700, fontSize: 14,
                  background: 'transparent', color: 'var(--text-3)',
                  border: '1px solid var(--border)', cursor: 'pointer',
                  transition: 'var(--transition)',
                }}
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Preset pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: showCustom ? 10 : 0 }}>
          {PRESETS.map((p) => (
            <button
              key={p.seconds}
              onClick={() => loadPreset(p.seconds)}
              style={{
                padding: '7px 14px', borderRadius: 999, fontWeight: 600, fontSize: 13,
                background: totalSeconds === p.seconds ? 'var(--accent-soft)' : 'var(--surface)',
                color: totalSeconds === p.seconds ? 'var(--accent)' : 'var(--text-2)',
                border: `1px solid ${totalSeconds === p.seconds ? 'var(--accent)' : 'var(--border)'}`,
                cursor: 'pointer', transition: 'var(--transition)',
              }}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setShowCustom((v) => !v)}
            style={{
              padding: '7px 14px', borderRadius: 999, fontWeight: 600, fontSize: 13,
              background: showCustom ? 'var(--accent-soft)' : 'var(--surface)',
              color: showCustom ? 'var(--accent)' : 'var(--text-2)',
              border: `1px solid ${showCustom ? 'var(--accent)' : 'var(--border)'}`,
              cursor: 'pointer', transition: 'var(--transition)',
            }}
          >
            Custom
          </button>
        </div>

        <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 }}>
          Timers reset when you leave the page — use Countdowns below for persistent milestones.
        </p>

        {showCustom && (
          <form onSubmit={handleCustomSubmit} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
            <input
              type="number" min={1} max={720}
              placeholder="Minutes"
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value)}
              style={{ ...inputStyle, width: 130 }}
              autoFocus
            />
            <Button variant="soft" size="sm" type="submit">Set</Button>
          </form>
        )}

        {/* Saved interval presets from DB */}
        {savedIntervals.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <p style={{
              fontSize: 12, color: 'var(--text-3)', fontWeight: 600,
              marginBottom: 8, letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>
              Saved Presets
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {savedIntervals.map((t) => (
                <div key={t.timer_id} style={{ display: 'flex', alignItems: 'stretch' }}>
                  <button
                    onClick={() => t.duration_seconds && loadPreset(t.duration_seconds)}
                    style={{
                      padding: '7px 12px 7px 14px', borderRadius: '999px 0 0 999px',
                      fontWeight: 600, fontSize: 13,
                      background: 'var(--surface)', color: 'var(--text-2)',
                      border: '1px solid var(--border)', borderRight: 'none',
                      cursor: 'pointer', transition: 'var(--transition)',
                    }}
                  >
                    {t.emoji} {t.title}
                  </button>
                  <button
                    onClick={() => deleteTimer(t.timer_id)}
                    style={{
                      padding: '7px 10px', borderRadius: '0 999px 999px 0',
                      background: 'var(--surface)', color: 'var(--text-3)',
                      border: '1px solid var(--border)', borderLeft: '1px solid var(--border-2)',
                      cursor: 'pointer', lineHeight: 1, display: 'flex', alignItems: 'center',
                    }}
                    title="Delete preset"
                  >
                    <Icon name="close" size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── Section 2: Countdowns ── */}
      <section>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 16,
        }}>
          <h2 style={{
            fontSize: 13, fontWeight: 700, color: 'var(--text-3)',
            letterSpacing: '0.07em', textTransform: 'uppercase', margin: 0,
          }}>
            Countdowns
          </h2>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 12px', borderRadius: 999, fontWeight: 600, fontSize: 13,
              background: 'var(--accent-soft)', color: 'var(--accent)',
              border: '1px solid var(--accent-line, var(--accent-soft))',
              cursor: 'pointer', transition: 'var(--transition)',
            }}
          >
            <Icon name="plus" size={14} />
            Add
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-3)', fontSize: 14 }}>Loading…</p>
        ) : countdowns.length === 0 ? (
          <div style={{
            padding: '36px 20px', textAlign: 'center',
            borderRadius: 'var(--r-md)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
          }}>
            <p style={{ fontSize: 36, marginBottom: 10 }}>⏳</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>
              No countdowns yet
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
              Add a milestone like "Vacation in 2 months"
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {countdowns.map((t) => (
              <CountdownCard key={t.timer_id} timer={t} onDelete={deleteTimer} />
            ))}
          </div>
        )}
      </section>

      {showAddModal && (
        <AddCountdownModal
          onClose={() => setShowAddModal(false)}
          onCreate={createTimer}
        />
      )}
    </div>
  )
}
