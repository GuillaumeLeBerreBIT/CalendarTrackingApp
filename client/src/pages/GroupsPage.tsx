import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/api/client'
import type { Group, Invite } from '@/types'
import Icon from '@/components/ui/Icon'
import { AvatarStack } from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import { Progress, Stat, Empty } from '@/components/ui/Primitives'

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

// ── Striped image-placeholder overlay ────────────────────────────────────────
function ImgPh({ opacity = 0.25 }: { opacity?: number }) {
  return (
    <svg
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity }}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern id="stripes" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="9" height="18" fill="rgba(255,255,255,0.18)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#stripes)" />
    </svg>
  )
}

// ── Group card ────────────────────────────────────────────────────────────────
interface GroupCardProps {
  group: Group
  onClick: () => void
}

function GroupCard({ group, onClick }: GroupCardProps) {
  const [hovered, setHovered] = useState(false)
  const color = groupColorFor(group)
  const letter = group.groups_title?.[0]?.toUpperCase() ?? 'G'

  const memberCount = group.members?.length ?? 0
  const upcomingEvents = group.totalEvents ?? 0
  const openTasks = Math.max(0, (group.totalTasks?.all ?? 0) - (group.totalTasks?.completed ?? 0))

  // Real member avatars from the group's member list (with username initials)
  const members = group.members ?? []
  const memberIds = members.map((m) => m.user_id)
  const memberNames: Record<string, string> = {}
  members.forEach((m) => { if (m.username) memberNames[m.user_id] = m.username })

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--surface)',
        borderRadius: 'var(--r-lg)',
        border: `1px solid ${hovered ? 'var(--border-hi)' : 'var(--border)'}`,
        boxShadow: hovered ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'var(--transition)',
        cursor: 'pointer',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Color header band */}
      <div style={{
        position: 'relative',
        height: 64,
        background: `linear-gradient(120deg, color-mix(in srgb, ${color} 60%, transparent), color-mix(in srgb, ${color} 22%, var(--surface)))`,
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        <ImgPh />
        {/* "Group" kind badge */}
        <span style={{
          position: 'absolute',
          top: 10,
          left: 12,
          padding: '3px 9px',
          borderRadius: 'var(--r-full)',
          background: 'rgba(0,0,0,0.48)',
          backdropFilter: 'blur(8px)',
          color: '#fff',
          fontSize: 11,
          fontWeight: 650,
          letterSpacing: '0.02em',
        }}>
          Group
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 17px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Icon row */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          {/* Group icon square */}
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 'var(--r-md)',
            background: color,
            border: '2px solid var(--surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 20,
            fontWeight: 800,
            flexShrink: 0,
            boxShadow: `0 4px 14px color-mix(in srgb, ${color} 40%, transparent)`,
          }}>
            {letter}
          </div>
          <AvatarStack ids={memberIds} names={memberNames} size={24} max={4} ringColor="var(--surface)" />
        </div>

        {/* Title + member count */}
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
            {group.groups_title}
          </h3>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '3px 0 0', lineHeight: 1 }}>
            {memberCount} members
          </p>
        </div>

        {/* Next event row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 10px',
          borderRadius: 'var(--r-sm)',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          minWidth: 0,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {upcomingEvents > 0 ? `${upcomingEvents} upcoming event${upcomingEvents > 1 ? 's' : ''}` : 'No upcoming events'}
          </span>
        </div>

        {/* Task progress */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>Tasks</span>
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
              {openTasks} open
            </span>
          </div>
          <Progress value={group.totalTasks?.completed ?? 0} total={group.totalTasks?.all ?? 0} color={color} height={4} />
        </div>

        {/* Stats row */}
        <div style={{
          display: 'flex',
          gap: 0,
          paddingTop: 8,
          borderTop: '1px solid var(--border)',
          justifyContent: 'space-between',
        }}>
          <Stat n={upcomingEvents} label="upcoming" />
          <Stat n={memberCount} label="members" />
          <Stat n={openTasks} label="open tasks" />
        </div>
      </div>
    </div>
  )
}

// ── Create placeholder card ───────────────────────────────────────────────────
function CreateCard({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        minHeight: 260,
        border: '1.5px dashed var(--border-hi)',
        borderRadius: 'var(--r-lg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        color: hovered ? 'var(--text-2)' : 'var(--text-3)',
        background: hovered ? 'var(--surface-2)' : 'transparent',
        transition: 'var(--transition)',
        cursor: 'pointer',
      }}
    >
      <div style={{
        width: 42,
        height: 42,
        borderRadius: 'var(--r-md)',
        border: '1.5px dashed var(--border-hi)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--text-3)',
      }}>
        <Icon name="plus" size={20} sw={2} />
      </div>
      <span style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: '-0.01em' }}>Create a group</span>
    </div>
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
      background: 'rgba(245,158,11,0.07)',
      border: '1px solid rgba(245,158,11,0.28)',
      flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 'var(--r-sm)',
          background: 'rgba(245,158,11,0.18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon name="bell" size={16} style={{ color: '#f59e0b' }} />
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
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      padding: 16,
    }}>
      <div style={{
        background: 'var(--surface)',
        borderRadius: 'var(--r-xl)',
        border: '1px solid var(--border-2)',
        boxShadow: 'var(--shadow-lg)',
        width: '100%',
        maxWidth: 400,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4, display: 'flex' }}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  )
}

// ── Input / label helper styles ───────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--surface-2)',
  border: '1px solid var(--border-2)',
  borderRadius: 'var(--r-sm)',
  padding: '9px 12px',
  fontSize: 13.5,
  color: 'var(--text-1)',
  outline: 'none',
}

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
    await Promise.allSettled([...selectedIds].map(id => api.delete(`/groups/${id}`)))
    setBulkDeleting(false)
    setShowDeleteConfirm(false)
    exitSelectMode()
    load()
  }

  return (
    <div style={{ padding: 'clamp(16px, 4vw, 28px) clamp(16px, 3vw, 24px)', maxWidth: 900, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.03em' }}>Groups</h1>
          <p style={{ fontSize: 13.5, color: 'var(--text-3)', margin: '4px 0 0' }}>
            {selectMode
              ? `${selectedIds.size} selected`
              : `${groups.length} group${groups.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {selectMode ? (
            <>
              <Button variant="ghost" size="md" onClick={exitSelectMode}>Cancel</Button>
              <Button
                variant="danger"
                size="md"
                icon="trash"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={selectedIds.size === 0}
              >
                Delete {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="md" onClick={() => setSelectMode(true)}>Select</Button>
              <Button variant="primary" icon="plus" size="md" onClick={() => setCreateOpen(true)}>
                New group
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
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
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.25)',
          color: 'var(--text-1)',
          fontSize: 13.5,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <Icon name="bell" size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
          {error}
        </div>
      )}

      {/* Groups grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ height: 260, borderRadius: 'var(--r-lg)' }} />
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
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))',
          gap: 16,
        }}>
          {groups.map((g) => {
            const isSelected = selectedIds.has(g.groups_id)
            return (
              <div key={g.groups_id} style={{ position: 'relative' }}>
                <GroupCard
                  group={g}
                  onClick={() => selectMode ? toggleSelect(g.groups_id) : navigate(`/groups/${g.groups_id}`)}
                />
                {selectMode && (
                  <div
                    onClick={() => toggleSelect(g.groups_id)}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: 'var(--r-lg)',
                      border: isSelected ? '2px solid #ef4444' : '2px solid transparent',
                      background: isSelected ? 'rgba(239,68,68,0.10)' : 'transparent',
                      transition: 'var(--transition)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'flex-end',
                      padding: 10,
                    }}
                  >
                    <div style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      border: isSelected ? '2px solid #ef4444' : '2px solid rgba(255,255,255,0.5)',
                      background: isSelected ? '#ef4444' : 'rgba(0,0,0,0.4)',
                      backdropFilter: 'blur(4px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'var(--transition)',
                    }}>
                      {isSelected && <Icon name="check" size={12} sw={2.5} style={{ color: '#fff' }} />}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {!selectMode && <CreateCard onClick={() => setCreateOpen(true)} />}
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
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 20,
            }}>
              <Icon name="trash" size={22} style={{ color: '#ef4444' }} />
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
              maxHeight: 140,
              overflowY: 'auto',
            }}>
              {groups.filter(g => selectedIds.has(g.groups_id)).map(g => (
                <div key={g.groups_id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '4px 0',
                  fontSize: 13.5, color: 'var(--text-1)',
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                  {g.groups_title}
                </div>
              ))}
            </div>

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
