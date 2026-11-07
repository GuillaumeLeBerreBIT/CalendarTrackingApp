import { useEffect, useState, type FormEvent } from 'react'
import { fieldStyle } from '@/components/ui/Controls'
import { SheetDialog as Modal, useIsPhone } from '@/components/ui/Sheet'
import { useSearchParams } from 'react-router-dom'
import api from '@/api/client'
import type { TaskList, Task, Group } from '@/types'
import Icon from '@/components/ui/Icon'
import Button, { IconButton } from '@/components/ui/Button'
import { Avatar, AvatarStack } from '@/components/ui/Avatar'
import { Segmented } from '@/components/ui/Primitives'
import ShoppingLists from '@/components/ShoppingLists'
import { groupColorById } from './GroupsPage'
import EventFormModal from '@/components/EventFormModal'

type Assignee = { userId: string; username: string | null }
type ListMember = { userId: string; username: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = fieldStyle

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12.5,
  fontWeight: 650,
  color: 'var(--text-2)',
  marginBottom: 6,
}



// ── Task checkbox (board: 18px square, ink when done) ─────────────────────────
function TaskCheckbox({ done, onClick, label }: { done: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={done}
      aria-label={label}
      style={{
        width: 18, height: 18, borderRadius: 5, flex: '0 0 18px', boxSizing: 'border-box', padding: 0,
        border: done ? 'none' : '1.5px solid var(--border-hi)',
        background: done ? 'var(--accent)' : 'transparent', color: 'var(--accent-text)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
      }}
    >
      {done && <Icon name="check" size={11} sw={3.2} />}
    </button>
  )
}

const fmtDue = (d: string) => new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

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
      <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-3)', margin: '0 0 8px' }}>
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
                  {on && <Icon name="check" size={10} sw={2.8} style={{ color: 'var(--accent-text)' }} />}
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

// ── Task row (board: 40px, check · title · due · assignee) ────────────────────
function TaskItem({ task, taskListId, onToggle, onAssign, onSchedule }: {
  task: Task
  taskListId: string
  onToggle: () => void
  onAssign: (userIds: string[]) => Promise<void>
  onSchedule: () => void
}) {
  const [editing, setEditing] = useState(false)
  const assignees = task.assignees ?? []
  const assigneeIds = assignees.map((a) => a.userId)
  const assigneeNames: Record<string, string> = {}
  assignees.forEach((a) => { if (a.username) assigneeNames[a.userId] = a.username })
  const done = task.is_completed

  return (
    <div>
      <div className="row-hover" style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 40, padding: '0 8px', borderRadius: 8 }}>
        <TaskCheckbox done={done} onClick={onToggle} label={done ? `Reopen ${task.task_title}` : `Complete ${task.task_title}`} />
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: '9px 0' }}>
          <span style={{
            fontSize: 15, color: done ? 'var(--text-3)' : 'var(--text-1)', textDecoration: done ? 'line-through' : 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{task.task_title}</span>
          {task.task_description && (
            <span style={{ fontSize: 13, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.task_description}</span>
          )}
        </span>
        {task.priority === 'high' && !done && <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--danger)' }}>High</span>}
        {task.due_date && <span style={{ fontSize: 12, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtDue(task.due_date)}</span>}
        <IconButton name="cal" size={32} isz={15} title="Put on the calendar" onClick={onSchedule} />
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-label={assigneeIds.length ? `Assigned to ${assignees.map(a => a.username).join(', ')}. Change` : 'Assign someone'}
          style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}
        >
          {assigneeIds.length > 0 ? (
            <AvatarStack ids={assigneeIds} names={assigneeNames} size={24} max={2} ringColor="var(--bg)" />
          ) : (
            <span style={{ width: 24, height: 24, borderRadius: 12, border: '1.5px dashed var(--border-hi)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
              <Icon name="plus" size={12} sw={2} />
            </span>
          )}
        </button>
      </div>
      {editing && (
        <div style={{ padding: '0 8px 8px 38px' }}>
          <AssigneeEditor taskListId={taskListId} current={assignees} onClose={() => setEditing(false)} onSave={onAssign} />
        </div>
      )}
    </div>
  )
}

// ── Inline "Add a task, press Enter" row ─────────────────────────────────────
function AddTaskRow({ onAdd, onDetails }: { onAdd: (title: string) => Promise<void>; onDetails: () => void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit() {
    const t = value.trim()
    if (!t || busy) return
    setBusy(true)
    try { await onAdd(t); setValue('') } finally { setBusy(false) }
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 40, padding: '0 8px', color: 'var(--text-3)' }}>
      <Icon name="plus" size={18} sw={2} style={{ flex: '0 0 18px' }} />
      <input
        data-bare
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }}
        placeholder="Add a task, press Enter"
        aria-label="Add a task"
        maxLength={200}
        style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', fontSize: 15, color: 'var(--text-1)', fontFamily: 'inherit', boxShadow: 'none' }}
      />
      <button type="button" onClick={onDetails} style={{ border: 0, background: 'transparent', color: 'var(--text-3)', fontSize: 13, cursor: 'pointer', padding: '0 4px', height: 32 }}>
        Details
      </button>
    </div>
  )
}

// ── Task list section (board: plain header line, rows, add row) ──────────────
function TaskListSection({ tl, onAddTask, onQuickAdd, onToggleTask, onAssign, onScheduleTask }: {
  tl: TaskList
  onAddTask: () => void
  onQuickAdd: (title: string) => Promise<void>
  onToggleTask: (id: string, done: boolean) => void
  onAssign: (taskId: string, userIds: string[]) => Promise<void>
  onScheduleTask: (task: Task, groupsId: string) => void
}) {
  const { idTl, idG, title, tag_group, group_title } = tl.taskListInfo
  const color = groupColorById(idG)
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 8px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: 0, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h2>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: color }} />{group_title || tag_group}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{tl.totalCompletedTasks}/{tl.totalTasks}</span>
      </div>
      {tl.taskItems.map((task: Task) => (
        <TaskItem
          key={task.task_id}
          task={task}
          taskListId={idTl}
          onToggle={() => onToggleTask(task.task_id, task.is_completed)}
          onAssign={(userIds) => onAssign(task.task_id, userIds)}
          onSchedule={() => onScheduleTask(task, idG)}
        />
      ))}
      <AddTaskRow onAdd={onQuickAdd} onDetails={onAddTask} />
    </section>
  )
}

// ── Tasks column ──────────────────────────────────────────────────────────────
function TasksTab({ createListOpen, setCreateListOpen, onCount }: {
  createListOpen: boolean
  setCreateListOpen: (open: boolean) => void
  onCount: (open: number) => void
}) {
  const [taskLists, setTaskLists] = useState<TaskList[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [createTaskOpen, setCreateTaskOpen] = useState<string | null>(null)
  const [scheduleTask, setScheduleTask] = useState<{ task: Task; groupsId: string } | null>(null)
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
        onCount(lists.reduce((n, tl) => n + tl.taskItems.filter(t => !t.is_completed).length, 0))
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleTask(taskId: string, isCompleted: boolean) {
    await api.patch('/updateTask', { taskId, isCompleted: !isCompleted })
    load()
  }

  async function assignTask(taskId: string, userIds: string[]) {
    await api.put(`/task/${taskId}/assignees`, { userIds })
    load()
  }

  async function quickAdd(taskListId: string, title: string) {
    await api.post('/createTask', { task_title: title, task_description: '', priority: 'medium', due_date: '', task_list_id: taskListId })
    await load()
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

  return (
    <div>
      {loading ? (
        <p style={{ fontSize: 14, color: 'var(--text-3)', padding: '24px 8px' }}>Loading…</p>
      ) : taskLists.length === 0 ? (
        <div style={{ padding: '32px 8px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <p style={{ fontSize: 14, color: 'var(--text-3)' }}>No task lists yet.</p>
          <Button variant="secondary" icon="plus" onClick={() => setCreateListOpen(true)}>New list</Button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {taskLists.map((tl) => {
            const { idTl } = tl.taskListInfo
            return (
              <TaskListSection
                key={idTl}
                tl={tl}
                onAddTask={() => setCreateTaskOpen(idTl)}
                onQuickAdd={(title) => quickAdd(idTl, title)}
                onToggleTask={toggleTask}
                onAssign={assignTask}
                onScheduleTask={(task, groupsId) => setScheduleTask({ task, groupsId })}
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

      {scheduleTask && (
        <EventFormModal
          event={null}
          selectInfo={null}
          groups={groups}
          prefill={{
            title: scheduleTask.task.task_title,
            date: scheduleTask.task.due_date ?? undefined,
            location: undefined,
          }}
          onClose={() => setScheduleTask(null)}
          onSaved={() => setScheduleTask(null)}
        />
      )}
    </div>
  )
}

export default function TodoPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'shopping' ? 'shopping' : 'tasks'
  const phone = useIsPhone()
  const [createListOpen, setCreateListOpen] = useState(false)
  const [openCount, setOpenCount] = useState(0)

  if (phone) {
    return (
      <div>
        <div style={{ padding: '12px 16px 8px' }}>
          <Segmented
            full
            size="md"
            label="Tasks or shopping"
            options={[{ value: 'tasks', label: 'Tasks' }, { value: 'shopping', label: 'Shopping' }]}
            value={tab}
            onChange={(v) => setParams(v === 'shopping' ? { tab: 'shopping' } : {}, { replace: true })}
          />
        </div>
        {tab === 'shopping' ? <ShoppingLists /> : (
          <div style={{ padding: '4px 8px 32px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '4px 8px 16px' }}>
              <div>
                <h1 className="page-title">Tasks</h1>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-3)' }}>{openCount} open</p>
              </div>
              <Button variant="primary" size="sm" icon="plus" onClick={() => setCreateListOpen(true)}>New list</Button>
            </div>
            <TasksTab createListOpen={createListOpen} setCreateListOpen={setCreateListOpen} onCount={setOpenCount} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '12px 16px 12px 24px', borderBottom: '1px solid var(--border)', minHeight: 36 }}>
        <h1 className="page-title">Tasks &amp; shopping</h1>
        <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{openCount} open task{openCount === 1 ? '' : 's'}</span>
        <div style={{ flex: 1 }} />
        <Button variant="primary" icon="plus" onClick={() => setCreateListOpen(true)}>New list</Button>
      </header>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 32, padding: 24 }}>
        <div style={{ flex: '999 1 420px', minWidth: 0, maxWidth: 680 }}>
          <TasksTab createListOpen={createListOpen} setCreateListOpen={setCreateListOpen} onCount={setOpenCount} />
        </div>
        <aside style={{ flex: '1 1 300px', maxWidth: 360, minWidth: 0, background: 'var(--bg-deep)', borderRadius: 14, padding: 16, boxSizing: 'border-box' }}>
          <ShoppingLists compact />
        </aside>
      </div>
    </div>
  )
}
