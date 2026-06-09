import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '@/api/client'
import Button from '@/components/ui/Button'
import Icon from '@/components/ui/Icon'
import { Tag } from '@/components/ui/Primitives'

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

// ── Skeleton placeholder ───────────────────────────────────────
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

interface GroupPreview {
  title: string
  tag: string
  memberCount: number
}

export default function JoinGroupPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [group, setGroup] = useState<GroupPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)

  // On mount: load the group preview for this token
  useEffect(() => {
    if (!token) return
    api.get(`/joinGroup/${token}`)
      .then(({ data }) => {
        if (data.success && data.group) {
          setGroup(data.group)
        } else {
          setError('This invite link is invalid or has expired.')
        }
      })
      .catch((err) => {
        if (err?.response?.status === 404) {
          setError('This invite link is invalid or has expired.')
        } else {
          setError('Something went wrong. Please try again.')
        }
      })
      .finally(() => setLoading(false))
  }, [token])

  async function handleJoin() {
    setJoinError(null)
    setJoining(true)

    // Check whether the user is currently logged in
    let isLoggedIn = false
    try {
      const { data } = await api.get('/profile')
      isLoggedIn = !!(data?.success)
    } catch {
      isLoggedIn = false
    }

    if (!isLoggedIn) {
      navigate(`/register?redirect=/join/${token}`)
      return
    }

    // User is logged in — attempt to join the group
    try {
      const { data } = await api.post(`/joinGroup/${token}`)
      if (data.success) {
        navigate('/groups')
      } else {
        setJoinError(data.error || 'Could not join the group. Please try again.')
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setJoinError(msg || 'Could not join the group. Please try again.')
    } finally {
      setJoining(false)
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
      <div style={{ width: '100%', maxWidth: 380 }}>

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
              <Skeleton w="55%" h={14} />
              <Skeleton w="100%" h={22} />
              <Skeleton w="40%" h={12} />
              <Skeleton w="100%" h={44} r="var(--r-sm)" />
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
                <Icon name="close" size={22} sw={2} />
              </div>
              <p style={{ fontSize: 14.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>{error}</p>
            </div>
          )}

          {!loading && group && (
            <>
              {/* Header label */}
              <p style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', margin: 0 }}>
                You've been invited to join
              </p>

              {/* Group info */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h2 style={{
                    fontSize: 26,
                    fontWeight: 800,
                    color: 'var(--text-1)',
                    margin: 0,
                    letterSpacing: '-0.03em',
                    lineHeight: 1.1,
                  }}>
                    {group.title}
                  </h2>
                  {group.tag && <Tag tone="neutral">#{group.tag}</Tag>}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-3)' }}>
                  <Icon name="users" size={14} sw={1.8} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
                  </span>
                </div>
              </div>

              {/* Error from join attempt */}
              {joinError && (
                <div style={{
                  background: 'rgba(244,63,94,0.12)',
                  border: '1px solid rgba(244,63,94,0.3)',
                  borderRadius: 'var(--r-sm)',
                  padding: '10px 13px',
                  fontSize: 13,
                  color: '#fb7185',
                }}>
                  {joinError}
                </div>
              )}

              {/* CTA */}
              <Button
                variant="primary"
                full
                size="lg"
                icon="groups"
                disabled={joining}
                onClick={handleJoin}
              >
                {joining ? 'Joining…' : 'Join group'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
