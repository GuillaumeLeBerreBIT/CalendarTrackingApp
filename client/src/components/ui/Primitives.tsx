import type { ReactNode } from 'react'
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
  /** sm = 28px toolbar switch, md = 34px tabs / RSVP (board) */
  size?: 'sm' | 'md'
  /** Stretch to the container width, segments share it equally */
  full?: boolean
  label?: string
}

export function Segmented({ options, value, onChange, size = 'sm', full, label }: SegmentedProps) {
  const big = size === 'md'
  return (
    <div role="group" aria-label={label} style={{
      display: full ? 'flex' : 'inline-flex',
      width: full ? '100%' : undefined,
      padding: big ? 3 : 2,
      background: 'var(--seg-track)',
      borderRadius: big ? 10 : 8,
      boxSizing: 'border-box',
    }}>
      {options.map(o => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            style={{
              flex: full ? 1 : undefined,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              height: big ? 34 : 28,
              padding: '0 12px',
              borderRadius: big ? 8 : 6,
              border: 'none',
              background: active ? 'var(--seg-on)' : 'transparent',
              color: active ? 'var(--text-1)' : 'var(--text-2)',
              fontSize: big ? 14 : 13,
              fontWeight: active ? 600 : 500,
              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              whiteSpace: 'nowrap',
              transition: 'var(--transition)',
              cursor: 'pointer',
            }}
          >
            {o.icon && <Icon name={o.icon} size={big ? 15 : 14} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ── Pill: round outline chip (people, lists, claims). Pressed = ink. ── */
interface PillProps {
  children: ReactNode
  on?: boolean
  onClick?: () => void
  /** Group colour dot in front of the label */
  dot?: string
  icon?: string
  title?: string
  disabled?: boolean
}

export function Pill({ children, on, onClick, dot, icon, title, disabled }: PillProps) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 36,
        padding: '0 12px',
        borderRadius: 999,
        border: `1px solid ${on ? 'var(--accent)' : 'var(--pill-line)'}`,
        background: on ? 'var(--accent)' : 'var(--bg)',
        color: on ? 'var(--accent-text)' : 'var(--text-1)',
        fontSize: 14,
        fontWeight: 500,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'var(--transition)',
      }}
    >
      {dot && <span style={{ width: 8, height: 8, borderRadius: 4, background: dot, flexShrink: 0 }} />}
      {icon && <Icon name={icon} size={14} sw={2} />}
      {children}
    </button>
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

/* ── Section wrapper ────────────────────────────────────── */
interface SectionProps {
  title: string
  count?: string | number
  children: React.ReactNode
}

export function Section({ title, count, children }: SectionProps) {
  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 4px 8px' }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, letterSpacing: 0, color: 'var(--text-2)' }}>{title}</h2>
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
      <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{label}</span>
    </div>
  )
}

/* re-export useState so callers don't need to import React */
export { useState }
