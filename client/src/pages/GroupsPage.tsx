import { useEffect, useState, type FormEvent } from 'react'
import { fieldStyle } from '@/components/ui/Controls'
import { SheetDialog as Modal } from '@/components/ui/Sheet'
import { useNavigate } from 'react-router-dom'
import api from '@/api/client'
import type { Group, Invite } from '@/types'
import Icon from '@/components/ui/Icon'
import { AvatarStack } from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import { Empty } from '@/components/ui/Primitives'
import GroupDeletePreview from '@/components/GroupDeletePreview'

export const GROUP_COLOR_PALETTE = ['#f59e0b', '#ec4899', '#22d3aa', '#38bdf8', '#c084fc', '#818cf8']
export function groupColorByIndex(idx: number) {
  return GROUP_COLOR_PALETTE[idx % GROUP_COLOR_PALETTE.length]
}

/** Stable hash of the group id → palette index. Unlike position-based cycling,
 *  a group keeps its color when the list reorders or other groups are deleted. */
export function groupColorById(groupsId: string | number) {
  const s = String(groupsId)
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0
  return GROUP_COLOR_PALETTE[Math.abs(hash) % GROUP_COLOR_PALETTE.length]
}

/** Creator-picked shared color when set, stable hash fallback otherwise. */
export function groupColorFor(group: { groups_id: string | number; shared_color?: string | null }) {
  return group.shared_color || groupColorById(group.groups_id)
}

// ── Group card ────────────────────────────────────────────────────────────────
interface GroupCardProps {
  group: Group
  onClick: () => void
}

function GroupCard({ group, onClick, selectMode, selected }: GroupCardProps & { selectMode?: boolean; selected?: boolean }) {
  const color = groupColorFor(group)
  const memberCount = group.members?.length ?? 0
  const upcomingEvents = group.totalEvents ?? 0
  const openTasks = Math.max(0, (group.totalTasks?.all ?? 0) - (group.totalTasks?.completed ?? 0))
  const members = group.members ?? []
  const memberIds = members.map((m) => m.user_id)
  const memberNames: Record<string, string> = {}
  members.forEach((m) => { if (m.username) memberNames[m.user_id] = m.username })
  const meta = [
    `${memberCount} member${memberCount === 1 ? '' : 's'}`,
    upcomingEvents ? `${upcomingEvents} upcoming` : null,
    openTasks ? `${openTasks} open task${openTasks === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selectMode ? selected : undefined}
      className="row-hover"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 64, padding: '10px 16px',
        border: 0, borderTop: '1px solid var(--divider)', background: 'transparent', textAlign: 'left',
        color: 'var(--text-1)', cursor: 'pointer',
      }}
    >
      {selectMode && (
        <span style={{
          width: 22, height: 22, borderRadius: 11, flex: '0 0 22px', boxSizing: 'border-box',
          border: selected ? 'none' : '1.5px solid var(--border-hi)', background: selected ? 'var(--accent)' : 'transparent',
          color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{selected && <Icon name="check" size={12} sw={3.2} />}</span>
      )}
      <span style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: color, flex: '0 0 3px' }} />
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.groups_title}</span>
        <span style={{ fontSize: 13, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</span>
      </span>
      <AvatarStack ids={memberIds} names={memberNames} size={26} max={3} ringColor="var(--fill)" />
      {!selectMode && <Icon name="chevR" size={14} sw={2} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
    </button>
  )
}


// ── Invite card ───────────────────────────────────────────────────────────────
function InviteCard({ inv, onAccept, onDecline }: { inv: Invite; onAccept: () => void; onDecline: () => void }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      padding: '14px 16px',
      borderRadius: 'var(--r-lg)',
      background: 'var(--fill)',
      border: '1px solid var(--border-2)',
      flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 'var(--r-sm)',
          background: 'var(--fill)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon name="bell" size={16} style={{ color: 'var(--text-1)' }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 650, color: 'var(--text-1)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {inv.groups_title}
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>
            #{inv.tag_name} · Invite pending
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <Button variant="soft" size="sm" icon="check" onClick={onAccept}>
          Accept
        </Button>
        <Button variant="ghost" size="sm" icon="close" onClick={onDecline}>
          Decline
        </Button>
      </div>
    </div>
  )
}

// ── Modal shell ───────────────────────────────────────────────────────────────

// ── Input / label helper styles ───────────────────────────────────────────────
const inputStyle: React.CSSProperties = fieldStyle

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12.5,
  fontWeight: 650,
  color: 'var(--text-2)',
  marginBottom: 6,
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function GroupsPage() {
  const navigate = useNavigate()
  const [groups, setGroups] = useState<Group[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ 'group-title': '', 'group-description': '', 'tag-name': '', 'shared-color': '' })
  const [creating, setCreating] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null)

  async function load() {
    setError(null)
    try {
      const { data } = await api.get('/groups')
      if (data.success) {
        // Backend members shape: [{ user_id, profile: { username, email }, role }]
        type RawMember = { user_id: string; role?: string; profile?: { username?: string; email?: string } }
        // Merge groupInfo with top-level fields (members, events, todoLists, totalEvents)
        type RawTotalTasks = { all: number; completed: number } | null
        const mapped: Group[] = data.userGroups.map((g: { groupInfo: { groupId: string; title: string; description: string; tag: string; sharedColor?: string | null; created_at?: string; totalTasks?: RawTotalTasks; progressWidth?: number }; members: RawMember[]; events: Group['events']; todoLists: Group['todoLists']; totalEvents: number }) => ({
          groups_id: String(g.groupInfo.groupId),
          groups_title: g.groupInfo.title,
          groups_description: g.groupInfo.description,
          tag_name: g.groupInfo.tag,
          shared_color: g.groupInfo.sharedColor ?? null,
          members: (g.members ?? []).map((m): NonNullable<Group['members']>[number] => ({
            user_id: m.user_id,
            username: m.profile?.username ?? '',
            email: m.profile?.email ?? '',
            role: m.role ?? '',
          })),
          events: g.events,
          todoLists: g.todoLists,
          totalEvents: g.totalEvents,
          totalTasks: g.groupInfo.totalTasks ?? { all: 0, completed: 0 },
        }))
        setGroups(mapped)
        setInvites(data.userInvites ?? [])
      } else {
        setError('Failed to load groups. Please try again.')
      }
    } catch (err: unknown) {
      // 401 is handled globally by the api interceptor; surface all other errors
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status !== 401) {
        setError('Something went wrong loading your groups. Please refresh.')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function acceptInvite(groupId: string) {
    await api.post('/acceptInviteGroup', { groupId })
    load()
  }

  async function declineInvite(groupId: string) {
    await api.post('/declineInviteGroup', { groupId })
    load()
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      await api.post('/createGroup', form)
      setCreateOpen(false)
      setForm({ 'group-title': '', 'group-description': '', 'tag-name': '', 'shared-color': '' })
      load()
    } finally {
      setCreating(false)
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  async function handleBulkDelete() {
    setBulkDeleting(true)
    setBulkDeleteError(null)
    const ids = [...selectedIds]
    const results = await Promise.allSettled(ids.map(id => api.delete(`/groups/${id}`)))
    const failedIds = ids.filter((_, i) => results[i].status === 'rejected')
    setBulkDeleting(false)
    load()
    if (failedIds.length === 0) {
      setShowDeleteConfirm(false)
      exitSelectMode()
      return
    }
    // Keep the failed groups selected and say which ones, with the server's reason.
    const first = results.find(r => r.status === 'rejected') as PromiseRejectedResult
    const reason = (first.reason as { response?: { data?: { error?: string } } })?.response?.data?.error
    const names = groups.filter(g => failedIds.includes(g.groups_id)).map(g => g.groups_title).join(', ')
    setSelectedIds(new Set(failedIds))
    setBulkDeleteError(reason ? `${names}: ${reason}` : `Could not delete ${names}.`)
  }

  return (
    <div className="page-body">
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 20 }}>
        <div>
          <h1 className="page-title">Groups</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '2px 0 0' }}>
            {selectMode
              ? `${selectedIds.size} selected`
              : `${groups.length} group${groups.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {selectMode ? (
            <>
              <Button variant="ghost" size="sm" onClick={exitSelectMode}>Cancel</Button>
              <Button
                variant="danger"
                size="sm"
                icon="trash"
                onClick={() => { setBulkDeleteError(null); setShowDeleteConfirm(true) }}
                disabled={selectedIds.size === 0}
              >
                Delete {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setSelectMode(true)}>Select</Button>
              <Button variant="primary" icon="plus" size="sm" onClick={() => setCreateOpen(true)}>
                New group
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-3)', marginBottom: 12 }}>
            Pending invites
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {invites.map((inv) => (
              <InviteCard
                key={inv.groups_id}
                inv={inv}
                onAccept={() => acceptInvite(inv.groups_id)}
                onDecline={() => declineInvite(inv.groups_id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Inline error */}
      {error && (
        <div style={{
          marginBottom: 20,
          padding: '12px 16px',
          borderRadius: 'var(--r-md)',
          background: 'color-mix(in srgb, var(--danger) 8%, transparent)',
          border: '1px solid color-mix(in srgb, var(--danger) 25%, transparent)',
          color: 'var(--text-1)',
          fontSize: 13.5,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <Icon name="bell" size={16} style={{ color: 'var(--danger)', flexShrink: 0 }} />
          {error}
        </div>
      )}

      {/* Groups grid */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ height: 64, borderRadius: 12 }} />
          ))}
        </div>
      ) : groups.length === 0 && invites.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 32 }}>
          <Empty text="You haven't joined any groups yet." />
          <div style={{ marginTop: 16 }}>
            <Button variant="primary" icon="plus" size="md" onClick={() => setCreateOpen(true)}>
              Create your first group
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ background: 'var(--fill)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ marginTop: -1 }}>
            {groups.map((g) => (
              <GroupCard
                key={g.groups_id}
                group={g}
                selectMode={selectMode}
                selected={selectedIds.has(g.groups_id)}
                onClick={() => selectMode ? toggleSelect(g.groups_id) : navigate(`/groups/${g.groups_id}`)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Create group modal */}
      {createOpen && (
        <Modal title="New group" onClose={() => setCreateOpen(false)}>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Group name</label>
              <input
                required
                value={form['group-title']}
                onChange={(e) => setForm((p) => ({ ...p, 'group-title': e.target.value }))}
                style={inputStyle}
                placeholder="My group"
              />
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <textarea
                value={form['group-description']}
                onChange={(e) => setForm((p) => ({ ...p, 'group-description': e.target.value }))}
                style={{ ...inputStyle, resize: 'none' }}
                rows={2}
                placeholder="What's this group about?"
              />
            </div>
            <div>
              <label style={labelStyle}>Tag name</label>
              <input
                required
                value={form['tag-name']}
                onChange={(e) => setForm((p) => ({ ...p, 'tag-name': e.target.value }))}
                style={inputStyle}
                placeholder="my-tag"
              />
            </div>
            <div>
              <label style={labelStyle}>Color</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {GROUP_COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, 'shared-color': p['shared-color'] === c ? '' : c }))}
                    aria-label={`Group color ${c}`}
                    style={{
                      width: 28, height: 28, borderRadius: '50%', background: c,
                      border: form['shared-color'] === c ? '3px solid var(--text-1)' : '2px solid transparent',
                      outline: form['shared-color'] === c ? '2px solid var(--accent)' : 'none',
                      outlineOffset: 2,
                      cursor: 'pointer', flexShrink: 0, transition: 'var(--transition)',
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={form['shared-color'] || '#818cf8'}
                  onChange={(e) => setForm((p) => ({ ...p, 'shared-color': e.target.value }))}
                  title="Custom color"
                  style={{ width: 28, height: 28, padding: 0, border: '1px solid var(--border-2)', borderRadius: '50%', background: 'transparent', cursor: 'pointer' }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
              <Button type="submit" variant="primary" full disabled={creating}>
                {creating ? 'Creating…' : 'Create group'}
              </Button>
              <Button type="button" variant="secondary" full onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Bulk delete confirmation modal */}
      {showDeleteConfirm && (
        <div
          onClick={() => !bulkDeleting && setShowDeleteConfirm(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)',
              borderRadius: 'var(--r-lg)',
              border: '1px solid var(--border)',
              padding: 28,
              maxWidth: 420,
              width: '100%',
              boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            }}
          >
            {/* Icon */}
            <div style={{
              width: 48, height: 48, borderRadius: 'var(--r-md)',
              background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--danger) 25%, transparent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 20,
            }}>
              <Icon name="trash" size={22} style={{ color: 'var(--danger)' }} />
            </div>

            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
              Delete {selectedIds.size} group{selectedIds.size !== 1 ? 's' : ''}?
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text-2)', margin: '0 0 24px', lineHeight: 1.6 }}>
              This will permanently delete {selectedIds.size === 1 ? 'this group' : 'these groups'} along with
              all their events, tasks, and members. <strong style={{ color: 'var(--text-1)' }}>This cannot be undone.</strong>
            </p>

            {/* Group names list */}
            <div style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              padding: '10px 14px',
              marginBottom: 24,
              maxHeight: 260,
              overflowY: 'auto',
            }}>
              {groups.filter(g => selectedIds.has(g.groups_id)).map(g => (
                <div key={g.groups_id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  padding: '4px 0',
                  fontSize: 13.5, color: 'var(--text-1)',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--danger)', flexShrink: 0, marginTop: 7 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span>{g.groups_title}</span>
                    <GroupDeletePreview groupId={g.groups_id} />
                  </div>
                </div>
              ))}
            </div>

            {bulkDeleteError && (
              <p role="alert" style={{ fontSize: 13, color: 'var(--danger)', margin: '-12px 0 16px' }}>{bulkDeleteError}</p>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <Button
                variant="danger"
                full
                disabled={bulkDeleting}
                onClick={handleBulkDelete}
              >
                {bulkDeleting ? 'Deleting…' : `Yes, delete ${selectedIds.size > 1 ? 'all' : 'it'}`}
              </Button>
              <Button
                variant="ghost"
                full
                disabled={bulkDeleting}
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
