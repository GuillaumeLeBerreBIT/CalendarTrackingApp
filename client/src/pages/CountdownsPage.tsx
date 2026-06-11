import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCountdownStore, type Countdown } from '@/store/timerStore'
import { useCountdown, formatCountdown } from '@/lib/countdown'
import Icon from '@/components/ui/Icon'
import Button from '@/components/ui/Button'

// ── Countdown card ─────────────────────────────────────────────────────────────
function CountdownCard({ countdown, onDelete }: { countdown: Countdown; onDelete: (id: number) => void }) {
  const state = useCountdown(countdown.target_date)
  const text = formatCountdown(state)
  const isSoon = !state.expired && state.days === 0

  const formattedDate = (() => {
    if (!countdown.target_date) return ''
    return new Date(countdown.target_date).toLocaleString(undefined, {
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
      <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{countdown.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 15, fontWeight: 700, color: 'var(--text-1)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          marginBottom: 2,
        }}>
          {countdown.title}
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
        onClick={() => onDelete(countdown.timer_id)}
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
  onCreate: (data: Omit<Countdown, 'timer_id'>) => Promise<void>
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
      await onCreate({ title: title.trim(), emoji: activeEmoji, target_date })
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

// ── CountdownsPage ─────────────────────────────────────────────────────────────
export default function CountdownsPage() {
  const navigate = useNavigate()
  const { countdowns, loading, fetchCountdowns, createCountdown, deleteCountdown } = useCountdownStore()
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => { fetchCountdowns() }, [fetchCountdowns])

  const sorted = [...countdowns].sort(
    (a, b) => new Date(a.target_date).getTime() - new Date(b.target_date).getTime()
  )

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px 40px' }}>
      {/* Back to calendar */}
      <button
        onClick={() => navigate('/calendar')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '7px 13px',
          borderRadius: 'var(--r-full)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--text-2)',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          marginBottom: 18,
          transition: 'var(--transition)',
        }}
      >
        <Icon name="chevL" size={14} sw={2.2} />
        Calendar
      </button>

      {/* Page header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 12, marginBottom: 24,
      }}>
        <div>
          <h1 style={{
            fontSize: 26, fontWeight: 900, color: 'var(--text-1)',
            letterSpacing: '-0.03em', margin: 0,
          }}>
            Countdowns
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--text-3)', margin: '6px 0 0' }}>
            Count down to trips, birthdays and big events.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 12px', borderRadius: 999, fontWeight: 600, fontSize: 13,
            background: 'var(--accent-soft)', color: 'var(--accent)',
            border: '1px solid var(--accent-line, var(--accent-soft))',
            cursor: 'pointer', transition: 'var(--transition)',
            flexShrink: 0, marginTop: 4,
          }}
        >
          <Icon name="plus" size={14} />
          Add
        </button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-3)', fontSize: 14 }}>Loading…</p>
      ) : sorted.length === 0 ? (
        <div style={{
          padding: '36px 20px', textAlign: 'center',
          borderRadius: 'var(--r-md)',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, color: 'var(--text-3)' }}>
            <Icon name="timer" size={32} />
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>
            No countdowns yet
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
            Add a milestone like "Vacation in 2 months"
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sorted.map((c) => (
            <CountdownCard key={c.timer_id} countdown={c} onDelete={deleteCountdown} />
          ))}
        </div>
      )}

      {showAddModal && (
        <AddCountdownModal
          onClose={() => setShowAddModal(false)}
          onCreate={createCountdown}
        />
      )}
    </div>
  )
}
