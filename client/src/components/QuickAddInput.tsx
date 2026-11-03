import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { splitPasted, type ListKind } from '@/lib/lists'

export function errorText(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } }; message?: string }
  return e?.response?.data?.error || e?.message || 'Something went wrong'
}

/** One-line add box: Enter adds one title; pasting several lines (or commas for shopping) adds many. */
export default function QuickAddInput({ kind, placeholder, onAdd }: {
  kind: ListKind
  placeholder: string
  onAdd: (titles: string[]) => Promise<void>
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  async function submit(titles: string[], clear: boolean) {
    if (titles.length === 0 || busy) return
    setBusy(true)
    setError('')
    try {
      await onAdd(titles)
      if (clear) setValue('')
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
      ref.current?.focus()
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const t = value.trim()
    if (t) void submit([t], true)
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text')
    const multi = text.includes('\n') || (kind === 'shopping' && text.includes(','))
    if (!multi) return
    e.preventDefault()
    void submit(splitPasted(text, kind), false)
  }

  return (
    <div>
      <input
        ref={ref}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        maxLength={200}
        style={{
          width: '100%', padding: '9px 12px', borderRadius: 'var(--r-sm)',
          border: '1px solid var(--border-2)', background: 'var(--surface-2)',
          color: 'var(--text-1)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
        }}
      />
      {error && <p role="alert" style={{ fontSize: 12.5, color: 'var(--danger, #ef4444)', margin: '6px 0 0' }}>{error}</p>}
    </div>
  )
}
