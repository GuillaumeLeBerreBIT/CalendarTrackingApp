import { useState, useEffect, type FormEvent } from 'react'
import Icon from '@/components/ui/Icon'
import type { DateSelectArg } from '@fullcalendar/core'
import api from '@/api/client'
import type { CalEvent, Group, Member } from '@/types'
import {
  type RecurrenceState, type RepeatFreq, type EndMode,
  WEEKDAYS, WEEKDAY_LABEL, parseRRule, buildRRule, summarize,
} from '@/lib/recurrence'
import { parseNL, type ParsedEvent } from '@/lib/nlParser'

interface Props {
  event: CalEvent | null
  selectInfo: DateSelectArg | null
  groups: Group[]
  currentUserId?: string | null
  prefill?: ParsedEvent
  onClose: () => void
  onSaved: () => void
}

type EventType = 'personal' | 'appointment' | 'social'

// Reminder options → minutes-before value sent to the backend (null = off)
const REMINDER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'None' },
  { value: 10, label: '10 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 1440, label: '1 day before' },
]

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface-3)',
  border: '1px solid var(--border-2)',
  borderRadius: 'var(--r-sm)',
  padding: '10px 12px',
  fontSize: 13.5,
  color: 'var(--text-1)',
  outline: 'none',
  transition: 'var(--transition)',
  fontFamily: 'inherit',
  minHeight: 44,
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11.5,
  fontWeight: 700,
  color: 'var(--text-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  marginBottom: 7,
}

function resolveInitialEventType(event: CalEvent | null): EventType {
  if (!event) return 'appointment'
  // Legacy events with no group were created under the old "personal" type — keep
  // editing them as such so they don't get force-attached to a group.
  if (!event.extendedProps?.groupsId) return 'personal'
  if (event.extendedProps?.eventType === 'social') return 'social'
  return 'appointment'
}

export default function EventFormModal({ event, selectInfo, groups, currentUserId, prefill, onClose, onSaved }: Props) {
  const isEdit = !!event

  const [eventType, setEventType] = useState<EventType>(resolveInitialEventType(event))

  const [form, setForm] = useState({
    title: event?.title ?? prefill?.title ?? '',
    description: event?.extendedProps?.description ?? '',
    location: (event?.extendedProps?.location as string | undefined) ?? prefill?.location ?? '',
    imageUrl: (event?.extendedProps?.imageUrl as string | undefined) ?? '',
    allDay: event?.allDay ?? (selectInfo?.allDay ?? !prefill?.time),
    startDate: event?.start?.split('T')[0] ?? selectInfo?.startStr?.split('T')[0] ?? prefill?.date ?? '',
    endDate: (event?.end ?? event?.start ?? '')?.split('T')[0] ?? selectInfo?.endStr?.split('T')[0] ?? prefill?.date ?? '',
    startTime: event?.start?.includes('T') ? event.start.split('T')[1].slice(0, 5) : (prefill?.time ?? ''),
    endTime: event?.end?.includes('T') ? event.end.split('T')[1].slice(0, 5) : '',
    groupsId: String(event?.extendedProps?.groupsId ?? ''),
  })

  const [groupMembers, setGroupMembers] = useState<Member[]>([])
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(
    event?.extendedProps?.participants?.map((p) => p.userId) ?? []
  )
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  // NL quick-fill (create mode): "Lunch Friday 1pm at Marco's" → fills the form
  const [nlText, setNlText] = useState('')

  function applyNL() {
    const text = nlText.trim()
    if (!text) return
    const parsed = parseNL(text)
    setForm(f => ({
      ...f,
      title: parsed.title || f.title,
      location: parsed.location ?? f.location,
      startDate: parsed.date ?? f.startDate,
      endDate: parsed.date ?? f.endDate,
      startTime: parsed.time ?? f.startTime,
      allDay: !parsed.time,
    }))
    setNlText('')
  }

  // Tentative mode — group votes on the date
  const [isTentative, setIsTentative] = useState(false)
  const emptyOption = () => ({ startDate: '', startTime: '', endDate: '', endTime: '' })
  const [dateOptions, setDateOptions] = useState<{ startDate: string; startTime: string; endDate: string; endTime: string }[]>(
    [emptyOption(), emptyOption()]
  )

  function toggleTentative() {
    setIsTentative(prev => {
      if (!prev) setDateOptions([emptyOption(), emptyOption()])
      return !prev
    })
  }

  function setDateOption(index: number, field: string, value: string) {
    setDateOptions(prev => prev.map((o, i) => i === index ? { ...o, [field]: value } : o))
  }

  function addDateOption() {
    if (dateOptions.length >= 4) return
    setDateOptions(prev => [...prev, emptyOption()])
  }

  function removeDateOption(index: number) {
    if (dateOptions.length <= 2) return
    setDateOptions(prev => prev.filter((_, i) => i !== index))
  }

  // Per-event reminder (minutes before; null = off). Pre-filled when editing.
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(
    event?.extendedProps?.reminderMinutes ?? null
  )

  // Recurrence editor state (parsed from an existing rule when editing)
  const [rec, setRec] = useState<RecurrenceState>(() => parseRRule(event?.extendedProps?.recurrenceRule))
  // When editing/deleting a recurring event, ask the user the scope first
  const [scopePrompt, setScopePrompt] = useState<null | 'save' | 'delete'>(null)

  // Recurrence identity of the event being edited
  const isRecurring = !!event?.extendedProps?.isRecurring
  const masterId = event?.extendedProps?.recurringEventId ?? event?.id
  const occurrenceDate = event?.extendedProps?.occurrenceDate ?? null

  // Load group members when group changes (appointment type only)
  useEffect(() => {
    if (eventType === 'appointment' && form.groupsId) {
      api.get(`/retrieveUsersSelectedGroup?groupId=${form.groupsId}`)
        .then(({ data }) => {
          if (data.success) {
            const members: Member[] = data.selectUser.map((u: { userId: string; username: string }) => ({
              user_id: u.userId,
              username: u.username,
              email: '',
              role: '',
            }))
            setGroupMembers(members)
            // Default-select the creator (logged-in user) so an event always has at
            // least one attendee. They can deselect, but must pick someone to submit.
            if (!isEdit) {
              const meIsMember = currentUserId && members.some(m => m.user_id === currentUserId)
              setSelectedParticipants(meIsMember ? [currentUserId] : [])
            }
          }
        })
        .catch(() => {})
    } else {
      setGroupMembers([])
      if (!isEdit) setSelectedParticipants([])
    }
  }, [form.groupsId, eventType, currentUserId])

  // Handle type switching side-effects
  useEffect(() => {
    if (eventType === 'personal') {
      setForm(prev => ({ ...prev, groupsId: '' }))
      setGroupMembers([])
      setSelectedParticipants([])
    } else if ((eventType === 'appointment' || eventType === 'social') && groups.length > 0 && !form.groupsId) {
      setForm(prev => ({ ...prev, groupsId: String(groups[0].groups_id) }))
    }
  }, [eventType])

  function set(field: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function toggleParticipant(userId: string) {
    setSelectedParticipants(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    )
  }

  function buildPayload(): Record<string, unknown> {
    const filledOptions = dateOptions.filter(o => o.startDate)
    // When tentative, use first option's date as the canonical start (backend ignores it anyway)
    const startDate = isTentative ? (filledOptions[0]?.startDate ?? '') : form.startDate
    const endDate = isTentative ? (filledOptions[0]?.endDate ?? startDate) : (form.endDate || form.startDate)

    const payload: Record<string, unknown> = {
      'calendar-title': form.title,
      'calendar-description': form.description,
      location: form.location || null,
      image_url: form.imageUrl || null,
      allDay: isTentative ? true : form.allDay,
      startDate,
      endDate,
      startTime: (isTentative || form.allDay) ? '' : form.startTime,
      endTime: (isTentative || form.allDay) ? '' : form.endTime,
      recurrence_rule: buildRRule(rec),
      reminder_minutes: reminderMinutes,
      status: isTentative ? 'tentative' : 'confirmed',
      dateOptions: isTentative ? filledOptions : undefined,
    }

    if (eventType === 'personal') {
      // Personal: no group, no participants
    } else if (eventType === 'appointment') {
      payload.event_type = 'appointment'
      payload.tagNames = form.groupsId
      payload.participants = groupMembers
        .filter(m => selectedParticipants.includes(m.user_id))
        .map(m => ({ userId: m.user_id, username: m.username }))
    } else {
      payload.event_type = 'social'
      payload.tagNames = form.groupsId
      payload.participants = []
    }
    return payload
  }

  // mode: 'create' (new event) | 'all' (whole series / single) | 'this' (one occurrence)
  //       | 'following' (this occurrence + all later — splits the series)
  async function doSave(mode: 'create' | 'all' | 'this' | 'following') {
    setSaving(true)
    setError('')
    try {
      const payload = buildPayload()
      if (mode === 'create') {
        await api.post('/parseEvent', payload)
      } else {
        payload.recurrenceScope = mode
        if (mode === 'this' || mode === 'following') payload.occurrenceDate = occurrenceDate
        await api.put(`/parseEvent/${masterId}`, payload)
      }
      onSaved()
    } catch {
      setError('Could not save event. Please try again.')
    } finally {
      setSaving(false)
      setScopePrompt(null)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    // Appointments must have at least one attendee selected from the group.
    if (eventType === 'appointment' && selectedParticipants.length === 0) {
      setError('Select at least one person from the group to attend this event.')
      return
    }

    // Editing a recurring event → ask whether to apply to this occurrence or all
    if (isEdit && isRecurring) {
      setScopePrompt('save')
      return
    }
    await doSave(isEdit ? 'all' : 'create')
  }

  async function doDelete(scope: 'this' | 'following' | 'all') {
    if (!event) return
    setDeleting(true)
    try {
      const query = isRecurring ? `?scope=${scope}&date=${occurrenceDate ?? ''}` : ''
      await api.delete(`/parseEvent/${masterId}${query}`)
      onSaved()
    } catch {
      setDeleting(false)
      setScopePrompt(null)
    }
  }

  async function handleDelete() {
    if (!event) return
    // Recurring → ask scope; single → simple confirm
    if (isRecurring) {
      setScopePrompt('delete')
      return
    }
    if (!window.confirm('Delete this event? This cannot be undone.')) return
    setDeleting(true)
    try {
      await api.delete(`/parseEvent/${event.id}`)
      onSaved()
    } catch {
      setDeleting(false)
    }
  }

  const typeOptions: { value: EventType; icon: string; label: string; hint: string }[] = [
    {
      value: 'appointment',
      icon: 'cal',
      label: 'Appointment',
      hint: 'Linked to a group — all members see it. You choose who attends (you\'re selected by default). Selected members get an RSVP prompt.',
    },
    {
      value: 'social',
      icon: 'groups',
      label: 'Social event',
      hint: 'Everyone in the group is automatically invited and gets an RSVP prompt.',
    },
  ]

  const submitLabel = saving
    ? 'Saving…'
    : isEdit
    ? 'Save changes'
    : eventType === 'appointment'
    ? 'Save & invite selected'
    : 'Create & invite everyone'

  const isGroupType = eventType === 'appointment' || eventType === 'social'
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        background: 'var(--scrim)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: isMobile ? 'stretch' : 'center',
        padding: isMobile ? 0 : 16,
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="scroll"
        style={isMobile ? {
          width: '100%',
          maxHeight: '92dvh',
          overflowY: 'auto',
          background: 'var(--surface)',
          borderRadius: 'var(--r-xl) var(--r-xl) 0 0',
          boxShadow: 'var(--shadow-lg)',
          animation: 'slideUp 0.28s cubic-bezier(0.2,0.7,0.2,1) both',
        } : {
          width: 'min(480px, 100%)',
          maxHeight: '92vh',
          overflowY: 'auto',
          background: 'var(--surface)',
          borderRadius: 'var(--r-xl)',
          border: '1px solid var(--border-2)',
          boxShadow: 'var(--shadow-lg)',
          animation: 'scaleIn 0.24s cubic-bezier(0.2,0.7,0.2,1) both',
        }}
      >
        {/* Mobile drag handle */}
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
            <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--border-2)' }} />
          </div>
        )}
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 20px 16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
            {isEdit ? 'Edit event' : 'New event'}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isEdit && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                title="Delete event"
                style={{
                  width: 34, height: 34,
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid rgba(244,63,94,0.3)',
                  background: 'transparent',
                  color: '#fb7185',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  opacity: deleting ? 0.5 : 1,
                  transition: 'var(--transition)',
                }}
              >
                <Icon name="close" size={15} sw={2.2} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                width: 34, height: 34,
                borderRadius: 'var(--r-sm)',
                border: '1px solid var(--border-2)',
                background: 'transparent',
                color: 'var(--text-3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                transition: 'var(--transition)',
              }}
            >
              <Icon name="close" size={15} sw={2} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* ── NL quick-fill (new events only) ── */}
          {!isEdit && (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={nlText}
                onChange={e => setNlText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); applyNL() }
                }}
                placeholder="Quick fill: &quot;Lunch Friday 1pm at Marco's&quot;"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                type="button"
                onClick={applyNL}
                disabled={!nlText.trim()}
                title="Fill form from text"
                style={{
                  padding: '0 14px',
                  borderRadius: 'var(--r-sm)',
                  border: 'none',
                  background: nlText.trim() ? 'var(--accent-soft)' : 'var(--surface-3)',
                  color: nlText.trim() ? 'var(--accent)' : 'var(--text-3)',
                  fontWeight: 650,
                  fontSize: 13,
                  cursor: nlText.trim() ? 'pointer' : 'default',
                  minHeight: 44,
                  flexShrink: 0,
                  transition: 'var(--transition)',
                }}
              >
                Fill
              </button>
            </div>
          )}

          {/* ── Event type selector (new events only) ── */}
          {!isEdit && (
            <>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 5,
                padding: 4,
                background: 'var(--surface-3)',
                borderRadius: 'var(--r-md)',
                border: '1px solid var(--border)',
              }}>
                {typeOptions.map(({ value, icon, label }) => {
                  const active = eventType === value
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setEventType(value)}
                      style={{
                        padding: '8px 4px',
                        borderRadius: 'calc(var(--r-md) - 4px)',
                        border: active ? '1px solid var(--border-2)' : '1px solid transparent',
                        background: active ? 'var(--surface)' : 'transparent',
                        color: active ? 'var(--text-1)' : 'var(--text-3)',
                        fontSize: 12,
                        fontWeight: 650,
                        cursor: 'pointer',
                        transition: 'var(--transition)',
                        boxShadow: active ? 'var(--shadow-sm)' : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 5,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <Icon name={icon} size={13} sw={1.8} />
                      {label}
                    </button>
                  )
                })}
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
                {typeOptions.find(o => o.value === eventType)?.hint}
              </p>
            </>
          )}

          {/* ── Tentative toggle (group events only, new events only) ── */}
          {!isEdit && isGroupType && (
            <button
              type="button"
              aria-pressed={isTentative}
              onClick={toggleTentative}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 'var(--r-md)',
                border: isTentative ? '1px solid rgba(245,158,11,0.4)' : '1px solid var(--border)',
                background: isTentative ? 'rgba(245,158,11,0.07)' : 'var(--surface-2)',
                cursor: 'pointer',
                transition: 'var(--transition)',
                width: '100%',
                textAlign: 'left',
              }}
            >
              {/* Custom checkbox */}
              <div style={{
                width: 18,
                height: 18,
                borderRadius: 5,
                border: isTentative ? '2px solid #f59e0b' : '2px solid var(--border-2)',
                background: isTentative ? '#f59e0b' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'var(--transition)',
              }}>
                {isTentative && <Icon name="check" size={11} sw={3} style={{ color: '#0b0b12' }} />}
              </div>
              <div>
                <span style={{ fontSize: 13.5, fontWeight: 650, color: isTentative ? '#f59e0b' : 'var(--text-2)' }}>
                  Tentative
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 6 }}>
                  — let the group vote on the date
                </span>
              </div>
            </button>
          )}

          {/* ── Title ── */}
          <div>
            <label style={labelStyle}>Title</label>
            <input
              required
              autoFocus
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder={
                eventType === 'personal' ? 'e.g. Doctor appointment' :
                eventType === 'social' ? 'e.g. Family dinner' :
                'e.g. School pickup'
              }
              style={inputStyle}
            />
          </div>

          {/* ── Description ── */}
          <div>
            <label style={labelStyle}>
              Description <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Any extra details…"
              rows={2}
              style={{ ...inputStyle, resize: 'none', minHeight: 'unset' }}
            />
          </div>

          {/* ── Location ── */}
          <div>
            <label style={labelStyle}>
              Location <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: 12, color: 'var(--text-3)', pointerEvents: 'none', display: 'flex' }}>
                <Icon name="pin" size={15} sw={1.8} />
              </span>
              <input
                type="text"
                value={form.location}
                onChange={e => set('location', e.target.value)}
                placeholder="Add location or address"
                style={{ ...inputStyle, paddingLeft: 36 }}
              />
            </div>
          </div>

          {/* ── Cover image ── */}
          <div>
            <label style={labelStyle}>
              Cover image <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ position: 'absolute', left: 12, color: 'var(--text-3)', pointerEvents: 'none', display: 'flex' }}>
                <Icon name="share" size={15} sw={1.8} />
              </span>
              <input
                type="url"
                value={form.imageUrl}
                onChange={e => set('imageUrl', e.target.value)}
                placeholder="Paste an image URL"
                style={{ ...inputStyle, paddingLeft: 36 }}
              />
            </div>
            {form.imageUrl && (
              <img
                src={form.imageUrl}
                alt="Cover preview"
                style={{ width: '100%', height: 60, objectFit: 'cover', borderRadius: 'var(--r-sm)', marginTop: 6 }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            )}
          </div>

          {/* ── All day (hidden when tentative) ── */}
          {!isTentative && (
            <label style={{
              display: 'flex', alignItems: 'center', gap: 9,
              cursor: 'pointer', fontSize: 13.5, color: 'var(--text-2)', userSelect: 'none',
            }}>
              <input
                type="checkbox"
                checked={form.allDay}
                onChange={e => set('allDay', e.target.checked)}
                style={{ accentColor: 'var(--accent)', width: 16, height: 16 }}
              />
              All day
            </label>
          )}

          {/* ── Normal dates (hidden when tentative) ── */}
          {!isTentative && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Start date</label>
                <input type="date" required value={form.startDate} onChange={e => set('startDate', e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>End date</label>
                <input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} style={inputStyle} />
              </div>
            </div>
          )}

          {/* ── Normal times (hidden when tentative) ── */}
          {!isTentative && !form.allDay && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Start time</label>
                <input type="time" value={form.startTime} onChange={e => set('startTime', e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>End time</label>
                <input type="time" value={form.endTime} onChange={e => set('endTime', e.target.value)} style={inputStyle} />
              </div>
            </div>
          )}

          {/* ── Tentative date options ── */}
          {isTentative && (
            <div>
              <label style={labelStyle}>Date options</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dateOptions.map((opt, idx) => (
                  <div key={idx} style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--r-sm)',
                    border: '1px dashed var(--border-2)',
                    background: 'var(--surface-2)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-3)' }}>
                        Option {idx + 1}
                      </span>
                      {dateOptions.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeDateOption(idx)}
                          title="Remove option"
                          style={{
                            width: 22, height: 22,
                            borderRadius: 'var(--r-sm)',
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--text-3)',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: 0,
                          }}
                        >
                          <Icon name="close" size={13} sw={2} />
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={{ ...labelStyle, marginBottom: 4 }}>Date</label>
                        <input
                          type="date"
                          value={opt.startDate}
                          onChange={e => setDateOption(idx, 'startDate', e.target.value)}
                          style={{ ...inputStyle, minHeight: 38 }}
                        />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, marginBottom: 4 }}>Start time</label>
                        <input
                          type="time"
                          value={opt.startTime}
                          onChange={e => setDateOption(idx, 'startTime', e.target.value)}
                          style={{ ...inputStyle, minHeight: 38 }}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={{ ...labelStyle, marginBottom: 4 }}>
                        End time <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                      </label>
                      <input
                        type="time"
                        value={opt.endTime}
                        onChange={e => setDateOption(idx, 'endTime', e.target.value)}
                        style={{ ...inputStyle, minHeight: 38 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addDateOption}
                disabled={dateOptions.length >= 4}
                style={{
                  marginTop: 8,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 12px',
                  borderRadius: 'var(--r-sm)',
                  border: '1px solid var(--border-2)',
                  background: 'transparent',
                  color: dateOptions.length >= 4 ? 'var(--text-3)' : 'var(--accent)',
                  fontSize: 12.5,
                  fontWeight: 650,
                  cursor: dateOptions.length >= 4 ? 'not-allowed' : 'pointer',
                  opacity: dateOptions.length >= 4 ? 0.5 : 1,
                  transition: 'var(--transition)',
                }}
              >
                <Icon name="plus" size={13} sw={2.2} />
                Add option
              </button>
            </div>
          )}

          {/* ── Repeat / recurrence ── */}
          <div>
            <label style={labelStyle}>Repeat</label>
            <select
              value={rec.repeat}
              onChange={e => setRec(r => ({ ...r, repeat: e.target.value as RepeatFreq }))}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>

            {rec.repeat !== 'none' && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' }}>
                {/* Interval */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Every</span>
                  <input
                    type="number" min={1} max={99} value={rec.interval}
                    onChange={e => setRec(r => ({ ...r, interval: Math.max(1, parseInt(e.target.value) || 1) }))}
                    style={{ ...inputStyle, width: 72, minHeight: 38 }}
                  />
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                    {rec.repeat === 'daily' ? 'day(s)' : rec.repeat === 'weekly' ? 'week(s)' : 'month(s)'}
                  </span>
                </div>

                {/* Weekdays (weekly only) */}
                {rec.repeat === 'weekly' && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {WEEKDAYS.map(d => {
                      const on = rec.weekdays.includes(d)
                      return (
                        <button
                          key={d} type="button"
                          onClick={() => setRec(r => ({ ...r, weekdays: on ? r.weekdays.filter(x => x !== d) : [...r.weekdays, d] }))}
                          style={{
                            width: 34, height: 34, borderRadius: '50%', cursor: 'pointer',
                            border: `1px solid ${on ? 'var(--accent)' : 'var(--border-2)'}`,
                            background: on ? 'var(--accent)' : 'var(--surface-3)',
                            color: on ? 'var(--accent-text)' : 'var(--text-2)',
                            fontSize: 12, fontWeight: 700,
                          }}
                        >{WEEKDAY_LABEL[d]}</button>
                      )
                    })}
                  </div>
                )}

                {/* End condition */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>
                    <input type="radio" name="endmode" checked={rec.endMode === 'never'} onChange={() => setRec(r => ({ ...r, endMode: 'never' as EndMode }))} style={{ accentColor: 'var(--accent)' }} />
                    Never ends
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>
                    <input type="radio" name="endmode" checked={rec.endMode === 'on'} onChange={() => setRec(r => ({ ...r, endMode: 'on' as EndMode }))} style={{ accentColor: 'var(--accent)' }} />
                    On
                    <input type="date" value={rec.endDate} onChange={e => setRec(r => ({ ...r, endDate: e.target.value, endMode: 'on' as EndMode }))} style={{ ...inputStyle, width: 160, minHeight: 36 }} />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>
                    <input type="radio" name="endmode" checked={rec.endMode === 'after'} onChange={() => setRec(r => ({ ...r, endMode: 'after' as EndMode }))} style={{ accentColor: 'var(--accent)' }} />
                    After
                    <input type="number" min={1} value={rec.count} onChange={e => setRec(r => ({ ...r, count: Math.max(1, parseInt(e.target.value) || 1), endMode: 'after' as EndMode }))} style={{ ...inputStyle, width: 72, minHeight: 36 }} />
                    times
                  </label>
                </div>

                <p style={{ fontSize: 12.5, color: 'var(--accent)', margin: 0, fontWeight: 600 }}>{summarize(rec)}</p>
              </div>
            )}
          </div>

          {/* ── Reminder ── */}
          <div>
            <label style={labelStyle}>Remind me</label>
            <select
              value={reminderMinutes === null ? '' : String(reminderMinutes)}
              onChange={e => setReminderMinutes(e.target.value === '' ? null : parseInt(e.target.value, 10))}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {REMINDER_OPTIONS.map(o => (
                <option key={o.label} value={o.value === null ? '' : String(o.value)}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* ── Group section ── */}
          {isGroupType && (
            <>
              <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />

              <div>
                <label style={labelStyle}>Group</label>
                <select
                  value={form.groupsId}
                  onChange={e => set('groupsId', e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="">Select a group…</option>
                  {groups.filter(g => g.groups_id != null).map(g => (
                    <option key={String(g.groups_id)} value={String(g.groups_id)}>
                      {g.groups_title || g.tag_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Social: info banner */}
              {eventType === 'social' && form.groupsId && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 14px',
                  borderRadius: 'var(--r-md)',
                  background: 'var(--accent-softer)',
                  border: '1px solid var(--accent-line)',
                }}>
                  <Icon name="groups" size={16} sw={1.8} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
                    Everyone in this group will be invited and can RSVP.
                  </p>
                </div>
              )}

              {/* Appointment: member checkboxes */}
              {eventType === 'appointment' && groupMembers.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Who's invited</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => setSelectedParticipants(groupMembers.map(m => m.user_id))}
                        style={{ fontSize: 11.5, color: 'var(--accent)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        All
                      </button>
                      <span style={{ color: 'var(--border-2)' }}>·</span>
                      <button type="button" onClick={() => setSelectedParticipants([])}
                        style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        None
                      </button>
                    </div>
                  </div>

                  <div style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                    {groupMembers.map((m, i) => {
                      const checked = selectedParticipants.includes(m.user_id)
                      return (
                        <label
                          key={m.user_id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', cursor: 'pointer',
                            borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                            background: checked ? 'var(--accent-softer)' : 'transparent',
                            transition: 'var(--transition)',
                          }}
                        >
                          <input type="checkbox" checked={checked} onChange={() => toggleParticipant(m.user_id)}
                            style={{ accentColor: 'var(--accent)', width: 16, height: 16, flexShrink: 0 }} />
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: 'var(--accent-soft)', color: 'var(--accent)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 700, flexShrink: 0,
                          }}>
                            {m.username?.[0]?.toUpperCase()}
                          </div>
                          <span style={{ fontSize: 13.5, color: 'var(--text-1)', fontWeight: 500 }}>{m.username}</span>
                          {checked && (
                            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent)', fontWeight: 650 }}>Invited</span>
                          )}
                        </label>
                      )
                    })}
                  </div>

                  {selectedParticipants.length === 0 && (
                    <p style={{ fontSize: 12, color: '#fb7185', marginTop: 8 }}>
                      Pick at least one person — an event needs at least one attendee.
                    </p>
                  )}
                </div>
              )}

              {eventType === 'appointment' && form.groupsId && groupMembers.length === 0 && (
                <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Loading members…</p>
              )}
            </>
          )}

          {/* ── Error ── */}
          {error && (
            <p style={{
              fontSize: 13, color: '#fb7185',
              background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)',
              borderRadius: 'var(--r-sm)', padding: '9px 12px', margin: 0,
            }}>
              {error}
            </p>
          )}

          {/* ── Actions ── */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 4, paddingBottom: 'env(safe-area-inset-bottom, 8px)' }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                flex: 1,
                background: saving ? 'var(--accent-soft)' : 'var(--accent)',
                color: 'var(--accent-text)',
                border: 'none',
                borderRadius: 'var(--r-sm)',
                padding: '11px 16px',
                fontSize: 13.5,
                fontWeight: 650,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
                transition: 'var(--transition)',
                boxShadow: saving ? 'none' : '0 4px 14px var(--accent-glow)',
              }}
            >
              {submitLabel}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                background: 'var(--surface-3)',
                color: 'var(--text-2)',
                border: '1px solid var(--border-2)',
                borderRadius: 'var(--r-sm)',
                padding: '11px 16px',
                fontSize: 13.5,
                fontWeight: 650,
                cursor: 'pointer',
                transition: 'var(--transition)',
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      {/* ── Recurring scope chooser ── */}
      {scopePrompt && (
        <div
          onClick={(e) => { e.stopPropagation(); setScopePrompt(null) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'var(--scrim)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(360px, 100%)', background: 'var(--surface)',
              borderRadius: 'var(--r-lg)', border: '1px solid var(--border-2)',
              boxShadow: 'var(--shadow-lg)', padding: 20,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 4px' }}>
              {scopePrompt === 'save' ? 'Save recurring event' : 'Delete recurring event'}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 8px' }}>
              This is a repeating event. Apply to:
            </p>

            <ScopeButton label="This event only" onClick={() => (scopePrompt === 'save' ? doSave('this') : doDelete('this'))} />
            <ScopeButton
              label="This and following events"
              onClick={() => (scopePrompt === 'save' ? doSave('following') : doDelete('following'))}
            />
            <ScopeButton
              label="All events in the series"
              danger={scopePrompt === 'delete'}
              onClick={() => (scopePrompt === 'save' ? doSave('all') : doDelete('all'))}
            />
            <button
              type="button"
              onClick={() => setScopePrompt(null)}
              style={{
                marginTop: 4, background: 'transparent', border: 'none',
                color: 'var(--text-3)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '8px',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ScopeButton({ label, onClick, danger = false }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', padding: '12px 14px',
        borderRadius: 'var(--r-sm)', cursor: 'pointer',
        border: '1px solid var(--border-2)',
        background: 'var(--surface-2)',
        color: danger ? '#fb7185' : 'var(--text-1)',
        fontSize: 13.5, fontWeight: 600, transition: 'var(--transition)',
      }}
    >
      {label}
    </button>
  )
}
