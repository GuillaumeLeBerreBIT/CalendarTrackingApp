import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/api/client'
import Icon from '@/components/ui/Icon'
import Button from '@/components/ui/Button'
import RoutineSheet from '@/components/RoutineSheet'
import { describeRoutine, formatDay, isSimpleRoutine, localToday } from '@/lib/routines'
import type { Routine } from '@/types'

function timeRange(r: Routine): string {
  if (r.allDay || !r.startTime) return 'All day'
  return r.endTime ? `${r.startTime}–${r.endTime}` : r.startTime
}

function nextLabel(r: Routine): string {
  if (!r.next) return 'Finished'
  const today = localToday()
  const d = new Date(`${r.next.date}T00:00:00`)
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = localToday(tomorrow)
  const day = r.next.date === today ? 'Today'
    : r.next.date === tomorrowStr ? 'Tomorrow'
    : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  return r.next.time ? `${day}, ${r.next.time}` : day
}

function RoutineCard({ routine, onEdit, onStop, onDelete }: {
  routine: Routine
  onEdit: (r: Routine) => void
  onStop: (r: Routine) => void
  onDelete: (r: Routine) => void
}) {
  const editable = isSimpleRoutine(routine.rule)
  const linkStyle: React.CSSProperties = {
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    fontSize: 12.5, fontWeight: 650, color: 'var(--text-3)',
  }
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 'var(--r-md)', background: 'var(--surface)',
      border: '1px solid var(--border)', opacity: routine.ended ? 0.65 : 1,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {routine.title}
        </p>
        <span style={{ fontSize: 12.5, fontWeight: 650, color: routine.ended ? 'var(--text-3)' : 'var(--accent)', flexShrink: 0 }}>
          {nextLabel(routine)}
        </span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
        {describeRoutine(routine.rule)} · {timeRange(routine)}
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
        Started {formatDay(routine.startDate)}
        {routine.reminderMinutes != null && !routine.allDay ? ` · reminder ${routine.reminderMinutes >= 60 ? `${routine.reminderMinutes / 60} h` : `${routine.reminderMinutes} min`} before` : ''}
      </p>
      <div style={{ display: 'flex', gap: 16, marginTop: 2 }}>
        {editable
          ? <button style={{ ...linkStyle, color: 'var(--accent)' }} onClick={() => onEdit(routine)}>Edit</button>
          : <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Custom repeat — edit it from the calendar</span>}
        {!routine.ended && <button style={linkStyle} onClick={() => onStop(routine)}>Stop</button>}
        <button style={{ ...linkStyle, color: 'var(--danger, #ef4444)' }} onClick={() => onDelete(routine)}>Delete</button>
      </div>
    </div>
  )
}

export default function RoutinesPage() {
  const navigate = useNavigate()
  const [routines, setRoutines] = useState<Routine[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [sheet, setSheet] = useState<{ routine?: Routine } | null>(null)
  const [actionError, setActionError] = useState('')

  // Bumping `version` refetches; state is only set from the response callbacks.
  const [version, setVersion] = useState(0)
  const load = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    let alive = true
    api.get('/routines')
      .then(({ data }) => {
        if (!alive) return
        setRoutines(data.success ? data.routines : [])
        setLoadError(!data.success)
      })
      .catch(() => {
        if (!alive) return
        setLoadError(true)
        setRoutines((prev) => prev ?? [])
      })
    return () => { alive = false }
  }, [version])

  async function run(request: () => Promise<unknown>, failure: string) {
    setActionError('')
    try { await request(); load() } catch { setActionError(failure) }
  }

  // Stop keeps the history: the series ends before today, past sessions stay.
  const stop = (r: Routine) => {
    if (!window.confirm(`Stop "${r.title}"? Past sessions stay on your calendar; nothing after today will.`)) return
    run(() => api.delete(`/parseEvent/${r.eventId}`, { params: { scope: 'following', date: localToday() } }), 'Could not stop the routine.')
  }
  const remove = (r: Routine) => {
    if (!window.confirm(`Delete "${r.title}" and every session, past and future? This cannot be undone.`)) return
    run(() => api.delete(`/parseEvent/${r.eventId}`, { params: { scope: 'all' } }), 'Could not delete the routine.')
  }

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px 40px' }}>
      <button
        onClick={() => navigate('/calendar')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px',
          borderRadius: 'var(--r-full)', background: 'var(--surface)', border: '1px solid var(--border)',
          color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 18,
        }}
      >
        <Icon name="chevL" size={14} sw={2.2} />
        Calendar
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.03em', margin: 0 }}>
            Routines
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--text-3)', margin: '6px 0 0' }}>
            Things you do on the same days every week — training, classes, a weekly meeting.
          </p>
        </div>
        <Button variant="soft" size="sm" icon="plus" onClick={() => setSheet({})}>Add</Button>
      </div>

      {actionError && <p role="alert" style={{ fontSize: 13, color: 'var(--danger, #ef4444)', marginBottom: 12 }}>{actionError}</p>}

      {routines === null ? (
        <p style={{ color: 'var(--text-3)', fontSize: 14 }}>Loading…</p>
      ) : loadError && routines.length === 0 ? (
        <div style={{ padding: '28px 20px', textAlign: 'center', borderRadius: 'var(--r-md)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 12 }}>Could not load your routines.</p>
          <Button variant="outline" size="sm" onClick={load}>Try again</Button>
        </div>
      ) : routines.length === 0 ? (
        <div style={{ padding: '36px 20px', textAlign: 'center', borderRadius: 'var(--r-md)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, color: 'var(--text-3)' }}>
            <Icon name="repeat" size={32} />
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>No routines yet</p>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 14 }}>
            Add one like "Swim training — Mon &amp; Tue, 19:00" and it fills your calendar for the whole year.
          </p>
          <Button variant="primary" size="sm" icon="plus" onClick={() => setSheet({})}>Add a routine</Button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {routines.map((r) => (
            <RoutineCard key={r.eventId} routine={r} onEdit={(x) => setSheet({ routine: x })} onStop={stop} onDelete={remove} />
          ))}
        </div>
      )}

      {sheet && (
        <RoutineSheet
          routine={sheet.routine}
          onClose={() => setSheet(null)}
          onSaved={() => { setSheet(null); load() }}
        />
      )}
    </div>
  )
}
