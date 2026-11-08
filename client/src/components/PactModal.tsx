import { useState, type FormEvent } from 'react'
import { fieldStyle } from '@/components/ui/Controls'
import Sheet from '@/components/ui/Sheet'
import api from '@/api/client'
import Button from '@/components/ui/Button'
import Icon from '@/components/ui/Icon'
import type { Pact } from '@/types'

const inputStyle: React.CSSProperties = fieldStyle

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12.5,
  fontWeight: 600,
  color: 'var(--text-2)',
  marginBottom: 6,
}

interface PactModalProps {
  groupId: number
  onClose: () => void
  onCreated: (pact: Pact) => void
}

export default function PactModal({ groupId, onClose, onCreated }: PactModalProps) {
  const [rewardTitle, setRewardTitle] = useState('')
  const [rewardDate, setRewardDate] = useState('')
  const [rewardTime, setRewardTime] = useState('')
  const [targetCompletions, setTargetCompletions] = useState(10)
  const [endsAt, setEndsAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const today = new Date().toISOString().slice(0, 10)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!rewardTitle.trim() || !rewardDate || !endsAt) return
    if (endsAt < today) { setError('End date must be today or later.'); return }
    if (rewardDate < today) { setError('Reward date must be today or later.'); return }

    setSaving(true)
    setError('')
    try {
      const { data } = await api.post(`/groups/${groupId}/pacts`, {
        reward_title: rewardTitle.trim(),
        reward_date: rewardDate,
        reward_time: rewardTime || null,
        target_completions: targetCompletions,
        ends_at: endsAt,
      })
      if (data.success) {
        onCreated(data.pact)
        onClose()
      } else {
        setError(data.error || 'Failed to create pact.')
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet title="New group pact" onClose={onClose} width={440}>
      <div>
        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0, lineHeight: 1.6 }}>
            A locked event appears on everyone's calendar. Hit the target and it unlocks for real.
          </p>

          <div>
            <label style={labelStyle}>Reward event name</label>
            <input
              style={inputStyle}
              placeholder="e.g. Team Dinner at Noma"
              value={rewardTitle}
              onChange={(e) => setRewardTitle(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Event date</label>
              <input type="date" style={inputStyle} value={rewardDate} min={today} onChange={(e) => setRewardDate(e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle}>Event time (optional)</label>
              <input type="time" style={inputStyle} value={rewardTime} onChange={(e) => setRewardTime(e.target.value)} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Pact deadline</label>
            <input type="date" style={inputStyle} value={endsAt} min={today} onChange={(e) => setEndsAt(e.target.value)} required />
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '5px 0 0' }}>Hit the target before this date to unlock the event.</p>
          </div>

          <div>
            <label style={labelStyle}>Target completions</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="number" min={1} max={999}
                value={targetCompletions}
                onChange={(e) => setTargetCompletions(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{ ...inputStyle, width: 90 }}
              />
              <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>total habit logs across the group</span>
            </div>
          </div>

          {error && (
            <p style={{ fontSize: 12.5, color: 'hsl(0 70% 65%)', margin: 0, padding: '8px 12px', background: 'hsl(0 70% 50% / 0.1)', borderRadius: 'var(--r-sm)' }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <Button variant="ghost" size="md" type="button" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="md" type="submit" disabled={saving}>
              <Icon name="trophy" size={14} />
              {saving ? 'Creating…' : 'Start Pact'}
            </Button>
          </div>
        </form>
      </div>
    </Sheet>
  )
}
