import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '@/api/client'
import Button from '@/components/ui/Button'
import Icon from '@/components/ui/Icon'

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

interface EventPreview {
  title: string
  startDate: string
  startTime?: string
  location?: string
  organiserUsername?: string
  goingCount: number
}

function formatDateTime(date: string, time?: string): string {
  const d = new Date(date + 'T00:00:00')
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
  if (!time) return dateStr
  return `${dateStr} · ${time.slice(0, 5)}`
}

export default function PublicEventPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [event, setEvent] = useState<EventPreview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    api.get(`/e/${token}`)
      .then(({ data }) => {
        if (data.success && data.event) {
          setEvent(data.event)
        } else {
          setError('This event is not available.')
        }
      })
      .catch((err) => {
        if (err?.response?.status === 404) {
          setError('This event is not available.')
        } else {
          setError('Something went wrong. Please try again.')
        }
      })
      .finally(() => setLoading(false))
  }, [token])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '24px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>

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
              <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--accent)', margin: 0 }}>
                Event
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
                {/* Date / time */}
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
                {event.goingCount > 0 && (
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

              {/* Divider */}
              <div style={{ height: 1, background: 'var(--border)' }} />

              {/* CTA */}
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
        </div>
      </div>
    </div>
  )
}
