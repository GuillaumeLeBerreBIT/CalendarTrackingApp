import { useState } from 'react'
import api from '@/api/client'
import type { GroupChallenge } from '@/types'
import Icon from '@/components/ui/Icon'
import { Avatar } from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import CountdownPill from '@/components/CountdownPill'

interface LeaderboardEntry {
  user_id: string
  username: string
  completions: number
  total_contribution: number
}

interface GroupChallengeCardProps {
  challenge: GroupChallenge
  groupId: string | number
  isAdmin?: boolean
  onDelete?: (id: number) => void
}

export default function GroupChallengeCard({ challenge, groupId, isAdmin, onDelete }: GroupChallengeCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loadingLB, setLoadingLB] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const pct = challenge.target_value > 0
    ? Math.min(100, Math.round((challenge.current_value / challenge.target_value) * 100))
    : 0
  const done = challenge.current_value >= challenge.target_value

  async function handleExpand() {
    const willExpand = !expanded
    setExpanded(willExpand)
    if (willExpand && leaderboard.length === 0) {
      setLoadingLB(true)
      try {
        const { data } = await api.get(`/groups/${groupId}/challenges/${challenge.challenge_id}/leaderboard`)
        if (data.success) setLeaderboard(data.leaderboard)
      } catch {
        // silently fail
      } finally {
        setLoadingLB(false)
      }
    }
  }

  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${done ? 'hsl(152 60% 30%)' : 'var(--border)'}`,
      borderRadius: 'var(--r-lg)',
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      {/* Header row */}
      <button
        onClick={handleExpand}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          width: '100%',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <p style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--text-1)',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {challenge.title}
            </p>
            {done && (
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 'var(--r-full)',
                background: 'hsl(152 60% 18%)',
                color: 'hsl(152 80% 70%)',
                border: '1px solid hsl(152 60% 28%)',
                flexShrink: 0,
              }}>
                Completed
              </span>
            )}
            {!challenge.is_active && !done && (
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 'var(--r-full)',
                background: 'var(--surface-3)',
                color: 'var(--text-3)',
                flexShrink: 0,
              }}>
                Inactive
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--surface-3)', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${pct}%`,
                borderRadius: 3,
                background: done
                  ? 'linear-gradient(90deg, #22d3aa, #34d399)'
                  : 'linear-gradient(90deg, var(--accent), var(--accent-hover))',
                transition: 'width 0.4s ease',
              }} />
            </div>
            <span style={{
              fontSize: 12,
              color: done ? 'hsl(152 80% 70%)' : 'var(--text-2)',
              flexShrink: 0,
              fontVariantNumeric: 'tabular-nums',
              minWidth: 90,
              textAlign: 'right',
            }}>
              {challenge.current_value} / {challenge.target_value} {challenge.unit}
            </span>
          </div>
        </div>
        <Icon
          name="chevron-down"
          size={16}
          style={{
            color: 'var(--text-3)',
            flexShrink: 0,
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
          }}
        />
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* End date countdown */}
          {challenge.end_date && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', margin: '0 0 6px' }}>
                Deadline
              </p>
              <CountdownPill targetDate={challenge.end_date + 'T23:59:59'} />
            </div>
          )}

          {/* Description */}
          {challenge.description && (
            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
              {challenge.description}
            </p>
          )}

          {/* Leaderboard */}
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', margin: '0 0 10px' }}>
              Leaderboard
            </p>
            {loadingLB ? (
              <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>Loading…</p>
            ) : leaderboard.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
                No contributions yet — link a habit to this challenge to start contributing.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {leaderboard.map((entry, i) => (
                  <div key={entry.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: i === 0 ? '#f59e0b' : i === 1 ? 'var(--text-2)' : 'var(--text-3)',
                      width: 20,
                      flexShrink: 0,
                      textAlign: 'center',
                    }}>
                      #{i + 1}
                    </span>
                    <Avatar id={entry.user_id} size={26} name={entry.username} />
                    <span style={{
                      flex: 1,
                      fontSize: 13,
                      color: 'var(--text-1)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {entry.username}
                    </span>
                    <span style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: done ? 'hsl(152 80% 70%)' : 'var(--accent)',
                      flexShrink: 0,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {entry.total_contribution} {challenge.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Admin: delete */}
          {isAdmin && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              {confirmDelete ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Button variant="danger" size="sm" onClick={() => onDelete?.(challenge.challenge_id)}>
                    Delete
                  </Button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-3)' }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12.5,
                    color: 'var(--text-3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: 0,
                  }}
                >
                  <Icon name="trash" size={13} />
                  Delete challenge
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
