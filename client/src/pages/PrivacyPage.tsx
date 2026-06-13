import { Link } from 'react-router-dom'

// ── FILL THESE IN BEFORE LAUNCH (tracked in LAUNCH_CHECKLIST.md) ───────────────
// Real privacy contact address (e.g. a dedicated alias). Shown to users and used
// for data-subject requests under GDPR.
const PRIVACY_EMAIL = 'privacy@eventli.app' // TODO: replace with the real mailbox
// Data controller identity: your full legal name + city, Belgium.
const CONTROLLER_NAME = '[Your full name], [City], Belgium' // TODO: fill in
const LAST_UPDATED = '13 June 2026'

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
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

function H({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em', margin: '28px 0 10px' }}>
      {children}
    </h2>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.65, margin: '0 0 12px' }}>
      {children}
    </p>
  )
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.65, marginBottom: 6 }}>
      {children}
    </li>
  )
}

export default function PrivacyPage() {
  return (
    <div style={{ height: '100dvh', overflowY: 'auto', background: 'var(--bg)', padding: '48px 16px 80px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <Logo />

        <h1 style={{ fontSize: 30, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.035em', margin: '0 0 6px' }}>
          Privacy Policy
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 8px' }}>Last updated: {LAST_UPDATED}</p>

        <P>
          This policy explains what personal data Eventli collects, why, and the rights you
          have over it under the EU General Data Protection Regulation (GDPR).
        </P>

        <H>Who is responsible for your data</H>
        <P>
          The data controller for Eventli is {CONTROLLER_NAME}. For any privacy question or to
          exercise your rights, contact us at <a href={`mailto:${PRIVACY_EMAIL}`} style={{ color: 'var(--accent)' }}>{PRIVACY_EMAIL}</a>.
        </P>

        <H>What we collect</H>
        <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
          <Li><strong>Account data</strong> — your email address and username, set when you register.</Li>
          <Li><strong>Profile data</strong> — optional home city and your notification and discoverability preferences.</Li>
          <Li><strong>Content you create</strong> — groups, events, tasks, habits, countdowns, RSVPs, comments and reactions.</Li>
          <Li><strong>Device data</strong> — if you enable push notifications, the browser push endpoint for your device.</Li>
          <Li><strong>Billing data</strong> — if you subscribe to Plus, your subscription status (payment details are handled by our payment provider, not stored by us).</Li>
        </ul>

        <H>Why we use it (legal bases)</H>
        <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
          <Li><strong>To provide the service</strong> (contract) — running your calendar, groups and tasks.</Li>
          <Li><strong>To send notifications</strong> (consent) — push alerts and the optional daily email digest, which you can turn off at any time.</Li>
          <Li><strong>To keep the service secure</strong> (legitimate interest) — preventing abuse and debugging errors.</Li>
        </ul>

        <H>Who we share it with (processors)</H>
        <P>
          We use a small number of trusted providers who process data on our behalf under
          data-processing agreements:
        </P>
        <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
          <Li><strong>Supabase</strong> — database and authentication hosting (EU region).</Li>
          <Li><strong>Resend</strong> — sending the daily digest email, if enabled.</Li>
          <Li><strong>Ticketmaster</strong> — the Discover feed queries their public events API; we don't send them your personal data.</Li>
        </ul>
        <P>We never sell your personal data.</P>

        <H>How long we keep it</H>
        <P>
          We keep your data for as long as your account exists. When you delete your account,
          your personal data is erased immediately (see below). Anonymous, aggregated data may
          be retained.
        </P>

        <H>Your rights</H>
        <P>Under the GDPR you have the right to:</P>
        <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
          <Li><strong>Access &amp; portability</strong> — download a copy of your data from your Profile page ("Export my data").</Li>
          <Li><strong>Erasure</strong> — delete your account and all personal data from your Profile page ("Delete account").</Li>
          <Li><strong>Rectification</strong> — edit your username, city and preferences at any time.</Li>
          <Li><strong>Objection &amp; withdrawal of consent</strong> — turn off notifications and email digests in your settings.</Li>
        </ul>
        <P>
          You also have the right to lodge a complaint with the Belgian Data Protection
          Authority (Gegevensbeschermingsautoriteit) at{' '}
          <a href="https://www.gegevensbeschermingsautoriteit.be" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
            gegevensbeschermingsautoriteit.be
          </a>.
        </P>

        <H>Contact</H>
        <P>
          Questions about this policy or your data? Email{' '}
          <a href={`mailto:${PRIVACY_EMAIL}`} style={{ color: 'var(--accent)' }}>{PRIVACY_EMAIL}</a>.
        </P>

        <div style={{ marginTop: 36, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
          <Link to="/" style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--accent)', textDecoration: 'none' }}>
            ← Back to Eventli
          </Link>
        </div>
      </div>
    </div>
  )
}
