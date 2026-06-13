import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Icon from '@/components/ui/Icon'
import api from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { BILLING_ENABLED } from '@/lib/billing'

const FREE_FEATURES = ['Up to 3 groups', '50 events/month', 'Task lists', 'Calendar & agenda view', 'Habit tracker', 'Push notifications']
const PLUS_FEATURES = ['Unlimited groups', 'Unlimited events', 'Everything in Free', 'Group challenges & pacts', 'iCal export & import', 'Daily email digest', 'Priority support']

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 40 }}>
      <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px var(--accent-glow)', flexShrink: 0 }}>
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="3" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </div>
      <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text-1)' }}>Eventli</span>
    </div>
  )
}

export default function PricingPage() {
  const { user } = useAuthStore()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const checkoutSuccess = searchParams.get('checkout') === 'success'
  const checkoutCancelled = searchParams.get('checkout') === 'cancelled'

  async function handleUpgrade() {
    if (!user) {
      window.location.href = '/register'
      return
    }
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post('/billing/create-checkout-session')
      if (data.success && data.url) {
        window.location.href = data.url
      } else {
        setError(data.error ?? 'Could not start checkout. Please try again.')
      }
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not start checkout. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ height: '100dvh', overflowY: 'auto', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 16px' }}>
      <Logo />

      {/* Post-checkout banners */}
      {checkoutSuccess && (
        <div style={{ width: '100%', maxWidth: 680, marginBottom: 24, padding: '14px 18px', borderRadius: 'var(--r-md)', background: 'rgba(34,211,170,0.1)', border: '1px solid rgba(34,211,170,0.25)', color: 'var(--g-work)', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="check" size={16} sw={2.5} />
          Welcome to Plus! Your plan has been upgraded.
        </div>
      )}
      {checkoutCancelled && (
        <div style={{ width: '100%', maxWidth: 680, marginBottom: 24, padding: '14px 18px', borderRadius: 'var(--r-md)', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', color: '#fb7185', fontSize: 14, fontWeight: 600 }}>
          Checkout was cancelled — no charge was made.
        </div>
      )}

      {/* Heading */}
      <div style={{ textAlign: 'center', marginBottom: 48, maxWidth: 480 }}>
        <h1 style={{ fontSize: 36, color: 'var(--text-1)', letterSpacing: '-0.035em', marginBottom: 10 }}>Simple pricing</h1>
        <p style={{ fontSize: 15, color: 'var(--text-3)', lineHeight: 1.6 }}>Start free. Upgrade when your group needs more.</p>
      </div>

      {/* Plan cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, width: '100%', maxWidth: 680 }}>

        {/* Free */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', padding: '28px 26px', display: 'flex', flexDirection: 'column' }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>Free</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 22 }}>
            <span style={{ fontSize: 40, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.04em' }}>€0</span>
            <span style={{ fontSize: 14, color: 'var(--text-3)', fontWeight: 500 }}>forever</span>
          </div>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, marginBottom: 28, listStyle: 'none', padding: 0 }}>
            {FREE_FEATURES.map(f => (
              <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: 'var(--text-2)' }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="check" size={11} sw={2.8} style={{ color: 'var(--text-3)' }} />
                </span>
                {f}
              </li>
            ))}
          </ul>
          <Link to="/register" style={{ display: 'block', textAlign: 'center', padding: '13px 20px', borderRadius: 'var(--r-sm)', fontSize: 14, fontWeight: 650, textDecoration: 'none', background: 'var(--surface-3)', color: 'var(--text-1)', border: '1px solid var(--border-2)', transition: 'var(--transition)' }}>
            Get started free
          </Link>
        </div>

        {/* Plus */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--accent-line)', borderRadius: 'var(--r-xl)', padding: '28px 26px', display: 'flex', flexDirection: 'column', boxShadow: '0 0 0 2px var(--accent-soft), var(--shadow-md)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 18, right: 18 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 'var(--r-full)', background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', color: 'var(--accent)', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              <Icon name="sparkle" size={11} fill="var(--accent)" /> Popular
            </span>
          </div>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>Plus</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 22 }}>
            <span style={{ fontSize: 40, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.04em' }}>€5</span>
            <span style={{ fontSize: 14, color: 'var(--text-3)', fontWeight: 500 }}>/month</span>
          </div>
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, marginBottom: 28, listStyle: 'none', padding: 0 }}>
            {PLUS_FEATURES.map(f => (
              <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: 'var(--text-2)' }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="check" size={11} sw={2.8} style={{ color: 'var(--accent)' }} />
                </span>
                {f}
              </li>
            ))}
          </ul>

          {error && (
            <p style={{ fontSize: 12.5, color: '#fb7185', marginBottom: 10, padding: '8px 12px', background: 'rgba(244,63,94,0.08)', borderRadius: 'var(--r-sm)', border: '1px solid rgba(244,63,94,0.2)' }}>
              {error}
            </p>
          )}

          {BILLING_ENABLED ? (
            <>
              <button
                onClick={handleUpgrade}
                disabled={loading}
                style={{ display: 'block', width: '100%', textAlign: 'center', padding: '13px 20px', borderRadius: 'var(--r-sm)', fontSize: 14, fontWeight: 650, letterSpacing: '-0.01em', cursor: loading ? 'not-allowed' : 'pointer', background: loading ? 'var(--accent-soft)' : 'var(--accent)', color: 'var(--accent-text)', border: 'none', boxShadow: loading ? 'none' : '0 6px 20px var(--accent-glow)', opacity: loading ? 0.7 : 1, transition: 'var(--transition)' }}
              >
                {loading ? 'Redirecting to checkout…' : user ? 'Upgrade to Plus' : 'Get started'}
              </button>
              <p style={{ fontSize: 11.5, color: 'var(--text-3)', textAlign: 'center', marginTop: 10 }}>
                No credit card stored · Cancel anytime
              </p>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '13px 20px', borderRadius: 'var(--r-sm)', fontSize: 13, fontWeight: 600, color: 'var(--text-3)', background: 'var(--surface-3)', border: '1px solid var(--border-2)' }}>
              Currently invite-only
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 40, textAlign: 'center' }}>
        <p style={{ fontSize: 13.5, color: 'var(--text-3)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--accent)', fontWeight: 600 }}>Sign in</Link>
        </p>
      </div>
    </div>
  )
}
