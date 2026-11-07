import { useState, useEffect, type FormEvent } from 'react'
import Sheet, { Disclosure } from '@/components/ui/Sheet'
import Button, { IconButton } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Primitives'
import { Switch, Checkbox, InsetGroup, InsetRow } from '@/components/ui/Controls'
import { Avatar } from '@/components/ui/Avatar'
import WishlistDraft, { type GiftDraft } from '@/components/WishlistDraft'
import { errorText } from '@/components/QuickAddInput'
import api from '@/api/client'
import type { CalEvent, DateSelection, Group, Member } from '@/types'
import RecurringScopePrompt from '@/components/RecurringScopePrompt'
import {
  type RecurrenceState, type RepeatFreq, type EndMode,
  WEEKDAYS, WEEKDAY_LABEL, parseRRule, summarize, ruleToSave, isFullyEditable,
} from '@/lib/recurrence'
import type { ParsedEvent } from '@/lib/nlParser'
import { fromCalendarAllDayEnd } from '@/lib/allDayDates'

// Max candidate date slots per tentative event (mirrors MAX_DATE_OPTIONS on the backend).
const MAX_DATE_OPTIONS = 6

interface Props {
  event: CalEvent | null
  selectInfo: DateSelection | null
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
  { value: 5, label: '5 minutes before' },
  { value: 10, label: '10 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
  { value: 1440, label: '1 day before' },
]

// New events default to a 15-minute reminder; editing keeps whatever was saved.
const DEFAULT_REMINDER_MINUTES = 15


const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12.5,
  fontWeight: 500,
  color: 'var(--text-2)',
  marginBottom: 6,
}

const radioRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--text-2)', cursor: 'pointer',
}

type SectionKey = 'invite' | 'place' | 'wishlist' | 'repeat'

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
    // API events carry no allDay field; a date-only start means all-day.
    // A selection spanning several days is an all-day range; a single click stays timed.
    allDay: event
      ? (event.allDay ?? !event.start.includes('T'))
      : !!selectInfo?.allDay &&
        fromCalendarAllDayEnd(selectInfo.startStr, selectInfo.endStr) > selectInfo.startStr.split('T')[0],
    startDate: event?.start?.split('T')[0] ?? selectInfo?.startStr?.split('T')[0] ?? prefill?.date ?? '',
    // Edit: stored end is already inclusive. Drag-select: FullCalendar's end is exclusive.
    endDate: event
      ? (event.end ?? event.start).split('T')[0]
      : selectInfo
        ? (selectInfo.allDay
            ? fromCalendarAllDayEnd(selectInfo.startStr, selectInfo.endStr)
            : selectInfo.endStr.split('T')[0])
        : (prefill?.date ?? ''),
    startTime: event?.start?.includes('T') ? event.start.split('T')[1].slice(0, 5) : (prefill?.time ?? ''),
    endTime: event?.end?.includes('T') ? event.end.split('T')[1].slice(0, 5) : '',
    groupsId: String(event?.extendedProps?.groupsId ?? ''),
  })

  const [groupMembers, setGroupMembers] = useState<Member[]>([])
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(
    event?.extendedProps?.participants?.map((p) => p.userId) ?? []
  )
  const [wishlistEnabled, setWishlistEnabled] = useState(false)
  const [giftDrafts, setGiftDrafts] = useState<GiftDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

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
    if (dateOptions.length >= MAX_DATE_OPTIONS) return
    setDateOptions(prev => [...prev, emptyOption()])
  }

  function removeDateOption(index: number) {
    if (dateOptions.length <= 2) return
    setDateOptions(prev => prev.filter((_, i) => i !== index))
  }

  // Per-event reminder (minutes before; null = off). Pre-filled when editing;
  // new events start at the 15-minute default.
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(
    event ? (event.extendedProps?.reminderMinutes ?? null) : DEFAULT_REMINDER_MINUTES
  )

  // Recurrence editor state (parsed from an existing rule when editing)
  const originalRule = (event?.extendedProps?.recurrenceRule as string | null | undefined) ?? null
  const [initialRec] = useState<RecurrenceState>(() => parseRRule(originalRule))
  const [rec, setRec] = useState<RecurrenceState>(initialRec)
  // Imported rules can use parts the editor has no controls for; they are kept
  // as-is unless the user changes the repeat settings.
  const customRuleKept = !isFullyEditable(originalRule) && JSON.stringify(rec) === JSON.stringify(initialRec)
  // When editing/deleting a recurring event, ask the user the scope first
  const [scopePrompt, setScopePrompt] = useState<null | 'save' | 'delete'>(null)

  // Optional sections start folded; a section with saved content starts open when editing.
  const [openSection, setOpenSection] = useState<Record<SectionKey, boolean>>(() => ({
    invite: false,
    place: !!(event && (event.extendedProps?.location || event.extendedProps?.description || event.extendedProps?.imageUrl)),
    wishlist: false,
    repeat: false,
  }))
  function toggleSection(key: SectionKey) {
    setOpenSection(s => ({ ...s, [key]: !s[key] }))
  }

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
      recurrence_rule: ruleToSave(originalRule, initialRec, rec),
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
    if (!isEdit && wishlistEnabled) payload.wishlist = giftDrafts.filter(g => g.title.trim())
    return payload
  }

  // mode: 'create' (new event) | 'all' (whole series / single) | 'this' (one occurrence)
  //       | 'following' (this occurrence + all later — splits the series)
  async function doSave(mode: 'create' | 'all' | 'this' | 'following') {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const payload = buildPayload()
      if (mode === 'create') {
        const { data } = await api.post('/parseEvent', payload)
        if (!data.success) throw new Error(data.error || 'Could not save event')
      } else {
        payload.recurrenceScope = mode
        if (mode === 'this' || mode === 'following') payload.occurrenceDate = occurrenceDate
        await api.put(`/parseEvent/${masterId}`, payload)
      }
      onSaved()
    } catch (err) {
      setError(errorText(err))
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

  // On iOS, inputs with font-size < 16px trigger viewport auto-zoom when focused.
  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg)',
    border: '1px solid var(--border-2)',
    borderRadius: 'var(--r-sm)',
    padding: '10px 12px',
    fontSize: isMobile ? 16 : 14,
    color: 'var(--text-1)',
    outline: 'none',
    transition: 'var(--transition)',
    fontFamily: 'inherit',
    minHeight: 44,
    boxSizing: 'border-box',
    // iOS native date/time inputs have a wide intrinsic min-width; without this
    // they refuse to shrink inside a 2-col grid and overflow the sheet edge.
    minWidth: 0,
  }

  // Date/time inputs only: reset the native WebKit appearance so the control
  // honours its box width (selects keep their native chevron).
  const dateTimeStyle: React.CSSProperties = {
    ...inputStyle,
    WebkitAppearance: 'none',
    appearance: 'none',
    textAlign: 'left',
  }

  const repeatSummary = rec.repeat === 'none' ? 'Does not repeat' : summarize(rec)
  const reminderSummary = REMINDER_OPTIONS.find(o => o.value === reminderMinutes)?.label ?? 'None'
  const inviteSummary = eventType === 'social'
    ? 'Everyone in the group'
    : `${selectedParticipants.length} invited`
  const placeSummary = [form.location, form.description && 'note', form.imageUrl && 'cover'].filter(Boolean).join(' · ') || 'None'
  const giftCount = giftDrafts.filter(g => g.title.trim()).length
  const wishlistSummary = wishlistEnabled ? `${giftCount} gift${giftCount === 1 ? '' : 's'}` : 'Off'

  return (
    <>
      <Sheet
        title={isEdit ? 'Edit event' : 'New event'}
        onClose={onClose}
        actions={isEdit ? (
          <Button variant="danger" size="sm" icon="trash" onClick={handleDelete} disabled={deleting} title="Delete event">
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        ) : undefined}
        footer={
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" onClick={onClose} style={{ flex: '0 0 auto' }}>Cancel</Button>
            <Button type="submit" form="event-form" disabled={saving} full style={{ flex: 1 }}>{submitLabel}</Button>
          </div>
        }
      >
        <form id="event-form" onSubmit={handleSubmit} style={{ padding: '16px 18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Event type (new events only) ── */}
          {!isEdit && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Segmented
                options={typeOptions.map(({ value, icon, label }) => ({ value, icon, label }))}
                value={eventType}
                onChange={(v) => setEventType(v as EventType)}
              />
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
                {typeOptions.find(o => o.value === eventType)?.hint}
              </p>
            </div>
          )}

          {/* ── Title ── */}
          <input
            required
            autoFocus={!isMobile}
            aria-label="Title"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder={
              eventType === 'personal' ? 'Title, e.g. Doctor appointment' :
              eventType === 'social' ? 'Title, e.g. Family dinner' :
              'Title, e.g. School pickup'
            }
            style={{ ...inputStyle, fontSize: isMobile ? 18 : 17, fontWeight: 600, minHeight: 48 }}
          />

          {/* ── Group ── */}
          {isGroupType && (
            <div>
              <label style={labelStyle} htmlFor="event-group">Group</label>
              <select
                id="event-group"
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
          )}

          {/* ── When ── */}
          <InsetGroup>
            {!isEdit && isGroupType && (
              <InsetRow
                first
                label={<span>Let the group vote on the date <span style={{ color: 'var(--text-3)', fontSize: 13 }}>· tentative</span></span>}
                value={<Switch checked={isTentative} onChange={toggleTentative} label="Tentative: let the group vote on the date" />}
              />
            )}
            {!isTentative && (
              <InsetRow
                first={isEdit || !isGroupType}
                label="All day"
                value={<Switch checked={form.allDay} onChange={(v) => set('allDay', v)} label="All day" />}
              />
            )}
            {!isTentative && (
              <div style={{ padding: '10px 14px 14px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
                  <div>
                    <label style={labelStyle} htmlFor="event-start-date">Starts</label>
                    <input id="event-start-date" type="date" required value={form.startDate} onChange={e => set('startDate', e.target.value)} style={dateTimeStyle} />
                  </div>
                  <div>
                    <label style={labelStyle} htmlFor="event-end-date">Ends</label>
                    <input id="event-end-date" type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} style={dateTimeStyle} />
                  </div>
                </div>
                {!form.allDay && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
                    <input type="time" aria-label="Start time" value={form.startTime} onChange={e => set('startTime', e.target.value)} style={dateTimeStyle} />
                    <input type="time" aria-label="End time" value={form.endTime} onChange={e => set('endTime', e.target.value)} style={dateTimeStyle} />
                  </div>
                )}
              </div>
            )}
            {isTentative && (
              <div style={{ padding: '10px 14px 14px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {dateOptions.map((opt, idx) => (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>Option {idx + 1}</span>
                      {dateOptions.length > 2 && (
                        <IconButton name="close" size={28} isz={13} title={`Remove option ${idx + 1}`} onClick={() => removeDateOption(idx)} />
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr)', gap: 6 }}>
                      <input type="date" aria-label={`Option ${idx + 1} date`} value={opt.startDate} onChange={e => setDateOption(idx, 'startDate', e.target.value)} style={dateTimeStyle} />
                      <input type="time" aria-label={`Option ${idx + 1} start time`} value={opt.startTime} onChange={e => setDateOption(idx, 'startTime', e.target.value)} style={dateTimeStyle} />
                      <input type="time" aria-label={`Option ${idx + 1} end time (optional)`} value={opt.endTime} onChange={e => setDateOption(idx, 'endTime', e.target.value)} style={dateTimeStyle} />
                    </div>
                  </div>
                ))}
                <div>
                  <Button variant="outline" size="sm" icon="plus" onClick={addDateOption} disabled={dateOptions.length >= MAX_DATE_OPTIONS}>
                    Add option
                  </Button>
                </div>
              </div>
            )}
          </InsetGroup>

          {/* ── Invite ── */}
          {isGroupType && form.groupsId && (
            <Disclosure
              label="Invite"
              icon="groups"
              summary={inviteSummary}
              open={openSection.invite || (eventType === 'appointment' && selectedParticipants.length === 0 && groupMembers.length > 0)}
              onToggle={() => toggleSection('invite')}
            >
              {eventType === 'social' && (
                <p style={{ fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
                  Everyone in this group will be invited and can RSVP.
                </p>
              )}
              {eventType === 'appointment' && groupMembers.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Loading members…</p>
              )}
              {eventType === 'appointment' && groupMembers.length > 0 && (
                <>
                  <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                    <button type="button" onClick={() => setSelectedParticipants(groupMembers.map(m => m.user_id))}
                      style={{ color: 'var(--text-1)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      Select all
                    </button>
                    <button type="button" onClick={() => setSelectedParticipants([])}
                      style={{ color: 'var(--text-2)', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      Clear
                    </button>
                  </div>
                  <div style={{ background: 'var(--bg)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                    {groupMembers.map((m, i) => {
                      const checked = selectedParticipants.includes(m.user_id)
                      return (
                        <div
                          key={m.user_id}
                          onClick={() => toggleParticipant(m.user_id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px', minHeight: 48, cursor: 'pointer',
                            borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                          }}
                        >
                          <Avatar id={m.user_id} size={28} />
                          <span style={{ flex: 1, fontSize: 14.5, color: 'var(--text-1)', fontWeight: 500 }}>{m.username}</span>
                          <span onClick={(e) => e.stopPropagation()} style={{ display: 'flex' }}>
                            <Checkbox checked={checked} onChange={() => toggleParticipant(m.user_id)} label={`Invite ${m.username}`} shape="round" />
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  {selectedParticipants.length === 0 && (
                    <p style={{ fontSize: 12.5, color: 'var(--danger)' }}>
                      Pick at least one person: an event needs at least one attendee.
                    </p>
                  )}
                </>
              )}
            </Disclosure>
          )}

          {/* ── Location & note ── */}
          <Disclosure
            label="Location & note"
            icon="pin"
            summary={placeSummary}
            open={openSection.place}
            onToggle={() => toggleSection('place')}
          >
            <input
              type="text"
              aria-label="Location"
              value={form.location}
              onChange={e => set('location', e.target.value)}
              placeholder="Location or address"
              style={inputStyle}
            />
            <textarea
              aria-label="Note"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Note: any extra details"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 'unset' }}
            />
            <input
              type="url"
              aria-label="Cover image URL"
              value={form.imageUrl}
              onChange={e => set('imageUrl', e.target.value)}
              placeholder="Cover image URL (optional)"
              style={inputStyle}
            />
            {form.imageUrl && (
              <img
                src={form.imageUrl}
                alt="Cover preview"
                style={{ width: '100%', height: 72, objectFit: 'cover', borderRadius: 'var(--r-sm)' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            )}
          </Disclosure>

          {/* ── Wishlist (new events only) ── */}
          {!isEdit && (
            <Disclosure
              label="Wishlist"
              icon="gift"
              summary={wishlistSummary}
              open={openSection.wishlist}
              onToggle={() => toggleSection('wishlist')}
            >
              <WishlistDraft enabled={wishlistEnabled} onEnabled={setWishlistEnabled} items={giftDrafts} onChange={setGiftDrafts} disabled={saving} />
            </Disclosure>
          )}

          {/* ── Repeat & reminder ── */}
          <Disclosure
            label="Repeat & reminder"
            icon="repeat"
            summary={`${repeatSummary} · ${reminderSummary === 'None' ? 'no reminder' : reminderSummary}`}
            open={openSection.repeat}
            onToggle={() => toggleSection('repeat')}
          >
            <div>
              <label style={labelStyle} htmlFor="event-repeat">Repeat</label>
              <select
                id="event-repeat"
                value={rec.repeat}
                onChange={e => setRec(r => ({ ...r, repeat: e.target.value as RepeatFreq }))}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
              {customRuleKept && (
                <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: '8px 0 0' }}>
                  Custom repeat from another calendar ({originalRule}). It is kept unless you change these settings.
                </p>
              )}
            </div>

            {rec.repeat !== 'none' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13.5, color: 'var(--text-2)' }}>Every</span>
                  <input
                    type="number" min={1} max={99} value={rec.interval}
                    aria-label="Repeat interval"
                    onChange={e => setRec(r => ({ ...r, interval: Math.max(1, parseInt(e.target.value) || 1) }))}
                    style={{ ...inputStyle, width: 72 }}
                  />
                  <span style={{ fontSize: 13.5, color: 'var(--text-2)' }}>
                    {rec.repeat === 'daily' ? 'day(s)' : rec.repeat === 'weekly' ? 'week(s)' : rec.repeat === 'monthly' ? 'month(s)' : 'year(s)'}
                  </span>
                </div>

                {rec.repeat === 'weekly' && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {WEEKDAYS.map((d, i) => {
                      const on = rec.weekdays.includes(d)
                      return (
                        <button
                          key={d} type="button"
                          aria-pressed={on}
                          onClick={() => setRec(r => ({ ...r, weekdays: on ? r.weekdays.filter(x => x !== d) : [...r.weekdays, d] }))}
                          style={{
                            width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
                            border: on ? 'none' : '1px solid var(--border-2)',
                            background: on ? 'var(--accent)' : (i >= 5 ? 'var(--weekend)' : 'var(--bg)'),
                            color: on ? 'var(--accent-text)' : 'var(--text-2)',
                            fontSize: 12, fontWeight: 600,
                          }}
                        >{WEEKDAY_LABEL[d]}</button>
                      )
                    })}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={radioRow}>
                    <input type="radio" name="endmode" checked={rec.endMode === 'never'} onChange={() => setRec(r => ({ ...r, endMode: 'never' as EndMode }))} style={{ accentColor: 'var(--accent)' }} />
                    Never ends
                  </label>
                  <label style={radioRow}>
                    <input type="radio" name="endmode" checked={rec.endMode === 'on'} onChange={() => setRec(r => ({ ...r, endMode: 'on' as EndMode }))} style={{ accentColor: 'var(--accent)' }} />
                    On
                    <input type="date" aria-label="Repeat end date" value={rec.endDate} onChange={e => setRec(r => ({ ...r, endDate: e.target.value, endMode: 'on' as EndMode }))} style={{ ...dateTimeStyle, width: 160 }} />
                  </label>
                  <label style={radioRow}>
                    <input type="radio" name="endmode" checked={rec.endMode === 'after'} onChange={() => setRec(r => ({ ...r, endMode: 'after' as EndMode }))} style={{ accentColor: 'var(--accent)' }} />
                    After
                    <input type="number" min={1} aria-label="Number of times" value={rec.count} onChange={e => setRec(r => ({ ...r, count: Math.max(1, parseInt(e.target.value) || 1), endMode: 'after' as EndMode }))} style={{ ...inputStyle, width: 72 }} />
                    times
                  </label>
                </div>

                <p style={{ fontSize: 13, color: 'var(--text-1)', fontWeight: 600 }}>{summarize(rec)}</p>
              </div>
            )}

            <div>
              <label style={labelStyle} htmlFor="event-reminder">Remind me</label>
              <select
                id="event-reminder"
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
          </Disclosure>

          {/* ── Error ── */}
          {error && (
            <p role="alert" style={{
              fontSize: 13, color: 'var(--danger)',
              background: 'var(--fill)', borderRadius: 'var(--r-sm)', padding: '10px 12px',
            }}>
              {error}
            </p>
          )}
        </form>
      </Sheet>

      {/* ── Recurring scope chooser ── */}
      {scopePrompt && (
        <RecurringScopePrompt
          mode={scopePrompt}
          onChoose={(scope) => {
            if (scopePrompt === 'save') doSave(scope)
            else doDelete(scope)
          }}
          onCancel={() => setScopePrompt(null)}
        />
      )}
    </>
  )
}
