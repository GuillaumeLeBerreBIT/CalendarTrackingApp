import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { fieldStyle } from '@/components/ui/Controls'
import Sheet from '@/components/ui/Sheet'
import api from '@/api/client'
import Icon from '@/components/ui/Icon'
import Button, { IconButton } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Primitives'
import { InsetGroup, InsetRow } from '@/components/ui/Controls'
import { Link } from 'react-router-dom'
import { groupColorFor } from '@/pages/GroupsPage'
import QuickAddInput, { errorText } from '@/components/QuickAddInput'

/** RLS hides writes a member may not make, which surfaces as 404; say why. */
function manageErrorText(err: unknown): string {
  const status = (err as { response?: { status?: number } })?.response?.status
  return status === 404 ? 'Only the creator or a group admin can change this list' : errorText(err)
}
import { splitDone } from '@/lib/lists'
import type { ShoppingList, ListItem } from '@/types'

const inputStyle: React.CSSProperties = fieldStyle
const labelStyle: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)',
  marginBottom: 6, display: 'block',
}
const errStyle: React.CSSProperties = { fontSize: 13, color: 'var(--danger)', margin: 0 }
const plainBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4,
  display: 'inline-flex', alignItems: 'center',
}

interface GroupOpt { id: string; title: string; color?: string }

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
    <Sheet title="New list" onClose={onClose} width={420}>
      <form onSubmit={save} style={{ padding: '18px 18px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
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
    </Sheet>
  )
}

function ItemRow({ item, onTick, onRemove, compact }: {
  item: ListItem
  onTick: (item: ListItem) => void
  onRemove: (item: ListItem) => void
  compact?: boolean
}) {
  return (
    <div className="row-hover" style={{ display: 'flex', alignItems: 'center', minHeight: compact ? 38 : 48, padding: compact ? '0 4px' : '0 8px 0 16px' }}>
      <button type="button" onClick={() => onTick(item)}
        aria-pressed={item.isDone}
        aria-label={item.isDone ? `Put ${item.title} back` : `Got ${item.title}`}
        style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: compact ? 10 : 12, border: 0, background: 'transparent', padding: '8px 0', textAlign: 'left', cursor: 'pointer' }}>
        <span style={{
          width: compact ? 18 : 22, height: compact ? 18 : 22, borderRadius: 11, flex: '0 0 auto', boxSizing: 'border-box',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: item.isDone ? 'none' : '1.5px solid var(--border-hi)',
          background: item.isDone ? 'var(--accent)' : 'transparent', color: 'var(--accent-text)',
        }}>
          {item.isDone && <Icon name="check" size={compact ? 10 : 12} sw={3.2} />}
        </span>
        <span style={{
          fontSize: compact ? 14 : 16, overflowWrap: 'anywhere',
          color: item.isDone ? 'var(--text-3)' : 'var(--text-1)',
          textDecoration: item.isDone ? 'line-through' : 'none',
        }}>{item.title}</span>
      </button>
      {!compact && (
        <button type="button" onClick={() => onRemove(item)} aria-label={`Remove ${item.title}`} style={{ ...plainBtn, width: 36, height: 36, justifyContent: 'center' }}>
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  )
}

function ListView({ list, patchItems, track, onRenamed, onRemoved, compact, groupColor }: {
  list: ShoppingList
  /** Functional update of this list's items against the latest state. */
  patchItems: (fn: (items: ListItem[]) => ListItem[]) => void
  /** Wraps a mutation so the parent knows one is pending. */
  track: <T>(p: Promise<T>) => Promise<T>
  onRenamed: (title: string) => void
  onRemoved: (listId: string) => void
  compact?: boolean
  groupColor: string
}) {
  const pendingItems = useRef(new Set<string>())
  const [showDone, setShowDone] = useState(true)
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

  const meta = [list.groupTitle ?? 'Just me', list.createdByName ? `by ${list.createdByName}` : null, `${open.length} to get`].filter(Boolean).join(' · ')

  if (compact) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2, gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: 0, color: 'var(--text-1)', overflowWrap: 'anywhere' }}>{list.title}</h2>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: groupColor }} />{list.groupTitle ?? 'Just me'}
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>Shopping{list.createdByName ? ` · by ${list.createdByName}` : ''}</div>
        <div style={{ marginBottom: 6 }}><QuickAddInput kind="shopping" small placeholder="Add item, paste a list" onAdd={add} /></div>
        {error && <p role="alert" style={errStyle}>{error}</p>}
        {[...open, ...done].map((i) => <ItemRow key={i.itemId} item={i} onTick={tick} onRemove={remove} compact />)}
        {open.length === 0 && done.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '6px 4px' }}>Nothing on this list yet.</p>}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '4px 8px 8px 16px' }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="page-title" style={{ fontSize: 22, overflowWrap: 'anywhere' }}>{list.title}</h1>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-3)' }}>{meta}</p>
        </div>
        <IconButton name="dots" size={44} isz={20} title="List options" onClick={() => setMenu(true)} />
      </div>

      <div style={{ padding: '0 16px 8px' }}>
        <QuickAddInput kind="shopping" placeholder="Add item, paste a whole list" onAdd={add} />
      </div>
      {error && <p role="alert" style={{ ...errStyle, margin: '0 16px 8px' }}>{error}</p>}

      {open.map((i) => <ItemRow key={i.itemId} item={i} onTick={tick} onRemove={remove} />)}
      {open.length === 0 && done.length === 0 && (
        <p style={{ fontSize: 14, color: 'var(--text-3)', margin: '12px 16px' }}>Nothing on this list yet.</p>
      )}

      {done.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 8px 0 16px', marginTop: 8, borderTop: '1px solid var(--border)' }}>
            <button type="button" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}
              style={{ ...plainBtn, height: 36, padding: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-2)', gap: 6 }}>
              <Icon name={showDone ? 'chevD' : 'chevR'} size={14} sw={2.2} />
              In the basket ({done.length})
            </button>
            <button type="button" onClick={clearDone} style={{ ...plainBtn, height: 36, padding: '0 8px', fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>Clear</button>
          </div>
          {showDone && done.map((i) => <ItemRow key={i.itemId} item={i} onTick={tick} onRemove={remove} />)}
        </>
      )}

      {menu && (
        <Sheet title={list.title} onClose={() => setMenu(false)}>
          <div style={{ padding: '12px 16px 24px' }}>
            <InsetGroup>
              <InsetRow first label="Rename list" chevron onClick={rename} />
              <InsetRow label={<span style={{ color: 'var(--danger)' }}>Delete list</span>} onClick={deleteList} />
            </InsetGroup>
          </div>
        </Sheet>
      )}
    </div>
  )
}

export default function ShoppingLists({ compact = false }: { compact?: boolean }) {
  const [lists, setLists] = useState<ShoppingList[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [groups, setGroups] = useState<GroupOpt[]>([])
  const [sheet, setSheet] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

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
        setGroups(data.userGroups.map((g: { groupInfo: { groupId: string | number; title: string; sharedColor?: string | null } }) => ({
          id: String(g.groupInfo.groupId), title: g.groupInfo.title,
          color: groupColorFor({ groups_id: g.groupInfo.groupId, shared_color: g.groupInfo.sharedColor }),
        })))
      })
      .catch(() => { /* "Just me" is still offered */ })
  }, [])

  const colorOf = (l: ShoppingList) => groups.find((g) => g.id === l.groupId)?.color ?? 'var(--text-1)'
  const current = lists?.find((l) => l.listId === selectedId) ?? lists?.[0] ?? null

  const view = current && (
    <ListView key={current.listId} list={current} track={track} compact={compact} groupColor={colorOf(current)}
      patchItems={(fn) => patchList(current.listId, (x) => ({ ...x, items: fn(x.items) }))}
      onRenamed={(title) => patchList(current.listId, (x) => ({ ...x, title }))}
      onRemoved={(id) => { setLists((cur) => (cur ?? []).filter((x) => x.listId !== id)); setSelectedId(null) }} />
  )

  return (
    <div>
      {loadError && <p role="alert" style={{ ...errStyle, margin: compact ? '0 0 8px' : '0 16px 8px' }}>{loadError}</p>}

      {lists === null ? (
        !loadError && <p style={{ fontSize: 14, color: 'var(--text-3)', padding: compact ? 0 : '12px 16px' }}>Loading…</p>
      ) : lists.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: compact ? 'flex-start' : 'center', padding: compact ? 0 : '32px 16px' }}>
          <p style={{ fontSize: 14, color: 'var(--text-3)' }}>No shopping lists yet.</p>
          <Button variant="secondary" icon="plus" onClick={() => setSheet(true)}>New shopping list</Button>
        </div>
      ) : compact ? (
        <>
          <div className="no-scrollbar" style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12 }}>
            {lists.length > 1 && lists.map((l) => (
              <Pill key={l.listId} on={l.listId === current?.listId} dot={colorOf(l)} onClick={() => setSelectedId(l.listId)}>{l.title}</Pill>
            ))}
            <Pill icon="plus" title="New shopping list" onClick={() => setSheet(true)}>{lists.length > 1 ? '' : 'New list'}</Pill>
          </div>
          {view}
          <Link to="/todo?tab=shopping" style={{ display: 'block', marginTop: 10, fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>All shopping lists →</Link>
        </>
      ) : (
        <>
          <div className="no-scrollbar" style={{ display: 'flex', gap: 8, padding: '4px 16px 12px', overflowX: 'auto' }}>
            {lists.map((l) => (
              <Pill key={l.listId} on={l.listId === current?.listId} dot={colorOf(l)} onClick={() => setSelectedId(l.listId)}>{l.title}</Pill>
            ))}
            <Pill icon="plus" title="New shopping list" onClick={() => setSheet(true)}>{''}</Pill>
          </div>
          {view}
        </>
      )}

      {sheet && (
        <NewListSheet groups={groups} onClose={() => setSheet(false)}
          onCreated={(list) => { setLists((cur) => [list, ...(cur ?? [])]); setSelectedId(list.listId); setSheet(false) }} />
      )}
    </div>
  )
}
