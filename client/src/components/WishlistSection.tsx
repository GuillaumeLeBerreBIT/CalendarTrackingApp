import { useEffect, useRef, useState } from 'react'
import api from '@/api/client'
import Icon from '@/components/ui/Icon'
import Button from '@/components/ui/Button'
import QuickAddInput, { errorText } from '@/components/QuickAddInput'
import { isSafeLink } from '@/lib/lists'
import type { Wishlist, WishItem } from '@/types'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 'var(--r-sm)',
  border: '1px solid var(--border-2)', background: 'var(--surface-2)',
  color: 'var(--text-1)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
}
const errStyle: React.CSSProperties = { fontSize: 13, color: 'var(--danger, #ef4444)', margin: 0 }
const plainBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4,
  display: 'inline-flex', alignItems: 'center',
}

function ItemDetails({ item }: { item: WishItem }) {
  return (
    <>
      {item.link && isSafeLink(item.link) && (
        <a href={item.link} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 12.5, color: 'var(--accent)', overflowWrap: 'anywhere' }}>
          {item.link}
        </a>
      )}
      {item.note && <span style={{ fontSize: 12.5, color: 'var(--text-3)', overflowWrap: 'anywhere' }}>{item.note}</span>}
    </>
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <button type="button" aria-label={`Edit ${item.title}`}
        onClick={() => { setTitle(item.title); setLink(item.link ?? ''); setNote(item.note ?? ''); setEditing(true) }}
        style={{ ...plainBtn, flex: 1, minWidth: 0, flexDirection: 'column', alignItems: 'flex-start', gap: 2, textAlign: 'left', padding: '6px 0' }}>
        <span style={{ fontSize: 14.5, color: 'var(--text-1)', overflowWrap: 'anywhere' }}>{item.title}</span>
      </button>
      <button type="button" onClick={() => onRemove(item)} aria-label={`Remove ${item.title}`} style={plainBtn}>
        <Icon name="close" size={16} />
      </button>
    </div>
  )
}

export default function WishlistSection({ eventId, taskId }: { eventId?: string | number; taskId?: string | number }) {
  const endpoint = taskId != null ? `/tasks/${taskId}/wishlist` : `/events/${eventId}/wishlist`
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
    api.get(endpoint)
      .then(({ data }) => { if (live) setWl(data.wishlist ?? null) })
      .catch((err) => { if (live) setLoadError(errorText(err)) })
      .finally(() => { if (live) setLoaded(true) })
    return () => { live = false }
  }, [endpoint, reload])

  const patchItem = (listId: string | undefined, id: string, fn: (i: WishItem) => WishItem) =>
    setWl((cur) => cur && cur.listId === listId ? { ...cur, items: cur.items.map((i) => (i.itemId === id ? fn(i) : i)) } : cur)

  async function create() {
    setCreating(true); setError('')
    try {
      const { data } = await api.post(endpoint)
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

  if (!loaded) return <p role="status" style={{ fontSize: 13, color: 'var(--text-3)' }}>Loading wishlist…</p>
  if (loadError) {
    return (
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <p role="alert" style={errStyle}>Couldn't load the wishlist: {loadError}</p>
        <Button variant="ghost" size="sm" onClick={() => setReload((n) => n + 1)}>Retry</Button>
      </div>
    )
  }
  if (!wl) {
    return (
      <div style={{ marginTop: 16 }}>
        <Button variant="soft" size="md" icon="plus" onClick={create} disabled={creating}>Add a wishlist</Button>
        {error && <p role="alert" style={{ ...errStyle, marginTop: 8 }}>{error}</p>}
      </div>
    )
  }

  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h4 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)', margin: 0, overflowWrap: 'anywhere' }}>
          {wl.ownerName ?? 'Someone'}'s wishlist
        </h4>
        {wl.isOwner && (
          <button type="button" onClick={deleteWishlist} aria-label="Delete wishlist" style={plainBtn}>
            <Icon name="trash" size={16} />
          </button>
        )}
      </div>

      {wl.isOwner && <QuickAddInput kind="wishlist" placeholder="Add something you'd like" onAdd={add} />}
      {itemError && <p role="alert" style={errStyle}>{itemError}</p>}

      {wl.items.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>Nothing on the wishlist yet.</p>}

      {wl.items.map((item) => wl.isOwner ? (
        <div key={item.itemId}>
          <OwnerRow item={item} onSave={save} onRemove={remove} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><ItemDetails item={item} /></div>
        </div>
      ) : (
        <div key={item.itemId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 14.5, color: 'var(--text-1)', overflowWrap: 'anywhere' }}>{item.title}</span>
            <ItemDetails item={item} />
          </div>
          {item.claimedByMe ? (
            <Button variant="outline" size="sm" style={{ flexShrink: 0 }} onClick={() => toggleClaim(item)}>You're getting this — undo</Button>
          ) : item.taken ? (
            <Button variant="ghost" size="sm" style={{ flexShrink: 0 }} disabled>Taken</Button>
          ) : (
            <Button variant="soft" size="sm" style={{ flexShrink: 0 }} onClick={() => toggleClaim(item)}>I'll get this</Button>
          )}
        </div>
      ))}
    </div>
  )
}
