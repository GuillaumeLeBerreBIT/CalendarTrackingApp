import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import Icon from '@/components/ui/Icon'
import { quickFieldWrap, quickFieldInput } from '@/components/ui/Controls'
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
export default function QuickAddInput({ kind, placeholder, onAdd, small }: {
  kind: ListKind
  placeholder: string
  onAdd: (titles: string[]) => Promise<void>
  /** Desktop side-panel variant: 38px, white with a hairline */
  small?: boolean
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
      <label style={small ? { ...quickFieldWrap, height: 38, borderRadius: 9, gap: 8, padding: '0 10px', background: 'var(--bg)', border: '1px solid var(--border-2)' } : quickFieldWrap}>
        <Icon name="plus" size={small ? 15 : 18} sw={2} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
        <input
          ref={ref}
          data-bare
          value={value}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => update(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          maxLength={200}
          style={small ? { ...quickFieldInput, fontSize: 14 } : quickFieldInput}
        />
      </label>
      {error && <p role="alert" style={{ fontSize: 12.5, color: 'var(--danger)', margin: '6px 0 0' }}>{error}</p>}
    </div>
  )
}
