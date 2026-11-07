// Sheet: bottom sheet on phone, right-hand inspector on desktop (Compact Mono, Phase B).
// Portalled to <body> so position:fixed escapes the overflow:hidden .app-viewport
// (iOS Safari otherwise clips it behind the bottom nav).
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from './Button'
import Icon from './Icon'

interface SheetProps {
  title: string
  onClose: () => void
  children: ReactNode
  /** Sticky bottom bar (primary action) */
  footer?: ReactNode
  /** Extra buttons left of the close button (e.g. delete) */
  actions?: ReactNode
  /** Desktop inspector width */
  width?: number
}

export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024)
  useEffect(() => {
    const onResize = () => setPhone(window.innerWidth < 1024)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return phone
}

export default function Sheet({ title, onClose, children, footer, actions, width = 440 }: SheetProps) {
  const phone = useIsPhone()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      // pointerdown, not click: a tap that opened the sheet must not also close it
      // through the browser's compatibility click landing on the new backdrop.
      onPointerDown={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        background: 'var(--scrim)',
        display: 'flex',
        alignItems: phone ? 'flex-end' : 'stretch',
        justifyContent: phone ? 'stretch' : 'flex-end',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg)',
          boxShadow: 'var(--shadow-lg)',
          ...(phone ? {
            width: '100%',
            maxHeight: '92dvh',
            borderRadius: 'var(--r-xl) var(--r-xl) 0 0',
            animation: 'slideUp 0.28s cubic-bezier(0.2,0.7,0.2,1) both',
          } : {
            width: `min(${width}px, 100vw)`,
            height: '100%',
            borderLeft: '1px solid var(--border)',
            animation: 'slideInRight 0.24s cubic-bezier(0.2,0.7,0.2,1) both',
          }),
        }}
      >
        {phone && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 0' }}>
            <div style={{ width: 36, height: 4, borderRadius: 99, background: 'var(--border-2)' }} />
          </div>
        )}
        <header style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: phone ? '8px 12px 8px 18px' : '14px 14px 14px 20px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <h2 style={{ flex: 1, fontSize: 17, fontWeight: 700, color: 'var(--text-1)' }}>{title}</h2>
          {actions}
          <IconButton name="close" size={36} isz={16} title="Close" onClick={onClose} />
        </header>
        <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {children}
        </div>
        {footer && (
          <footer style={{
            flexShrink: 0,
            padding: '12px 16px',
            paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg)',
          }}>
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}

/* ── Disclosure: a collapsed optional section with a one-line summary ── */
interface DisclosureProps {
  label: string
  icon?: string
  /** Shown on the right while collapsed (e.g. "2 invited", "Off") */
  summary?: ReactNode
  open: boolean
  onToggle: () => void
  children: ReactNode
}

export function Disclosure({ label, icon, summary, open, onToggle, children }: DisclosureProps) {
  return (
    <div style={{ background: 'var(--fill)', borderRadius: 'var(--r-lg)' }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        style={{
          width: '100%',
          minHeight: 48,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 14px',
          border: 'none',
          background: 'transparent',
          color: 'var(--text-1)',
          fontSize: 15,
          fontWeight: 500,
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        {icon && <Icon name={icon} size={16} sw={1.8} style={{ color: 'var(--text-2)' }} />}
        <span style={{ flex: 1 }}>{label}</span>
        {summary !== undefined && !open && (
          <span style={{ fontSize: 13.5, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '55%' }}>{summary}</span>
        )}
        <Icon
          name="chevR"
          size={14}
          sw={2}
          style={{ color: 'var(--text-3)', transform: open ? 'rotate(90deg)' : 'none', transition: 'var(--transition)' }}
        />
      </button>
      {open && (
        <div style={{ padding: '2px 14px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {children}
        </div>
      )}
    </div>
  )
}
