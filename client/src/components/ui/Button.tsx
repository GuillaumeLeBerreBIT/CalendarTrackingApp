import { useState } from 'react'
import Icon from './Icon'

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'soft' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps {
  children?: React.ReactNode
  variant?: Variant
  size?: Size
  icon?: string
  iconRight?: string
  full?: boolean
  onClick?: (e: React.MouseEvent) => void
  active?: boolean
  style?: React.CSSProperties
  title?: string
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}

const SIZES = {
  sm: { p: '7px 12px', fs: 12.5, h: 32, gap: 6, isz: 15 },
  md: { p: '9px 16px', fs: 13.5, h: 40, gap: 7, isz: 17 },
  lg: { p: '13px 20px', fs: 15,   h: 50, gap: 8, isz: 19 },
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  full,
  onClick,
  active,
  style,
  title,
  disabled,
  type = 'button',
}: ButtonProps) {
  const [hover, setHover] = useState(false)
  const [press, setPress] = useState(false)
  const s = SIZES[size]

  const VARIANTS: Record<Variant, { bg: string; c: string; b: string; sh: string }> = {
    // Compact Mono: one ink primary per screen; everything else outline or plain text.
    primary:   { bg: active ? 'var(--accent-press)' : (hover ? 'var(--accent-hover)' : 'var(--accent)'), c: 'var(--accent-text)', b: 'transparent',     sh: 'none' },
    secondary: { bg: hover ? 'var(--surface-2)' : 'var(--surface)',                                     c: 'var(--text-1)',      b: 'var(--border-2)', sh: 'none' },
    ghost:     { bg: hover ? 'var(--surface-2)' : 'transparent',                                        c: 'var(--text-2)',      b: 'transparent',     sh: 'none' },
    outline:   { bg: hover ? 'var(--surface-2)' : 'transparent',                                        c: 'var(--text-1)',      b: 'var(--border-2)', sh: 'none' },
    soft:      { bg: active ? 'var(--accent)' : (hover ? 'var(--surface-hi)' : 'var(--fill)'),          c: active ? 'var(--accent-text)' : 'var(--text-1)', b: 'transparent', sh: 'none' },
    danger:    { bg: hover ? 'var(--surface-2)' : 'transparent',                                        c: 'var(--danger)',      b: 'transparent',     sh: 'none' },
  }
  const v = VARIANTS[variant]

  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPress(false) }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: s.gap,
        padding: s.p,
        minHeight: s.h,
        width: full ? '100%' : 'auto',
        borderRadius: 'var(--r-sm)',
        border: `1px solid ${v.b}`,
        background: v.bg,
        color: v.c,
        fontSize: s.fs,
        fontWeight: variant === 'ghost' || variant === 'danger' ? 500 : 600,
        letterSpacing: '-0.01em',
        boxShadow: v.sh,
        transform: press ? 'scale(0.98)' : 'none',
        transition: 'var(--transition)',
        whiteSpace: 'nowrap',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={s.isz} sw={2} />}
      {children}
      {iconRight && <Icon name={iconRight} size={s.isz} sw={2} />}
    </button>
  )
}

interface IconButtonProps {
  name: string
  size?: number
  isz?: number
  onClick?: (e: React.MouseEvent) => void
  title?: string
  active?: boolean
  tone?: 'default' | 'glass'
  badge?: boolean
}

export function IconButton({ name, size = 40, isz, onClick, title, active, tone = 'default', badge }: IconButtonProps) {
  const [hover, setHover] = useState(false)

  const bg = tone === 'glass'
    ? (hover ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.4)')
    : (active ? 'var(--surface-hi)' : (hover ? 'var(--surface-3)' : 'transparent'))
  const c = tone === 'glass' ? '#fff' : (active ? 'var(--text-1)' : 'var(--text-2)')

  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: 'var(--r-sm)',
        border: '1px solid',
        borderColor: tone === 'glass' ? 'rgba(255,255,255,0.14)' : (active ? 'var(--border-2)' : 'transparent'),
        background: bg,
        color: c,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'var(--transition)',
        backdropFilter: tone === 'glass' ? 'blur(8px)' : 'none',
        cursor: 'pointer',
      }}
    >
      <Icon name={name} size={isz || size * 0.46} sw={1.8} />
      {badge && (
        <span style={{
          position: 'absolute',
          top: 8,
          right: 8,
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: 'var(--danger)',
          boxShadow: '0 0 0 2px var(--bg)',
        }} />
      )}
    </button>
  )
}
