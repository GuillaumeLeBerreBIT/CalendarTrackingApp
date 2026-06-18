import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '@/api/client'
import Button from '@/components/ui/Button'
import Icon from '@/components/ui/Icon'
import { Progress } from '@/components/ui/Primitives'
import type { Availability } from '@/types'

// ── Shared logo (matches LoginPage) ────────────────────────────
function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        background: 'var(--accent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none"
          stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="3" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </div>
      <span style={{
        fontSize: 22,
        fontWeight: 800,
        letterSpacing: '-0.03em',
        color: 'var(--text-1)',
        lineHeight: 1,
      }}>
        Eventli
      </span>
    </div>
  )
}

function Skeleton({ w = '100%', h = 16, r = 'var(--r-sm)' }: { w?: string | number; h?: number; r?: string }) {
  return (
    <div style={{
      width: w,
      height: h,
      borderRadius: r,
      background: 'var(--surface-3)',
      animation: 'pulse 1.4s ease-in-out infinite',
    }} />
  )
}

interface PublicDateOption {
  optionId: number
  startDate: string
  startTime?: string | null
  endDate?: string | null
  endTime?: string | null
  position: number
  yesCount: number
  maybeCount: number
  noCount: number
}

interface EventPreview {
  title: string
  description?: string | null
  startDate: string
  startTime?: string | null
  location?: string | null
  organiserUsername?: string | null
  goingCount: number
  status?: 'confirmed' | 'tentative' | 'locked' | 'failed'
  dateOptions?: PublicDateOption[] | null
}

// Availability pills — mirrors the member voting UI in GroupDetailPage.
const AVAILABILITY_PILLS: { value: Availability; label: string; title: string; color: string; bg: string }[] = [
  { value: 'yes',   label: '✓', title: 'Yes, I can make it',  color: 'var(--g-work)',   bg: 'rgba(34,211,170,0.14)' },
  { value: 'maybe', label: '~', title: 'Maybe',                color: 'var(--g-family)', bg: 'rgba(245,158,11,0.14)' },
  { value: 'no',    label: '✕', title: "No, I can't",          color: '#fb7185',         bg: 'rgba(244,63,94,0.12)' },
]

function formatDateTime(date: string, time?: string | null): string {
  const d = new Date(date + 'T00:00:00')
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
  if (!time) return dateStr
  return `${dateStr} · ${time.slice(0, 5)}`
}

function formatSlot(date: string, time?: string | null): string {
  const d = new Date(date + 'T00:00:00')
  const dateLbl = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
  return time ? `${dateLbl} · ${time.slice(0, 5)}` : dateLbl
}

const guestKey = (token: string) => `eventli_guest_${token}`

export default function PublicEventPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [event, setEvent] = useState<EventPreview | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Guest identity (persisted in localStorage so they can return and edit votes)
  const [guestToken, setGuestToken] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [myVotes, setMyVotes] = useState<Record<number, Availability>>({})
  const [pendingOption, setPendingOption] = useState<number | null>(null)
  const [voteError, setVoteError] = useState<string | null>(null)

  const isPoll = event?.status === 'tentative' && Array.isArray(event?.dateOptions)
  const hasIdentity = !!guestToken || name.trim().length > 0

  // Load any stored guest identity for this event
  useEffect(() => {
    if (!token) return
    try {
      const raw = localStorage.getItem(guestKey(token))
      if (raw) {
        const saved = JSON.parse(raw) as { token: string; name: string }
        if (saved?.token) setGuestToken(saved.token)
        if (saved?.name) setName(saved.name)
      }
    } catch { /* ignore malformed storage */ }
  }, [token])

  const fetchEvent = () => api.get(`/e/${token}`).then(({ data }) => {
    if (data.success && data.event) setEvent(data.event)
    else setError('This event is not available.')
  })

  useEffect(() => {
    if (!token) return
    fetchEvent()
      .catch((err) => {
        if (err?.response?.status === 404) setError('This event is not available.')
        else setError('Something went wrong. Please try again.')
      })
      .finally(() => setLoading(false))
  }, [token])

  // Returning guest → pre-fill their prior answers
  useEffect(() => {
    if (!token || !guestToken) return
    api.get(`/e/${token}/my-votes`, { params: { guestToken } })
      .then(({ data }) => { if (data.success) setMyVotes(data.votes || {}) })
      .catch(() => { /* non-fatal */ })
  }, [token, guestToken])

  async function castVote(optionId: number, availability: Availability | 'clear') {
    if (!token) return
    if (!guestToken && !name.trim()) { setVoteError('Add your name to vote.'); return }
    setVoteError(null)
    setPendingOption(optionId)
    try {
      const { data } = await api.post(`/e/${token}/vote`, {
        optionId,
        availability,
        guestToken: guestToken || undefined,
        guestName: name.trim(),
        guestEmail: email.trim() || undefined,
      })
      if (data.success) {
        // Persist the minted/known token so this guest can edit later
        if (data.guestToken && data.guestToken !== guestToken) {
          setGuestToken(data.guestToken)
          localStorage.setItem(guestKey(token), JSON.stringify({ token: data.guestToken, name: name.trim() }))
        }
        setMyVotes(prev => {
          const next = { ...prev }
          if (availability === 'clear') delete next[optionId]
          else next[optionId] = availability
          return next
        })
        await fetchEvent() // refresh tallies
      }
    } catch (err: any) {
      setVoteError(err?.response?.data?.error || 'Could not save your vote.')
    } finally {
      setPendingOption(null)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '24px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: 460 }}>

        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <Logo />
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-2)',
          borderRadius: 'var(--r-xl)',
          padding: 28,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}>

          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Skeleton w="40%" h={12} />
              <Skeleton w="90%" h={28} />
              <Skeleton w="60%" h={14} />
              <Skeleton w="50%" h={14} />
              <div style={{ height: 8 }} />
              <Skeleton w="100%" h={48} r="var(--r-sm)" />
            </div>
          )}

          {!loading && error && (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'rgba(244,63,94,0.12)',
                border: '1px solid rgba(244,63,94,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                color: '#fb7185',
              }}>
                <Icon name="calendar" size={22} sw={1.8} />
              </div>
              <p style={{ fontSize: 14.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>{error}</p>
            </div>
          )}

          {!loading && event && (
            <>
              {/* Category label */}
              <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: isPoll ? '#f59e0b' : 'var(--accent)', margin: 0 }}>
                {isPoll ? 'Pick a date' : 'Event'}
              </p>

              {/* Title */}
              <h1 style={{
                fontSize: 26,
                fontWeight: 800,
                color: 'var(--text-1)',
                margin: 0,
                letterSpacing: '-0.03em',
                lineHeight: 1.2,
              }}>
                {event.title}
              </h1>

              {/* Meta items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {/* Date / time — only meaningful once confirmed */}
                {!isPoll && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-2)' }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 'var(--r-sm)',
                      background: 'var(--surface-3)',
                      border: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, color: 'var(--text-3)',
                    }}>
                      <Icon name="clock" size={15} sw={1.8} />
                    </div>
                    <span style={{ fontSize: 13.5, fontWeight: 500 }}>
                      {formatDateTime(event.startDate, event.startTime)}
                    </span>
                  </div>
                )}

                {/* Location */}
                {event.location && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-2)' }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 'var(--r-sm)',
                      background: 'var(--surface-3)',
                      border: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, color: 'var(--text-3)',
                    }}>
                      <Icon name="pin" size={15} sw={1.8} />
                    </div>
                    <span style={{ fontSize: 13.5, fontWeight: 500 }}>{event.location}</span>
                  </div>
                )}

                {/* Organiser */}
                {event.organiserUsername && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-2)' }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 'var(--r-sm)',
                      background: 'var(--surface-3)',
                      border: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, color: 'var(--text-3)',
                    }}>
                      <Icon name="profile" size={15} sw={1.8} />
                    </div>
                    <span style={{ fontSize: 13.5, fontWeight: 500 }}>
                      By <strong style={{ color: 'var(--text-1)', fontWeight: 700 }}>{event.organiserUsername}</strong>
                    </span>
                  </div>
                )}

                {/* Going count */}
                {!isPoll && event.goingCount > 0 && (
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    alignSelf: 'flex-start',
                    padding: '5px 12px',
                    borderRadius: 'var(--r-full)',
                    background: 'var(--accent-softer)',
                    border: '1px solid var(--accent-line)',
                    fontSize: 12.5,
                    fontWeight: 650,
                    color: 'var(--accent)',
                  }}>
                    <Icon name="check" size={13} sw={2.2} />
                    {event.goingCount} going
                  </div>
                )}
              </div>

              {/* ── Voting poll (tentative events) ── */}
              {isPoll && (
                <>
                  <div style={{ height: 1, background: 'var(--border)' }} />

                  <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
                    Mark which dates work for you — no account needed.
                  </p>

                  {/* Name (+ optional email) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Your name"
                      maxLength={80}
                      disabled={!!guestToken}
                      style={inputStyle}
                    />
                    {!guestToken && (
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="Email (optional — to hear when the date is set)"
                        maxLength={254}
                        style={inputStyle}
                      />
                    )}
                  </div>

                  {/* Date option rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {(event.dateOptions ?? [])
                      .slice()
                      .sort((a, b) => a.position - b.position)
                      .map(opt => {
                        const mine = myVotes[opt.optionId] ?? null
                        const busy = pendingOption === opt.optionId
                        return (
                          <div key={opt.optionId} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                            <div style={{ flex: 1, minWidth: 150, display: 'flex', flexDirection: 'column', gap: 5 }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {formatSlot(opt.startDate, opt.startTime)}
                                </span>
                                <span style={{ fontSize: 11.5, color: 'var(--text-3)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                                  <span style={{ color: 'var(--g-work)', fontWeight: 700 }}>✓ {opt.yesCount}</span>
                                  {opt.maybeCount > 0 && <span style={{ color: 'var(--g-family)' }}> · ~ {opt.maybeCount}</span>}
                                </span>
                              </div>
                              <Progress value={opt.yesCount} total={Math.max(1, opt.yesCount + opt.maybeCount + opt.noCount)} color="var(--accent)" height={6} />
                            </div>
                            <div style={{ display: 'inline-flex', gap: 6, flexShrink: 0 }}>
                              {AVAILABILITY_PILLS.map(p => {
                                const active = mine === p.value
                                return (
                                  <button
                                    key={p.value}
                                    type="button"
                                    disabled={busy || !hasIdentity}
                                    title={p.title}
                                    aria-label={p.title}
                                    aria-pressed={active}
                                    onClick={() => castVote(opt.optionId, active ? 'clear' : p.value)}
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                      minWidth: 44, height: 40, padding: '0 10px',
                                      borderRadius: 'var(--r-sm)',
                                      border: `1px solid ${active ? p.color : 'var(--border-2)'}`,
                                      background: active ? p.bg : 'transparent',
                                      color: active ? p.color : 'var(--text-2)',
                                      fontSize: 13, fontWeight: 700,
                                      cursor: (busy || !hasIdentity) ? 'default' : 'pointer',
                                      opacity: (busy || !hasIdentity) ? 0.5 : 1,
                                      transition: 'var(--transition)',
                                    }}
                                  >
                                    {p.label}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                  </div>

                  {voteError && (
                    <p style={{ fontSize: 12.5, color: '#fb7185', margin: 0 }}>{voteError}</p>
                  )}

                  <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
                    Want the full picture? <button onClick={() => navigate('/register')} style={linkBtn}>Create a free account</button> to organise your own.
                  </p>
                </>
              )}

              {/* ── Confirmed event CTA ── */}
              {!isPoll && (
                <>
                  <div style={{ height: 1, background: 'var(--border)' }} />
                  <Button
                    variant="primary"
                    full
                    size="lg"
                    icon="rsvp"
                    onClick={() => navigate('/register')}
                  >
                    RSVP on Eventli
                  </Button>
                  <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-3)', margin: 0, lineHeight: 1.5 }}>
                    Create a free account to RSVP and coordinate with your group.
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 'var(--r-sm)',
  border: '1px solid var(--border-2)',
  background: 'var(--surface-2)',
  color: 'var(--text-1)',
  fontSize: 13.5,
  outline: 'none',
}

const linkBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: 'var(--accent)',
  fontWeight: 650,
  fontSize: 12,
  cursor: 'pointer',
}
