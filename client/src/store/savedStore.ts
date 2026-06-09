import { create } from 'zustand'
import api from '@/api/client'
import type { SavedEvent } from '@/types'
import type { DiscoveryEvent } from '@/lib/mockData'

interface SavedState {
  items: SavedEvent[]
  ids: Set<string>
  loaded: boolean
  loading: boolean
  load: () => Promise<void>
  isSaved: (discoveryId: string) => boolean
  toggle: (event: DiscoveryEvent) => Promise<void>
}

export const useSavedStore = create<SavedState>((set, get) => ({
  items: [],
  ids: new Set<string>(),
  loaded: false,
  loading: false,

  load: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get('/saved')
      if (data.success) {
        const saved: SavedEvent[] = data.saved ?? []
        set({
          items: saved,
          ids: new Set(saved.map((s) => s.discovery_id)),
          loaded: true,
        })
      }
    } catch {
      // 401 handled by interceptor
    } finally {
      set({ loading: false })
    }
  },

  isSaved: (discoveryId) => get().ids.has(discoveryId),

  toggle: async (event) => {
    const id = event.id
    const currentlySaved = get().ids.has(id)

    // Optimistic update
    set((s) => {
      const ids = new Set(s.ids)
      let items = s.items
      if (currentlySaved) {
        ids.delete(id)
        items = items.filter((it) => it.discovery_id !== id)
      } else {
        ids.add(id)
        items = [{ discovery_id: id, snapshot: event }, ...items]
      }
      return { ids, items }
    })

    try {
      if (currentlySaved) {
        await api.delete(`/saved/${encodeURIComponent(id)}`)
      } else {
        await api.post('/saved', event)
      }
    } catch {
      // Revert on failure
      set((s) => {
        const ids = new Set(s.ids)
        let items = s.items
        if (currentlySaved) {
          ids.add(id)
          items = [{ discovery_id: id, snapshot: event }, ...items]
        } else {
          ids.delete(id)
          items = items.filter((it) => it.discovery_id !== id)
        }
        return { ids, items }
      })
    }
  },
}))
