// Compact Mono form controls: switch, checkbox and iOS-style inset groups.
import type { ReactNode } from 'react'
import Icon from './Icon'

/* ── Switch ─────────────────────────────────────────────── */
interface SwitchProps {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 44,
        height: 26,
        flexShrink: 0,
        borderRadius: 13,
        border: 'none',
        padding: 2,
        display: 'flex',
        justifyContent: checked ? 'flex-end' : 'flex-start',
        background: checked ? 'var(--accent)' : 'var(--border-2)',
        transition: 'var(--transition)',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <span style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        background: checked ? 'var(--accent-text)' : 'var(--surface)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
      }} />
    </button>
  )
}

/* ── Checkbox ───────────────────────────────────────────── */
interface CheckboxProps {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  /** square = tasks (18px), round = shopping items (22px) */
  shape?: 'square' | 'round'
}

export function Checkbox({ checked, onChange, label, shape = 'square' }: CheckboxProps) {
  const size = shape === 'round' ? 22 : 18
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        // 44px hit area around a small visual box
        width: 44,
        height: 44,
        margin: -13,
        flexShrink: 0,
        border: 'none',
        background: 'transparent',
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      <span style={{
        width: size,
        height: size,
        borderRadius: shape === 'round' ? size / 2 : 5,
        boxSizing: 'border-box',
        border: checked ? 'none' : '1.5px solid var(--border-hi)',
        background: checked ? 'var(--accent)' : 'transparent',
        color: 'var(--accent-text)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'var(--transition)',
      }}>
        {checked && <Icon name="check" size={shape === 'round' ? 13 : 11} sw={3} />}
      </span>
    </button>
  )
}

/* ── Inset group ────────────────────────────────────────── */
export function InsetGroup({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      ...style,
      background: 'var(--fill)',
      borderRadius: 'var(--r-lg)',
      overflow: 'hidden',
    }}>
      {children}
    </div>
  )
}

interface InsetRowProps {
  label: ReactNode
  value?: ReactNode
  onClick?: () => void
  chevron?: boolean
  /** Extra content under the row (e.g. an expanded section) */
  children?: ReactNode
  first?: boolean
}

export function InsetRow({ label, value, onClick, chevron, children, first }: InsetRowProps) {
  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    padding: '0 14px',
    width: '100%',
    border: 'none',
    borderTop: first ? 'none' : '1px solid var(--divider)',
    background: 'transparent',
    color: 'var(--text-1)',
    fontSize: 15,
    textAlign: 'left',
    boxSizing: 'border-box',
    cursor: onClick ? 'pointer' : 'default',
  }
  const inner = (
    <>
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
      {value !== undefined && (
        <span style={{ color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>{value}</span>
      )}
      {chevron && <Icon name="chevR" size={14} sw={2} style={{ color: 'var(--text-3)' }} />}
    </>
  )
  return (
    <>
      {onClick
        ? <button type="button" onClick={onClick} style={rowStyle}>{inner}</button>
        : <div style={rowStyle}>{inner}</div>}
      {children}
    </>
  )
}

/* ── Field: the board's text input (44px, 10px radius, hairline, ink focus ring via CSS) ── */
export const fieldStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 44,
  borderRadius: 10,
  border: '1px solid var(--border-2)',
  background: 'var(--bg)',
  padding: '10px 12px',
  lineHeight: 1.35,
  fontSize: 16,
  color: 'var(--text-1)',
  outline: 'none',
  fontFamily: 'inherit',
  minWidth: 0,
}
/** Multi-line variant of fieldStyle */
export const areaStyle: React.CSSProperties = { ...fieldStyle, minHeight: 88, lineHeight: 1.45, resize: 'vertical' }
/** Label above a field */
export const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6 }

/* ── QuickField: borderless add-row on --fill ("Add item, press Enter") ── */
export const quickFieldWrap: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, height: 48, borderRadius: 12,
  background: 'var(--fill)', padding: '0 14px', boxSizing: 'border-box',
}
export const quickFieldInput: React.CSSProperties = {
  flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent',
  fontSize: 16, color: 'var(--text-1)', fontFamily: 'inherit', boxShadow: 'none',
}
