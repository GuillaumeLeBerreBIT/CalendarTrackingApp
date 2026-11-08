import { useEffect, useRef, useState } from 'react'
import { fieldStyle } from '@/components/ui/Controls'
import api from '@/api/client'
import Icon from '@/components/ui/Icon'
import Button from '@/components/ui/Button'
import { Pill } from '@/components/ui/Primitives'
import QuickAddInput, { errorText } from '@/components/QuickAddInput'
import { isSafeLink } from '@/lib/lists'
import type { Wishlist, WishItem } from '@/types'

const inputStyle: React.CSSProperties = fieldStyle
const errStyle: React.CSSProperties = { fontSize: 13, color: 'var(--danger)', margin: 0 }
const plainBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4,
  display: 'inline-flex', alignItems: 'center',
}

function ItemDetails({ item }: { item: WishItem }) {
  const safe = item.link && isSafeLink(item.link) ? item.link : null
  let host = ''
  if (safe) { try { host = new URL(safe).hostname.replace(/^www\./, '') } catch { host = safe } }
  if (!safe && !item.note) return null
  return (
    <span style={{ fontSize: 13, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', overflowWrap: 'anywhere' }}>
      {safe && (
        <a href={safe} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
          style={{ color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'underline' }}>
          <Icon name="external" size={12} sw={2} />{host}
        </a>
      )}
      {safe && item.note && <span>·</span>}
      {item.note && <span>{item.note}</span>}
    </span>
  )
}

function OwnerRow({ item, onSave, onRemove }: {
  item: WishItem
  onSave: (item: WishItem, patch: { title: string; link: string | null; note: string | null }) => Promise<string | null>
  onRemove: (item: WishItem) => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(item.title)
  const [link, setLink] = useState(item.link ?? '')
  const [note, setNote] = useState(item.note ?? '')
  const [error, setError] = useState('')

  async function save() {
    if (!title.trim()) { setError('Give it a name'); return }
    const err = await onSave(item, { title: title.trim(), link: link.trim() || null, note: note.trim() || null })
    if (err) setError(err)
    else { setError(''); setEditing(false) }
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0' }}>
        <input style={inputStyle} value={title} maxLength={200} aria-label="Title" onChange={(e) => setTitle(e.target.value)} />
        <input style={inputStyle} value={link} placeholder="Link (https://…)" aria-label="Link" onChange={(e) => setLink(e.target.value)} />
        <input style={inputStyle} value={note} placeholder="Note" aria-label="Note" onChange={(e) => setNote(e.target.value)} />
        {error && <p role="alert" style={errStyle}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setError('') }}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={save}>Save</Button>
        </div>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button type="button" aria-label={`Edit ${item.title}`}
        onClick={() => { setTitle(item.title); setLink(item.link ?? ''); setNote(item.note ?? ''); setEditing(true) }}
        style={{ ...plainBtn, flex: 1, minWidth: 0, flexDirection: 'column', alignItems: 'flex-start', gap: 2, textAlign: 'left', padding: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-1)', overflowWrap: 'anywhere' }}>{item.title}</span>
        <ItemDetails item={item} />
      </button>
      <button type="button" onClick={() => onRemove(item)} aria-label={`Remove ${item.title}`} style={{ ...plainBtn, width: 36, height: 36, justifyContent: 'center' }}>
        <Icon name="close" size={16} />
      </button>
    </div>
  )
}

export default function WishlistSection({ eventId }: { eventId: string | number }) {
  const [wl, setWl] = useState<Wishlist | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [itemError, setItemError] = useState('')
  const [creating, setCreating] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const pendingItems = useRef(new Set<string>())

  useEffect(() => {
    let live = true
    setLoaded(false); setWl(null); setError(''); setLoadError(''); setItemError('')
    api.get(`/events/${eventId}/wishlist`)
      .then(({ data }) => { if (live) setWl(data.wishlist ?? null) })
      .catch((err) => { if (live) setLoadError(errorText(err)) })
      .finally(() => { if (live) setLoaded(true) })
    return () => { live = false }
  }, [eventId, reload])

  const patchItem = (listId: string | undefined, id: string, fn: (i: WishItem) => WishItem) =>
    setWl((cur) => cur && cur.listId === listId ? { ...cur, items: cur.items.map((i) => (i.itemId === id ? fn(i) : i)) } : cur)

  async function create() {
    setCreating(true); setError('')
    try {
      const { data } = await api.post(`/events/${eventId}/wishlist`)
      setWl(data.wishlist)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setCreating(false)
    }
  }

  async function deleteWishlist() {
    if (!wl || !window.confirm('Delete this wishlist and all its items?')) return
    try {
      await api.delete(`/lists/${wl.listId}`)
      setWl(null)
    } catch (err) {
      setItemError(errorText(err))
    }
  }

  async function add(titles: string[]) {
    if (!wl) return
    const listId = wl.listId
    const { data } = await api.post(`/lists/${listId}/items`, { titles })
    const added: WishItem[] = data.items
    setWl((cur) => cur && cur.listId === listId ? { ...cur, items: [...cur.items, ...added.filter((a) => !cur.items.some((i) => i.itemId === a.itemId))] } : cur)
  }

  async function save(item: WishItem, patch: { title: string; link: string | null; note: string | null }): Promise<string | null> {
    if (pendingItems.current.has(item.itemId)) return 'Saving…'
    pendingItems.current.add(item.itemId)
    const listId = wl?.listId
    try {
      const { data } = await api.patch(`/lists/items/${item.itemId}`, patch)
      patchItem(listId, item.itemId, (i) => ({ ...i, ...data.item }))
      return null
    } catch (err) {
      return errorText(err)
    } finally {
      pendingItems.current.delete(item.itemId)
    }
  }

  async function remove(item: WishItem) {
    if (pendingItems.current.has(item.itemId)) return
    pendingItems.current.add(item.itemId)
    setItemError('')
    const listId = wl?.listId
    setWl((cur) => cur && { ...cur, items: cur.items.filter((i) => i.itemId !== item.itemId) })
    try {
      await api.delete(`/lists/items/${item.itemId}`)
    } catch (err) {
      setWl((cur) => cur && cur.listId === listId && !cur.items.some((i) => i.itemId === item.itemId) ? { ...cur, items: [...cur.items, item] } : cur)
      setItemError(errorText(err))
    } finally {
      pendingItems.current.delete(item.itemId)
    }
  }

  async function toggleClaim(item: WishItem) {
    if (pendingItems.current.has(item.itemId) || item.taken && !item.claimedByMe) return
    pendingItems.current.add(item.itemId)
    setItemError('')
    const listId = wl?.listId
    const prev = { taken: item.taken, claimedByMe: item.claimedByMe }
    const claiming = !item.claimedByMe
    patchItem(listId, item.itemId, (i) => ({ ...i, taken: claiming, claimedByMe: claiming }))
    try {
      if (claiming) await api.post(`/lists/items/${item.itemId}/claim`)
      else await api.delete(`/lists/items/${item.itemId}/claim`)
    } catch (err) {
      if (claiming && (err as { response?: { status?: number } })?.response?.status === 409) {
        patchItem(listId, item.itemId, (i) => ({ ...i, taken: true, claimedByMe: false }))
      } else {
        patchItem(listId, item.itemId, (i) => ({ ...i, ...prev }))
        setItemError(errorText(err))
      }
    } finally {
      pendingItems.current.delete(item.itemId)
    }
  }

  if (!loaded) return null
  if (loadError) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <p role="alert" style={errStyle}>Couldn't load the wishlist: {loadError}</p>
        <Button variant="ghost" size="sm" onClick={() => setReload((n) => n + 1)}>Retry</Button>
      </div>
    )
  }
  if (!wl) {
    return (
      <div style={{ padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, fontWeight: 600 }}><Icon name="gift" size={18} sw={1.8} />Wishlist</span>
        <Button variant="secondary" size="sm" onClick={create} disabled={creating}>Add a wishlist</Button>
        {error && <p role="alert" style={{ ...errStyle, width: '100%' }}>{error}</p>}
      </div>
    )
  }

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0 16px' }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-1)', overflowWrap: 'anywhere', letterSpacing: 0 }}>
          <Icon name="gift" size={18} sw={1.8} />
          {wl.isOwner ? 'Your wishlist' : `${wl.ownerName ?? 'Someone'}'s wishlist`}
        </h2>
        {wl.isOwner && (
          <button type="button" onClick={deleteWishlist} aria-label="Delete wishlist" style={{ ...plainBtn, width: 36, height: 36, justifyContent: 'center' }}>
            <Icon name="trash" size={16} />
          </button>
        )}
      </div>
      <p style={{ margin: '6px 16px 8px', fontSize: 13, color: 'var(--text-3)', lineHeight: 1.4 }}>
        {wl.isOwner
          ? 'Guests can reserve a gift. You never see who took what.'
          : `Reserve a gift so nobody buys the same thing. ${wl.ownerName ?? 'They'} never sees who took what.`}
      </p>
      {wl.isOwner && <div style={{ padding: '4px 16px 8px' }}><QuickAddInput kind="wishlist" placeholder="Add a wish, press Enter" onAdd={add} /></div>}
      {itemError && <p role="alert" style={{ ...errStyle, margin: '0 16px 8px' }}>{itemError}</p>}
      {wl.items.length === 0 && <p style={{ fontSize: 14, color: 'var(--text-3)', margin: '4px 16px' }}>Nothing on the wishlist yet.</p>}

      {wl.items.map((item, idx) => (
        <div key={item.itemId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', minHeight: 44, borderTop: idx ? '1px solid var(--border)' : 'none' }}>
          {wl.isOwner ? (
            <div style={{ flex: 1, minWidth: 0 }}><OwnerRow item={item} onSave={save} onRemove={remove} /></div>
          ) : (
            <>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-1)', overflowWrap: 'anywhere' }}>{item.title}</span>
                <ItemDetails item={item} />
              </div>
              {item.claimedByMe ? (
                <Pill on icon="check" onClick={() => toggleClaim(item)} title="You're getting this. Tap to undo">You · Undo</Pill>
              ) : item.taken ? (
                <span style={{ fontSize: 14, color: 'var(--text-3)', padding: '0 6px' }}>Taken</span>
              ) : (
                <Pill onClick={() => toggleClaim(item)}>I'll get this</Pill>
              )}
            </>
          )}
        </div>
      ))}
    </section>
  )
}
