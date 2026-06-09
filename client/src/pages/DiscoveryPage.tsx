import { useState, useEffect } from 'react'
import Icon from '@/components/ui/Icon'
import Button from '@/components/ui/Button'
import { SourceBadge, Empty } from '@/components/ui/Primitives'
import EventModal from '@/components/EventModal'
import SaveToCalendarModal from '@/components/SaveToCalendarModal'
import { Segmented } from '@/components/ui/Primitives'
import { type DiscoveryEvent } from '@/lib/mockData'
import { FILTERS, CAT_LABELS, type Filter } from '@/lib/design'
import { useAuthStore } from '@/store/authStore'
import { useSavedStore } from '@/store/savedStore'
import api from '@/api/client'
import type { Group } from '@/types'

// Map a filter chip to Ticketmaster query params. 'Free' has no upstream param —
// it's applied client-side on priceVal. 'All' sends nothing.
function filterToParams(filter: Filter): Record<string, string> {
  switch (filter) {
    case 'Music':        return { category: 'music' }
    case 'Sports':       return { category: 'sports' }
    case 'Food':         return { category: 'food' }
    case 'Today':        return { when: 'today' }
    case 'This Weekend': return { when: 'weekend' }
    default:             return {}
  }
}

export default function DiscoveryPage() {
  const [filter, setFilter] = useState<Filter>('All')
  const [view, setView] = useState<'discover' | 'saved'>('discover')
  const savedItems = useSavedStore((s) => s.items)
  const savedIds = useSavedStore((s) => s.ids)
  const loadSaved = useSavedStore((s) => s.load)
  const toggleSaved = useSavedStore((s) => s.toggle)
  const [modal, setModal] = useState<DiscoveryEvent | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [saveModal, setSaveModal] = useState<DiscoveryEvent | null>(null)

  const [events, setEvents] = useState<DiscoveryEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Default location comes from the user's saved profile city (else Belgium-wide)
  const profileCity = useAuthStore((s) => s.user?.city)
  const [location, setLocation] = useState('')
  useEffect(() => { if (profileCity) setLocation(profileCity) }, [profileCity])

  // Load the user's saved discovery events once on mount
  useEffect(() => { loadSaved() }, [loadSaved])

  useEffect(() => {
    api.get('/groups').then(({ data }) => {
      if (data.success && Array.isArray(data.userGroups)) {
        setGroups(data.userGroups.map((g: { groupInfo: { groupId: string; title: string; description: string; tag: string } }) => ({
          groups_id: String(g.groupInfo.groupId),
          groups_title: g.groupInfo.title,
          groups_description: g.groupInfo.description,
          tag_name: g.groupInfo.tag,
        })))
      }
    }).catch(() => {})
  }, [])

  // Debounce the keyword search so we don't hit the API on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // Fetch discovery events whenever the filter, search or location changes
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const params: Record<string, string> = { ...filterToParams(filter) }
        if (location.trim()) params.city = location.trim()
        if (debouncedSearch) params.keyword = debouncedSearch
        const { data } = await api.get('/discovery', { params })
        if (cancelled) return
        if (data.success) setEvents(data.events as DiscoveryEvent[])
        else setError('Could not load events right now.')
      } catch {
        if (!cancelled) setError('Could not load events right now.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [filter, debouncedSearch, location])

  // Save/unsave a full discovery event (persisted via the saved store)
  function toggleSave(ev: DiscoveryEvent) {
    toggleSaved(ev)
  }

  // EventModal expects an id-based callback; resolve the id back to an event.
  function toggleSaveById(id: string) {
    const ev = events.find((e) => e.id === id) ?? savedItems.find((s) => s.discovery_id === id)?.snapshot
    if (ev) toggleSaved(ev)
  }

  const savedEvents = savedItems.map((s) => s.snapshot)

  // 'Free' is the only client-side filter (Ticketmaster has no price filter)
  const filtered = filter === 'Free' ? events.filter((ev) => ev.priceVal === 0) : events

  // Featured = first event when on the default view (no active filter or search)
  const featured = filter === 'All' && !debouncedSearch ? filtered[0] : null
  const feedEvents = featured ? filtered.slice(1) : filtered

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* ── Sticky header ────────────────────────────────────── */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        background: 'color-mix(in srgb, var(--bg) 86%, transparent)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border)',
        padding: '18px 28px 0',
        flexShrink: 0,
      }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <h1 style={{ fontSize: 27, color: 'var(--text-1)', flex: 1 }}>Discover</h1>
          <Segmented
            options={[
              { value: 'discover', label: 'Discover', icon: 'discover' },
              { value: 'saved', label: `Saved${savedIds.size ? ` ${savedIds.size}` : ''}`, icon: 'bookmark' },
            ]}
            value={view}
            onChange={(v) => setView(v as 'discover' | 'saved')}
            size="sm"
          />
          {/* Editable location pill */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            borderRadius: 'var(--r-full)',
            background: 'var(--surface)',
            border: '1px solid var(--border-2)',
          }}>
            <Icon name="pin" size={14} sw={1.8} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Belgium"
              aria-label="Location"
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-2)',
                fontSize: 13,
                fontWeight: 500,
                width: 100,
              }}
            />
          </div>
        </div>

        {view === 'discover' && (<>
        {/* Search bar */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ position: 'absolute', left: 14, color: 'var(--text-3)', pointerEvents: 'none', display: 'flex' }}>
            <Icon name="discover" size={16} sw={1.8} />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events, artists, teams…"
            aria-label="Search events"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'var(--surface)',
              border: '1px solid var(--border-2)',
              borderRadius: 'var(--r-full)',
              padding: '10px 38px 10px 40px',
              fontSize: 13.5,
              color: 'var(--text-1)',
              outline: 'none',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label="Clear search"
              style={{ position: 'absolute', right: 12, background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', display: 'flex' }}
            >
              <Icon name="close" size={15} sw={2} />
            </button>
          )}
        </div>

        {/* Subtitle */}
        <p style={{ fontSize: 13.5, color: 'var(--text-3)', marginBottom: 14 }}>
          {loading
            ? 'Loading events…'
            : `${filtered.length} event${filtered.length === 1 ? '' : 's'} ${location.trim() ? `in ${location.trim()}` : 'in Belgium'} · via Ticketmaster`}
        </p>

        {/* Filter chips */}
        <div
          className="no-scrollbar"
          style={{
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            paddingBottom: 14,
          }}
        >
          {FILTERS.map((f) => {
            const active = filter === f
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={active}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 16px',
                  minHeight: 36,
                  borderRadius: 'var(--r-full)',
                  border: active ? 'none' : '1px solid var(--border-2)',
                  background: active ? 'var(--accent)' : 'var(--surface)',
                  color: active ? 'var(--accent-text)' : 'var(--text-2)',
                  boxShadow: active ? '0 4px 14px var(--accent-glow)' : 'none',
                  fontSize: 13,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  transition: 'var(--transition)',
                  flexShrink: 0,
                }}
              >
                {f === 'Free' && (
                  <span style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: active ? 'rgba(255,255,255,0.75)' : 'var(--g-work)',
                  }} />
                )}
                {f}
              </button>
            )
          })}
        </div>
        </>)}

        {view === 'saved' && (
          <p style={{ fontSize: 13.5, color: 'var(--text-3)', marginBottom: 14, marginTop: 4 }}>
            {savedEvents.length} saved event{savedEvents.length === 1 ? '' : 's'}
          </p>
        )}
      </div>

      {/* ── Feed ─────────────────────────────────────────────── */}
      <div
        className="scroll"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '22px 28px 60px',
        }}
      >
        <div style={{
          maxWidth: 1180,
          margin: '0 auto',
        }}>
          {view === 'saved' ? (
            savedEvents.length === 0 ? (
              <Empty text="No saved events yet. Tap the bookmark on any event to save it here." />
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 18,
              }}>
                {savedEvents.map((ev) => (
                  <EventCard
                    key={ev.id}
                    event={ev}
                    isSaved={savedIds.has(ev.id)}
                    onSave={() => toggleSave(ev)}
                    onClick={() => setModal(ev)}
                  />
                ))}
              </div>
            )
          ) : loading ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 18,
            }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton" style={{
                  height: 290,
                  borderRadius: 'var(--r-lg)',
                }} />
              ))}
            </div>
          ) : error ? (
            <Empty text={error} />
          ) : filtered.length === 0 ? (
            <Empty text={
              debouncedSearch
                ? `No events found for "${debouncedSearch}".`
                : `No events match "${filter}" right now.`
            } />
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 18,
            }}>
              {/* Featured card */}
              {featured && (
                <FeaturedCard
                  event={featured}
                  isSaved={savedIds.has(featured.id)}
                  onSave={() => toggleSave(featured)}
                  onClick={() => setModal(featured)}
                />
              )}

              {/* Regular event cards */}
              {feedEvents.map((ev) => (
                <EventCard
                  key={ev.id}
                  event={ev}
                  isSaved={savedIds.has(ev.id)}
                  onSave={() => toggleSave(ev)}
                  onClick={() => setModal(ev)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Event detail modal ───────────────────────────────── */}
      {modal && (
        <EventModal
          data={modal}
          onClose={() => setModal(null)}
          savedSet={savedIds}
          onSave={toggleSaveById}
          onSaveToCalendar={(ev) => { setModal(null); setSaveModal(ev) }}
        />
      )}

      {/* ── Save to calendar modal ───────────────────────────── */}
      {saveModal && (
        <SaveToCalendarModal
          event={saveModal}
          groups={groups}
          onClose={() => setSaveModal(null)}
          onSaved={() => setSaveModal(null)}
        />
      )}
    </div>
  )
}

/* ── Featured card ──────────────────────────────────────────── */
function FeaturedCard({ event: ev, isSaved, onSave, onClick }: {
  event: DiscoveryEvent
  isSaved: boolean
  onSave: () => void
  onClick: () => void
}) {
  return (
    <div
      className={ev.image ? '' : 'img-ph'}
      data-cat={ev.cat}
      onClick={onClick}
      style={{
        gridColumn: '1 / -1',
        minHeight: 340,
        borderRadius: 'var(--r-xl)',
        position: 'relative',
        cursor: 'pointer',
        border: '1px solid var(--border)',
        overflow: 'hidden',
        transition: 'var(--transition)',
        background: ev.image ? 'var(--surface-2)' : undefined,
      }}
    >
      {/* Real cover image when available */}
      {ev.image && (
        <img
          src={ev.image}
          alt={ev.title}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      )}
      {/* Overlay */}
      <div style={{ position: 'absolute', inset: 0, background: 'var(--overlay-grad)' }} />

      {/* "Featured tonight" badge */}
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 2 }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '5px 12px',
          borderRadius: 'var(--r-full)',
          background: 'var(--accent)',
          color: 'var(--accent-text)',
          fontSize: 11.5,
          fontWeight: 700,
          letterSpacing: '0.01em',
          boxShadow: '0 4px 14px var(--accent-glow)',
        }}>
          <Icon name="sparkle" size={12} sw={2} />
          Featured tonight
        </span>
      </div>

      {/* Top-right badges */}
      <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 8, zIndex: 2 }}>
        <SourceBadge source={ev.source} />
        <button
          onClick={(e) => { e.stopPropagation(); onSave() }}
          style={{
            width: 36,
            height: 36,
            borderRadius: 'var(--r-sm)',
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(8px)',
            color: isSaved ? 'var(--accent)' : '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'var(--transition)',
          }}
        >
          <Icon name="bookmark" size={16} sw={2} fill={isSaved ? 'var(--accent)' : undefined} />
        </button>
      </div>

      {/* Bottom content */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 24px 28px', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
          <Icon name="clock" size={14} sw={1.8} style={{ color: 'rgba(255,255,255,0.7)' }} />
          <span style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>
            {ev.date} · {ev.time}
          </span>
        </div>
        <h2 style={{ fontSize: 34, fontWeight: 800, color: '#fff', lineHeight: 1.15, letterSpacing: '-0.035em', marginBottom: 10 }}>
          {ev.title}
        </h2>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 18, maxWidth: 560, lineHeight: 1.55 }}>
          {ev.blurb}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>
            {ev.price}
          </span>
          <div style={{ marginLeft: 'auto' }}>
            <Button variant="primary" size="md" iconRight="arrowR">
              Get tickets
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Regular event card ─────────────────────────────────────── */
function EventCard({ event: ev, isSaved, onSave, onClick }: {
  event: DiscoveryEvent
  isSaved: boolean
  onSave: () => void
  onClick: () => void
}) {
  const [hover, setHover] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: 'var(--surface)',
        borderRadius: 'var(--r-lg)',
        border: `1px solid ${hover ? 'var(--border-hi)' : 'var(--border)'}`,
        overflow: 'hidden',
        cursor: 'pointer',
        transform: hover ? 'translateY(-3px)' : 'none',
        boxShadow: hover ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        transition: 'var(--transition)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Cover image area */}
      <div
        className={ev.image ? '' : 'img-ph'}
        data-cat={ev.cat}
        style={{ height: 176, position: 'relative', flexShrink: 0, background: ev.image ? 'var(--surface-2)' : undefined }}
      >
        {/* Real cover image when available */}
        {ev.image && (
          <img
            src={ev.image}
            alt={ev.title}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        )}
        {/* Overlay for bottom items */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(7,7,12,0.7) 100%)' }} />

        {/* Save button top-right */}
        <button
          onClick={(e) => { e.stopPropagation(); onSave() }}
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 32,
            height: 32,
            borderRadius: 'var(--r-sm)',
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(0,0,0,0.38)',
            backdropFilter: 'blur(8px)',
            color: isSaved ? 'var(--accent)' : '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 2,
            transition: 'var(--transition)',
          }}
        >
          <Icon name="bookmark" size={14} sw={2} fill={isSaved ? 'var(--accent)' : undefined} />
        </button>

        {/* Source badge top-left */}
        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 2 }}>
          <SourceBadge source={ev.source} compact />
        </div>

        {/* Date pill bottom */}
        <div style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 2 }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 9px',
            borderRadius: 'var(--r-full)',
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.12)',
            fontSize: 11.5,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.9)',
          }}>
            {ev.date} · {ev.time}
          </span>
        </div>
      </div>

      {/* Card body */}
      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {/* Category label */}
        <span style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--accent)',
        }}>
          {CAT_LABELS[ev.cat] || ev.cat}
        </span>

        {/* Venue with pin */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Icon name="pin" size={12} sw={1.8} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {ev.venue}
          </span>
        </div>

        {/* Title */}
        <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.3, letterSpacing: '-0.02em' }}>
          {ev.title}
        </h3>


        {/* Footer: price + save button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 10 }}>
          <span style={{
            fontSize: ev.priceVal === 0 ? 12.5 : 15,
            fontWeight: ev.priceVal === 0 ? 600 : 800,
            color: ev.priceVal === 0 ? 'var(--g-work)' : 'var(--text-1)',
            letterSpacing: '-0.01em',
          }}>
            {ev.price}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onSave() }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 'var(--r-sm)',
              border: `1px solid ${isSaved ? 'var(--accent-line)' : 'var(--border-2)'}`,
              background: isSaved ? 'var(--accent-softer)' : 'var(--surface-3)',
              color: isSaved ? 'var(--accent)' : 'var(--text-2)',
              fontSize: 12.5,
              fontWeight: 650,
              cursor: 'pointer',
              transition: 'var(--transition)',
            }}
          >
            <Icon name="bookmark" size={13} sw={2} fill={isSaved ? 'var(--accent)' : undefined} />
            {isSaved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
