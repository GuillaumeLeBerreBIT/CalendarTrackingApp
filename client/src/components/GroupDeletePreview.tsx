import { useEffect, useState } from 'react'
import api from '@/api/client'

interface Preview {
  taskLists: { title: string; tasks: number }[]
  events: number
}

/**
 * What deleting a group removes, by name: its task lists (with task counts)
 * and its number of events. Shown in every delete confirmation so a list
 * that "looked like" another group's is visible before anything goes.
 */
export default function GroupDeletePreview({ groupId }: { groupId: string | number }) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    api.get(`/groups/${groupId}/delete-preview`)
      .then(({ data }) => { if (live && data.success) setPreview(data) })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [groupId])

  const muted = { fontSize: 12.5, color: 'var(--text-3)', margin: 0 }
  if (failed) return <p style={muted}>Couldn't load what this group contains.</p>
  if (!preview) return <p style={muted}>Checking what this group contains…</p>

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  return (
    <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
      {preview.taskLists.length === 0 ? (
        <p style={{ margin: 0 }}>No task lists.</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {preview.taskLists.map((l) => (
            <li key={l.title}>
              Task list <strong style={{ color: 'var(--text-1)' }}>{l.title}</strong> ({plural(l.tasks, 'task')})
            </li>
          ))}
        </ul>
      )}
      <p style={{ margin: '4px 0 0' }}>{plural(preview.events, 'event')}</p>
    </div>
  )
}
