import { useState, useEffect, useCallback } from 'react'
import Icon from '@/components/ui/Icon'
import Button from '@/components/ui/Button'
import { IconButton } from '@/components/ui/Button'
import api from '@/api/client'
import type { DiscoveryEvent } from '@/lib/mockData'
import type { Group } from '@/types'

interface Props {
  event: DiscoveryEvent
  groups: Group[]
  onClose: () => void
  onSaved: () => void
}

/** Parse "6 Jun" or "7 Jun" style dates into YYYY-MM-DD using current year. */
function parseDiscoveryDate(dateStr: string): string {
  try {
    const year = new Date().getFullYear()
    const parsed = new Date(`${dateStr} ${year}`)
    if (isNaN(parsed.getTime())) return ''
    return parsed.toISOString().split('T')[0]
  } catch {
    return ''
  }
}

/** Prefer the machine-readable local startISO; fall back to the display strings. */
function initialDate(ev: DiscoveryEvent): string {
  if (ev.startISO && ev.startISO.includes('-')) return ev.startISO.split('T')[0]
  return parseDiscoveryDate(ev.date)
}
function initialTime(ev: DiscoveryEvent): string {
  if (ev.startISO && ev.startISO.includes('T')) return ev.startISO.split('T')[1].slice(0, 5)
  return ev.time || ''
}

export default function SaveToCalendarModal({ event: ev, groups, onClose, onSaved }: Props) {
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [selectedDate, setSelectedDate] = useState(initialDate(ev))
  const [selectedTime, setSelectedTime] = useState(initialTime(ev))
  const [location, setLocation] = useState(ev.venue || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await api.post('/parseEvent', {
        'calendar-title': ev.title,
        'calendar-description': ev.blurb,
        location: location.trim() || undefined,
        image_url: ev.image || undefined,
        allDay: false,
        startDate: selectedDate,
        endDate: selectedDate,
        startTime: selectedTime,
        endTime: '',
        // Discovery events are Social — backend auto-invites everyone in the group
        event_type: selectedGroupId ? 'social' : undefined,
        tagNames: selectedGroupId || undefined,
        participants: [],
      })
      onSaved()
    } catch (err: unknown) {
      const msg =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { error?: string } } }).response?.data?.error
          ? (err as { response: { data: { error: string } } }).response.data.error
          : 'Failed to save event. Please try again.'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--surface-2)',
    border: '1px solid var(--border-2)',
    borderRadius: 'var(--r-sm)',
    color: 'var(--text-1)',
    padding: '9px 12px',
    minHeight: 44,
    fontSize: 14,
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--text-3)',
    marginBottom: 8,
    display: 'block',
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'var(--scrim)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--surface)',
          borderRadius: 'var(--r-xl)',
          border: '1px solid var(--border-2)',
          boxShadow: 'var(--shadow-lg)',
          animation: 'scaleIn 0.24s cubic-bezier(0.2,0.7,0.2,1) both',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 20px 16px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--r-sm)',
              background: 'var(--accent-softer)',
              border: '1px solid var(--accent-line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)',
              flexShrink: 0,
            }}>
              <Icon name="calendar" size={18} sw={2} />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.2 }}>
                Add to your calendar
              </h2>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                {ev.title}
              </p>
            </div>
          </div>
          <IconButton name="close" size={34} onClick={onClose} title="Close" />
        </div>

        {/* Form body */}
        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Group picker */}
          <div>
            <label htmlFor="stc-group" style={labelStyle}>Group</label>
            <select
              id="stc-group"
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              style={inputStyle}
            >
              <option value="">Personal (no group)</option>
              {groups.map((g) => (
                <option key={g.groups_id} value={g.groups_id}>
                  {g.groups_title}
                </option>
              ))}
            </select>
          </div>

          {/* Date + time row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label htmlFor="stc-date" style={labelStyle}>Start date</label>
              <input
                id="stc-date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="stc-time" style={labelStyle}>Start time</label>
              <input
                id="stc-time"
                type="time"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Location */}
          <div>
            <label htmlFor="stc-location" style={labelStyle}>Location</label>
            <input
              id="stc-location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Venue or address"
              style={inputStyle}
            />
          </div>

          {/* Social invite banner — shown when a group is selected */}
          {selectedGroupId && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 14px',
              borderRadius: 'var(--r-md)',
              background: 'var(--accent-softer)',
              border: '1px solid var(--accent-line)',
            }}>
              <Icon name="groups" size={16} sw={1.8} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
                Everyone in this group will be invited and can RSVP.
              </p>
            </div>
          )}

          {/* Inline error */}
          {error && (
            <div style={{
              background: 'rgba(244,63,94,0.1)',
              border: '1px solid rgba(244,63,94,0.28)',
              borderRadius: 'var(--r-sm)',
              padding: '10px 14px',
              fontSize: 13,
              color: '#fb7185',
            }}>
              {error}
            </div>
          )}

          {/* Footer buttons */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <Button
              variant="secondary"
              full
              size="lg"
              type="button"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              full
              size="lg"
              icon="plus"
              type="submit"
              disabled={submitting}
            >
              {submitting ? 'Saving...' : 'Add to calendar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
