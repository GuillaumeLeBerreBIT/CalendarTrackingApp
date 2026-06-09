import { useState, useEffect, useCallback } from 'react'
import Icon from '@/components/ui/Icon'
import { Avatar, AvatarStack } from '@/components/ui/Avatar'
import Button, { IconButton } from '@/components/ui/Button'
import { SourceBadge, MapPreview } from '@/components/ui/Primitives'
import { MOCK_MEMBERS, type DiscoveryEvent } from '@/lib/mockData'
import type { CalEvent } from '@/types'
import api from '@/api/client'

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
  const isCalEvent = 'extendedProps' in data
  const eventId = isCalEvent ? data.id : null

  const calEvent = isCalEvent ? (data as CalEvent) : null
  const isGroupEvent = isCalEvent && !!(calEvent?.extendedProps?.groupsId)
  const participants = calEvent?.extendedProps?.participants ?? []
  const eventType = calEvent?.extendedProps?.eventType
  const imageUrl = isCalEvent ? calEvent?.extendedProps?.imageUrl : (data as DiscoveryEvent).image
  const location = calEvent?.extendedProps?.location

  const [shareCopied, setShareCopied] = useState(false)

  function handleShare() {
    if (isDisc) return
    // Extract the real DB event id: data.id may be "uuid::suffix" for recurring events
    const rawId = data.id ?? ''
    const dbId = rawId.includes('::') ? rawId.split('::')[0] : rawId
    navigator.clipboard.writeText(window.location.origin + '/e/' + dbId).then(() => {
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    }).catch(() => {})
  }

  // Live copy of the participant list so RSVP changes reflect immediately in the UI
  const [liveParticipants, setLiveParticipants] = useState(participants)

  const myParticipant = liveParticipants.find(p => p.userId === currentUserId) ?? null
  const [rsvp, setRsvp] = useState<RsvpChoice>((myParticipant?.rsvpStatus as RsvpChoice) ?? null)

  // Who created this event (group events only). Match the creator's userId against
  // the participant list to get their username; show "You" for the current user.
  const createdById = calEvent?.extendedProps?.createdBy ?? null
  const creatorName = createdById
    ? (createdById === currentUserId ? 'You' : (liveParticipants.find(p => p.userId === createdById)?.username ?? null))
    : null

  // Single rule: show RSVP only if the user was explicitly invited (appears in participants)
  const showRsvp = isGroupEvent && !!myParticipant

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
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
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
        {/* ── Cover ───────────────────────────────────────────── */}
        <div
          className={imageUrl ? '' : 'img-ph'}
          data-cat={imageUrl ? undefined : cat}
          style={{ height: 230, position: 'relative', flex: '0 0 230px', borderRadius: 'var(--r-xl) var(--r-xl) 0 0', overflow: 'hidden', background: imageUrl ? 'var(--surface-2)' : undefined }}
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
          <div style={{ position: 'absolute', top: 14, left: 16, zIndex: 2 }}>
            {source ? (
              <SourceBadge source={source} />
            ) : (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 'var(--r-full)',
                background: eventType === 'social' ? 'var(--accent)' : 'rgba(0,0,0,0.42)',
                backdropFilter: 'blur(8px)',
                border: eventType === 'social' ? '1px solid var(--accent-line)' : '1px solid rgba(255,255,255,0.14)',
                fontSize: 11,
                fontWeight: 600,
                color: '#fff',
              }}>
                <Icon name={eventType === 'social' ? 'sparkle' : isGroupEvent ? 'groups' : 'profile'} size={12} sw={2} />
                {eventType === 'social' ? 'Social event' : isGroupEvent ? 'Group event' : 'Personal'}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <Icon name="clock" size={14} sw={1.8} style={{ color: 'rgba(255,255,255,0.75)' }} />
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>{date}</span>
            </div>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: '#fff', lineHeight: 1.2, letterSpacing: '-0.03em' }}>
              {title}
            </h2>
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────── */}
        <div style={{ padding: '22px 24px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* Meta row */}
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
