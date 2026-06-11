import { create } from 'zustand'
import api from '@/api/client'

// Countdowns live in the shared `timers` table (backend /api/timers, type: 'countdown').
// The interval/Pomodoro timer UI was removed — this store is countdown-only and
// filters out any legacy 'interval' rows the backend may still return.
export interface Countdown {
  timer_id: number
  title: string
  emoji: string
  target_date: string
}

// Raw row shape returned by GET /api/timers (may include legacy interval presets)
interface TimerRow {
  timer_id: number
  type: 'countdown' | 'interval'
  title: string
  emoji: string
  target_date: string | null
}

interface CountdownStore {
  countdowns: Countdown[]
  loading: boolean
  fetchCountdowns: () => Promise<void>
  createCountdown: (data: Omit<Countdown, 'timer_id'>) => Promise<void>
  deleteCountdown: (id: number) => Promise<void>
}

export const useCountdownStore = create<CountdownStore>((set, get) => ({
  countdowns: [],
  loading: false,

  fetchCountdowns: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get('/timers')
      if (data.success) {
        const countdowns: Countdown[] = (data.timers as TimerRow[])
          .filter((t) => t.type === 'countdown' && t.target_date != null)
          .map((t) => ({ timer_id: t.timer_id, title: t.title, emoji: t.emoji, target_date: t.target_date as string }))
        set({ countdowns })
      }
    } catch {
      // 401 handled by interceptor
    } finally {
      set({ loading: false })
    }
  },

  createCountdown: async (data) => {
    await api.post('/timers', { ...data, type: 'countdown' })
    await get().fetchCountdowns()
  },

  deleteCountdown: async (id) => {
    await api.delete(`/timers/${id}`)
    set((s) => ({ countdowns: s.countdowns.filter((t) => t.timer_id !== id) }))
  },
}))
