export const GROUP_COLORS: Record<string, string> = {
  family:  '#f59e0b',
  friends: '#ec4899',
  work:    '#22d3aa',
  climb:   '#38bdf8',
  book:    '#c084fc',
  self:    'var(--accent)',
}

export const SOURCE_META: Record<string, { label: string; color: string }> = {
  ticket:     { label: 'Ticketmaster', color: 'var(--src-ticket)' },
  eventbrite: { label: 'Eventbrite',   color: 'var(--src-eventbrite)' },
  meetup:     { label: 'Meetup',       color: 'var(--src-meetup)' },
}

export const FILTERS = ['All', 'Today', 'This Weekend', 'Music', 'Sports', 'Food', 'Free'] as const
export type Filter = typeof FILTERS[number]

export const CAT_LABELS: Record<string, string> = {
  music:    'live music',
  sports:   'sports',
  food:     'food + drink',
  workshop: 'workshop',
  art:      'art',
  market:   'market',
}
