import { useState, useEffect, type FormEvent } from 'react'
import Sheet from '@/components/ui/Sheet'
import { groupColorFor } from '@/pages/GroupsPage'
import { IconButton } from '@/components/ui/Button'
import Icon from '@/components/ui/Icon'
import { Segmented, Pill } from '@/components/ui/Primitives'
import { Switch, fieldStyle } from '@/components/ui/Controls'
type GiftDraft = { title: string; link: string; note: string }
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

  const [eventType, setEventType] = useState<EventType>(() => (!event && groups.length === 0) ? 'personal' : resolveInitialEventType(event))

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
    startTime: event?.start?.includes('T') ? event.start.split('T')[1].slice(0, 5) : (prefill?.time ?? (event ? '' : nextHourSlot()[0])),
    endTime: event?.end?.includes('T') ? event.end.split('T')[1].slice(0, 5) : (event || prefill?.time ? '' : nextHourSlot()[1]),
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
    if (eventType !== 'personal' && form.groupsId) {
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
  }, [form.groupsId, eventType === 'personal', currentUserId]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const isGroupType = eventType === 'appointment' || eventType === 'social'
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024

  // ── Board layout helpers ─────────────────────────────────────────────
  const groupList = groups.filter(g => g.groups_id != null)
  const selectedGroup = groupList.find(g => String(g.groups_id) === form.groupsId)
  const groupName = selectedGroup ? (selectedGroup.groups_title || selectedGroup.tag_name) : 'Just me'
  const groupDot = selectedGroup ? groupColorFor(selectedGroup) : 'var(--text-1)'
  const everyone = eventType === 'social'

  function pickCalendar(value: string) {
    if (!value) {
      setEventType('personal')
      set('groupsId', '')
    } else {
      if (eventType === 'personal') setEventType('appointment')
      set('groupsId', value)
    }
  }

  function setStartDate(v: string) {
    setForm(f => ({ ...f, startDate: v, endDate: !f.endDate || f.endDate < v || f.endDate === f.startDate ? v : f.endDate }))
  }

  const fmtDay = (key: string) => key
    ? new Date(`${key}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    : 'Pick a date'

  const invitedOthers = selectedParticipants.filter(id => id !== currentUserId).length
  const inviteSummary = everyone ? 'Everyone'
    : selectedParticipants.length === 0 ? 'Nobody yet'
    : invitedOthers === 0 ? 'Just you'
    : `You + ${invitedOthers}`
  const placeSummary = form.location || (form.description ? 'Note' : '') || 'None'
  const giftCount = giftDrafts.filter(g => g.title.trim()).length
  const wishlistSummary = giftCount ? `${giftCount} gift${giftCount === 1 ? '' : 's'}` : 'None'
  const reminderLabel = REMINDER_OPTIONS.find(o => o.value === reminderMinutes)?.label ?? 'None'
  const repeatSummary = rec.repeat === 'none' ? 'Never' : rec.repeat[0].toUpperCase() + rec.repeat.slice(1)
  const repeatLine = `${repeatSummary} · ${reminderMinutes === null ? 'no reminder' : reminderLabel.replace(' before', '')}`

  const showEnds = form.allDay || (form.endDate !== '' && form.endDate !== form.startDate)
  const [gift, setGift] = useState('')
  function addGift() {
    const t = gift.trim()
    if (!t) return
    setGiftDrafts(g => [...g, { title: t, link: '', note: '' }])
    setWishlistEnabled(true)
    setGift('')
  }

  const hint = !selectedGroup
    ? 'Only you can see it.'
    : everyone
      ? `Everyone in ${groupName} is invited and can RSVP.`
      : `Everyone in ${groupName} can see it. Only the people you invite get an RSVP.`

  return (
    <>
      <Sheet
        title={isEdit ? 'Edit event' : 'New event'}
        onClose={onClose}
        confirmLabel={saving ? 'Saving…' : isEdit ? 'Save' : 'Add'}
        confirmForm="event-form"
        confirmDisabled={saving || !form.title.trim()}
        width={440}
      >
        <form id="event-form" onSubmit={handleSubmit} style={{ padding: '4px 16px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          <label style={{ display: 'block' }}>
            <span className="sr-only">Event name</span>
            <input
              data-bare
              required
              autoFocus={!isMobile}
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Event name"
              style={{
                width: '100%', boxSizing: 'border-box', border: 0, outline: 'none', background: 'transparent',
                fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', padding: '8px 0', color: 'var(--text-1)',
                fontFamily: 'inherit',
              }}
            />
          </label>

          {/* ── When + calendar ── */}
          <div style={grp}>
            {isTentative ? (
              <div style={{ ...panel, paddingTop: 12 }}>
                {dateOptions.map((opt, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="date" aria-label={`Option ${idx + 1} date`} value={opt.startDate} onChange={e => setDateOption(idx, 'startDate', e.target.value)} style={{ ...fieldStyle, flex: 1.4 }} />
                    <input type="time" aria-label={`Option ${idx + 1} start time`} value={opt.startTime} onChange={e => setDateOption(idx, 'startTime', e.target.value)} style={{ ...fieldStyle, flex: 1 }} />
                    {dateOptions.length > 2
                      ? <IconButton name="close" size={36} isz={14} title={`Remove option ${idx + 1}`} onClick={() => removeDateOption(idx)} />
                      : <span style={{ width: 36, flexShrink: 0 }} />}
                  </div>
                ))}
                {dateOptions.length < MAX_DATE_OPTIONS && (
                  <button type="button" onClick={addDateOption} style={textBtn}><Icon name="plus" size={14} sw={2.2} /> Add a date</button>
                )}
              </div>
            ) : (
              <>
                <label style={{ ...cell, borderTop: 'none' }}>
                  <span>{showEnds ? 'Starts' : 'Date'}</span>
                  <span style={val}>
                    {fmtDay(form.startDate)}
                    <input type="date" required aria-label="Start date" value={form.startDate} onChange={e => setStartDate(e.target.value)} onClick={openPicker} style={overlayInput} />
                  </span>
                </label>
                {showEnds && (
                  <label style={cell}>
                    <span>Ends</span>
                    <span style={val}>
                      {fmtDay(form.endDate || form.startDate)}
                      <input type="date" aria-label="End date" min={form.startDate} value={form.endDate} onChange={e => set('endDate', e.target.value)} onClick={openPicker} style={overlayInput} />
                    </span>
                  </label>
                )}
                {!form.allDay && (
                  <div style={cell}>
                    <span>Time</span>
                    <span style={{ ...val, fontVariantNumeric: 'tabular-nums' }}>
                      <span style={{ position: 'relative', padding: '4px 2px' }}>
                        {form.startTime || 'Start'}
                        <input type="time" aria-label="Start time" value={form.startTime} onChange={e => set('startTime', e.target.value)} onClick={openPicker} style={overlayInput} />
                      </span>
                      –
                      <span style={{ position: 'relative', padding: '4px 2px' }}>
                        {form.endTime || 'End'}
                        <input type="time" aria-label="End time" value={form.endTime} onChange={e => set('endTime', e.target.value)} onClick={openPicker} style={overlayInput} />
                      </span>
                    </span>
                  </div>
                )}
                <div style={{ ...cell, cursor: 'default' }}>
                  <span>All day</span>
                  <span style={val}><Switch checked={form.allDay} onChange={(v) => set('allDay', v)} label="All day" /></span>
                </div>
              </>
            )}
            <label style={{ ...cell, position: 'relative', cursor: isEdit && !isGroupType ? 'default' : 'pointer' }}>
              <span>Calendar</span>
              <span style={val}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: groupDot }} />
                {groupName}
                {!(isEdit && !isGroupType) && <Icon name="chevR" size={12} sw={2.2} />}
              </span>
              {!(isEdit && !isGroupType) && (
                <select aria-label="Calendar" value={form.groupsId} onChange={e => pickCalendar(e.target.value)} style={overlayInput}>
                  {!isEdit && <option value="">Just me</option>}
                  {groupList.map(g => (
                    <option key={String(g.groups_id)} value={String(g.groups_id)}>{g.groups_title || g.tag_name}</option>
                  ))}
                </select>
              )}
            </label>
            {!isEdit && selectedGroup && (
              <div style={{ ...cell, cursor: 'default' }}>
                <span>Let the group vote on a date</span>
                <span style={val}><Switch checked={isTentative} onChange={toggleTentative} label="Let the group vote on a date" /></span>
              </div>
            )}
          </div>
          <p style={{ margin: '-4px 4px 0', fontSize: 13, color: 'var(--text-3)', lineHeight: 1.4 }}>{hint}</p>

          {/* ── Optional sections, folded ── */}
          <div style={{ ...grp, marginTop: 8 }}>
            {selectedGroup && (
              <>
                <SectionCell first icon="users" label="Invite" summary={inviteSummary} open={openSection.invite} onToggle={() => toggleSection('invite')} />
                {openSection.invite && (
                  <div style={{ ...panel, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <Pill on={everyone} onClick={() => setEventType(everyone ? 'appointment' : 'social')}>Everyone</Pill>
                    {groupMembers.map(m => (
                      <Pill
                        key={m.user_id}
                        on={everyone || selectedParticipants.includes(m.user_id)}
                        disabled={everyone}
                        onClick={() => toggleParticipant(m.user_id)}
                      >
                        {m.user_id === currentUserId ? 'You' : m.username}
                      </Pill>
                    ))}
                    {groupMembers.length === 0 && <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Loading people…</span>}
                  </div>
                )}
              </>
            )}

            <SectionCell first={!selectedGroup} icon="pin" label="Location & note" summary={placeSummary} open={openSection.place} onToggle={() => toggleSection('place')} />
            {openSection.place && (
              <div style={panel}>
                <input aria-label="Location" placeholder="Location" value={form.location} onChange={e => set('location', e.target.value)} style={fieldStyle} />
                <textarea aria-label="Note for guests" placeholder="Note for guests" rows={2} value={form.description} onChange={e => set('description', e.target.value)} style={{ ...fieldStyle, resize: 'vertical' }} />
                <input type="url" aria-label="Cover image URL" placeholder="Cover image link (optional)" value={form.imageUrl} onChange={e => set('imageUrl', e.target.value)} style={fieldStyle} />
              </div>
            )}

            {!isEdit && (
              <>
                <SectionCell icon="gift" label="Wishlist" summary={wishlistSummary} open={openSection.wishlist} onToggle={() => toggleSection('wishlist')} />
                {openSection.wishlist && (
                  <div style={panel}>
                    <input
                      aria-label="Add a gift"
                      placeholder="Add a gift, press Enter"
                      value={gift}
                      maxLength={200}
                      onChange={e => setGift(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGift() } }}
                      onBlur={addGift}
                      style={fieldStyle}
                    />
                    {giftDrafts.map((g, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, minHeight: 36 }}>
                        <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--text-3)' }} />
                        <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{g.title}</span>
                        <IconButton name="close" size={36} isz={14} title={`Remove ${g.title}`} onClick={() => setGiftDrafts(d => d.filter((_, n) => n !== i))} />
                      </div>
                    ))}
                    <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Guests can reserve a gift. You never see who took what.</span>
                  </div>
                )}
              </>
            )}

            <SectionCell icon="repeat" label="Repeat & reminder" summary={repeatLine} open={openSection.repeat} onToggle={() => toggleSection('repeat')} />
            {openSection.repeat && (
              <div style={{ ...panel, gap: 12 }}>
                <Segmented
                  full
                  size="md"
                  label="Repeat"
                  options={[
                    { value: 'none', label: 'Never' },
                    { value: 'daily', label: 'Daily' },
                    { value: 'weekly', label: 'Weekly' },
                    { value: 'monthly', label: 'Monthly' },
                    { value: 'yearly', label: 'Yearly' },
                  ]}
                  value={rec.repeat}
                  onChange={(v) => setRec(r => ({ ...r, repeat: v as RepeatFreq }))}
                />
                {customRuleKept && (
                  <p style={{ fontSize: 13, color: 'var(--text-2)' }}>
                    Custom repeat from another calendar ({originalRule}). It is kept unless you change it.
                  </p>
                )}
                {rec.repeat !== 'none' && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
                      <span>Every</span>
                      <input type="number" min={1} max={99} aria-label="Repeat interval" value={rec.interval}
                        onChange={e => setRec(r => ({ ...r, interval: Math.max(1, parseInt(e.target.value) || 1) }))}
                        style={{ ...fieldStyle, width: 64 }} />
                      <span>{rec.repeat === 'daily' ? 'day(s)' : rec.repeat === 'weekly' ? 'week(s)' : rec.repeat === 'monthly' ? 'month(s)' : 'year(s)'}</span>
                    </div>
                    {rec.repeat === 'weekly' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {WEEKDAYS.map((d, i) => {
                          const on = rec.weekdays.includes(d)
                          return (
                            <button key={d} type="button" aria-pressed={on} aria-label={d}
                              onClick={() => setRec(r => ({ ...r, weekdays: on ? r.weekdays.filter(x => x !== d) : [...r.weekdays, d] }))}
                              style={{
                                flex: 1, height: 36, borderRadius: 18, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                                border: on ? 'none' : '1px solid var(--pill-line)',
                                background: on ? 'var(--accent)' : (i >= 5 ? 'var(--weekend)' : 'var(--bg)'),
                                color: on ? 'var(--accent-text)' : 'var(--text-1)',
                              }}>{WEEKDAY_LABEL[d]}</button>
                          )
                        })}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15, position: 'relative' }}>
                      <span>Ends</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-2)' }}>
                        <select aria-label="Repeat ends" value={rec.endMode} onChange={e => setRec(r => ({ ...r, endMode: e.target.value as EndMode }))} style={bareSelect}>
                          <option value="never">Never</option>
                          <option value="on">On a date</option>
                          <option value="after">After a number of times</option>
                        </select>
                        {rec.endMode === 'on' && <input type="date" aria-label="Repeat end date" value={rec.endDate} onChange={e => setRec(r => ({ ...r, endDate: e.target.value }))} style={{ ...fieldStyle, width: 150 }} />}
                        {rec.endMode === 'after' && <input type="number" min={1} aria-label="Number of times" value={rec.count} onChange={e => setRec(r => ({ ...r, count: Math.max(1, parseInt(e.target.value) || 1) }))} style={{ ...fieldStyle, width: 64 }} />}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{summarize(rec)}</p>
                  </>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15 }}>
                  <span>Reminder</span>
                  <select aria-label="Reminder" value={reminderMinutes === null ? '' : String(reminderMinutes)}
                    onChange={e => setReminderMinutes(e.target.value === '' ? null : parseInt(e.target.value, 10))}
                    style={bareSelect}>
                    {REMINDER_OPTIONS.map(o => (
                      <option key={o.label} value={o.value === null ? '' : String(o.value)}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {isEdit && (
            <button type="button" onClick={handleDelete} disabled={deleting} style={{ ...textBtn, color: 'var(--danger)', alignSelf: 'center', marginTop: 12 }}>
              {deleting ? 'Deleting…' : 'Delete event'}
            </button>
          )}

          {error && <p role="alert" style={{ fontSize: 13, color: 'var(--danger)', margin: '0 4px' }}>{error}</p>}
        </form>
      </Sheet>

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

// ── Board styles (PhoneEvent mockup) ─────────────────────────────────────
function openPicker(e: React.MouseEvent<HTMLInputElement>) {
  try { e.currentTarget.showPicker?.() } catch { /* not allowed or unsupported: native focus still works */ }
}
/** Next full hour (and the hour after) for a new timed event */
function nextHourSlot(): [string, string] {
  const h = (new Date().getHours() + 1) % 24
  const pad = (n: number) => String(n).padStart(2, '0')
  return [`${pad(h)}:00`, `${pad((h + 1) % 24)}:00`]
}
const grp: React.CSSProperties = { background: 'var(--fill)', borderRadius: 12, overflow: 'hidden' }
const cell: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, minHeight: 48, padding: '0 14px', fontSize: 15,
  border: 0, borderTop: '1px solid var(--divider)', background: 'transparent', width: '100%',
  boxSizing: 'border-box', textAlign: 'left', color: 'var(--text-1)', cursor: 'pointer', position: 'relative',
}
const val: React.CSSProperties = { marginLeft: 'auto', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }
const panel: React.CSSProperties = { padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }
/** Invisible native picker stretched over a row value (tap the row, get the OS picker) */
const overlayInput: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 0, fontSize: 16 }
const bareSelect: React.CSSProperties = {
  border: 0, background: 'transparent', color: 'var(--text-2)', fontSize: 15, fontFamily: 'inherit',
  textAlign: 'right', cursor: 'pointer', padding: '4px 0', boxShadow: 'none',
}
const textBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 4px', border: 0,
  background: 'transparent', color: 'var(--text-1)', fontSize: 14, fontWeight: 500, cursor: 'pointer',
}

function SectionCell({ icon, label, summary, open, onToggle, first }: {
  icon: string; label: string; summary: string; open: boolean; onToggle: () => void; first?: boolean
}) {
  return (
    <button type="button" aria-expanded={open} onClick={onToggle} style={{ ...cell, borderTop: first ? 'none' : cell.borderTop }}>
      <span style={{ width: 20, display: 'flex', color: 'var(--text-2)' }} aria-hidden="true"><Icon name={icon} size={18} sw={1.8} /></span>
      <span>{label}</span>
      <span style={val}>
        <span style={{ fontSize: 14, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
        <Icon name={open ? 'chevD' : 'chevR'} size={12} sw={2.2} />
      </span>
    </button>
  )
}
