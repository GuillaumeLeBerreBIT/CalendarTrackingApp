const IconPaths: Record<string, string> = {
  discover:  'M21 21l-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z',
  calendar:  'M8 2v3M16 2v3M3.5 9h17M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  groups:    'M16 18v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 18v-1a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11',
  profile:   'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  pin:       'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0zM12 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  clock:     'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  plus:      'M12 5v14M5 12h14',
  check:     'M20 6L9 17l-5-5',
  chevR:     'M9 6l6 6-6 6',
  chevL:     'M15 6l-6 6 6 6',
  chevD:     'M6 9l6 6 6-6',
  close:     'M18 6L6 18M6 6l12 12',
  bell:      'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  bookmark:  'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
  heart:     'M19 14c1.5-1.5 3-3.3 3-5.5A4.5 4.5 0 0 0 12 5.6 4.5 4.5 0 0 0 2 8.5C2 12 5 14 12 20c5-4.5 7-6 7-6z',
  ticket:    'M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4zM9 7v10',
  sparkle:   'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z',
  filter:    'M3 5h18M6 12h12M10 19h4',
  map:       'M9 6l-6-3v15l6 3 6-3 6 3V6l-6-3-6 3zM9 3v15M15 6v15',
  share:     'M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13',
  task:      'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  cal:       'M8 2v3M16 2v3M3.5 9h17M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  rsvp:      'M20 6L9 17l-5-5',
  save:      'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z',
  chat:      'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  sun:       'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon:      'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  settings:  'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 6 9.4a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 11 3h.09a2 2 0 0 1 4 0V3a1.65 1.65 0 0 0 1.82.33h.09',
  external:  'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3',
  grid:      'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  list:      'M8 6h13M8 12h13M8 18h13M3 6h0M3 12h0M3 18h0',
  arrowR:    'M5 12h14M13 6l6 6-6 6',
  dots:      'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  users:     'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  star:      'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  edit:      'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  trash:     'M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6',
  logout:    'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  'wifi-off': 'M1 1l22 22M16.7 16.7A10 10 0 0 1 2.3 7.3M5 12.9A7 7 0 0 1 12 6c.8 0 1.5.1 2.2.3M10.7 10.7A3 3 0 0 1 15 14M12 20h0',
  flame:      'M12 2c0 0-5 4.5-5 9a5 5 0 0 0 10 0c0-1.5-.5-2.9-1.4-4C15 8 13 9 13 11c0 1.1-.9 2-2 2s-2-.9-2-2c0-2 3-5 3-5z',
  timer:      'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2M16.2 2.2l1.4 1.4',
  'chevron-down': 'M6 9l6 6 6-6',
  trophy:     'M6 9H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-2M6 9a6 6 0 0 0 12 0M12 15v4M8 21h8',
}

interface IconProps {
  name: string
  size?: number
  sw?: number
  fill?: string
  style?: React.CSSProperties
  className?: string
}

export default function Icon({ name, size = 18, sw = 1.7, fill, style, className }: IconProps) {
  const d = IconPaths[name] || ''
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill || 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: '0 0 auto', ...style }}
      className={className}
      aria-hidden="true"
    >
      {d.split('M').filter(Boolean).map((seg, i) => (
        <path key={i} d={'M' + seg} />
      ))}
    </svg>
  )
}
