import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUpgradeStore } from '@/store/upgradeStore'
import Button from '@/components/ui/Button'
import Icon from '@/components/ui/Icon'
import api from '@/api/client'
import { BILLING_ENABLED } from '@/lib/billing'

const LIMIT_COPY: Record<string, { title: string; body: string }> = {
  groups: {
    title: 'Group limit reached',
    body: 'Free plan includes 3 groups. Upgrade to Plus for unlimited groups.',
  },
  events_month: {
    title: 'Monthly event limit reached',
    body: 'Free plan includes 50 events per month. Upgrade to Plus for unlimited events.',
  },
}

const FALLBACK = {
  title: 'Plan limit reached',
  body: 'You’ve hit a limit of the Free plan. Upgrade to Plus to keep going.',
}

export default function UpgradeModal() {
  const { open, limit, hideUpgrade } = useUpgradeStore()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  if (!open) return null

  const copy = (limit && LIMIT_COPY[limit]) || FALLBACK

  async function handleUpgrade() {
    setLoading(true)
    try {
      const { data } = await api.post('/billing/create-checkout-session')
      if (data.success && data.url) {
        hideUpgrade()
        window.location.href = data.url
        return
      }
    } catch {
      // billing not configured or user not logged in — fall back to pricing page
    } finally {
      setLoading(false)
    }
    hideUpgrade()
    navigate('/pricing')
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 90,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', padding: 16,
      }}
      onClick={hideUpgrade}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          borderRadius: 'var(--r-xl)',
          border: '1px solid var(--border-2)',
          boxShadow: 'var(--shadow-lg)',
          width: '100%', maxWidth: 400,
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, background: 'var(--accent-soft)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="sparkle" size={16} style={{ color: 'var(--accent)' }} />
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{copy.title}</h2>
          </div>
          <button
            onClick={hideUpgrade}
            aria-label="Close"
            style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4, display: 'flex' }}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <p style={{ fontSize: 13.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.6 }}>
            {copy.body}
          </p>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant={BILLING_ENABLED ? 'ghost' : 'primary'} size="md" onClick={hideUpgrade}>
              {BILLING_ENABLED ? 'Maybe later' : 'Got it'}
            </Button>
            {BILLING_ENABLED && (
              <Button variant="primary" size="md" onClick={handleUpgrade} disabled={loading} iconRight="arrowR">
                {loading ? 'Loading…' : 'Upgrade to Plus'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
