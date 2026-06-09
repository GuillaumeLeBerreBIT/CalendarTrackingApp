import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotificationStore } from '@/store/notificationStore'
import Icon from '@/components/ui/Icon'
import Button from '@/components/ui/Button'
import { Empty } from '@/components/ui/Primitives'
import type { AppNotification } from '@/types'

const TYPE_META: Record<string, { icon: string; color: string }> = {
  group_invite:    { icon: 'groups', color: 'var(--accent)' },
  event_invite:    { icon: 'cal',    color: 'var(--accent)' },
  rsvp_reply:      { icon: 'check',  color: 'var(--g-work)' },
  event_changed:   { icon: 'cal',    color: 'var(--g-family)' },
  event_cancelled: { icon: 'close',  color: '#fb7185' },
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const { items, unread, loading, fetch, markRead, markAllRead, remove } = useNotificationStore()

  useEffect(() => { fetch() }, [fetch])

  function handleOpen(n: AppNotification) {
    if (!n.is_read) markRead(n.notification_id)
    if (n.link) navigate(n.link)
  }

  return (
    <div style={{ padding: '28px 24px', maxWidth: 640, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.02em', margin: 0 }}>
          Notifications
          {unread > 0 && (
            <span style={{
              marginLeft: 10,
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--accent)',
              background: 'var(--accent-softer)',
              border: '1px solid var(--accent-line)',
              borderRadius: 'var(--r-full)',
              padding: '2px 9px',
              verticalAlign: 'middle',
            }}>{unread} new</span>
          )}
        </h1>
        {items.length > 0 && unread > 0 && (
          <Button variant="ghost" size="sm" onClick={() => markAllRead()}>Mark all read</Button>
        )}
      </div>

      {loading && items.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 68, borderRadius: 'var(--r-md)' }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Empty text="You're all caught up — no notifications yet." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((n) => {
            const meta = TYPE_META[n.type] ?? { icon: 'bell', color: 'var(--text-3)' }
            return (
              <div
                key={n.notification_id}
                role="button"
                tabIndex={0}
                onClick={() => handleOpen(n)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 13,
                  padding: '13px 15px',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--border)',
                  background: n.is_read ? 'var(--surface)' : 'var(--accent-softer)',
                  cursor: 'pointer',
                  transition: 'var(--transition)',
                }}
              >
                {/* Icon */}
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: 'var(--surface-3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: meta.color,
                }}>
                  <Icon name={meta.icon} size={18} sw={1.9} />
                </div>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 650, color: 'var(--text-1)' }}>{n.title}</span>
                    {!n.is_read && (
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
                    )}
                  </div>
                  {n.body && (
                    <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '3px 0 0', lineHeight: 1.45 }}>{n.body}</p>
                  )}
                  <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '4px 0 0' }}>{relativeTime(n.created_at)}</p>
                </div>

                {/* Dismiss */}
                <button
                  onClick={(e) => { e.stopPropagation(); remove(n.notification_id) }}
                  title="Dismiss"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-3)',
                    cursor: 'pointer',
                    padding: 4,
                    display: 'flex',
                    flexShrink: 0,
                  }}
                >
                  <Icon name="close" size={15} sw={2} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
