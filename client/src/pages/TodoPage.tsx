import { useEffect, useState, type FormEvent } from 'react'
import api from '@/api/client'
import type { TaskList, Task, Group } from '@/types'
import Icon from '@/components/ui/Icon'
import Button from '@/components/ui/Button'
import { Avatar, AvatarStack } from '@/components/ui/Avatar'
import { Empty } from '@/components/ui/Primitives'
import { groupColorByIndex } from './GroupsPage'

type Assignee = { userId: string; username: string | null }
type ListMember = { userId: string; username: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

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
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  )
}

// Priority badge styles
const priorityStyle = (priority: string): React.CSSProperties => {
  if (priority === 'high')   return { background: 'rgba(244,63,94,0.12)', color: '#fb7185' }
  if (priority === 'medium') return { background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }
  if (priority === 'low')    return { background: 'rgba(34,197,94,0.12)', color: '#4ade80' }
  return { background: 'var(--surface-3)', color: 'var(--text-3)' }
}

// ── Custom checkbox ───────────────────────────────────────────────────────────
function TaskCheckbox({ done, color, onClick }: { done: boolean; color: string; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 20,
        height: 20,
        borderRadius: 6,
        border: done
          ? 'none'
          : `2px solid ${hover ? color : 'var(--border-hi)'}`,
        background: done ? color : 'transparent',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'var(--transition)',
        boxShadow: done ? `0 2px 8px color-mix(in srgb, ${color} 40%, transparent)` : 'none',
      }}
    >
      {done && <Icon name="check" size={11} sw={2.8} style={{ color: '#fff' }} />}
    </button>
  )
}

// ── Assignee multi-select editor ──────────────────────────────────────────────
function AssigneeEditor({
  taskListId,
  current,
  onClose,
  onSave,
}: {
  taskListId: string
  current: Assignee[]
  onClose: () => void
  onSave: (userIds: string[]) => Promise<void>
}) {
  const [members, setMembers] = useState<ListMember[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set(current.map((a) => a.userId)))
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.get('/membersTaskList', { params: { taskListId } })
      .then(({ data }) => {
        if (cancelled) return
        if (data.success) setMembers(data.members ?? [])
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingMembers(false) })
    return () => { cancelled = true }
  }, [taskListId])

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(userId) ? next.delete(userId) : next.add(userId)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(Array.from(selected))
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      marginTop: 8,
      padding: '10px 12px',
      borderRadius: 'var(--r-sm)',
      background: 'var(--surface-2)',
      border: '1px solid var(--border-2)',
    }}>
      <p style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
        Assign to
      </p>
      {loadingMembers ? (
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>Loading members…</p>
      ) : members.length === 0 ? (
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>No members available.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {members.map((m) => {
            const on = selected.has(m.userId)
            return (
              <button
                key={m.userId}
                onClick={() => toggle(m.userId)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '6px 8px',
                  borderRadius: 'var(--r-sm)',
                  border: 'none',
                  background: on ? 'var(--accent-softer)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'var(--transition)',
                }}
              >
                <Avatar id={m.userId} name={m.username} size={22} />
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.username}
                </span>
                <span style={{
                  width: 18,
                  height: 18,
                  borderRadius: 6,
                  border: on ? 'none' : '2px solid var(--border-hi)',
                  background: on ? 'var(--accent)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {on && <Icon name="check" size={10} sw={2.8} style={{ color: '#fff' }} />}
                </span>
              </button>
            )
          })}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || loadingMembers}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  )
}

// ── Task item ─────────────────────────────────────────────────────────────────
function TaskItem({ task, color, taskListId, onToggle, onAssign }: {
  task: Task
  color: string
  taskListId: string
  onToggle: () => void
  onAssign: (userIds: string[]) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const assignees = task.assignees ?? []
  const assigneeIds = assignees.map((a) => a.userId)
  const assigneeNames: Record<string, string> = {}
  assignees.forEach((a) => { if (a.username) assigneeNames[a.userId] = a.username })

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      padding: '11px 16px',
    }}>
      <div style={{ paddingTop: 1, flexShrink: 0 }}>
        <TaskCheckbox done={task.is_completed} color={color} onClick={onToggle} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 13.5,
          fontWeight: 500,
          color: task.is_completed ? 'var(--text-3)' : 'var(--text-1)',
          textDecoration: task.is_completed ? 'line-through' : 'none',
          margin: 0,
          lineHeight: 1.4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {task.task_title}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          {task.priority && (
            <span style={{
              fontSize: 11,
              fontWeight: 650,
              padding: '2px 7px',
              borderRadius: 'var(--r-full)',
              ...priorityStyle(task.priority),
            }}>
              {task.priority}
            </span>
          )}
          {task.due_date && (
            <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
              Due {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
        {editing && (
          <AssigneeEditor
            taskListId={taskListId}
            current={assignees}
            onClose={() => setEditing(false)}
            onSave={onAssign}
          />
        )}
      </div>
      {/* Assignee avatars + assign trigger */}
      <button
        onClick={() => setEditing((v) => !v)}
        title="Assign members"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '2px 4px',
          flexShrink: 0,
        }}
      >
        {assigneeIds.length > 0 ? (
          <AvatarStack ids={assigneeIds} names={assigneeNames} size={22} max={3} ringColor="var(--surface)" />
        ) : (
          <span style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            border: '1.5px dashed var(--border-hi)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-3)',
          }}>
            <Icon name="plus" size={13} sw={2} />
          </span>
        )}
      </button>
    </div>
  )
}

// ── Task list card ────────────────────────────────────────────────────────────
interface TaskListCardProps {
  tl: TaskList
  groupIndex: number
  isExpanded: boolean
  onToggleExpand: () => void
  onAddTask: () => void
  onToggleTask: (id: string, done: boolean) => void
  onAssign: (taskId: string, userIds: string[]) => Promise<void>
}

function TaskListCard({ tl, groupIndex, isExpanded, onToggleExpand, onAddTask, onToggleTask, onAssign }: TaskListCardProps) {
  const { idTl, title, tag_group } = tl.taskListInfo
  const color = groupColorByIndex(groupIndex)
  const pct = tl.totalTasks > 0 ? Math.round((tl.totalCompletedTasks / tl.totalTasks) * 100) : 0

  return (
    <div style={{
      background: 'var(--surface)',
      borderRadius: 'var(--r-xl)',
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-sm)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleExpand}
        onKeyDown={(e) => e.key === 'Enter' && onToggleExpand()}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '13px 16px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {/* Left: chevron + title + tag */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Icon
            name={isExpanded ? 'chevD' : 'chevR'}
            size={14}
            sw={2.2}
            style={{ color: 'var(--text-3)', flexShrink: 0 }}
          />
          <span style={{
            fontSize: 14.5,
            fontWeight: 700,
            color: 'var(--text-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {title}
          </span>
          <span style={{
            fontSize: 11,
            fontWeight: 650,
            padding: '2px 8px',
            borderRadius: 'var(--r-full)',
            background: 'var(--surface-3)',
            color: 'var(--text-3)',
            flexShrink: 0,
          }}>
            #{tag_group}
          </span>
        </div>

        {/* Right: progress + add task */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {tl.totalCompletedTasks}/{tl.totalTasks} done
            </span>
            <div style={{ width: 20, height: 4, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${pct}%`,
                background: color,
                borderRadius: 99,
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onAddTask() }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12.5,
              fontWeight: 650,
              color: 'var(--accent)',
              padding: '4px 8px',
              borderRadius: 'var(--r-sm)',
              whiteSpace: 'nowrap',
            }}
          >
            + Task
          </button>
        </div>
      </div>

      {/* Tasks */}
      {isExpanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {tl.taskItems.length === 0 ? (
            <div style={{ padding: '8px 16px 12px' }}>
              <Empty text="No tasks yet." />
            </div>
          ) : (
            tl.taskItems.map((task: Task, i: number) => (
              <div
                key={task.task_id}
                style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}
              >
                <TaskItem
                  task={task}
                  color={color}
                  taskListId={idTl}
                  onToggle={() => onToggleTask(task.task_id, task.is_completed)}
                  onAssign={(userIds) => onAssign(task.task_id, userIds)}
                />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Build a tag → index map for consistent color assignment ───────────────────
function buildTagIndexMap(groups: Group[]): Map<string, number> {
  const m = new Map<string, number>()
  groups.forEach((g, i) => m.set(g.tag_name, i))
  return m
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function TodoPage() {
  const [taskLists, setTaskLists] = useState<TaskList[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [createListOpen, setCreateListOpen] = useState(false)
  const [createTaskOpen, setCreateTaskOpen] = useState<string | null>(null)
  const [listForm, setListForm] = useState({ title: '', description: '', groups_id: '' })
  const [taskForm, setTaskForm] = useState({ task_title: '', task_description: '', priority: 'medium', due_date: '' })
  const [saving, setSaving] = useState(false)

  async function load() {
    try {
      const { data } = await api.get('/todo')
      if (data.success) {
        const lists: TaskList[] = data.yourTaskLists ?? []
        const gs: Group[] = data.groupTagObj?.map((g: { gid: string; tag: string }) => ({
          groups_id: g.gid,
          groups_title: g.tag,
          groups_description: '',
          tag_name: g.tag,
        })) ?? []
        setTaskLists(lists)
        setGroups(gs)
        const defaultExpanded: Record<string, boolean> = {}
        lists.forEach((tl: TaskList) => { defaultExpanded[tl.taskListInfo.idTl] = true })
        setExpanded(defaultExpanded)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function toggleTask(taskId: string, isCompleted: boolean) {
    await api.patch('/updateTask', { taskId, isCompleted: !isCompleted })
    load()
  }

  async function assignTask(taskId: string, userIds: string[]) {
    await api.put(`/task/${taskId}/assignees`, { userIds })
    load()
  }

  async function handleCreateList(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/createTaskList', listForm)
      setCreateListOpen(false)
      setListForm({ title: '', description: '', groups_id: '' })
      load()
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateTask(e: FormEvent, taskListId: string) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/createTask', { ...taskForm, task_list_id: taskListId })
      setCreateTaskOpen(null)
      setTaskForm({ task_title: '', task_description: '', priority: 'medium', due_date: '' })
      load()
    } finally {
      setSaving(false)
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const tagIndexMap = buildTagIndexMap(groups)

  return (
    <div style={{ padding: '28px 24px', maxWidth: 760, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.03em' }}>Tasks</h1>
          <p style={{ fontSize: 13.5, color: 'var(--text-3)', margin: '4px 0 0' }}>
            {taskLists.length} list{taskLists.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="primary" icon="plus" size="md" onClick={() => setCreateListOpen(true)}>
          New list
        </Button>
      </div>

      {loading ? (
        <p style={{ fontSize: 13.5, color: 'var(--text-3)', padding: '24px 0' }}>Loading…</p>
      ) : taskLists.length === 0 ? (
        <Empty text="No task lists yet. Create one to get started." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {taskLists.map((tl) => {
            const { idTl, tag_group } = tl.taskListInfo
            const groupIdx = tagIndexMap.get(tag_group) ?? 0
            return (
              <TaskListCard
                key={idTl}
                tl={tl}
                groupIndex={groupIdx}
                isExpanded={!!expanded[idTl]}
                onToggleExpand={() => toggleExpand(idTl)}
                onAddTask={() => setCreateTaskOpen(idTl)}
                onToggleTask={toggleTask}
                onAssign={assignTask}
              />
            )
          })}
        </div>
      )}

      {/* Create list modal */}
      {createListOpen && (
        <Modal title="New task list" onClose={() => setCreateListOpen(false)}>
          <form onSubmit={handleCreateList} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Title</label>
              <input
                required
                value={listForm.title}
                onChange={(e) => setListForm((p) => ({ ...p, title: e.target.value }))}
                style={inputStyle}
                placeholder="My task list"
              />
            </div>
            <div>
              <label style={labelStyle}>Group</label>
              <select
                required
                value={listForm.groups_id}
                onChange={(e) => setListForm((p) => ({ ...p, groups_id: e.target.value }))}
                style={{ ...inputStyle }}
              >
                <option value="">Select a group</option>
                {groups.map((g) => (
                  <option key={g.groups_id} value={g.groups_id}>{g.tag_name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button type="submit" variant="primary" full disabled={saving}>
                {saving ? 'Creating…' : 'Create'}
              </Button>
              <Button type="button" variant="secondary" full onClick={() => setCreateListOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Create task modal */}
      {createTaskOpen && (
        <Modal title="New task" onClose={() => setCreateTaskOpen(null)}>
          <form onSubmit={(e) => handleCreateTask(e, createTaskOpen)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Task title</label>
              <input
                required
                value={taskForm.task_title}
                onChange={(e) => setTaskForm((p) => ({ ...p, task_title: e.target.value }))}
                style={inputStyle}
                placeholder="What needs to be done?"
              />
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <textarea
                value={taskForm.task_description}
                onChange={(e) => setTaskForm((p) => ({ ...p, task_description: e.target.value }))}
                style={{ ...inputStyle, resize: 'none' }}
                rows={2}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Priority</label>
                <select
                  value={taskForm.priority}
                  onChange={(e) => setTaskForm((p) => ({ ...p, priority: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Due date</label>
                <input
                  type="date"
                  value={taskForm.due_date}
                  onChange={(e) => setTaskForm((p) => ({ ...p, due_date: e.target.value }))}
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button type="submit" variant="primary" full disabled={saving}>
                {saving ? 'Creating…' : 'Create task'}
              </Button>
              <Button type="button" variant="secondary" full onClick={() => setCreateTaskOpen(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
