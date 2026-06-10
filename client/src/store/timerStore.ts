import { create } from 'zustand'
import api from '@/api/client'

interface Timer {
  timer_id: number
  type: 'countdown' | 'interval'
  title: string
  emoji: string
  target_date?: string
  duration_seconds?: number
}

interface TimerStore {
  timers: Timer[]
  loading: boolean
  fetchTimers: () => Promise<void>
  createTimer: (data: Omit<Timer, 'timer_id'>) => Promise<void>
  deleteTimer: (id: number) => Promise<void>
}

export const useTimerStore = create<TimerStore>((set, get) => ({
  timers: [],
  loading: false,

  fetchTimers: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get('/timers')
      if (data.success) set({ timers: data.timers })
    } catch {
      // 401 handled by interceptor
    } finally {
      set({ loading: false })
    }
  },

  createTimer: async (data) => {
    await api.post('/timers', data)
    await get().fetchTimers()
  },

  deleteTimer: async (id) => {
    await api.delete(`/timers/${id}`)
    set((s) => ({ timers: s.timers.filter((t) => t.timer_id !== id) }))
  },
}))
