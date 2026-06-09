import { Link } from 'react-router-dom'
import Icon from '@/components/ui/Icon'

const plans = [
  {
    name: 'Free',
    price: '€0',
    period: 'forever',
    features: ['Up to 3 groups', '50 events/month', 'Basic task lists', 'Calendar view'],
    cta: 'Get started',
    href: '/register',
    highlight: false,
  },
  {
    name: 'Plus',
    price: '€5',
    period: '/month',
    features: ['Unlimited groups', 'Unlimited events', 'Advanced task management', 'Member color coding', 'iCal export', 'Email digests'],
    cta: 'Start free trial',
    href: '/register',
    highlight: true,
  },
]

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
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 16px' }}>
      <Logo />

      {/* Heading */}
      <div style={{ textAlign: 'center', marginBottom: 48, maxWidth: 480 }}>
        <h1 style={{ fontSize: 36, color: 'var(--text-1)', letterSpacing: '-0.035em', marginBottom: 10 }}>Simple pricing</h1>
        <p style={{ fontSize: 15, color: 'var(--text-3)', lineHeight: 1.6 }}>Start free. Upgrade when your group needs more.</p>
      </div>

      {/* Plan cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, width: '100%', maxWidth: 680 }}>
        {plans.map((plan) => (
          <div
            key={plan.name}
            style={{
              background: 'var(--surface)',
              border: `1px solid ${plan.highlight ? 'var(--accent-line)' : 'var(--border)'}`,
              borderRadius: 'var(--r-xl)',
              padding: '28px 26px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: plan.highlight ? '0 0 0 2px var(--accent-soft), var(--shadow-md)' : 'var(--shadow-sm)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Popular badge */}
            {plan.highlight && (
              <div style={{ position: 'absolute', top: 18, right: 18 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 'var(--r-full)', background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', color: 'var(--accent)', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  <Icon name="sparkle" size={11} fill="var(--accent)" /> Popular
                </span>
              </div>
            )}

            {/* Plan name + price */}
            <div style={{ marginBottom: 22 }}>
              <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 8 }}>{plan.name}</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 40, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.04em' }}>{plan.price}</span>
                <span style={{ fontSize: 14, color: 'var(--text-3)', fontWeight: 500 }}>{plan.period}</span>
              </div>
            </div>

            {/* Features */}
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, marginBottom: 28, listStyle: 'none', padding: 0, margin: '0 0 28px' }}>
              {plan.features.map((f) => (
                <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: 'var(--text-2)' }}>
                  <span style={{ width: 18, height: 18, borderRadius: '50%', background: plan.highlight ? 'var(--accent-soft)' : 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="check" size={11} sw={2.8} style={{ color: plan.highlight ? 'var(--accent)' : 'var(--text-3)' }} />
                  </span>
                  {f}
                </li>
              ))}
            </ul>

            {/* CTA */}
            <Link
              to={plan.href}
              style={{
                display: 'block',
                textAlign: 'center',
                padding: '13px 20px',
                borderRadius: 'var(--r-sm)',
                fontSize: 14,
                fontWeight: 650,
                letterSpacing: '-0.01em',
                textDecoration: 'none',
                background: plan.highlight ? 'var(--accent)' : 'var(--surface-3)',
                color: plan.highlight ? 'var(--accent-text)' : 'var(--text-1)',
                border: `1px solid ${plan.highlight ? 'transparent' : 'var(--border-2)'}`,
                boxShadow: plan.highlight ? '0 6px 20px var(--accent-glow)' : 'none',
                transition: 'var(--transition)',
              }}
            >
              {plan.cta}
            </Link>
          </div>
        ))}
      </div>

      {/* Footer links */}
      <div style={{ marginTop: 40, textAlign: 'center' }}>
        <p style={{ fontSize: 13.5, color: 'var(--text-3)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--accent)', fontWeight: 600 }}>Sign in</Link>
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8, opacity: 0.7 }}>
          No credit card required · Cancel anytime
        </p>
      </div>
    </div>
  )
}
