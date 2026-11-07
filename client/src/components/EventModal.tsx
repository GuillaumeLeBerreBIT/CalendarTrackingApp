import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '@/components/ui/Icon'
import CountdownPill from '@/components/CountdownPill'
import { IconButton } from '@/components/ui/Button'
import Sheet from '@/components/ui/Sheet'
import { Tag } from '@/components/ui/Primitives'
import { InsetGroup, InsetRow } from '@/components/ui/Controls'
import { Avatar } from '@/components/ui/Avatar'
import type { CalEvent } from '@/types'
import api from '@/api/client'
import RecurringScopePrompt from '@/components/RecurringScopePrompt'
import WishlistSection from '@/components/WishlistSection'
import CommentThread from '@/components/CommentThread'

const HEX_GROUP_COLORS: Record<string, string> = {
  family: '#f59e0b', friends: '#ec4899', work: '#22d3aa',
  climb: '#38bdf8', book: '#c084fc', self: '#7c6ef2',
}
const EXTRA_GROUP_PALETTE = ['#f97316', '#a855f7', '#06b6d4', '#84cc16', '#eab308', '#f43f5e']

function hashHue(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0
  return Math.abs(hash) % 360
}

function hexGroupColor(groupName?: string, groupId?: string | number): string {
  if (!groupId && !groupName) return '#7c6ef2'
  const key = (groupName ?? '').toLowerCase().replace(/[^a-z]/g, '')
  if (HEX_GROUP_COLORS[key]) return HEX_GROUP_COLORS[key]
  if (groupId) {
    const hash = String(groupId).split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
    return EXTRA_GROUP_PALETTE[hash % EXTRA_GROUP_PALETTE.length]
  }
  return '#7c6ef2'
}

// Uses the DB-stored member color (resolvedHex) when available, same as CalendarPage.
function resolveEventHex(participants: Array<{ userId: string }>, groupName?: string, groupId?: string, createdBy?: string | null, resolvedHex?: string | null): string {
  if (resolvedHex) return resolvedHex
  if (participants.length === 1) return `hsl(${hashHue(participants[0].userId)} 62% 56%)`
  if (participants.length > 1) return hexGroupColor(groupName, groupId)
  const hue = createdBy ? hashHue(createdBy) : 252
  return `hsl(${hue} 62% 56%)`
}

type RsvpChoice = 'going' | 'maybe' | 'no' | null

interface EventModalProps {
  data: CalEvent
  onClose: () => void
  onEdit?: () => void
  onDeleted?: () => void
  currentUserId?: string
  onRsvp?: () => void
}

export default function EventModal({ data, onClose, onEdit, onDeleted, currentUserId, onRsvp }: EventModalProps) {
  const navigate = useNavigate()
  const isCalEvent = true
  const eventId = data.id

  const calEvent = data
  const isGroupEvent = isCalEvent && !!(calEvent?.extendedProps?.groupsId)
  const participants = calEvent?.extendedProps?.participants ?? []
  const isMultiPerson = participants.length > 1
  // Color: 1 participant → their avatar hue, 2+ → group color (matches calendar pill logic)
  const groupHex = resolveEventHex(
    participants,
    calEvent?.extendedProps?.groupName,
    calEvent?.extendedProps?.groupsId as string | undefined,
    calEvent?.extendedProps?.createdBy as string | null | undefined,
    calEvent?.extendedProps?.resolvedHex as string | null | undefined,
  )
  const imageUrl = calEvent?.extendedProps?.imageUrl
  const location = calEvent?.extendedProps?.location

  const [shareCopied, setShareCopied] = useState(false)

  // ── Delete state ───────────────────────────────────────────
  const [deleting, setDeleting] = useState(false)
  const [deleteScope, setDeleteScope] = useState<'prompt' | null>(null)

  async function doDelete(scope: string, date: string | null) {
    setDeleting(true)
    try {
      const calEv = data as CalEvent
      const eventId = calEv.extendedProps?.recurringEventId ?? calEv.id
      const params: Record<string, string> = { scope }
      if (date) params.date = date
      await api.delete(`/parseEvent/${eventId}`, { params })
      onDeleted?.()
    } catch (err) {
      console.error('Delete failed', err)
    } finally {
      setDeleting(false)
      setDeleteScope(null)
    }
  }

  function handleDelete() {
    const calEv = data as CalEvent
    const isRecurring = !!calEv.extendedProps?.isRecurring
    if (isRecurring) {
      setDeleteScope('prompt')
      return
    }
    if (!window.confirm('Delete this event? This cannot be undone.')) return
    doDelete('this', null)
  }

  // ── Reactions ──────────────────────────────────────────────
  const [reactions, setReactions] = useState<Array<{ emoji: string; count: number; iMine: boolean }>>([])
  const [reactionsLoaded, setReactionsLoaded] = useState(false)

  function handleShare() {
    const token = calEvent?.extendedProps?.publicToken
    if (!token) return
    const url = window.location.origin + '/e/' + token
    // Native share sheet on mobile (WhatsApp etc.), clipboard fallback on desktop
    if (navigator.share) {
      navigator.share({ title: calEvent?.title ?? 'Event', url }).catch(() => {})
      return
    }
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    }).catch(() => {})
  }

  // Live copy of the participant list so RSVP changes reflect immediately in the UI
  const [liveParticipants, setLiveParticipants] = useState(participants)

  const myParticipant = liveParticipants.find(p => p.userId === currentUserId) ?? null
  const myStatus = myParticipant?.rsvpStatus ?? 'pending'
  const [rsvp, setRsvp] = useState<RsvpChoice>((myStatus !== 'pending' ? myStatus as RsvpChoice : null))

  // Who created this event (group events only). Match the creator's userId against
  // the participant list to get their username; show "You" for the current user.
  const createdById = calEvent?.extendedProps?.createdBy ?? null
  const creatorName = createdById
    ? (createdById === currentUserId ? 'You' : (liveParticipants.find(p => p.userId === createdById)?.username ?? null))
    : null

  // Show RSVP for any group event (not just when user appears in participant list)
  const showRsvp = isGroupEvent

  async function handleRsvp(status: 'going' | 'maybe' | 'no') {
    setRsvp(status)
    // Reflect the change in the attendee list right away
    setLiveParticipants(prev => prev.map(p =>
      p.userId === currentUserId ? { ...p, rsvpStatus: status } : p
    ))
    if (eventId) {
      await api.patch(`/rsvp/${eventId}`, { status }).catch(() => {})
      onRsvp?.()
    }
  }

  // Fetch reactions when the modal opens for a real calendar event.
  // (Comments are fetched independently by <CommentThread>.)
  useEffect(() => {
    if (!eventId) {
      setReactions([])
      setReactionsLoaded(false)
      return
    }
    let cancelled = false
    api.get<{ reactions: Array<{ emoji: string; count: number; iMine: boolean }> }>(`/events/${eventId}/reactions`)
      .catch(() => null)
      .then((reactRes) => {
        if (cancelled) return
        if (reactRes?.data?.reactions) setReactions(reactRes.data.reactions)
        setReactionsLoaded(true)
      })
    return () => { cancelled = true }
  }, [eventId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleReactionToggle(emoji: string) {
    if (!eventId) return
    // Optimistic update
    setReactions(prev => {
      const existing = prev.find(r => r.emoji === emoji)
      if (existing) {
        return prev.map(r =>
          r.emoji === emoji
            ? { ...r, iMine: !r.iMine, count: r.iMine ? r.count - 1 : r.count + 1 }
            : r
        ).filter(r => r.count > 0 || r.iMine)
      }
      return [...prev, { emoji, count: 1, iMine: true }]
    })
    try {
      await api.post(`/events/${eventId}/reactions`, { emoji })
    } catch {
      // Revert on error
      setReactions(prev => {
        const existing = prev.find(r => r.emoji === emoji)
        if (existing) {
          return prev.map(r =>
            r.emoji === emoji
              ? { ...r, iMine: !r.iMine, count: r.iMine ? r.count - 1 : r.count + 1 }
              : r
          ).filter(r => r.count > 0 || r.iMine)
        }
        return prev
      })
    }
  }

  // Display shape for a calendar event
  const title  = data.title
  const blurb  = data.extendedProps?.description ?? ''
  const dateText = formatWhen(data)

  // Edit/Delete actions are gated on management rights (creator OR group admin),
  // independent of whether the user is an invited participant.
  const canManage = data.extendedProps?.canManage === true

  const rsvpOptions: { key: RsvpChoice & string; label: string; icon: string; color: string }[] = [
    { key: 'going', label: 'Going',    icon: 'check', color: 'var(--g-work)' },
    { key: 'maybe', label: 'Maybe',    icon: 'star',  color: 'var(--g-family)' },
    { key: 'no',    label: "Can't go", icon: 'close', color: 'var(--text-3)' },
  ]

  // Display metadata per RSVP status — 'pending' means invited but not yet responded
  const RSVP_META: Record<string, { label: string; color: string }> = {
    going:   { label: 'Going',     color: 'var(--g-work)' },
    maybe:   { label: 'Maybe',     color: 'var(--g-family)' },
    no:      { label: "Can't go",  color: 'var(--text-3)' },
    pending: { label: 'Invited',   color: 'var(--text-3)' },
  }

  const groupsId = calEvent?.extendedProps?.groupsId
  const isTentativeEv = calEvent?.extendedProps?.status === 'tentative'
  const isGoogle = calEvent?.extendedProps?.externalSource === 'google'
  const reminderMins = calEvent?.extendedProps?.reminderMinutes
  const reminderText = typeof reminderMins === 'number'
    ? (reminderMins >= 1440 ? `${Math.round(reminderMins / 1440)} day before`
      : reminderMins >= 60 ? `${Math.round(reminderMins / 60)} hour before`
      : `${reminderMins} min before`)
    : null

  return (
    <>
      <Sheet
        title={isMultiPerson ? 'Group event' : isGroupEvent ? 'Appointment' : 'Event'}
        onClose={onClose}
        width={480}
        actions={
          <>
            {calEvent?.extendedProps?.publicToken && (
              shareCopied
                ? <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', padding: '0 6px' }}>Copied!</span>
                : <IconButton name="share" size={36} isz={16} title="Share link" onClick={handleShare} />
            )}
            {canManage && <IconButton name="edit" size={36} isz={16} title="Edit event" onClick={onEdit} />}
            {canManage && <IconButton name="trash" size={36} isz={16} title={deleting ? 'Deleting…' : 'Delete event'} onClick={deleting ? undefined : handleDelete} />}
          </>
        }
      >
        <div style={{ padding: '16px 18px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {imageUrl && (
            <img
              src={imageUrl}
              alt=""
              style={{ width: '100%', height: 150, objectFit: 'cover', borderRadius: 'var(--r-lg)', background: 'var(--fill)' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          )}

          {/* Title block */}
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ width: 3, borderRadius: 2, background: groupHex, flexShrink: 0, opacity: isTentativeEv ? 0.5 : 1 }} />
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h2 style={{ fontSize: 23, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.25 }}>{title}</h2>
              <p style={{ fontSize: 14.5, color: 'var(--text-2)' }}>{dateText}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {data.start && new Date(data.start) > new Date() && <CountdownPill targetDate={data.start} size="sm" />}
                {data.extendedProps?.isRecurring && <Tag><Icon name="repeat" size={11} sw={2} /> Repeats</Tag>}
                {isTentativeEv && <Tag tone="ghost">Voting open</Tag>}
                {isGoogle && <Tag tone="ghost">From Google Calendar · read-only</Tag>}
              </div>
            </div>
          </div>

          {/* Details */}
          <InsetGroup>
            {data.extendedProps?.groupName && (
              <InsetRow
                first
                label={<span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: groupHex }} />
                  {data.extendedProps.groupName}
                </span>}
                chevron={!!groupsId}
                onClick={groupsId ? () => { navigate(`/groups/${groupsId}`); onClose() } : undefined}
              />
            )}
            {location && (
              <InsetRow
                first={!data.extendedProps?.groupName}
                label={<span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Icon name="pin" size={15} sw={1.8} style={{ color: 'var(--text-3)' }} />{location}</span>}
              />
            )}
            {creatorName && (
              <InsetRow
                first={!data.extendedProps?.groupName && !location}
                label="Created by"
                value={creatorName}
              />
            )}
            {reminderText && (
              <InsetRow
                first={!data.extendedProps?.groupName && !location && !creatorName}
                label="Reminder"
                value={reminderText}
              />
            )}
          </InsetGroup>

          {blurb && (
            <p style={{ fontSize: 14.5, color: 'var(--text-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{blurb}</p>
          )}

          {/* RSVP */}
          {showRsvp && (
            <section>
              <h3 style={sectionTitle}>Are you going?</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                {rsvpOptions.map(({ key, label, icon }) => {
                  const active = rsvp === key
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => handleRsvp(key)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                        minHeight: 44,
                        borderRadius: 'var(--r-md)',
                        border: active ? '1px solid var(--accent)' : '1px solid var(--border-2)',
                        background: active ? 'var(--accent)' : 'transparent',
                        color: active ? 'var(--accent-text)' : 'var(--text-1)',
                        fontSize: 14, fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'var(--transition)',
                      }}
                    >
                      <Icon name={icon} size={15} sw={2.2} />
                      {label}
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {/* Attendees */}
          {liveParticipants.length > 0 && (
            <section>
              <h3 style={sectionTitle}>Attendees · {liveParticipants.length}</h3>
              <InsetGroup>
                {[...liveParticipants]
                  .sort((a, b) => (a.userId === createdById ? -1 : b.userId === createdById ? 1 : 0))
                  .map((p, i) => {
                    const meta = RSVP_META[p.rsvpStatus] ?? RSVP_META.pending
                    const isMe = p.userId === currentUserId
                    const isCreator = p.userId === createdById
                    return (
                      <InsetRow
                        key={p.userId}
                        first={i === 0}
                        label={<span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <Avatar id={p.userId} size={28} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.username}{isMe ? ' (you)' : ''}
                          </span>
                          {isCreator && <Tag tone="ghost">Host</Tag>}
                        </span>}
                        value={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color }} />
                          {meta.label}
                        </span>}
                      />
                    )
                  })}
              </InsetGroup>
            </section>
          )}

          {eventId && reactionsLoaded && (
            <ReactionBar reactions={reactions} onToggle={handleReactionToggle} />
          )}

          {eventId && <WishlistSection eventId={calEvent?.extendedProps?.recurringEventId ?? eventId} />}

          {eventId && <CommentThread eventId={eventId} currentUserId={currentUserId} />}
        </div>
      </Sheet>

      {/* ── Recurring delete scope chooser ── */}
      {deleteScope === 'prompt' && (
        <RecurringScopePrompt
          mode="delete"
          onChoose={(scope) => {
            const calEv = data as CalEvent
            const date = calEv.start?.split('T')[0] ?? calEv.extendedProps?.occurrenceDate ?? null
            doDelete(scope, date as string | null)
          }}
          onCancel={() => setDeleteScope(null)}
        />
      )}
    </>
  )
}

const sectionTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-2)',
  marginBottom: 10,
}

/** "Saturday 14 November · 18:00 – 20:00" (all-day ranges show both dates) */
function formatWhen(ev: CalEvent): string {
  if (!ev.start) return ''
  const fmt = (key: string) => new Date(`${key}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const startKey = ev.start.split('T')[0]
  const endKey = (ev.end ?? ev.start).split('T')[0]
  const startT = ev.start.includes('T') ? ev.start.split('T')[1].slice(0, 5) : ''
  const endT = ev.end?.includes('T') ? ev.end.split('T')[1].slice(0, 5) : ''
  if (!startT) return endKey > startKey ? `${fmt(startKey)} – ${fmt(endKey)}` : `${fmt(startKey)} · All day`
  if (endKey > startKey) return `${fmt(startKey)} ${startT} – ${fmt(endKey)} ${endT}`
  return `${fmt(startKey)} · ${startT}${endT && endT !== startT ? ` – ${endT}` : ''}`
}

/* ── ReactionBar ────────────────────────────────────────────── */
const EMOJI_LIST = ['👍', '❤️', '🎉', '😂', '😮', '👎']

function ReactionBar({
  reactions,
  onToggle,
}: {
  reactions: Array<{ emoji: string; count: number; iMine: boolean }>
  onToggle: (emoji: string) => void
}) {
  return (
    <section>
      <h3 style={sectionTitle}>Reactions</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {EMOJI_LIST.map(emoji => {
          const reaction = reactions.find(r => r.emoji === emoji)
          const iMine = reaction?.iMine ?? false
          const count = reaction?.count ?? 0
          return (
            <button
              key={emoji}
              type="button"
              aria-pressed={iMine}
              onClick={() => onToggle(emoji)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                minHeight: 34,
                padding: '0 11px',
                borderRadius: 999,
                border: iMine ? '1px solid var(--text-1)' : '1px solid var(--border-2)',
                background: iMine ? 'var(--fill)' : 'transparent',
                color: 'var(--text-1)',
                cursor: 'pointer',
                transition: 'var(--transition)',
              }}
            >
              <span style={{ fontSize: 15, lineHeight: 1 }}>{emoji}</span>
              {count > 0 && (
                <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1 }}>{count}</span>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
