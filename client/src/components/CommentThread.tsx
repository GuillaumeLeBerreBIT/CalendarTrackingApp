import { useState, useEffect } from 'react'
import Icon from '@/components/ui/Icon'
import { Avatar } from '@/components/ui/Avatar'
import api from '@/api/client'

interface Comment {
  commentId: number
  body: string
  userId: string
  username: string
  createdAt: string
}

interface CommentThreadProps {
  eventId: string | number
  currentUserId?: string
  /** Section heading shown above the thread. */
  title?: string
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

/**
 * Self-contained event comment thread — fetches, posts and deletes its own
 * comments via /api/events/:id/comments. Used in EventModal and the doodle
 * voting card.
 */
export default function CommentThread({ eventId, currentUserId, title = 'Comments' }: CommentThreadProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [input, setInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!eventId) return
    let cancelled = false
    api.get<{ comments: Comment[] }>(`/events/${eventId}/comments`)
      .then(res => { if (!cancelled && res.data?.comments) setComments(res.data.comments) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [eventId])

  async function handleSubmit() {
    if (!input.trim() || submitting) return
    setSubmitting(true)
    try {
      const res = await api.post<{ comment: Comment }>(`/events/${eventId}/comments`, { body: input.trim() })
      if (res.data?.comment) {
        setComments(prev => [...prev, res.data.comment])
        setInput('')
      }
    } catch {
      // silently fail — user can retry
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(commentId: number) {
    setComments(prev => prev.filter(c => c.commentId !== commentId))
    try {
      await api.delete(`/events/${eventId}/comments/${commentId}`)
    } catch {
      // backend is source of truth on next open
    }
  }

  return (
    <div>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.09em',
        textTransform: 'uppercase',
        color: 'var(--text-3)',
        marginBottom: 12,
      }}>
        {title}
      </div>

      {comments.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 14 }}>
          No comments yet. Be the first!
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          {comments.map(c => (
            <div key={c.commentId} style={{
              display: 'flex',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 'var(--r-md)',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              alignItems: 'flex-start',
            }}>
              <Avatar id={c.userId} size={26} name={c.username} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{c.username}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 400 }}>{relativeTime(c.createdAt)}</span>
                </div>
                <p style={{ fontSize: 13.5, color: 'var(--text-1)', lineHeight: 1.5, margin: 0, wordBreak: 'break-word' }}>
                  {c.body}
                </p>
              </div>
              {c.userId === currentUserId && (
                <button
                  onClick={() => handleDelete(c.commentId)}
                  title="Delete comment"
                  style={{
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 22,
                    height: 22,
                    borderRadius: 'var(--r-sm)',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text-3)',
                    cursor: 'pointer',
                  }}
                >
                  <Icon name="close" size={14} sw={2} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          rows={1}
          maxLength={1000}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
          }}
          placeholder="Add a comment…"
          style={{
            flex: 1,
            resize: 'none',
            padding: '9px 12px',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--border-2)',
            background: 'var(--surface-2)',
            color: 'var(--text-1)',
            fontSize: 13.5,
            lineHeight: 1.5,
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={submitting || !input.trim()}
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 38,
            height: 38,
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--accent)',
            background: 'var(--accent)',
            color: '#fff',
            cursor: submitting || !input.trim() ? 'not-allowed' : 'pointer',
            opacity: submitting || !input.trim() ? 0.5 : 1,
            transition: 'var(--transition)',
          }}
        >
          <Icon name="chevR" size={16} sw={2.2} />
        </button>
      </div>
    </div>
  )
}
