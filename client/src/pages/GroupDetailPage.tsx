import { useEffect, useState, type FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '@/api/client'
import CountdownPill from '@/components/CountdownPill'
import type { Member, CalEvent, TaskList, Task, GroupChallenge, Pact } from '@/types'
import { useAuthStore } from '@/store/authStore'
import Icon from '@/components/ui/Icon'
import { Avatar, AvatarStack } from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import { Tag, Section, Empty, Progress } from '@/components/ui/Primitives'
import { groupColorByIndex } from './GroupsPage'
import EventFormModal from '@/components/EventFormModal'
import GroupChallengeCard from '@/components/GroupChallengeCard'
import PactModal from '@/components/PactModal'
import PactCelebration from '@/components/PactCelebration'

// ── Shared helpers ────────────────────────────────────────────────────────────

function ImgPh({ opacity = 0.22 }: { opacity?: number }) {
  return (
    <svg
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity }}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern id="dp-stripes" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="10" height="20" fill="rgba(255,255,255,0.18)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dp-stripes)" />
    </svg>
  )
}

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
        maxWidth: 420,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  )
}

// ── Activity feed ─────────────────────────────────────────────────────────────
interface ActivityItem {
  user_id: string
  username: string
  action_type: 'event_added' | 'task_completed' | 'member_joined' | 'rsvp_going'
  object_title: string
  created_at: string
}

const ACTION_LABELS: Record<ActivityItem['action_type'], string> = {
  event_added:    'added an event',
  task_completed: 'completed a task',
  member_joined:  'joined the group',
  rsvp_going:     'is going to',
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 60) return `${Math.max(diffMin, 1)}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  return `${diffD} day${diffD === 1 ? '' : 's'} ago`
}

function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0' }}>
      <div style={{ flexShrink: 0 }}>
        <Avatar id={item.user_id} size={34} label={item.username} name={item.username} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, color: 'var(--text-1)', margin: 0, lineHeight: 1.4 }}>
          <strong style={{ fontWeight: 650 }}>{item.username}</strong>
          {' '}{ACTION_LABELS[item.action_type]}{' '}
          <span style={{ color: 'var(--text-2)' }}>{item.object_title}</span>
        </p>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '2px 0 0' }}>
          {relativeTime(item.created_at)}
        </p>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'events' | 'tasks' | 'members'

export default function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const navigate = useNavigate()
  const currentUserId = useAuthStore((s) => s.userId)

  const [members, setMembers] = useState<Member[]>([])
  const [events, setEvents] = useState<CalEvent[]>([])
  const [taskLists, setTaskLists] = useState<TaskList[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [groupTitle, setGroupTitle] = useState('')
  const [groupTag, setGroupTag] = useState('')
  const [groupDescription, setGroupDescription] = useState('')
  const [sharedColor, setSharedColor] = useState('#3b82f6')
  const [myColor, setMyColor] = useState('#3b82f6')
  const [loading, setLoading] = useState(true)
  const [groupIndex] = useState(() => Math.abs((groupId?.charCodeAt(0) ?? 0) % 6))
  const groupColor = groupColorByIndex(groupIndex)

  // ── Edit group modal state ───────────────────────────────────────────────────
  const [showEditModal, setShowEditModal] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editTag, setEditTag] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // ── Delete group state ───────────────────────────────────────────────────────
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // ── Leave group state ────────────────────────────────────────────────────────
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)

  // ── Kick member state ────────────────────────────────────────────────────────
  const [kickConfirmId, setKickConfirmId] = useState<string | null>(null)
  const [kicking, setKicking] = useState(false)

  // Pacts
  const [activePact, setActivePact] = useState<Pact | null>(null)
  const [pastPacts, setPastPacts] = useState<Pact[]>([])
  const [showPastPacts, setShowPastPacts] = useState(false)
  const [showPactModal, setShowPactModal] = useState(false)
  const [celebratePactId, setCelebratePactId] = useState<number | null>(null)

  // Challenges
  const [challenges, setChallenges] = useState<GroupChallenge[]>([])
  const [showCreateChallenge, setShowCreateChallenge] = useState(false)
  const [challengeTitle, setChallengeTitle] = useState('')
  const [challengeTarget, setChallengeTarget] = useState('')
  const [challengeUnit, setChallengeUnit] = useState('completions')
  const [challengeStartDate, setChallengeStartDate] = useState('')
  const [challengeEndDate, setChallengeEndDate] = useState('')
  const [challengeDesc, setChallengeDesc] = useState('')
  const [savingChallenge, setSavingChallenge] = useState(false)

  // Task completion toggle state
  const [taskDone, setTaskDone] = useState<Record<string, boolean>>({})

  // Event creation modal
  const [showEventModal, setShowEventModal] = useState(false)
  const [eventsPage, setEventsPage] = useState(0)

  // Tentative voting
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null)
  const [votingEventId, setVotingEventId] = useState<string | null>(null)
  const [confirmingEventId, setConfirmingEventId] = useState<string | null>(null)

  async function handleVote(eventId: string, optionId: number) {
    setVotingEventId(eventId)
    try {
      await api.post('/voteEventDate', { eventId, optionId })
      // Reload events for this group
      const { data } = await api.get('/renderEvents')
      if (data.success && Array.isArray(data.events)) {
        setEvents(data.events.filter((e: CalEvent) => String(e.extendedProps?.groupsId) === String(groupId)))
      }
    } catch {
      // silently fail
    } finally {
      setVotingEventId(null)
    }
  }

  async function handleConfirmDate(eventId: string, optionId: number) {
    setConfirmingEventId(eventId)
    try {
      await api.post('/confirmEventDate', { eventId, optionId })
      const { data } = await api.get('/renderEvents')
      if (data.success && Array.isArray(data.events)) {
        setEvents(data.events.filter((e: CalEvent) => String(e.extendedProps?.groupsId) === String(groupId)))
      }
      setExpandedEventId(null)
    } catch {
      // silently fail
    } finally {
      setConfirmingEventId(null)
    }
  }

  const [shareLink, setShareLink] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResult, setSearchResult] = useState<{ username: string; user_id: string; email: string } | null>(null)
  const [inviteList, setInviteList] = useState<{ username: string; user_id: string; email: string }[]>([])
  const [searching, setSearching] = useState(false)
  const [inviting, setInviting] = useState(false)

  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  async function loadAll() {
    if (!groupId) return
    try {
      // 1. Members + colors
      const membersRes = await api.get(`/getGroupMembers/${groupId}`)
      if (membersRes.data.success) {
        setMembers(membersRes.data.members)
        setSharedColor(membersRes.data.sharedColor ?? '#3b82f6')
        const me = membersRes.data.members.find((m: Member) => m.user_id === currentUserId)
        if (me?.color) setMyColor(me.color)
      }

      // 2. Group title — from /groups list
      api.get('/groups').then(({ data }) => {
        if (data.success && Array.isArray(data.userGroups)) {
          const match = data.userGroups.find(
            (g: { groupInfo: { groupId: string | number; title: string; tag: string } }) =>
              String(g.groupInfo.groupId) === String(groupId)
          )
          if (match) {
            setGroupTitle(match.groupInfo.title)
            setGroupTag(match.groupInfo.tag)
            setGroupDescription(match.groupInfo.description ?? '')
          }
        }
      }).catch(() => {})

      // 3. Events for this group
      api.get('/renderEvents').then(({ data }) => {
        if (data.success && Array.isArray(data.events)) {
          const groupEvents = data.events.filter(
            (e: CalEvent) => String(e.extendedProps?.groupsId) === String(groupId)
          )
          setEvents(groupEvents)
        }
      }).catch(() => {})

      // 4. Task lists for this group
      api.get('/todo').then(({ data }) => {
        if (data.success && Array.isArray(data.yourTaskLists)) {
          const groupLists = data.yourTaskLists.filter(
            (tl: TaskList) => String(tl.taskListInfo.idG) === String(groupId)
          )
          setTaskLists(groupLists)
          // Init local done state from DB
          const doneMap: Record<string, boolean> = {}
          groupLists.forEach((tl: TaskList) => {
            tl.taskItems.forEach((t: Task) => { doneMap[t.task_id] = t.is_completed })
          })
          setTaskDone(doneMap)
        }
      }).catch(() => {})

      // 5. Activity feed for this group
      api.get(`/groupActivity/${groupId}`).then(({ data }) => {
        if (data.success) setActivity(data.activity ?? [])
      }).catch(() => {})

      // 6. Active pact + full history for this group
      api.get(`/groups/${groupId}/pacts/active`).then(({ data }) => {
        if (data.success) {
          const pact = data.pact as Pact | null
          if (pact && pact.status === 'succeeded' && !sessionStorage.getItem(`pact_celebrated_${pact.pact_id}`)) {
            setCelebratePactId(pact.pact_id)
          }
          setActivePact(pact)
        }
      }).catch(() => {})

      api.get(`/groups/${groupId}/pacts`).then(({ data }) => {
        if (data.success) {
          const all = (data.pacts ?? []) as Pact[]
          setPastPacts(all.filter((p) => p.status !== 'active'))
        }
      }).catch(() => {})

      // 7. Challenges for this group
      api.get(`/groups/${groupId}/challenges`).then(({ data }) => {
        if (data.success) setChallenges(data.challenges ?? [])
      }).catch(() => {})

    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [groupId, currentUserId])

  async function toggleTask(taskId: string, current: boolean) {
    setTaskDone(prev => ({ ...prev, [taskId]: !current }))
    try {
      await api.patch('/updateTask', { taskId, isCompleted: !current })
    } catch {
      setTaskDone(prev => ({ ...prev, [taskId]: current })) // revert on error
    }
  }

  async function handleSharedColor(color: string) {
    setSharedColor(color)
    await api.post('/setGroupSharedColor', { groupsId: groupId, sharedColor: color }).catch(() => {})
  }

  async function handleMyColor(color: string) {
    setMyColor(color)
    await api.post('/setMemberColor', { groupsId: groupId, color }).catch(() => {})
  }

  async function searchUser(e: FormEvent) {
    e.preventDefault()
    setSearching(true)
    setSearchResult(null)
    try {
      const { data } = await api.post('/checkUser', { isUser: searchTerm })
      if (data.success && data.match) setSearchResult(data.user)
      else setSearchResult(null)
    } finally {
      setSearching(false)
    }
  }

  function addToInviteList() {
    if (!searchResult || inviteList.find((u) => u.user_id === searchResult.user_id)) return
    setInviteList((prev) => [...prev, searchResult])
    setSearchResult(null)
    setSearchTerm('')
  }

  async function sendInvites() {
    if (!inviteList.length) return
    setInviting(true)
    try {
      await api.post('/inviteUsers', { groupId, userList: inviteList })
      setInviteOpen(false)
      setInviteList([])
    } finally {
      setInviting(false)
    }
  }

  async function handleShareLink() {
    if (shareLink) return
    setShareLink(true)
    try {
      const { data } = await api.post('/generateInviteLink', { groupId })
      if (data.success && data.url) {
        await navigator.clipboard.writeText(data.url)
        setShareCopied(true)
        setTimeout(() => setShareCopied(false), 2000)
      }
    } catch {
      // silently fail
    } finally {
      setShareLink(false)
    }
  }

  // ── Edit group ───────────────────────────────────────────────────────────────
  function openEditModal() {
    setEditTitle(groupTitle)
    setEditDescription(groupDescription)
    setEditTag(groupTag)
    setShowEditModal(true)
  }

  async function saveGroupEdits() {
    if (!editTitle.trim()) return
    setEditSaving(true)
    try {
      await api.patch(`/groups/${groupId}`, {
        groups_title: editTitle.trim(),
        groups_description: editDescription.trim(),
        tag_name: editTag,
      })
      await loadAll()
      setShowEditModal(false)
    } finally {
      setEditSaving(false)
    }
  }

  // ── Delete group ─────────────────────────────────────────────────────────────
  async function deleteGroup() {
    setDeleting(true)
    try {
      await api.delete(`/groups/${groupId}`)
      navigate('/groups')
    } finally {
      setDeleting(false)
    }
  }

  // ── Leave group ──────────────────────────────────────────────────────────────
  async function leaveGroup() {
    setLeaving(true)
    setLeaveError(null)
    try {
      await api.post(`/groups/${groupId}/leave`)
      navigate('/groups')
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Could not leave group.'
          : 'Could not leave group.'
      setLeaveError(msg)
    } finally {
      setLeaving(false)
    }
  }

  // ── Kick member ──────────────────────────────────────────────────────────────
  async function kickMember(memberId: string) {
    setKicking(true)
    try {
      await api.delete(`/groups/${groupId}/members/${memberId}`)
      setMembers((prev) => prev.filter((m) => m.user_id !== memberId))
      setKickConfirmId(null)
    } finally {
      setKicking(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
        Loading…
      </div>
    )
  }

  // Determine if the current user is an admin of this group
  const isCurrentUserAdmin = members.some((m) => m.user_id === currentUserId && m.role === 'admin')

  const groupName = groupTitle || 'Group'
  const letter = groupName[0]?.toUpperCase() ?? 'G'
  const memberIds = members.slice(0, 5).map((m) => m.user_id)
  const memberNames: Record<string, string> = Object.fromEntries(
    members.map((m) => [m.user_id, m.username]),
  )

  // ── Cover + hero ────────────────────────────────────────────────────────────
  const coverSection = (
    <div style={{ position: 'relative' }}>
      {/* Cover band */}
      <div style={{
        height: 190,
        background: `linear-gradient(120deg, color-mix(in srgb, ${groupColor} 55%, transparent), color-mix(in srgb, ${groupColor} 18%, var(--bg)))`,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <ImgPh />
        {/* Gradient overlay to bg */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
          background: 'linear-gradient(to bottom, transparent, var(--bg))',
        }} />
        {/* Back button */}
        <button
          onClick={() => navigate('/groups')}
          style={{
            position: 'absolute', top: 16, left: 16,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 13px',
            borderRadius: 'var(--r-full)',
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.14)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Icon name="chevL" size={14} sw={2.2} />
          Groups
        </button>
      </div>

      {/* Hero row */}
      <div style={{
        padding: `16px clamp(16px, 4vw, 24px) 20px`,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
      }}>
        {/* Left: avatar + info */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
          <div style={{
            width: 80,
            height: 80,
            borderRadius: 'var(--r-lg)',
            background: groupColor,
            border: '3px solid var(--bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 32,
            fontWeight: 800,
            flexShrink: 0,
            boxShadow: 'var(--shadow-md)',
          }}>
            {letter}
          </div>
          <div style={{ paddingBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.03em' }}>
                {groupName}
              </h1>
              {groupTag && <Tag tone="neutral">#{groupTag}</Tag>}
              {isCurrentUserAdmin && (
                <button
                  onClick={openEditModal}
                  title="Edit group"
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 30, height: 30, borderRadius: 'var(--r-sm)',
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    color: 'var(--text-3)', cursor: 'pointer',
                    transition: 'var(--transition)',
                  }}
                >
                  <Icon name="edit" size={14} sw={1.8} />
                </button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
              <AvatarStack ids={memberIds} size={22} max={5} ringColor="var(--bg)" names={memberNames} />
              <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{members.length} members</span>
            </div>
          </div>
        </div>

        {/* Right: action buttons */}
        <div style={{ display: 'flex', gap: 8, paddingBottom: 4 }}>
          <Button variant="ghost" icon="share" size="sm" onClick={handleShareLink} disabled={shareLink}>
            {shareCopied ? 'Copied!' : 'Share'}
          </Button>
          <Button variant="primary" icon="plus" size="sm" onClick={() => setShowEventModal(true)}>
            Add event
          </Button>
        </div>
      </div>
    </div>
  )

  // ── Color settings (subtle) ──────────────────────────────────────────────────
  const colorSettings = (
    <div style={{
      display: 'flex',
      gap: 20,
      flexWrap: 'wrap',
      padding: '12px 16px',
      borderRadius: 'var(--r-md)',
      background: 'var(--surface-2)',
      border: '1px solid var(--border)',
      marginBottom: 28,
    }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600, cursor: 'pointer' }}>
        <input type="color" value={sharedColor} onChange={(e) => handleSharedColor(e.target.value)}
          style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border-2)', cursor: 'pointer', background: 'none', padding: 0 }} />
        Shared color
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--text-2)', fontWeight: 600, cursor: 'pointer' }}>
        <input type="color" value={myColor} onChange={(e) => handleMyColor(e.target.value)}
          style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border-2)', cursor: 'pointer', background: 'none', padding: 0 }} />
        My color
      </label>
    </div>
  )

  // ── Members section ──────────────────────────────────────────────────────────
  const membersSection = (
    <Section title="Members" count={members.length}>
      <div style={{
        background: 'var(--surface)',
        borderRadius: 'var(--r-lg)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
      }}>
        {members.length === 0 ? (
          <Empty text="No members yet." />
        ) : (
          members.map((m, i) => {
            const isYou = m.user_id === currentUserId
            const isAdmin = m.role === 'admin'
            return (
              <div
                key={m.user_id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '13px 16px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar id={m.user_id} size={36} ring ringColor="var(--surface)" label={m.username} name={m.username} />
                  <div>
                    <p style={{
                      fontSize: 14, margin: 0,
                      fontWeight: isAdmin ? 700 : 500,
                      color: 'var(--text-1)',
                    }}>
                      {m.username}{isYou && <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 400, marginLeft: 6 }}>you</span>}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>
                      {isAdmin ? 'Organiser' : 'Member'}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isAdmin && (
                    <span style={{
                      fontSize: 11.5, fontWeight: 650, padding: '3px 9px',
                      borderRadius: 'var(--r-full)',
                      background: `color-mix(in srgb, ${groupColor} 15%, transparent)`,
                      color: groupColor,
                      border: `1px solid color-mix(in srgb, ${groupColor} 30%, transparent)`,
                    }}>
                      Organiser
                    </span>
                  )}
                  {isCurrentUserAdmin && !isYou && (
                    kickConfirmId === m.user_id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={kicking}
                          onClick={() => kickMember(m.user_id)}
                        >
                          {kicking ? '…' : 'Remove'}
                        </Button>
                        <button
                          onClick={() => setKickConfirmId(null)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 12 }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setKickConfirmId(m.user_id)}
                        title={`Remove ${m.username}`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 28, height: 28, borderRadius: 'var(--r-sm)',
                          background: 'none', border: '1px solid transparent',
                          color: 'var(--text-3)', cursor: 'pointer',
                          transition: 'var(--transition)',
                        }}
                      >
                        <Icon name="close" size={14} sw={2} />
                      </button>
                    )
                  )}
                </div>
              </div>
            )
          })
        )}
        {/* Invite button — admin only */}
        {isCurrentUserAdmin && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <button
              onClick={() => setInviteOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                padding: '8px 0', color: 'var(--accent)',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                border: '1.5px dashed var(--accent-line)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Icon name="plus" size={16} sw={2} style={{ color: 'var(--accent)' }} />
              </div>
              <span style={{ fontSize: 13.5, fontWeight: 650 }}>Invite members</span>
            </button>
          </div>
        )}
      </div>
    </Section>
  )

  // ── Events section ───────────────────────────────────────────────────────────
  const EVENTS_PAGE_SIZE = 10
  const now = new Date()
  const tentativeEvents = events.filter(e => e.extendedProps?.status === 'tentative')
  const confirmedEvents = events.filter(e => e.extendedProps?.status !== 'tentative')
  const allUpcoming = confirmedEvents
    .filter(e => new Date(e.start) >= now)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  const totalPages = Math.ceil(allUpcoming.length / EVENTS_PAGE_SIZE)
  const upcomingEvents = allUpcoming.slice(eventsPage * EVENTS_PAGE_SIZE, (eventsPage + 1) * EVENTS_PAGE_SIZE)
  const pastEvents = confirmedEvents
    .filter(e => new Date(e.start) < now)
    .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
    .slice(0, 3)

  const eventsSection = (
    <Section title="Events" count={events.length}>
      {events.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
          <Empty text="No events yet. Add the first one!" />
          <Button variant="outline" size="sm" icon="plus" onClick={() => setShowEventModal(true)}>
            Create event
          </Button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ── Tentative events (voting open) ── */}
          {tentativeEvents.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#f59e0b', marginBottom: 10 }}>
                Voting open
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tentativeEvents.map(ev => {
                  const isExpanded = expandedEventId === ev.id
                  const opts = ev.extendedProps?.dateOptions ?? []
                  const myVote = ev.extendedProps?.myVote ?? null
                  const totalMembers = ev.extendedProps?.totalGroupMembers ?? members.length
                  const totalVoters = new Set(opts.flatMap(o => o.votes.map(v => v.userId))).size
                  const isCreator = ev.extendedProps?.createdBy === currentUserId
                  const isVoting = votingEventId === ev.id
                  const isConfirming = confirmingEventId === ev.id
                  // Leading option by vote count
                  const leadingOption = opts.length > 0
                    ? opts.reduce((best, o) => o.voteCount > best.voteCount ? o : best, opts[0])
                    : null

                  return (
                    <div key={ev.id} style={{
                      borderRadius: 'var(--r-md)',
                      background: 'var(--surface)',
                      border: '1px dashed var(--border-2)',
                      overflow: 'hidden',
                    }}>
                      {/* Card header — clickable to expand */}
                      <button
                        onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '12px 14px',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          width: '100%',
                          textAlign: 'left',
                        }}
                      >
                        {/* Date placeholder block (amber) */}
                        <div style={{
                          width: 46, flexShrink: 0, textAlign: 'center',
                          padding: '5px 0',
                          borderRadius: 'var(--r-sm)',
                          background: 'rgba(245,158,11,0.10)',
                        }}>
                          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: '#f59e0b' }}>TBD</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: '#f59e0b', lineHeight: 1.2 }}>?</div>
                        </div>
                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                            <p style={{ fontSize: 14, fontWeight: 650, color: 'var(--text-1)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ev.title}
                            </p>
                            {/* Amber "Voting open" pill */}
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '2px 8px', borderRadius: 'var(--r-full)',
                              background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
                              fontSize: 11, fontWeight: 700, flexShrink: 0,
                            }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
                              Voting open
                            </span>
                          </div>
                          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
                            {totalVoters} of {totalMembers} voted · {opts.length} option{opts.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <Icon
                          name={isExpanded ? 'chevD' : 'chevR'}
                          size={14}
                          sw={2.2}
                          style={{ color: 'var(--text-3)', flexShrink: 0, transform: isExpanded ? 'rotate(180deg) scaleX(-1)' : 'none' }}
                        />
                      </button>

                      {/* Expanded voting rows */}
                      {isExpanded && (
                        <div style={{
                          borderTop: '1px solid var(--border)',
                          padding: '12px 14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                        }}>
                          {opts.length === 0 ? (
                            <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>No date options yet.</p>
                          ) : (
                            opts
                              .sort((a, b) => a.position - b.position)
                              .map(opt => {
                                const hasVoted = myVote === opt.optionId
                                const isLeading = leadingOption?.optionId === opt.optionId && opt.voteCount > 0
                                // Format date label
                                const dateObj = new Date(opt.startDate + 'T00:00:00')
                                const dateLbl = dateObj.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
                                const timeLbl = opt.startTime ? opt.startTime.slice(0, 5) : ''
                                const label = timeLbl ? `${dateLbl} · ${timeLbl}` : dateLbl

                                return (
                                  <div key={opt.optionId} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '8px 0',
                                  }}>
                                    {/* Date label */}
                                    <span style={{
                                      fontSize: 13,
                                      fontWeight: 700,
                                      color: 'var(--text-1)',
                                      width: 160,
                                      flexShrink: 0,
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}>
                                      {label}
                                    </span>
                                    {/* Progress bar */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <Progress
                                        value={opt.voteCount}
                                        total={Math.max(1, totalMembers)}
                                        color={isLeading ? 'var(--accent)' : 'var(--surface-3)'}
                                        height={6}
                                      />
                                    </div>
                                    {/* Vote count */}
                                    <span style={{
                                      fontSize: 12,
                                      color: 'var(--text-3)',
                                      width: 48,
                                      textAlign: 'right',
                                      flexShrink: 0,
                                      fontVariantNumeric: 'tabular-nums',
                                    }}>
                                      {opt.voteCount} vote{opt.voteCount !== 1 ? 's' : ''}
                                    </span>
                                    {/* Vote button */}
                                    {hasVoted ? (
                                      <div style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                        padding: '5px 10px',
                                        borderRadius: 'var(--r-sm)',
                                        background: 'rgba(34,211,170,0.12)',
                                        color: 'var(--g-work)',
                                        fontSize: 12,
                                        fontWeight: 700,
                                        flexShrink: 0,
                                      }}>
                                        <Icon name="check" size={12} sw={2.5} />
                                        Voted
                                      </div>
                                    ) : (
                                      <Button
                                        variant="soft"
                                        size="sm"
                                        disabled={isVoting}
                                        onClick={() => handleVote(ev.id, opt.optionId)}
                                      >
                                        Vote
                                      </Button>
                                    )}
                                  </div>
                                )
                              })
                          )}

                          {/* Creator-only: Confirm leading date */}
                          {isCreator && leadingOption && (
                            <div style={{ marginTop: 4, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isConfirming}
                                onClick={() => handleConfirmDate(ev.id, leadingOption.optionId)}
                              >
                                {isConfirming ? 'Confirming…' : 'Confirm this date ↗'}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {allUpcoming.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 10 }}>Upcoming</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {upcomingEvents.map(ev => {
                  const dateStr = ev.start.split('T')[0]
                  const date = new Date(dateStr + 'T00:00:00')
                  const timeStr = ev.start.includes('T') ? ev.start.split('T')[1].slice(0, 5) : 'All day'
                  return (
                    <div key={ev.id} style={{
                      display: 'flex', alignItems: 'center', gap: 13,
                      padding: '12px 14px',
                      borderRadius: 'var(--r-md)',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                    }}>
                      {/* Date block */}
                      <div style={{
                        width: 46, flexShrink: 0, textAlign: 'center',
                        padding: '5px 0',
                        borderRadius: 'var(--r-sm)',
                        background: `color-mix(in srgb, ${groupColor} 14%, var(--surface-2))`,
                      }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: groupColor }}>
                          {date.toLocaleDateString('en-US', { month: 'short' })}
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.1 }}>
                          {date.getDate()}
                        </div>
                      </div>
                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 650, color: 'var(--text-1)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ev.title}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Icon name="clock" size={11} />
                          {timeStr}
                          {ev.extendedProps?.participants && ev.extendedProps.participants.length > 0 && (
                            <> · {ev.extendedProps.participants.length} going</>
                          )}
                        </p>
                      </div>
                      <CountdownPill targetDate={ev.start} />
                    </div>
                  )
                })}
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                  <button
                    onClick={() => setEventsPage(p => p - 1)}
                    disabled={eventsPage === 0}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      fontSize: 12.5, fontWeight: 650,
                      color: eventsPage === 0 ? 'var(--text-3)' : 'var(--accent)',
                      background: 'none', border: 'none',
                      cursor: eventsPage === 0 ? 'not-allowed' : 'pointer',
                      padding: '4px 0', opacity: eventsPage === 0 ? 0.4 : 1,
                    }}
                  >
                    <Icon name="chevL" size={13} sw={2.2} />
                    Previous
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
                    {eventsPage + 1} / {totalPages}
                  </span>
                  <button
                    onClick={() => setEventsPage(p => p + 1)}
                    disabled={eventsPage >= totalPages - 1}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      fontSize: 12.5, fontWeight: 650,
                      color: eventsPage >= totalPages - 1 ? 'var(--text-3)' : 'var(--accent)',
                      background: 'none', border: 'none',
                      cursor: eventsPage >= totalPages - 1 ? 'not-allowed' : 'pointer',
                      padding: '4px 0', opacity: eventsPage >= totalPages - 1 ? 0.4 : 1,
                    }}
                  >
                    Next
                    <Icon name="chevR" size={13} sw={2.2} />
                  </button>
                </div>
              )}
            </div>
          )}
          {pastEvents.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 10 }}>Past</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pastEvents.map(ev => (
                  <div key={ev.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px',
                    borderRadius: 'var(--r-sm)',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    opacity: 0.7,
                  }}>
                    <Icon name="check" size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                    <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ev.title}
                    </p>
                    <span style={{ fontSize: 11.5, color: 'var(--text-3)', flexShrink: 0 }}>
                      {new Date(ev.start.split('T')[0] + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Section>
  )

  // ── Tasks section ────────────────────────────────────────────────────────────
  const tasksSection = (
    <Section title="Tasks" count={taskLists.reduce((s, tl) => s + tl.totalTasks, 0) || undefined}>
      {taskLists.length === 0 ? (
        <Empty text="No task lists yet. Go to Tasks to create one for this group." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {taskLists.map(tl => {
            const doneCount = tl.taskItems.filter(t => taskDone[t.task_id] ?? t.is_completed).length
            const total = tl.taskItems.length
            return (
              <div key={tl.taskListInfo.idTl} style={{
                background: 'var(--surface)',
                borderRadius: 'var(--r-lg)',
                border: '1px solid var(--border)',
                overflow: 'hidden',
              }}>
                {/* List header */}
                <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tl.taskListInfo.title}
                    </p>
                    <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '2px 0 0' }}>
                      {doneCount}/{total} done
                    </p>
                  </div>
                  <div style={{ width: 64, flexShrink: 0 }}>
                    <Progress value={doneCount} total={total} color={groupColor} height={5} />
                  </div>
                </div>
                {/* Tasks */}
                {tl.taskItems.length === 0 ? (
                  <p style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-3)', margin: 0 }}>No tasks yet.</p>
                ) : (
                  tl.taskItems.map((t, i) => {
                    const done = taskDone[t.task_id] ?? t.is_completed
                    return (
                      <div
                        key={t.task_id}
                        onClick={() => toggleTask(t.task_id, done)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '11px 16px',
                          borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                          cursor: 'pointer',
                          transition: 'background var(--transition)',
                        }}
                        className="row-hover"
                      >
                        {/* Checkbox */}
                        <div style={{
                          width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                          border: done ? 'none' : `2px solid ${groupColor}`,
                          background: done ? groupColor : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'var(--transition)',
                          boxShadow: done ? `0 2px 8px color-mix(in srgb, ${groupColor} 40%, transparent)` : 'none',
                        }}>
                          {done && <Icon name="check" size={11} sw={2.8} style={{ color: '#fff' }} />}
                        </div>
                        <p style={{
                          fontSize: 13.5, margin: 0, flex: 1,
                          color: done ? 'var(--text-3)' : 'var(--text-1)',
                          textDecoration: done ? 'line-through' : 'none',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {t.task_title}
                        </p>
                      </div>
                    )
                  })
                )}
              </div>
            )
          })}
        </div>
      )}
    </Section>
  )

  // ── Activity section ─────────────────────────────────────────────────────────
  const activitySection = (
    <Section title="Recent activity">
      {activity.length === 0 ? (
        <Empty text="No activity yet." />
      ) : (
        <div style={{
          background: 'var(--surface)',
          borderRadius: 'var(--r-lg)',
          border: '1px solid var(--border)',
          padding: '4px 16px',
        }}>
          {activity.map((item, i) => (
            <div key={`${item.user_id}-${item.created_at}-${i}`} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
              <ActivityRow item={item} />
            </div>
          ))}
        </div>
      )}
    </Section>
  )

  // ── Pact banner section ────────────────────────────────────────────────────────
  const pactSection = (
    <div style={{ marginBottom: 24 }}>
      {/* Section label */}
      <div style={{ marginBottom: 10 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Group Pact</p>
        <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '2px 0 0' }}>
          Bet a real calendar event on the group's habit completions — hit the target and it unlocks for everyone.
        </p>
      </div>
      {activePact && activePact.status === 'active' ? (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-2)',
          borderRadius: 'var(--r-lg)',
          padding: '16px 18px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Accent accent strip */}
          <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: 'var(--accent)', borderRadius: '3px 0 0 3px' }} />
          <div style={{ paddingLeft: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Icon name="trophy" size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Group Pact</span>
              <span style={{
                marginLeft: 'auto', fontSize: 11, fontWeight: 650,
                color: 'var(--text-3)',
                padding: '2px 8px', borderRadius: 'var(--r-full)',
                background: 'var(--surface-2)', border: '1px solid var(--border)',
              }}>
                ends {new Date(activePact.ends_at + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-3)', marginBottom: 5 }}>
                <span>{activePact.completions_count} completions</span>
                <span>{activePact.target_completions} target</span>
              </div>
              <Progress value={activePact.completions_count} total={activePact.target_completions} color="var(--accent)" height={6} />
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>
              Hit the target to unlock the reward event.
            </p>
          </div>
        </div>
      ) : activePact && activePact.status === 'succeeded' ? (
        <div style={{
          background: 'color-mix(in srgb, #22d3aa 8%, var(--surface))',
          border: '1px solid color-mix(in srgb, #22d3aa 25%, transparent)',
          borderRadius: 'var(--r-lg)',
          padding: '13px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>🎉</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#22d3aa', margin: 0 }}>Pact Complete!</p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>Your reward event is now on the calendar.</p>
          </div>
        </div>
      ) : activePact && activePact.status === 'failed' ? (
        <div style={{
          background: 'color-mix(in srgb, #ef4444 6%, var(--surface))',
          border: '1px solid color-mix(in srgb, #ef4444 18%, transparent)',
          borderRadius: 'var(--r-lg)',
          padding: '13px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Icon name="close" size={15} style={{ color: '#ef4444', flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#fb7185', margin: 0 }}>Pact Failed</p>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>The group didn't hit the target in time.</p>
          </div>
        </div>
      ) : null}

      {isCurrentUserAdmin && (!activePact || activePact.status !== 'active') && (
        <button
          onClick={() => setShowPactModal(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: activePact ? 10 : 0,
            width: '100%',
            padding: '11px 14px',
            background: 'var(--accent-soft)',
            border: '1px dashed color-mix(in srgb, var(--accent) 40%, transparent)',
            borderRadius: 'var(--r-lg)',
            color: 'var(--accent)',
            fontSize: 13.5, fontWeight: 650,
            cursor: 'pointer',
            transition: 'var(--transition)',
          }}
        >
          <Icon name="trophy" size={15} />
          Start a Group Pact
        </button>
      )}

      {/* Past pacts history */}
      {pastPacts.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => setShowPastPacts(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-3)', fontSize: 12, fontWeight: 600, padding: 0,
            }}
          >
            <Icon name="chevD" size={13} style={{ transform: showPastPacts ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            {pastPacts.length} past pact{pastPacts.length !== 1 ? 's' : ''}
          </button>

          {showPastPacts && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pastPacts.map((p) => {
                const succeeded = p.status === 'succeeded'
                const pct = p.target_completions > 0
                  ? Math.min(100, Math.round((p.completions_count / p.target_completions) * 100))
                  : 0
                return (
                  <div key={p.pact_id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px',
                    background: 'var(--surface-2)',
                    border: `1px solid ${succeeded ? 'color-mix(in srgb, #22d3aa 20%, transparent)' : 'var(--border)'}`,
                    borderRadius: 'var(--r-md)',
                  }}>
                    <span style={{ fontSize: 15, flexShrink: 0 }}>{succeeded ? '✅' : '❌'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {succeeded ? 'Completed' : 'Failed'}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>
                          {p.completions_count}/{p.target_completions} · {pct}%
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>
                          ended {new Date(p.ends_at + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                      <div style={{ marginTop: 5, height: 3, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${pct}%`,
                          background: succeeded ? '#22d3aa' : '#6b7280',
                          borderRadius: 99,
                        }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )

  // ── Challenges section ────────────────────────────────────────────────────────
  async function createChallenge(e: FormEvent) {
    e.preventDefault()
    if (!challengeTitle.trim() || !challengeTarget || !challengeStartDate) return
    setSavingChallenge(true)
    try {
      const { data } = await api.post(`/groups/${groupId}/challenges`, {
        title: challengeTitle.trim(),
        description: challengeDesc.trim() || undefined,
        target_value: parseInt(challengeTarget, 10),
        unit: challengeUnit,
        start_date: challengeStartDate,
        end_date: challengeEndDate || undefined,
      })
      if (data.success) {
        setChallenges((prev) => [data.challenge, ...prev])
        setShowCreateChallenge(false)
        setChallengeTitle('')
        setChallengeTarget('')
        setChallengeDesc('')
        setChallengeEndDate('')
      }
    } catch {
      // silently fail
    } finally {
      setSavingChallenge(false)
    }
  }

  function deleteChallenge(id: number) {
    api.delete(`/groups/${groupId}/challenges/${id}`).catch(() => {})
    setChallenges((prev) => prev.filter((c) => c.challenge_id !== id))
  }

  const challengeInputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--surface-2)', border: '1px solid var(--border-2)',
    borderRadius: 'var(--r-sm)', padding: '8px 11px',
    fontSize: 13.5, color: 'var(--text-1)', outline: 'none',
  }

  const challengesSection = (
    <Section title="Challenges" count={challenges.length || undefined}>
      <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 12px', lineHeight: 1.5 }}>
        Track a shared group goal — workouts logged, books read, steps walked. Different from a pact: no reward event, just collective progress.
      </p>
      {challenges.length === 0 && !isCurrentUserAdmin ? (
        <Empty text="No challenges yet." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {challenges.map((c) => (
            <GroupChallengeCard
              key={c.challenge_id}
              challenge={c}
              groupId={groupId ?? ''}
              isAdmin={isCurrentUserAdmin}
              onDelete={deleteChallenge}
            />
          ))}
          {challenges.length === 0 && isCurrentUserAdmin && (
            <Empty text="No challenges yet — create the first one!" />
          )}
        </div>
      )}
      {isCurrentUserAdmin && (
        <div style={{ marginTop: challenges.length > 0 ? 12 : 0 }}>
          {showCreateChallenge ? (
            <form onSubmit={createChallenge} style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border-2)',
              borderRadius: 'var(--r-lg)',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>New Challenge</p>
              <input
                style={challengeInputStyle}
                placeholder="Title"
                value={challengeTitle}
                onChange={(e) => setChallengeTitle(e.target.value)}
                required
                autoFocus
              />
              <textarea
                style={{ ...challengeInputStyle, minHeight: 60, resize: 'vertical' }}
                placeholder="Description (optional)"
                value={challengeDesc}
                onChange={(e) => setChallengeDesc(e.target.value)}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 4, fontWeight: 600 }}>Target</label>
                  <input
                    style={challengeInputStyle}
                    type="number"
                    min={1}
                    placeholder="e.g. 100"
                    value={challengeTarget}
                    onChange={(e) => setChallengeTarget(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 4, fontWeight: 600 }}>Unit</label>
                  <input
                    style={challengeInputStyle}
                    placeholder="completions"
                    value={challengeUnit}
                    onChange={(e) => setChallengeUnit(e.target.value)}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 4, fontWeight: 600 }}>Start date</label>
                  <input
                    style={challengeInputStyle}
                    type="date"
                    value={challengeStartDate}
                    onChange={(e) => setChallengeStartDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 4, fontWeight: 600 }}>End date</label>
                  <input
                    style={challengeInputStyle}
                    type="date"
                    value={challengeEndDate}
                    onChange={(e) => setChallengeEndDate(e.target.value)}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button variant="ghost" size="sm" type="button" onClick={() => setShowCreateChallenge(false)}>Cancel</Button>
                <Button variant="primary" size="sm" type="submit" disabled={savingChallenge}>
                  {savingChallenge ? 'Creating…' : 'Create'}
                </Button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => {
                setChallengeStartDate(new Date().toISOString().slice(0, 10))
                setShowCreateChallenge(true)
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'none', border: '1px dashed var(--border-2)',
                borderRadius: 'var(--r-md)', padding: '10px 14px',
                color: 'var(--accent)', cursor: 'pointer', width: '100%',
                fontSize: 13.5, fontWeight: 650,
              }}
            >
              <Icon name="plus" size={15} />
              New challenge
            </button>
          )}
        </div>
      )}
    </Section>
  )

  // ── Danger zone + leave ──────────────────────────────────────────────────────
  const dangerZone = (
    <div style={{
      background: 'color-mix(in srgb, #ef4444 6%, var(--surface))',
      border: '1px solid color-mix(in srgb, #ef4444 20%, transparent)',
      borderRadius: 'var(--r-lg)',
      padding: 16,
      marginTop: 32,
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    }}>
      <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#fb7185', margin: 0 }}>
        Danger zone
      </p>

      {/* Leave group (visible to all members) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {showLeaveConfirm ? (
          <div style={{
            background: 'var(--surface-2)', borderRadius: 'var(--r-md)',
            padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
              Leave this group? You will lose access to all its events and tasks.
            </p>
            {leaveError && (
              <p style={{ fontSize: 12.5, color: '#fb7185', margin: 0 }}>{leaveError}</p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Button variant="danger" size="sm" disabled={leaving} onClick={leaveGroup}>
                {leaving ? 'Leaving…' : 'Yes, leave'}
              </Button>
              <button
                onClick={() => { setShowLeaveConfirm(false); setLeaveError(null) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-3)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Leave group</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>
                You will no longer have access to this group's events and tasks.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setShowLeaveConfirm(true)}>
              Leave group
            </Button>
          </div>
        )}
      </div>

      {/* Delete group (admin only) */}
      {isCurrentUserAdmin && (
        <div style={{ borderTop: '1px solid color-mix(in srgb, #ef4444 20%, transparent)', paddingTop: 16 }}>
          {showDeleteConfirm ? (
            <div style={{
              background: 'var(--surface-2)', borderRadius: 'var(--r-md)',
              padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
                Are you sure? This permanently deletes all events and tasks in this group and cannot be undone.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Button variant="danger" size="sm" disabled={deleting} onClick={deleteGroup}>
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </Button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-3)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Delete group</p>
                <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>
                  Permanently remove this group, all its events and tasks.
                </p>
              </div>
              <Button variant="danger" size="sm" onClick={() => setShowDeleteConfirm(true)}>
                Delete group
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )

  // ── Mobile tabs ──────────────────────────────────────────────────────────────
  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'events',   label: 'Events' },
    { id: 'tasks',    label: 'Tasks' },
    { id: 'members',  label: 'Members' },
  ]

  const tabBar = (
    <div style={{
      display: 'flex',
      borderBottom: '1px solid var(--border)',
      marginBottom: 24,
      gap: 0,
    }}>
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => setActiveTab(t.id)}
          style={{
            flex: 1,
            padding: '11px 8px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === t.id ? `2px solid var(--accent)` : '2px solid transparent',
            color: activeTab === t.id ? 'var(--text-1)' : 'var(--text-3)',
            fontSize: 13,
            fontWeight: activeTab === t.id ? 650 : 500,
            cursor: 'pointer',
            transition: 'var(--transition)',
            marginBottom: -1,
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  )

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: 48, height: '100%', overflowY: 'auto' }} className="scroll">
      {coverSection}

      <div style={{ padding: `0 clamp(16px, 4vw, 24px)` }}>
        {colorSettings}

        {isMobile ? (
          <>
            {tabBar}
            {activeTab === 'overview' && <>{pactSection}{eventsSection}{tasksSection}{challengesSection}{dangerZone}</>}
            {activeTab === 'events'   && eventsSection}
            {activeTab === 'tasks'    && tasksSection}
            {activeTab === 'members'  && <>{membersSection}{dangerZone}</>}
          </>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 32 }}>
            <div>
              {pactSection}
              {eventsSection}
              {tasksSection}
              {challengesSection}
              {dangerZone}
            </div>
            <div>
              {membersSection}
              {activitySection}
            </div>
          </div>
        )}
      </div>

      {/* Invite modal */}
      {inviteOpen && (
        <Modal title="Invite members" onClose={() => setInviteOpen(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <form onSubmit={searchUser} style={{ display: 'flex', gap: 8 }}>
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by username or email"
                style={{ ...inputStyle, flex: 1 }}
              />
              <Button type="submit" variant="secondary" size="sm" disabled={searching}>
                {searching ? '…' : 'Search'}
              </Button>
            </form>

            {searchResult && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: 'var(--r-md)',
                background: 'var(--surface-2)',
                border: '1px solid var(--border-2)',
              }}>
                <div>
                  <p style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--text-1)', margin: 0 }}>{searchResult.username}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>{searchResult.email}</p>
                </div>
                <Button variant="soft" size="sm" onClick={addToInviteList}>Add</Button>
              </div>
            )}

            {inviteList.length > 0 && (
              <div>
                <p style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  To invite:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {inviteList.map((u) => (
                    <div key={u.user_id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: 'var(--r-sm)',
                      background: 'var(--surface-2)',
                    }}>
                      <span style={{ fontSize: 13.5, color: 'var(--text-1)' }}>{u.username}</span>
                      <button
                        onClick={() => setInviteList((prev) => prev.filter((x) => x.user_id !== u.user_id))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
              <Button
                variant="primary"
                full
                disabled={inviting || inviteList.length === 0}
                onClick={sendInvites}
              >
                {inviting ? 'Inviting…' : 'Send invites'}
              </Button>
              <Button variant="secondary" full onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit group modal */}
      {showEditModal && (
        <Modal title="Edit group" onClose={() => setShowEditModal(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Title */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--text-2)' }}>Group name</label>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Group name"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)', color: 'var(--text-1)',
                  padding: '10px 12px', fontSize: 14, outline: 'none',
                }}
              />
            </div>

            {/* Description */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--text-2)' }}>Description</label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="What's this group about?"
                rows={3}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)', color: 'var(--text-1)',
                  padding: '10px 12px', fontSize: 14, outline: 'none',
                  resize: 'vertical', fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Tag selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--text-2)' }}>Tag</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {([
                  { value: 'family',  color: '#f59e0b' },
                  { value: 'friends', color: '#ec4899' },
                  { value: 'work',    color: '#22d3aa' },
                  { value: 'climb',   color: '#38bdf8' },
                  { value: 'book',    color: '#c084fc' },
                ] as const).map(({ value, color }) => {
                  const selected = editTag === value
                  return (
                    <button
                      key={value}
                      onClick={() => setEditTag(selected ? '' : value)}
                      style={{
                        padding: '5px 14px',
                        borderRadius: 'var(--r-full)',
                        fontSize: 12.5, fontWeight: 650,
                        cursor: 'pointer',
                        transition: 'var(--transition)',
                        background: selected
                          ? `color-mix(in srgb, ${color} 20%, transparent)`
                          : `color-mix(in srgb, ${color} 10%, transparent)`,
                        border: selected
                          ? `1.5px solid ${color}`
                          : `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
                        color: selected ? color : 'var(--text-2)',
                      }}
                    >
                      #{value}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
              <Button
                variant="primary"
                full
                disabled={editSaving || !editTitle.trim()}
                onClick={saveGroupEdits}
              >
                {editSaving ? 'Saving…' : 'Save changes'}
              </Button>
              <Button variant="secondary" full onClick={() => setShowEditModal(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Pact creation modal */}
      {showPactModal && (
        <PactModal
          groupId={Number(groupId)}
          onClose={() => setShowPactModal(false)}
          onCreated={(pact) => setActivePact(pact)}
        />
      )}

      {/* Pact celebration */}
      {celebratePactId && (
        <PactCelebration
          pactId={celebratePactId}
          onDone={() => setCelebratePactId(null)}
        />
      )}

      {/* Event creation modal — pre-selects this group */}
      {showEventModal && (
        <EventFormModal
          event={null}
          selectInfo={null}
          groups={[{ groups_id: String(groupId), groups_title: groupTitle || 'This group', groups_description: '', tag_name: groupTag }]}
          currentUserId={currentUserId}
          onClose={() => setShowEventModal(false)}
          onSaved={() => {
            setShowEventModal(false)
            // Reload events after creating
            api.get('/renderEvents').then(({ data }) => {
              if (data.success && Array.isArray(data.events)) {
                setEvents(data.events.filter((e: CalEvent) => String(e.extendedProps?.groupsId) === String(groupId)))
              }
            }).catch(() => {})
          }}
        />
      )}
    </div>
  )
}
