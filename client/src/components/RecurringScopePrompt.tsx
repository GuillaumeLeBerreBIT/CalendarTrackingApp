import { createPortal } from 'react-dom'

export interface RecurringScopePromptProps {
  mode: 'save' | 'delete'
  onChoose: (scope: 'this' | 'following' | 'all') => void
  onCancel: () => void
}

export default function RecurringScopePrompt({ mode, onChoose, onCancel }: RecurringScopePromptProps) {
  return createPortal(
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'var(--scrim)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(360px, 100%)', background: 'var(--surface)',
          borderRadius: 'var(--r-lg)', border: '1px solid var(--border-2)',
          boxShadow: 'var(--shadow-lg)', padding: 20,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 4px' }}>
          {mode === 'save' ? 'Save recurring event' : 'Delete recurring event'}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '0 0 8px' }}>
          This is a repeating event. Apply to:
        </p>

        <ScopeButton label="This event only" onClick={() => onChoose('this')} />
        <ScopeButton
          label="This and following events"
          onClick={() => onChoose('following')}
        />
        <ScopeButton
          label="All events in the series"
          danger={mode === 'delete'}
          onClick={() => onChoose('all')}
        />
        <button
          type="button"
          onClick={onCancel}
          style={{
            marginTop: 4, background: 'transparent', border: 'none',
            color: 'var(--text-3)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '8px',
            minHeight: 44,
          }}
        >
          Cancel
        </button>
      </div>
    </div>,
    document.body
  )
}

function ScopeButton({ label, onClick, danger = false }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', padding: '12px 14px',
        borderRadius: 'var(--r-sm)', cursor: 'pointer',
        border: danger ? '1px solid rgba(244,63,94,0.3)' : '1px solid var(--border-2)',
        background: danger ? 'rgba(244,63,94,0.06)' : 'var(--surface-2)',
        color: danger ? '#fb7185' : 'var(--text-1)',
        fontSize: 13.5, fontWeight: 600, transition: 'var(--transition)',
        minHeight: 44,
      }}
    >
      {label}
    </button>
  )
}
