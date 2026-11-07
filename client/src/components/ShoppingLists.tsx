import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import api from '@/api/client'
import Icon from '@/components/ui/Icon'
import Button from '@/components/ui/Button'
import { Empty } from '@/components/ui/Primitives'
import QuickAddInput, { errorText } from '@/components/QuickAddInput'

/** RLS hides writes a member may not make, which surfaces as 404; say why. */
function manageErrorText(err: unknown): string {
  const status = (err as { response?: { status?: number } })?.response?.status
  return status === 404 ? 'Only the creator or a group admin can change this list' : errorText(err)
}
import { splitDone } from '@/lib/lists'
import type { ShoppingList, ListItem } from '@/types'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 'var(--r-sm)',
  border: '1px solid var(--border-2)', background: 'var(--surface-2)',
  color: 'var(--text-1)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)',
  marginBottom: 6, display: 'block',
}
const errStyle: React.CSSProperties = { fontSize: 13, color: 'var(--danger)', margin: 0 }
const plainBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4,
  display: 'inline-flex', alignItems: 'center',
}

interface GroupOpt { id: string; title: string }

function NewListSheet({ groups, onClose, onCreated }: {
  groups: GroupOpt[]
  onClose: () => void
  onCreated: (list: ShoppingList) => void
}) {
  const [title, setTitle] = useState('')
  const [chosen, setChosen] = useState<string | null>(null)
  const groupId = chosen ?? groups[0]?.id ?? ''
  const setGroupId = setChosen
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Give the list a name'); return }
    setSaving(true)
    setError('')
    try {
      const { data } = await api.post('/lists', { title: title.trim(), groupId: groupId || null })
      onCreated(data.list)
    } catch (err) {
      setError(errorText(err))
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center', padding: isMobile ? 0 : 16,
        background: 'hsl(0 0% 0% / 0.5)',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <form onSubmit={save} style={{
        width: '100%', maxWidth: 440, margin: '0 auto', background: 'var(--surface)',
        borderRadius: isMobile ? 'var(--r-lg) var(--r-lg) 0 0' : 'var(--r-lg)',
        boxShadow: isMobile ? undefined : 'var(--shadow-lg)',
        padding: isMobile ? '20px 20px 32px' : 24, display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>New list</h3>
          <button type="button" onClick={onClose} aria-label="Close" style={plainBtn}><Icon name="close" size={20} /></button>
        </div>
        <div>
          <label style={labelStyle} htmlFor="shop-title">Name</label>
          <input id="shop-title" style={inputStyle} placeholder="e.g. Groceries" value={title}
            maxLength={200} autoFocus onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle} htmlFor="shop-group">Where</label>
          <select id="shop-group" style={{ ...inputStyle, cursor: 'pointer' }} value={groupId}
            onChange={(e) => setGroupId(e.target.value)}>
            <option value="">Just me</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </div>
        {error && <p role="alert" style={errStyle}>{error}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="md" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="md" type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create list'}</Button>
        </div>
      </form>
    </div>
  )
}

function ItemRow({ item, onTick, onRemove }: {
  item: ListItem
  onTick: (item: ListItem) => void
  onRemove: (item: ListItem) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <button type="button" onClick={() => onTick(item)}
        aria-label={item.isDone ? `Restore ${item.title}` : `Tick off ${item.title}`}
        style={{ ...plainBtn, flex: 1, minWidth: 0, gap: 10, textAlign: 'left', padding: '6px 0', justifyContent: 'flex-start' }}>
        <span style={{
          width: 18, height: 18, borderRadius: 5, flex: '0 0 auto', display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center',
          border: '1.5px solid var(--border-2)',
          background: item.isDone ? 'var(--accent)' : 'transparent', color: 'var(--accent-text)',
        }}>
          {item.isDone && <Icon name="check" size={12} />}
        </span>
        <span style={{
          fontSize: 14.5, overflowWrap: 'anywhere',
          color: item.isDone ? 'var(--text-3)' : 'var(--text-1)',
          textDecoration: item.isDone ? 'line-through' : 'none',
        }}>{item.title}</span>
      </button>
      <button type="button" onClick={() => onRemove(item)} aria-label={`Remove ${item.title}`} style={plainBtn}>
        <Icon name="close" size={16} />
      </button>
    </div>
  )
}

function ListCard({ list, patchItems, track, onRenamed, onRemoved }: {
  list: ShoppingList
  /** Functional update of this list's items against the latest state. */
  patchItems: (fn: (items: ListItem[]) => ListItem[]) => void
  /** Wraps a mutation so the parent knows one is pending. */
  track: <T>(p: Promise<T>) => Promise<T>
  onRenamed: (title: string) => void
  onRemoved: (listId: string) => void
}) {
  const pendingItems = useRef(new Set<string>())
  const [showDone, setShowDone] = useState(false)
  const [menu, setMenu] = useState(false)
  const [error, setError] = useState('')
  const { open, done } = splitDone(list.items)

  const setDone = (id: string, isDone: boolean) =>
    patchItems((items) => items.map((i) => (i.itemId === id ? { ...i, isDone } : i)))

  async function tick(item: ListItem) {
    if (pendingItems.current.has(item.itemId)) return
    pendingItems.current.add(item.itemId)
    const prev = item.isDone
    const target = !prev
    setError('')
    setDone(item.itemId, target)
    try {
      await track(api.patch(`/lists/items/${item.itemId}`, { isDone: target }))
    } catch (err) {
      setDone(item.itemId, prev)
      setError(errorText(err))
    } finally {
      pendingItems.current.delete(item.itemId)
    }
  }

  async function remove(item: ListItem) {
    if (pendingItems.current.has(item.itemId)) return
    pendingItems.current.add(item.itemId)
    setError('')
    patchItems((items) => items.filter((i) => i.itemId !== item.itemId))
    try {
      await track(api.delete(`/lists/items/${item.itemId}`))
    } catch (err) {
      patchItems((items) => (items.some((i) => i.itemId === item.itemId) ? items : [...items, item]))
      setError(errorText(err))
    } finally {
      pendingItems.current.delete(item.itemId)
    }
  }

  async function add(titles: string[]) {
    const { data } = await track(api.post(`/lists/${list.listId}/items`, { titles }))
    const added: ListItem[] = data.items
    patchItems((items) => [...items, ...added.filter((a) => !items.some((i) => i.itemId === a.itemId))])
  }

  async function clearDone() {
    setError('')
    try {
      await track(api.delete(`/lists/${list.listId}/items/done`))
      patchItems((items) => items.filter((i) => !i.isDone))
    } catch (err) {
      setError(errorText(err))
    }
  }

  async function rename() {
    setMenu(false)
    const next = window.prompt('Rename list', list.title)?.trim()
    if (!next || next === list.title) return
    try {
      await track(api.patch(`/lists/${list.listId}`, { title: next }))
      onRenamed(next)
    } catch (err) {
      setError(manageErrorText(err))
    }
  }

  async function deleteList() {
    setMenu(false)
    if (!window.confirm(`Delete "${list.title}" and all its items?`)) return
    try {
      await track(api.delete(`/lists/${list.listId}`))
      onRemoved(list.listId)
    } catch (err) {
      setError(manageErrorText(err))
    }
  }

  return (
    <div style={{
      background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
      padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, position: 'relative' }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0, overflowWrap: 'anywhere' }}>{list.title}</h3>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '3px 0 0' }}>
            {list.groupTitle ?? 'Just me'}{list.createdByName ? ` · by ${list.createdByName}` : ''}
          </p>
        </div>
        <button type="button" onClick={() => setMenu((m) => !m)} aria-label="List options" style={plainBtn}>
          <Icon name="dots" size={20} />
        </button>
        {menu && (
          <div style={{
            position: 'absolute', right: 0, top: 30, zIndex: 5, background: 'var(--surface-hi)',
            border: '1px solid var(--border-2)', borderRadius: 'var(--r-sm)', boxShadow: 'var(--shadow-lg)',
            display: 'flex', flexDirection: 'column', minWidth: 130, padding: 4,
          }}>
            <Button variant="ghost" size="sm" icon="edit" onClick={rename} style={{ justifyContent: 'flex-start' }}>Rename</Button>
            <Button variant="ghost" size="sm" icon="trash" onClick={deleteList} style={{ justifyContent: 'flex-start' }}>Delete</Button>
          </div>
        )}
      </div>

      <QuickAddInput kind="shopping" placeholder="Add an item (paste a list to add many)" onAdd={add} />

      {error && <p role="alert" style={errStyle}>{error}</p>}

      <div>
        {open.map((i) => <ItemRow key={i.itemId} item={i} onTick={tick} onRemove={remove} />)}
        {open.length === 0 && done.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>Nothing on this list yet.</p>
        )}
      </div>

      {done.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button type="button" onClick={() => setShowDone((s) => !s)} aria-expanded={showDone}
              style={{ ...plainBtn, fontSize: 13, fontWeight: 650, color: 'var(--text-2)', gap: 6 }}>
              <Icon name="chevron-down" size={14} style={{ transform: showDone ? 'none' : 'rotate(-90deg)' }} />
              Done ({done.length})
            </button>
            <Button variant="ghost" size="sm" onClick={clearDone}>Clear done</Button>
          </div>
          {showDone && done.map((i) => <ItemRow key={i.itemId} item={i} onTick={tick} onRemove={remove} />)}
        </div>
      )}
    </div>
  )
}

export default function ShoppingLists() {
  const [lists, setLists] = useState<ShoppingList[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [groups, setGroups] = useState<GroupOpt[]>([])
  const [sheet, setSheet] = useState(false)

  const seq = useRef(0)
  const pending = useRef(0)

  const load = useCallback(() => {
    if (pending.current > 0) return // a refetch would clobber optimistic state
    const mine = ++seq.current
    api.get('/lists')
      .then(({ data }) => {
        if (mine !== seq.current || pending.current > 0) return
        setLists(data.lists ?? []); setLoadError('')
      })
      .catch((err) => {
        if (mine !== seq.current) return
        setLists((cur) => { if (cur === null) setLoadError(errorText(err)); return cur })
      })
  }, [])

  const track = useCallback(async <T,>(p: Promise<T>): Promise<T> => {
    pending.current++
    seq.current++ // invalidate any refetch already in flight
    try { return await p } finally { pending.current-- }
  }, [])

  const patchList = (id: string, fn: (l: ShoppingList) => ShoppingList) =>
    setLists((cur) => (cur ?? []).map((x) => (x.listId === id ? fn(x) : x)))

  useEffect(() => {
    load()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  useEffect(() => {
    api.get('/groups')
      .then(({ data }) => {
        if (!data.success || !Array.isArray(data.userGroups)) return
        setGroups(data.userGroups.map((g: { groupInfo: { groupId: string | number; title: string } }) => ({
          id: String(g.groupInfo.groupId), title: g.groupInfo.title,
        })))
      })
      .catch(() => { /* "Just me" is still offered */ })
  }, [])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Shopping</h2>
        <Button variant="primary" icon="plus" size="md" onClick={() => setSheet(true)}>New list</Button>
      </div>

      {loadError && <p role="alert" style={{ ...errStyle, marginBottom: 12 }}>{loadError}</p>}

      {lists === null ? (
        !loadError && <p style={{ fontSize: 13.5, color: 'var(--text-3)' }}>Loading…</p>
      ) : lists.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <div style={{ width: '100%' }}><Empty text="No shopping lists yet. Create one to get started." /></div>
          <Button variant="soft" icon="plus" size="md" onClick={() => setSheet(true)}>New list</Button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {lists.map((l) => (
            <ListCard key={l.listId} list={l} track={track}
              patchItems={(fn) => patchList(l.listId, (x) => ({ ...x, items: fn(x.items) }))}
              onRenamed={(title) => patchList(l.listId, (x) => ({ ...x, title }))}
              onRemoved={(id) => setLists((cur) => (cur ?? []).filter((x) => x.listId !== id))} />
          ))}
        </div>
      )}

      {sheet && (
        <NewListSheet groups={groups} onClose={() => setSheet(false)}
          onCreated={(list) => { setLists((cur) => [list, ...(cur ?? [])]); setSheet(false) }} />
      )}
    </div>
  )
}
