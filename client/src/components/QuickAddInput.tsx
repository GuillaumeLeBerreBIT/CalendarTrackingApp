import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { splitPasted, type ListKind } from '@/lib/lists'

export function errorText(err: unknown): string {
  const e = err as { response?: { data?: { error?: string } }; message?: string }
  return e?.response?.data?.error || e?.message || 'Something went wrong'
}

/**
 * One-line add box: Enter adds one title; pasting several lines (or commas for shopping) adds many.
 * The box clears at once; submits are queued and sent one after another, in order. A failed submit
 * puts its text back (in the box if empty, else in front of what was typed since).
 */
export default function QuickAddInput({ kind, placeholder, onAdd }: {
  kind: ListKind
  placeholder: string
  onAdd: (titles: string[]) => Promise<void>
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const latest = useRef('')

  function update(v: string) {
    latest.current = v
    setValue(v)
  }

  function restore(titles: string[]) {
    const text = titles.join(', ')
    update(latest.current ? `${text} ${latest.current}` : text)
  }

  function enqueue(titles: string[]) {
    if (titles.length === 0) return
    setError('')
    queue.current = queue.current.then(async () => {
      try {
        await onAdd(titles)
      } catch (err) {
        setError(errorText(err))
        restore(titles)
      }
    })
    ref.current?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    e.preventDefault()
    const t = latest.current.trim()
    if (!t) return
    update('')
    enqueue([t])
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text')
    const multi = text.includes('\n') || (kind === 'shopping' && text.includes(','))
    if (!multi) return
    e.preventDefault()
    enqueue(splitPasted(text, kind))
  }

  return (
    <div>
      <input
        ref={ref}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => update(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        maxLength={200}
        style={{
          width: '100%', padding: '9px 12px', borderRadius: 'var(--r-sm)',
          border: '1px solid var(--border-2)', background: 'var(--surface-2)',
          color: 'var(--text-1)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
        }}
      />
      {error && <p role="alert" style={{ fontSize: 12.5, color: 'var(--danger)', margin: '6px 0 0' }}>{error}</p>}
    </div>
  )
}
