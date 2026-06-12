import { useState, type CSSProperties, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import Button from '@/components/ui/Button'
import Icon from '@/components/ui/Icon'

/*
 * Full-screen first-run wizard. Shown once when the logged-in user has
 * hasCompletedOnboarding === false. Completing or skipping at any point
 * patches the profile flag and updates the auth store in place so the
 * wizard unmounts without a reload and never reappears.
 */

// ── Shared styles ─────────────────────────────────────────────────────────────
const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--surface-2)',
  border: '1px solid var(--border-2)',
  borderRadius: 'var(--r-sm)',
  padding: '10px 13px',
  fontSize: 14,
  color: 'var(--text-1)',
  outline: 'none',
}

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 11.5,
  fontWeight: 650,
  color: 'var(--text-3)',
  marginBottom: 6,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
}

// ── Step dots ─────────────────────────────────────────────────────────────────
function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current + 1}
      aria-label={`Step ${current + 1} of ${total}`}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
    >
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          style={{
            width: i === current ? 22 : 8,
            height: 8,
            borderRadius: 99,
            background: i === current ? 'var(--accent)' : 'var(--surface-3)',
            transition: 'width 0.25s ease, background 0.25s ease',
          }}
        />
      ))}
    </div>
  )
}

// ── Eventli wordmark ──────────────────────────────────────────────────────────
function Wordmark() {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        background: 'var(--accent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxShadow: '0 8px 32px var(--accent-glow)',
      }}>
        <svg width={24} height={24} viewBox="0 0 24 24" fill="none"
          stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="3" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </div>
      <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.035em', color: 'var(--text-1)', lineHeight: 1 }}>
        Eventli
      </span>
    </div>
  )
}

// ── Step 1 — Welcome ──────────────────────────────────────────────────────────
function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div style={{ textAlign: 'center', animation: 'scaleIn 0.4s cubic-bezier(0.2,0.7,0.2,1) both' }}>
      {/* Soft accent glow behind the wordmark */}
      <div style={{ position: 'relative', display: 'inline-block', marginBottom: 28 }}>
        <div aria-hidden="true" style={{
          position: 'absolute',
          inset: '-48px -80px',
          background: 'radial-gradient(closest-side, var(--accent-glow), transparent 70%)',
          filter: 'blur(8px)',
          pointerEvents: 'none',
        }} />
        <Wordmark />
      </div>

      <p style={{
        fontSize: 16.5,
        color: 'var(--text-2)',
        margin: '0 auto 36px',
        maxWidth: 320,
        lineHeight: 1.55,
        animation: 'fadeUp 0.45s ease 0.1s both',
      }}>
        Coordinate life with the people you care about
      </p>

      <div style={{ animation: 'fadeUp 0.45s ease 0.18s both' }}>
        <Button variant="primary" size="lg" onClick={onNext} iconRight="arrowR">
          Get started
        </Button>
      </div>
    </div>
  )
}

// ── Step 2 — Create or join a group ───────────────────────────────────────────
type GroupMode = 'none' | 'create' | 'join'

function StepGroup({ onAdvance }: { onAdvance: () => void }) {
  const [mode, setMode] = useState<GroupMode>('none')
  const [groupName, setGroupName] = useState('')
  const [groupTag, setGroupTag] = useState('')
  const [joinInput, setJoinInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!groupName.trim()) return
    setBusy(true)
    setError('')
    try {
      // Same payload shape as GroupsPage's create modal
      await api.post('/createGroup', {
        'group-title': groupName.trim(),
        'group-description': '',
        'tag-name': groupTag.trim(),
        'shared-color': '',
      })
      onAdvance()
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not create the group. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleJoin(e: FormEvent) {
    e.preventDefault()
    const raw = joinInput.trim()
    if (!raw) return
    // Accept either a full /join/<token> URL or a bare token
    const match = raw.match(/\/join\/([^/?#\s]+)/)
    const token = match ? match[1] : raw
    setBusy(true)
    setError('')
    try {
      const { data } = await api.post(`/joinGroup/${encodeURIComponent(token)}`)
      if (data.success === false) {
        setError(data.error || 'That invite link is not valid.')
      } else {
        onAdvance()
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'That invite link is not valid.')
    } finally {
      setBusy(false)
    }
  }

  const optionCard = (active: boolean): CSSProperties => ({
    flex: 1,
    background: active ? 'var(--accent-soft)' : 'var(--surface-2)',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 'var(--r-lg)',
    padding: '16px 14px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    textAlign: 'center',
    transition: 'border-color 0.2s ease, background 0.2s ease',
  })

  return (
    <div style={{ animation: 'fadeUp 0.35s ease both' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{
          width: 52,
          height: 52,
          borderRadius: 'var(--r-lg)',
          background: 'var(--accent-soft)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent)',
          margin: '0 auto 16px',
        }}>
          <Icon name="users" size={26} sw={1.6} />
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
          Create or join a group
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--text-3)', margin: '8px 0 0', lineHeight: 1.5 }}>
          Groups are shared calendars for family, friends, or your team.
        </p>
      </div>

      {/* Option cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div
          role="button"
          tabIndex={0}
          aria-pressed={mode === 'create'}
          style={optionCard(mode === 'create')}
          onClick={() => { setMode('create'); setError('') }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMode('create'); setError('') } }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 'var(--r-sm)',
            background: 'var(--surface-3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--accent)',
          }}>
            <Icon name="plus" size={20} sw={2} />
          </div>
          <div>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Create a group</p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 0' }}>Start fresh and invite people</p>
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          aria-pressed={mode === 'join'}
          style={optionCard(mode === 'join')}
          onClick={() => { setMode('join'); setError('') }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMode('join'); setError('') } }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 'var(--r-sm)',
            background: 'var(--surface-3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--accent)',
          }}>
            <Icon name="arrowR" size={20} sw={2} />
          </div>
          <div>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Join with an invite link</p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 0' }}>Paste a link or token</p>
          </div>
        </div>
      </div>

      {/* Inline create mini-form */}
      {mode === 'create' && (
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16, animation: 'fadeUp 0.25s ease both' }}>
          <div>
            <label style={labelStyle} htmlFor="ob-group-name">Group name</label>
            <input
              id="ob-group-name"
              style={inputStyle}
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="e.g. The Lefevre Family"
              required
              autoFocus
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="ob-group-tag">Tag</label>
            <input
              id="ob-group-tag"
              style={inputStyle}
              value={groupTag}
              onChange={e => setGroupTag(e.target.value)}
              placeholder="e.g. family"
            />
          </div>
          <Button variant="primary" full size="md" type="submit" disabled={busy || !groupName.trim()}>
            {busy ? 'Creating…' : 'Create group'}
          </Button>
        </form>
      )}

      {/* Inline join form */}
      {mode === 'join' && (
        <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16, animation: 'fadeUp 0.25s ease both' }}>
          <div>
            <label style={labelStyle} htmlFor="ob-join-token">Invite link or token</label>
            <input
              id="ob-join-token"
              style={inputStyle}
              value={joinInput}
              onChange={e => setJoinInput(e.target.value)}
              placeholder="https://…/join/abc123 or abc123"
              required
              autoFocus
            />
          </div>
          <Button variant="primary" full size="md" type="submit" disabled={busy || !joinInput.trim()}>
            {busy ? 'Joining…' : 'Join group'}
          </Button>
        </form>
      )}

      {error && (
        <p role="alert" style={{
          fontSize: 12.5, color: 'hsl(0 70% 65%)', margin: '0 0 14px',
          padding: '8px 12px', background: 'hsl(0 70% 50% / 0.1)', borderRadius: 'var(--r-sm)',
        }}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onAdvance}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 13,
          color: 'var(--text-3)',
          padding: '8px 0',
          display: 'block',
          margin: '0 auto',
          textDecoration: 'underline',
          textDecorationColor: 'var(--border-2)',
        }}
      >
        I&rsquo;ll do this later
      </button>
    </div>
  )
}

// ── Step 3 — Done ─────────────────────────────────────────────────────────────
const RECAP = [
  { icon: 'calendar', title: 'Shared calendar', text: 'Plan events together and RSVP in one place.' },
  { icon: 'users',    title: 'Groups',          text: 'Coordinate with family, friends, or your team.' },
  { icon: 'flame',    title: 'Habits',          text: 'Build streaks and keep each other accountable.' },
]

function StepDone({ onFinish, finishing }: { onFinish: () => void; finishing: boolean }) {
  return (
    <div style={{ textAlign: 'center', animation: 'fadeUp 0.35s ease both' }}>
      <div style={{
        width: 60,
        height: 60,
        borderRadius: '50%',
        background: 'var(--accent-soft)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--accent)',
        margin: '0 auto 20px',
        boxShadow: '0 0 0 12px var(--accent-soft)',
      }}>
        <Icon name="check" size={28} sw={2.2} />
      </div>

      <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', margin: '0 0 24px', letterSpacing: '-0.02em', lineHeight: 1.25 }}>
        You&rsquo;re all set
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28, textAlign: 'left' }}>
        {RECAP.map((r, i) => (
          <div
            key={r.icon}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 14px',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              animation: `fadeUp 0.35s ease ${0.08 + i * 0.06}s both`,
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 'var(--r-sm)',
              background: 'var(--accent-soft)', color: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Icon name={r.icon} size={18} sw={1.8} />
            </div>
            <div>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{r.title}</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '3px 0 0', lineHeight: 1.45 }}>{r.text}</p>
            </div>
          </div>
        ))}
      </div>

      <Button variant="primary" full size="lg" onClick={onFinish} disabled={finishing}>
        {finishing ? 'One moment…' : 'Go to my calendar'}
      </Button>
    </div>
  )
}

// ── Main wizard ───────────────────────────────────────────────────────────────
export default function OnboardingWizard() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [finishing, setFinishing] = useState(false)

  // Marks onboarding complete on the server and in the auth store, which
  // unmounts the wizard (App.tsx renders it only while the flag is false).
  async function complete() {
    if (finishing) return
    setFinishing(true)
    try {
      await api.patch('/profile', { has_completed_onboarding: true })
    } catch {
      // Non-blocking — still dismiss locally; the flag retries on next session.
    }
    useAuthStore.setState(s => ({
      user: s.user ? { ...s.user, hasCompletedOnboarding: true } : s.user,
    }))
  }

  async function finish() {
    await complete()
    navigate('/calendar')
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Eventli"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px 24px',
        overflowY: 'auto',
      }}
    >
      {/* Skip — always available, marks onboarding complete */}
      <button
        type="button"
        onClick={complete}
        disabled={finishing}
        style={{
          position: 'absolute',
          top: 'max(16px, env(safe-area-inset-top))',
          right: 16,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-3)',
          padding: '10px 12px',
          borderRadius: 'var(--r-sm)',
        }}
      >
        Skip
      </button>

      <div style={{ width: '100%', maxWidth: 440, margin: 'auto 0' }}>
        {step === 0 && <StepWelcome onNext={() => setStep(1)} />}
        {step === 1 && <StepGroup onAdvance={() => setStep(2)} />}
        {step === 2 && <StepDone onFinish={finish} finishing={finishing} />}
      </div>

      <div style={{ marginTop: 28, paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <StepDots total={3} current={step} />
      </div>
    </div>
  )
}
