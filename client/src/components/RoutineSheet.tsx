import { useState } from 'react'
import api from '@/api/client'
import Icon from '@/components/ui/Icon'
import Button from '@/components/ui/Button'
import {
  ROUTINE_DAYS, END_PRESETS, localToday, nextDateOnOrAfter, routinePayload, formatDay,
  type EndPreset, type RoutineDraft,
} from '@/lib/routines'
import { parseRRule } from '@/lib/recurrence'
import type { Routine } from '@/types'

const REMINDERS: { value: number | null; label: string }[] = [
  { value: null, label: 'No reminder' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
  { value: 1440, label: '1 day before' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 'var(--r-sm)',
  border: '1px solid var(--border-2)', background: 'var(--surface-2)',
  color: 'var(--text-1)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '0.04em',
  textTransform: 'uppercase', marginBottom: 6, display: 'block',
}

type EndChoice = EndPreset | 'keep'

/** Quick create / edit for a routine. `routine` set = edit mode. */
export default function RoutineSheet({ routine, onClose, onSaved }: {
  routine?: Routine
  onClose: () => void
  onSaved: () => void
}) {
  const editing = !!routine
  const existing = routine ? parseRRule(routine.rule) : null

  const [title, setTitle] = useState(routine?.title ?? '')
  const [weekdays, setWeekdays] = useState<string[]>(existing?.weekdays ?? [])
  const [startTime, setStartTime] = useState(routine?.startTime ?? '')
  const [endTime, setEndTime] = useState(routine?.endTime ?? '')
  const [end, setEnd] = useState<EndChoice>(editing ? 'keep' : '12m')
  const [reminder, setReminder] = useState<number | null>(editing ? routine!.reminderMinutes : 30)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const toggleDay = (code: string) =>
    setWeekdays((w) => (w.includes(code) ? w.filter((d) => d !== code) : [...w, code]))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return setError('Give the routine a name.')
    if (weekdays.length === 0) return setError('Pick at least one day.')
    if (startTime && endTime && endTime <= startTime) return setError('The end time must be after the start time.')

    const draft: RoutineDraft = {
      title, weekdays, startTime, endTime: startTime ? endTime : '',
      end: end === 'keep' ? '12m' : end, reminderMinutes: reminder,
    }
    setSaving(true)
    setError('')
    try {
      if (routine) {
        // Keep the original start (history stays put); presets count from today.
        const opts = end === 'keep'
          ? { endDate: existing?.endMode === 'on' && existing.endDate ? existing.endDate : null }
          : { endFrom: localToday() }
        await api.put(`/parseEvent/${routine.eventId}`, {
          ...routinePayload(draft, routine.startDate, opts), recurrenceScope: 'all',
        })
      } else {
        const start = nextDateOnOrAfter(localToday(), weekdays)
        await api.post('/parseEvent', routinePayload(draft, start))
      }
      onSaved()
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? 'Could not save the routine. Please try again.')
      setSaving(false)
    }
  }

  const keepEndLabel = existing?.endMode === 'on' && existing.endDate
    ? `Keep (until ${formatDay(existing.endDate)})` : 'Keep (no end)'

  // Bottom sheet on mobile, centred dialog on desktop (same split as EventFormModal).
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center', padding: isMobile ? 0 : 16,
        background: 'hsl(0 0% 0% / 0.5)',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={save}
        style={{
          width: '100%', maxWidth: 480, margin: '0 auto', maxHeight: '92vh', overflowY: 'auto',
          background: 'var(--surface)',
          borderRadius: isMobile ? 'var(--r-lg) var(--r-lg) 0 0' : 'var(--r-lg)',
          boxShadow: isMobile ? undefined : 'var(--shadow-lg)',
          padding: isMobile ? '20px 20px 32px' : 24, display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>
            {editing ? 'Edit routine' : 'New routine'}
          </h3>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
            <Icon name="close" size={20} />
          </button>
        </div>

        <div>
          <label style={labelStyle} htmlFor="routine-title">Name</label>
          <input id="routine-title" style={inputStyle} placeholder="e.g. Swim training" value={title}
            onChange={(e) => setTitle(e.target.value)} autoFocus maxLength={120} />
        </div>

        <div>
          <span style={labelStyle}>Repeats every week on</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ROUTINE_DAYS.map((d) => {
              const on = weekdays.includes(d.code)
              return (
                <button key={d.code} type="button" aria-pressed={on} title={d.long} onClick={() => toggleDay(d.code)}
                  style={{
                    minWidth: 52, padding: '9px 10px', borderRadius: 'var(--r-full)', fontSize: 13, fontWeight: 650,
                    cursor: 'pointer', transition: 'var(--transition)',
                    background: on ? 'var(--accent)' : 'var(--surface-2)',
                    color: on ? '#fff' : 'var(--text-2)',
                    border: `1px solid ${on ? 'var(--accent)' : 'var(--border-2)'}`,
                  }}>
                  {d.short}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle} htmlFor="routine-start">From</label>
            <input id="routine-start" type="time" style={inputStyle} value={startTime}
              onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle} htmlFor="routine-end">Until</label>
            <input id="routine-end" type="time" style={{ ...inputStyle, opacity: startTime ? 1 : 0.5 }} value={endTime}
              disabled={!startTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '-8px 0 0' }}>
          Leave the time empty for an all-day routine.
        </p>

        <div>
          <span style={labelStyle}>{editing ? 'Run for' : 'Keep going for'}</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {([...(editing ? [{ value: 'keep' as const, label: keepEndLabel }] : []), ...END_PRESETS]).map((p) => {
              const on = end === p.value
              return (
                <button key={p.value} type="button" aria-pressed={on} onClick={() => setEnd(p.value)}
                  style={{
                    padding: '8px 12px', borderRadius: 'var(--r-full)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    background: on ? 'var(--accent-soft)' : 'var(--surface-2)',
                    color: on ? 'var(--accent)' : 'var(--text-2)',
                    border: `1px solid ${on ? 'var(--accent)' : 'var(--border-2)'}`,
                  }}>
                  {p.label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <label style={labelStyle} htmlFor="routine-reminder">Remind me</label>
          <select id="routine-reminder" style={{ ...inputStyle, cursor: 'pointer' }}
            value={reminder === null ? '' : String(reminder)}
            onChange={(e) => setReminder(e.target.value === '' ? null : parseInt(e.target.value, 10))}
            disabled={!startTime}>
            {REMINDERS.map((r) => (
              <option key={r.label} value={r.value === null ? '' : String(r.value)}>{r.label}</option>
            ))}
          </select>
        </div>

        {error && <p role="alert" style={{ fontSize: 13, color: 'var(--danger, #ef4444)', margin: 0 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="md" type="submit" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create routine'}
          </Button>
        </div>
      </form>
    </div>
  )
}
