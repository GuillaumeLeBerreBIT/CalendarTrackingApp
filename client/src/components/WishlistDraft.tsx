import Button from '@/components/ui/Button'
import { Switch } from '@/components/ui/Controls'

export type GiftDraft = { title: string; link: string; note: string }

const field: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px', fontSize: 16,
  borderRadius: 'var(--r-sm)', border: '1px solid var(--border-2)',
  background: 'var(--bg)', color: 'var(--text-1)', minHeight: 44, fontFamily: 'inherit',
}

export default function WishlistDraft({ enabled, onEnabled, items, onChange, disabled }: {
  enabled: boolean; onEnabled: (value: boolean) => void
  items: GiftDraft[]; onChange: (items: GiftDraft[]) => void; disabled: boolean
}) {
  function patch(index: number, key: keyof GiftDraft, value: string) {
    onChange(items.map((item, i) => i === index ? { ...item, [key]: value } : item))
  }
  return (
    <fieldset disabled={disabled} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14.5, color: 'var(--text-1)', minHeight: 36 }}>
        <span style={{ flex: 1 }}>Add a wishlist to this event</span>
        <Switch checked={enabled} onChange={onEnabled} label="Add a wishlist" disabled={disabled} />
      </div>
      {enabled && (
        <div id="event-wishlist-draft" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-3)' }}>
            Share gift ideas with people who can see this event. They can reserve gifts; you won’t see what they’ve chosen.
          </p>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600 }}>Gift {i + 1}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange(items.filter((_, n) => n !== i))} title={`Remove gift ${i + 1}`}>Remove</Button>
              </div>
              <input style={field} required maxLength={200} aria-label={`Gift ${i + 1} name`} placeholder="What would you like?" value={item.title} onChange={e => patch(i, 'title', e.target.value)} />
              <input style={field} type="url" maxLength={2000} aria-label={`Gift ${i + 1} link`} placeholder="Link (optional)" value={item.link} onChange={e => patch(i, 'link', e.target.value)} />
              <textarea style={{ ...field, resize: 'vertical' }} rows={2} maxLength={1000} aria-label={`Gift ${i + 1} note`} placeholder="Size, color, or other details (optional)" value={item.note} onChange={e => patch(i, 'note', e.target.value)} />
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" icon="plus" disabled={items.length >= 100} onClick={() => onChange([...items, { title: '', link: '', note: '' }])}>Add gift idea</Button>
          {items.length === 0 && <p style={{ margin: 0, fontSize: 12, color: 'var(--text-3)' }}>You can also add gifts after saving.</p>}
        </div>
      )}
    </fieldset>
  )
}
