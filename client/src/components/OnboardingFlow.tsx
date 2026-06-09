import { useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/api/client'
import Button from '@/components/ui/Button'
import Icon from '@/components/ui/Icon'

export interface OnboardingFlowProps {
  onComplete: () => void
}

// ── Dot step indicator ────────────────────────────────────────────────────────
function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 28 }}>
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

// ── Input shared style ────────────────────────────────────────────────────────
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

// ── Step 1 ────────────────────────────────────────────────────────────────────
function Step1({ onNext }: { onNext: () => void }) {
  const [city, setCity] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleContinue() {
    setSaving(true)
    try {
      if (city.trim()) {
        await api.patch('/profile', { city: city.trim() })
      }
    } catch {
      // non-blocking — proceed regardless
    } finally {
      setSaving(false)
      onNext()
    }
  }

  return (
    <div>
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
          <Icon name="sparkle" size={26} sw={1.6} />
        </div>
        <p style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>
          Welcome to Eventli
        </p>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
          Let's set up your account
        </h2>
      </div>

      <div style={{ marginBottom: 22 }}>
        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 650, color: 'var(--text-2)', marginBottom: 7 }}>
          Your city
        </label>
        <input
          type="text"
          value={city}
          onChange={e => setCity(e.target.value)}
          placeholder="e.g. Brussels"
          style={inputStyle}
          onKeyDown={e => { if (e.key === 'Enter') handleContinue() }}
          autoFocus
        />
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '6px 0 0', lineHeight: 1.4 }}>
          Used to personalise your Discovery feed. You can change this any time.
        </p>
      </div>

      <Button variant="primary" full size="lg" onClick={handleContinue} disabled={saving}>
        {saving ? 'Saving…' : 'Continue'}
      </Button>
    </div>
  )
}

// ── Step 2 ────────────────────────────────────────────────────────────────────
function Step2({ onSkip, onClose }: { onSkip: () => void; onClose: () => void }) {
  const navigate = useNavigate()
  const [joinInput, setJoinInput] = useState('')
  const [showJoinInput, setShowJoinInput] = useState(false)

  function handleCreate() {
    navigate('/groups')
    onClose()
  }

  function handleJoin() {
    if (!showJoinInput) {
      setShowJoinInput(true)
      return
    }
    if (!joinInput.trim()) return
    // Support both a full URL and a raw token
    const match = joinInput.trim().match(/\/join\/([^/?#]+)/)
    const target = match ? `/join/${match[1]}` : joinInput.trim()
    navigate(target)
    onClose()
  }

  const optionCard: CSSProperties = {
    flex: 1,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-lg)',
    padding: '1rem',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    textAlign: 'center',
    transition: 'border-color 0.2s',
  }

  return (
    <div>
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
        <p style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>
          Step 2 of 3
        </p>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
          Groups are where the magic happens
        </h2>
        <p style={{ fontSize: 13.5, color: 'var(--text-3)', margin: '8px 0 0', lineHeight: 1.5 }}>
          Coordinate events and tasks with family, friends, or your team.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {/* Create card */}
        <div
          role="button"
          tabIndex={0}
          style={optionCard}
          onClick={handleCreate}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleCreate() }}
        >
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 'var(--r-sm)',
            background: 'var(--surface-3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent)',
          }}>
            <Icon name="plus" size={20} sw={2} />
          </div>
          <div>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Create a group</p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 0' }}>Start fresh and invite people</p>
          </div>
        </div>

        {/* Join card */}
        <div
          role="button"
          tabIndex={0}
          style={optionCard}
          onClick={handleJoin}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleJoin() }}
        >
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 'var(--r-sm)',
            background: 'var(--surface-3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent)',
          }}>
            <Icon name="arrowR" size={20} sw={2} />
          </div>
          <div>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Join with invite link</p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 0' }}>Paste a /join/… link</p>
          </div>
        </div>
      </div>

      {showJoinInput && (
        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            value={joinInput}
            onChange={e => setJoinInput(e.target.value)}
            placeholder="Paste invite link or token"
            style={inputStyle}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') handleJoin() }}
          />
          <Button
            variant="primary"
            full
            size="md"
            onClick={handleJoin}
            disabled={!joinInput.trim()}
            style={{ marginTop: 8 }}
          >
            Go to group
          </Button>
        </div>
      )}

      <button
        onClick={onSkip}
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
        I'll do this later →
      </button>
    </div>
  )
}

// ── Step 3 ────────────────────────────────────────────────────────────────────
// onComplete = closeWizard (which handles the API patch internally)
function Step3({ onComplete }: { onComplete: () => void }) {
  const navigate = useNavigate()
  const [completing, setCompleting] = useState(false)

  function finish(path: string) {
    if (completing) return
    setCompleting(true)
    navigate(path)
    onComplete() // closeWizard patches the API and fires the external callback
  }

  return (
    <div style={{ textAlign: 'center' }}>
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

      <p style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>
        You're all set!
      </p>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', margin: '0 0 10px', letterSpacing: '-0.02em', lineHeight: 1.25 }}>
        Your calendar is ready.
      </h2>
      <p style={{ fontSize: 13.5, color: 'var(--text-3)', margin: '0 0 28px', lineHeight: 1.6 }}>
        Invite people, add events, and discover what's happening near you.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Button variant="primary" full size="lg" onClick={() => finish('/calendar')} disabled={completing}>
          Go to Calendar
        </Button>
        <Button variant="ghost" full size="lg" onClick={() => finish('/discovery')} disabled={completing}>
          Explore Discovery
        </Button>
      </div>
    </div>
  )
}

// ── Main wizard ───────────────────────────────────────────────────────────────
export default function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState(0)

  async function closeWizard() {
    try {
      await api.patch('/profile', { has_completed_onboarding: true })
    } catch {
      // non-blocking
    }
    onComplete()
  }

  return (
    // Backdrop
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      {/* Card */}
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          background: 'var(--surface)',
          borderRadius: 'var(--r-xl)',
          border: '1px solid var(--border-2)',
          padding: '32px 28px 28px',
          position: 'relative',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* Close button — always available, marks onboarding complete */}
        <button
          onClick={closeWizard}
          aria-label="Close setup wizard"
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 4,
            borderRadius: 'var(--r-sm)',
          }}
        >
          <Icon name="close" size={18} sw={2} />
        </button>

        <StepDots total={3} current={step} />

        {step === 0 && <Step1 onNext={() => setStep(1)} />}
        {step === 1 && <Step2 onSkip={() => setStep(2)} onClose={closeWizard} />}
        {step === 2 && <Step3 onComplete={closeWizard} />}
      </div>
    </div>
  )
}
