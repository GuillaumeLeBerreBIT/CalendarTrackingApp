import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '@/components/ui/Icon'
import CountdownPill from '@/components/CountdownPill'
import { Avatar, AvatarStack } from '@/components/ui/Avatar'
import Button, { IconButton } from '@/components/ui/Button'
import { SourceBadge, MapPreview } from '@/components/ui/Primitives'
import { MOCK_MEMBERS, type DiscoveryEvent } from '@/lib/mockData'
import type { CalEvent } from '@/types'
import api from '@/api/client'

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
  data: DiscoveryEvent | CalEvent
  onClose: () => void
  savedSet?: Set<string>
  onSave?: (id: string) => void
  onEdit?: () => void
  currentUserId?: string
  onSaveToCalendar?: (ev: DiscoveryEvent) => void
  onRsvp?: () => void
}

function isDiscovery(data: DiscoveryEvent | CalEvent): data is DiscoveryEvent {
  return 'blurb' in data && 'cat' in data
}

export default function EventModal({ data, onClose, savedSet, onSave, onEdit, currentUserId, onSaveToCalendar, onRsvp }: EventModalProps) {
  const navigate = useNavigate()
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024
  const isCalEvent = 'extendedProps' in data
  const eventId = isCalEvent ? data.id : null

  const calEvent = isCalEvent ? (data as CalEvent) : null
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
  const imageUrl = isCalEvent ? calEvent?.extendedProps?.imageUrl : (data as DiscoveryEvent).image
  const location = calEvent?.extendedProps?.location

  const [shareCopied, setShareCopied] = useState(false)

  // ── Reactions ──────────────────────────────────────────────
  const [reactions, setReactions] = useState<Array<{ emoji: string; count: number; iMine: boolean }>>([])
  const [reactionsLoaded, setReactionsLoaded] = useState(false)

  // ── Comments ───────────────────────────────────────────────
  const [comments, setComments] = useState<Array<{ commentId: number; body: string; userId: string; username: string; createdAt: string }>>([])
  const [commentInput, setCommentInput] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)

  function handleShare() {
    if (isDisc) return
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

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Fetch reactions + comments in parallel when the modal opens for a real calendar event
  useEffect(() => {
    if (!isCalEvent || !eventId || isDiscovery(data)) {
      setReactions([])
      setComments([])
      setReactionsLoaded(false)
      return
    }
    let cancelled = false
    Promise.all([
      api.get<{ reactions: Array<{ emoji: string; count: number; iMine: boolean }> }>(`/events/${eventId}/reactions`).catch(() => null),
      api.get<{ comments: Array<{ commentId: number; body: string; userId: string; username: string; createdAt: string }> }>(`/events/${eventId}/comments`).catch(() => null),
    ]).then(([reactRes, commRes]) => {
      if (cancelled) return
      if (reactRes?.data?.reactions) setReactions(reactRes.data.reactions)
      setReactionsLoaded(true)
      if (commRes?.data?.comments) setComments(commRes.data.comments)
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

  async function handleCommentSubmit() {
    if (!commentInput.trim() || !eventId || submittingComment) return
    setSubmittingComment(true)
    try {
      const res = await api.post<{ comment: { commentId: number; body: string; userId: string; username: string; createdAt: string } }>(`/events/${eventId}/comments`, { body: commentInput.trim() })
      if (res.data?.comment) {
        setComments(prev => [...prev, res.data.comment])
        setCommentInput('')
      }
    } catch {
      // silently fail — user can retry
    } finally {
      setSubmittingComment(false)
    }
  }

  async function handleCommentDelete(commentId: number) {
    if (!eventId) return
    setComments(prev => prev.filter(c => c.commentId !== commentId))
    try {
      await api.delete(`/events/${eventId}/comments/${commentId}`)
    } catch {
      // If delete fails we don't restore; backend is source of truth on next open
    }
  }

  // Normalise both event shapes into a common display shape
  const isDisc = isDiscovery(data)

  const cat    = isDisc ? data.cat : 'calendar'
  const title  = isDisc ? data.title : data.title
  const blurb  = isDisc ? data.blurb : (data.extendedProps?.description ?? '')
  const source = isDisc ? data.source : null
  const date   = isDisc
    ? `${data.date} · ${data.time}`
    : data.start
      ? `${data.start.split('T')[0]}${data.start.includes('T') ? ' · ' + data.start.split('T')[1].slice(0, 5) : ''}`
      : ''
  const venue  = isDisc ? data.venue : (data.extendedProps?.groupName ?? 'Calendar event')
  const area   = isDisc ? data.area : ''
  const price  = isDisc ? data.price : null
  const going  = isDisc ? data.going : (data.extendedProps?.participants?.filter(p => p.rsvpStatus === 'going').map(p => p.userId) ?? [])
  const organiser = isDisc ? data.organiser : (data.extendedProps?.groupName ?? '')
  const isSaved = savedSet?.has(data.id) ?? false

  // Edit/Delete actions are gated on management rights (creator OR group admin),
  // independent of whether the user is an invited participant.
  const canManage = !isDisc && (data.extendedProps?.canManage === true)

  // Members from "going" list that we know about
  const knownGoingIds = going.filter(id => MOCK_MEMBERS[id])
  const goingNames = knownGoingIds.slice(0, 2).map(id => MOCK_MEMBERS[id]?.name?.split(' ')[0]).filter(Boolean)
  const goingLabel = goingNames.length === 1
    ? `${goingNames[0]} is going to this`
    : goingNames.length >= 2
    ? `${goingNames.join(' & ')} are going to this`
    : ''

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

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'var(--scrim)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: isMobile ? 'stretch' : 'center',
        padding: isMobile ? '0' : '16px',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={isMobile ? {
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          maxHeight: '92dvh',
          overflowY: 'auto',
          background: 'var(--surface)',
          borderRadius: '20px 20px 0 0',
          border: '1px solid var(--border-2)',
          boxShadow: 'var(--shadow-lg)',
          animation: 'scaleIn 0.24s cubic-bezier(0.2,0.7,0.2,1) both',
          display: 'flex',
          flexDirection: 'column',
        } : {
          width: 'min(720px, 100%)',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--surface)',
          borderRadius: 'var(--r-xl)',
          border: '1px solid var(--border-2)',
          boxShadow: 'var(--shadow-lg)',
          animation: 'scaleIn 0.24s cubic-bezier(0.2,0.7,0.2,1) both',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 0' }}>
            <div style={{ width: 40, height: 4, borderRadius: 99, background: 'var(--border-2)' }} />
          </div>
        )}
        {/* ── Cover ───────────────────────────────────────────── */}
        <div
          className={imageUrl ? '' : 'img-ph'}
          data-cat={imageUrl ? undefined : cat}
          style={{ height: 230, position: 'relative', flex: '0 0 230px', borderRadius: 'var(--r-xl) var(--r-xl) 0 0', overflow: 'hidden', background: imageUrl ? 'var(--surface-2)' : `linear-gradient(135deg, ${groupHex}28 0%, var(--surface-3) 100%)` }}
        >
          {/* Real cover image when provided */}
          {imageUrl && (
            <img
              src={imageUrl}
              alt={title}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          )}

          {/* Overlay gradient */}
          <div style={{ position: 'absolute', inset: 0, background: 'var(--overlay-grad)', borderRadius: 'var(--r-xl) var(--r-xl) 0 0' }} />

          {/* Top-left: source badge or event-type pill */}
          <div style={{ position: 'absolute', top: 14, left: 16, zIndex: 2, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {source ? (
              <SourceBadge source={source} />
            ) : (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 'var(--r-full)',
                background: isMultiPerson ? groupHex + '33' : groupHex + '22',
                backdropFilter: 'blur(8px)',
                border: `1px solid ${groupHex}55`,
                fontSize: 11,
                fontWeight: 600,
                color: '#fff',
              }}>
                <Icon name={isMultiPerson ? 'users' : isGroupEvent ? 'calendar' : 'profile'} size={12} sw={2} />
                {isMultiPerson ? 'Group event' : isGroupEvent ? 'Appointment' : 'Personal'}
              </span>
            )}
            {isCalEvent && data.extendedProps?.isRecurring && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 10px', borderRadius: 'var(--r-full)',
                background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)',
                color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 600,
                border: '1px solid rgba(255,255,255,0.15)',
              }}>
                ↻ Recurring
              </span>
            )}
            {isCalEvent && data.extendedProps?.status === 'tentative' && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 10px', borderRadius: 'var(--r-full)',
                background: 'rgba(245,158,11,0.18)', backdropFilter: 'blur(8px)',
                color: '#f59e0b', fontSize: 11, fontWeight: 700,
                border: '1px solid rgba(245,158,11,0.3)',
              }}>
                Voting open
              </span>
            )}
          </div>

          {/* Top-right: share (calendar events only) + close */}
          <div style={{ position: 'absolute', top: 14, right: 16, display: 'flex', gap: 8, zIndex: 2 }}>
            {!isDisc && (
              shareCopied ? (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0 12px',
                  height: 36,
                  borderRadius: 'var(--r-sm)',
                  background: 'rgba(0,0,0,0.4)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  fontSize: 12,
                  fontWeight: 650,
                  color: '#fff',
                  whiteSpace: 'nowrap',
                }}>
                  Copied!
                </span>
              ) : (
                <IconButton name="share" tone="glass" size={36} title="Copy link" onClick={handleShare} />
              )
            )}
            <IconButton name="close" tone="glass" size={36} onClick={onClose} title="Close" />
          </div>

          {/* Bottom: date + title */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 20px 20px', zIndex: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8, flexWrap: 'wrap' }}>
              <Icon name="clock" size={14} sw={1.8} style={{ color: 'rgba(255,255,255,0.75)' }} />
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>{date}</span>
              {isCalEvent && data.start && new Date(data.start) > new Date() && (
                <CountdownPill targetDate={data.start} size="sm" />
              )}
            </div>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: '#fff', lineHeight: 1.2, letterSpacing: '-0.03em' }}>
              {title}
            </h2>
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────── */}
        <div style={{ padding: '22px 24px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* Meta row */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <MetaItem icon="pin" primary={venue} secondary={area || undefined} />
              {!isDisc && location && (
                <MetaItem icon="map" primary={location} secondary="Location" />
              )}
              {isDisc ? (
                <MetaItem icon="users" primary={organiser} secondary="Organiser" />
              ) : creatorName ? (
                <MetaItem icon="profile" primary={creatorName} secondary="Created by" />
              ) : null}
              {price && (
                <div style={{ marginLeft: 'auto', fontSize: 22, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.03em', whiteSpace: 'nowrap' }}>
                  {price}
                </div>
              )}
            </div>
            {isCalEvent && data.extendedProps?.groupName && (
              <div
                onClick={() => { if ((data as CalEvent).extendedProps?.groupsId) { navigate(`/groups/${(data as CalEvent).extendedProps?.groupsId}`); onClose() } }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  cursor: (data as CalEvent).extendedProps?.groupsId ? 'pointer' : 'default',
                  color: groupHex,
                  fontSize: 13.5, fontWeight: 500,
                  padding: '2px 0',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => { if ((data as CalEvent).extendedProps?.groupsId) (e.currentTarget as HTMLDivElement).style.opacity = '0.75' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = '1' }}
              >
                <Icon name="users" size={14} sw={1.8} style={{ color: groupHex, flexShrink: 0 }} />
                {(data as CalEvent).extendedProps?.groupName}
                {(data as CalEvent).extendedProps?.groupsId && <Icon name="chevR" size={12} sw={2} style={{ color: groupHex, opacity: 0.6 }} />}
              </div>
            )}
            {isCalEvent && typeof (data as CalEvent).extendedProps?.reminderMinutes === 'number' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--text-3)' }}>
                <Icon name="bell" size={14} sw={1.8} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                <span>Reminder: {
                  (() => {
                    const mins = (data as CalEvent).extendedProps!.reminderMinutes as number
                    if (mins >= 1440) return `${Math.round(mins / 1440)} day before`
                    if (mins >= 60) return `${Math.round(mins / 60)} hour before`
                    return `${mins} min before`
                  })()
                }</span>
              </div>
            )}
          </div>

          {/* Social proof banner */}
          {knownGoingIds.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: 'var(--accent-softer)',
              border: '1px solid var(--accent-line)',
              borderRadius: 'var(--r-md)',
              padding: '13px 15px',
            }}>
              <AvatarStack ids={knownGoingIds} size={28} ringColor="var(--surface-2)" max={3} />
              <span style={{ fontSize: 13.5, color: 'var(--text-2)' }}>
                <span style={{ color: 'var(--accent)', fontWeight: 650 }}>{goingLabel}</span>
              </span>
            </div>
          )}

          {/* Description */}
          {blurb && (
            <p style={{ fontSize: 14.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
              {blurb}
            </p>
          )}

          {/* RSVP section — only when the current user was explicitly invited */}
          {showRsvp && <div>
            <h3 style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              color: 'var(--text-3)',
              marginBottom: 12,
            }}>
              Are you going?
            </h3>
            {(
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {rsvpOptions.map(({ key, label, icon, color }) => {
                  const active = rsvp === key
                  return (
                    <button
                      key={key}
                      onClick={() => handleRsvp(key)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 9,
                        padding: '14px 10px',
                        borderRadius: 'var(--r-md)',
                        border: `1px solid ${active ? color : 'var(--border-2)'}`,
                        background: active
                          ? `color-mix(in srgb, ${color} 14%, var(--surface))`
                          : 'var(--surface-2)',
                        cursor: 'pointer',
                        transition: 'var(--transition)',
                      }}
                    >
                      <div style={{
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        background: active ? color : 'var(--surface-3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: active ? (key === 'no' ? 'var(--text-1)' : '#fff') : 'var(--text-3)',
                        transition: 'var(--transition)',
                      }}>
                        <Icon name={icon} size={16} sw={2.2} />
                      </div>
                      <span style={{
                        fontSize: 12.5,
                        fontWeight: 650,
                        color: active ? color : 'var(--text-2)',
                        transition: 'var(--transition)',
                      }}>
                        {label}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>}

          {/* Map preview — only for discovery events with an area */}
          {isDisc && area && (
            <MapPreview area={area} venue={venue} />
          )}

          {/* Attendees — discovery events use mock member data */}
          {isDisc && going.length > 0 && (
            <div>
              {knownGoingIds.length > 0 && (
                <>
                  <div style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.09em',
                    textTransform: 'uppercase',
                    color: 'var(--text-3)',
                    marginBottom: 10,
                  }}>
                    From your groups
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                    {knownGoingIds.map((id) => (
                      <div key={id} style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 7,
                        padding: '5px 10px 5px 5px',
                        borderRadius: 'var(--r-full)',
                        background: 'var(--accent-softer)',
                        border: '1px solid var(--accent-line)',
                      }}>
                        <Avatar id={id} size={22} />
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>
                          {MOCK_MEMBERS[id]?.name?.split(' ')[0] || id}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {going.filter(id => !MOCK_MEMBERS[id]).length > 0 && (
                <>
                  <div style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.09em',
                    textTransform: 'uppercase',
                    color: 'var(--text-3)',
                    marginBottom: 10,
                  }}>
                    Others
                  </div>
                  <AvatarStack ids={going.filter(id => !MOCK_MEMBERS[id])} size={30} max={8} />
                </>
              )}
            </div>
          )}

          {/* Attendees — real calendar events use the actual participant list */}
          {!isDisc && liveParticipants.length > 0 && (
            <div>
              <h3 style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.09em',
                textTransform: 'uppercase',
                color: 'var(--text-3)',
                marginBottom: 12,
              }}>
                Attendees · {liveParticipants.length}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[...liveParticipants]
                  .sort((a, b) => (a.userId === createdById ? -1 : b.userId === createdById ? 1 : 0))
                  .map((p) => {
                    const meta = RSVP_META[p.rsvpStatus] ?? RSVP_META.pending
                    const isMe = p.userId === currentUserId
                    const isCreator = p.userId === createdById
                    return (
                      <div key={p.userId} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 11,
                        padding: '9px 12px',
                        borderRadius: 'var(--r-md)',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                      }}>
                        <div style={{
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          flexShrink: 0,
                          background: 'var(--accent-soft)',
                          color: 'var(--accent)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 13,
                          fontWeight: 700,
                        }}>
                          {p.username?.[0]?.toUpperCase() || '?'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.username}{isMe ? ' (You)' : ''}
                          </span>
                          {isCreator && (
                            <span style={{
                              flexShrink: 0,
                              fontSize: 10.5,
                              fontWeight: 700,
                              letterSpacing: '0.04em',
                              textTransform: 'uppercase',
                              color: 'var(--accent)',
                              background: 'var(--accent-softer)',
                              border: '1px solid var(--accent-line)',
                              borderRadius: 'var(--r-full)',
                              padding: '2px 7px',
                            }}>
                              Host
                            </span>
                          )}
                        </div>
                        <span style={{
                          flexShrink: 0,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          fontWeight: 650,
                          color: meta.color,
                        }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color }} />
                          {meta.label}
                        </span>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* ── Reaction Bar ──────────────────────────────────── */}
          {isCalEvent && !isDiscovery(data) && eventId && reactionsLoaded && (
            <ReactionBar reactions={reactions} onToggle={handleReactionToggle} />
          )}

          {/* ── Comment Thread ────────────────────────────────── */}
          {isCalEvent && !isDiscovery(data) && eventId && reactionsLoaded && (
            <div>
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.09em',
                textTransform: 'uppercase',
                color: 'var(--text-3)',
                marginBottom: 12,
              }}>
                Comments
              </div>

              {comments.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 14 }}>
                  No comments yet. Be the first!
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                  {comments.map(c => (
                    <div key={c.commentId} style={{
                      display: 'flex',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 'var(--r-md)',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      alignItems: 'flex-start',
                    }}>
                      <Avatar id={c.userId} size={26} name={c.username} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 3 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{c.username}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 400 }}>{relativeTime(c.createdAt)}</span>
                        </div>
                        <p style={{ fontSize: 13.5, color: 'var(--text-1)', lineHeight: 1.5, margin: 0, wordBreak: 'break-word' }}>
                          {c.body}
                        </p>
                      </div>
                      {c.userId === currentUserId && (
                        <button
                          onClick={() => handleCommentDelete(c.commentId)}
                          title="Delete comment"
                          style={{
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 22,
                            height: 22,
                            borderRadius: 'var(--r-sm)',
                            border: '1px solid var(--border)',
                            background: 'transparent',
                            color: 'var(--text-3)',
                            cursor: 'pointer',
                          }}
                        >
                          <Icon name="close" size={14} sw={2} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  rows={1}
                  maxLength={1000}
                  value={commentInput}
                  onChange={e => setCommentInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommentSubmit() }
                  }}
                  placeholder="Add a comment…"
                  style={{
                    flex: 1,
                    resize: 'none',
                    padding: '9px 12px',
                    borderRadius: 'var(--r-md)',
                    border: '1px solid var(--border-2)',
                    background: 'var(--surface-2)',
                    color: 'var(--text-1)',
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  onClick={handleCommentSubmit}
                  disabled={submittingComment || !commentInput.trim()}
                  style={{
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 38,
                    height: 38,
                    borderRadius: 'var(--r-md)',
                    border: '1px solid var(--accent)',
                    background: 'var(--accent)',
                    color: '#fff',
                    cursor: submittingComment || !commentInput.trim() ? 'not-allowed' : 'pointer',
                    opacity: submittingComment || !commentInput.trim() ? 0.5 : 1,
                    transition: 'var(--transition)',
                  }}
                >
                  <Icon name="chevR" size={16} sw={2.2} />
                </button>
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div style={{
            display: 'flex',
            gap: 10,
            paddingTop: 4,
            position: 'sticky',
            bottom: 0,
            background: 'var(--surface)',
            paddingBottom: 2,
          }}>
            {onEdit && !isDisc && canManage && (
              <Button
                variant="secondary"
                icon="cal"
                size="lg"
                onClick={onEdit}
              >
                Edit event
              </Button>
            )}
            {isDisc && onSaveToCalendar ? (
              <>
                <Button
                  variant="secondary"
                  full
                  size="lg"
                  icon="bookmark"
                  onClick={() => onSave?.(data.id)}
                  active={isSaved}
                >
                  {isSaved ? 'Saved' : 'Save'}
                </Button>
                <Button
                  variant="primary"
                  full
                  size="lg"
                  icon="plus"
                  onClick={() => onSaveToCalendar(data as DiscoveryEvent)}
                >
                  Add to calendar
                </Button>
              </>
            ) : (
              /* CalEvent footer — RSVP handled by the 3-button grid above, just show Edit if available */
              null
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Helpers ────────────────────────────────────────────────── */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
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
    <div>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.09em',
        textTransform: 'uppercase',
        color: 'var(--text-3)',
        marginBottom: 10,
      }}>
        Reactions
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {EMOJI_LIST.map(emoji => {
          const reaction = reactions.find(r => r.emoji === emoji)
          const iMine = reaction?.iMine ?? false
          const count = reaction?.count ?? 0
          return (
            <button
              key={emoji}
              onClick={() => onToggle(emoji)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                borderRadius: 999,
                border: iMine ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: iMine ? 'var(--accent-soft)' : 'var(--surface-2)',
                color: iMine ? 'var(--accent)' : 'var(--text-2)',
                cursor: 'pointer',
                transition: 'var(--transition)',
              }}
            >
              <span style={{ fontSize: 15, lineHeight: 1 }}>{emoji}</span>
              {count > 0 && (
                <span style={{ fontSize: 12, fontWeight: 650, lineHeight: 1 }}>{count}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── Internal MetaItem ──────────────────────────────────────── */
function MetaItem({ icon, primary, secondary }: { icon: string; primary: string; secondary?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
      <div style={{
        width: 38,
        height: 38,
        borderRadius: 'var(--r-sm)',
        background: 'var(--surface-3)',
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-3)',
        flex: '0 0 auto',
      }}>
        <Icon name={icon} size={17} sw={1.8} />
      </div>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text-1)' }}>{primary}</div>
        {secondary && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{secondary}</div>}
      </div>
    </div>
  )
}
