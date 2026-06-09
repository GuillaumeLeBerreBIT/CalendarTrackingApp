import { useState } from 'react'
import Icon from './Icon'

/* ── Tag / pill ─────────────────────────────────────────── */
type TagTone = 'neutral' | 'free' | 'ghost'

interface TagProps {
  children: React.ReactNode
  tone?: TagTone
}

export function Tag({ children, tone = 'neutral' }: TagProps) {
  const tones: Record<TagTone, { bg: string; c: string; b: string }> = {
    neutral: { bg: 'var(--surface-3)',  c: 'var(--text-2)',  b: 'transparent' },
    free:    { bg: 'var(--accent-soft)', c: 'var(--accent)', b: 'var(--accent-line)' },
    ghost:   { bg: 'transparent',       c: 'var(--text-3)',  b: 'var(--border-2)' },
  }
  const t = tones[tone]
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '3px 8px',
      borderRadius: 'var(--r-full)',
      background: t.bg,
      color: t.c,
      border: `1px solid ${t.b}`,
      fontSize: 11.5,
      fontWeight: 600,
      letterSpacing: '0.01em',
    }}>
      {children}
    </span>
  )
}

/* ── Progress bar ───────────────────────────────────────── */
interface ProgressProps {
  value: number
  total: number
  color?: string
  height?: number
}

export function Progress({ value, total, color = 'var(--accent)', height = 6 }: ProgressProps) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <div style={{ height, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden', width: '100%' }}>
      <div style={{
        height: '100%',
        width: `${pct}%`,
        background: color,
        borderRadius: 99,
        transition: 'width 0.6s cubic-bezier(0.2,0.7,0.2,1)',
      }} />
    </div>
  )
}

/* ── Segmented control ──────────────────────────────────── */
interface SegmentedOption {
  value: string
  label: string
  icon?: string
}

interface SegmentedProps {
  options: SegmentedOption[]
  value: string
  onChange: (value: string) => void
  size?: 'sm' | 'md'
}

export function Segmented({ options, value, onChange, size = 'md' }: SegmentedProps) {
  const pad = size === 'sm' ? '5px 11px' : '7px 14px'
  const fs  = size === 'sm' ? 12 : 13
  return (
    <div style={{
      display: 'inline-flex',
      gap: 2,
      padding: 3,
      background: 'var(--surface-3)',
      borderRadius: 'var(--r-sm)',
      border: '1px solid var(--border)',
    }}>
      {options.map(o => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: pad,
              borderRadius: 'calc(var(--r-sm) - 3px)',
              border: 'none',
              background: active ? 'var(--surface-hi)' : 'transparent',
              color: active ? 'var(--text-1)' : 'var(--text-3)',
              fontSize: fs,
              fontWeight: 650,
              boxShadow: active ? 'var(--shadow-sm)' : 'none',
              transition: 'var(--transition)',
              cursor: 'pointer',
            }}
          >
            {o.icon && <Icon name={o.icon} size={fs + 2} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ── RSVP pill ──────────────────────────────────────────── */
type RsvpStatus = 'going' | 'maybe' | 'no'

export function RsvpPill({ status }: { status: RsvpStatus }) {
  const map: Record<RsvpStatus, { label: string; c: string; bg: string }> = {
    going: { label: 'Going',      c: 'var(--g-work)',   bg: 'rgba(34,211,170,0.12)' },
    maybe: { label: 'Maybe',      c: 'var(--g-family)', bg: 'rgba(245,158,11,0.12)' },
    no:    { label: 'Not going',  c: 'var(--text-3)',   bg: 'var(--surface-3)' },
  }
  const m = map[status]
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '4px 9px',
      borderRadius: 'var(--r-full)',
      background: m.bg,
      color: m.c,
      fontSize: 11.5,
      fontWeight: 700,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.c }} />
      {m.label}
    </span>
  )
}

/* ── Source badge ───────────────────────────────────────── */
import { SOURCE_META } from '@/lib/design'

interface SourceBadgeProps {
  source: string
  compact?: boolean
}

export function SourceBadge({ source, compact = false }: SourceBadgeProps) {
  const m = SOURCE_META[source]
  if (!m) return null
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: compact ? '3px 7px' : '4px 9px',
      borderRadius: 'var(--r-full)',
      background: 'rgba(0,0,0,0.42)',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255,255,255,0.14)',
      fontSize: 11,
      fontWeight: 600,
      color: '#fff',
      letterSpacing: '0.01em',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: m.color, flex: '0 0 auto' }} />
      {!compact && m.label}
    </span>
  )
}

/* ── Section wrapper ────────────────────────────────────── */
interface SectionProps {
  title: string
  count?: string | number
  children: React.ReactNode
}

export function Section({ title, count, children }: SectionProps) {
  return (
    <section style={{ marginBottom: 30 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, color: 'var(--text-1)' }}>{title}</h2>
        {count !== undefined && (
          <span style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--text-3)',
            padding: '2px 9px',
            borderRadius: 'var(--r-full)',
            background: 'var(--surface-3)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {count}
          </span>
        )}
      </div>
      {children}
    </section>
  )
}

/* ── Empty state ────────────────────────────────────────── */
export function Empty({ text }: { text: string }) {
  return (
    <div style={{
      padding: 22,
      textAlign: 'center',
      fontSize: 13,
      color: 'var(--text-3)',
      background: 'var(--surface-2)',
      borderRadius: 'var(--r-md)',
      border: '1px dashed var(--border-2)',
    }}>
      {text}
    </div>
  )
}

/* ── Map preview (SVG placeholder) ─────────────────────── */
export function MapPreview({ area, venue }: { area: string; venue: string }) {
  return (
    <div style={{
      position: 'relative',
      height: 150,
      borderRadius: 'var(--r-md)',
      overflow: 'hidden',
      border: '1px solid var(--border)',
      background: 'var(--surface-2)',
    }}>
      <svg width="100%" height="100%" viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
        <rect width="400" height="150" fill="var(--surface-2)" />
        {[30,75,120,165,210,255,300,345].map(x => <line key={'v'+x} x1={x} y1="0" x2={x-20} y2="150" stroke="var(--border-2)" strokeWidth="1.2" />)}
        {[30,60,90,120].map(y => <line key={'h'+y} x1="0" y1={y} x2="400" y2={y+8} stroke="var(--border-2)" strokeWidth="1.2" />)}
        <path d="M0 95 L160 80 L260 110 L400 88" stroke="var(--accent-line)" strokeWidth="4" fill="none" opacity="0.6" />
        <path d="M120 0 L150 70 L130 150" stroke="var(--accent-line)" strokeWidth="3" fill="none" opacity="0.5" />
      </svg>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-90%)' }}>
        <div style={{ width: 30, height: 30, borderRadius: '50% 50% 50% 0', background: 'var(--accent)', transform: 'rotate(-45deg)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px var(--accent-glow)' }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#fff', transform: 'rotate(45deg)' }} />
        </div>
      </div>
      <div style={{ position: 'absolute', left: 12, bottom: 12, padding: '7px 11px', borderRadius: 'var(--r-sm)', background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--text-1)' }}>{venue}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{area}, Brussels</div>
      </div>
      <button style={{ position: 'absolute', right: 12, bottom: 12, padding: '7px 11px', borderRadius: 'var(--r-sm)', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <Icon name="external" size={13} />Directions
      </button>
    </div>
  )
}

/* ── Stat block ─────────────────────────────────────────── */
export function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{label}</span>
    </div>
  )
}

/* re-export useState so callers don't need to import React */
export { useState }
