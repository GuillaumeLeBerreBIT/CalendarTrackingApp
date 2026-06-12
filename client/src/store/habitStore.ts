import { create } from 'zustand'
import api from '@/api/client'

interface Habit {
  habit_id: number
  title: string
  frequency: 'daily' | 'weekly'
  emoji: string
  color: string
  groups_id?: string | null
  streak: number
  completedToday: boolean
  recentDays: boolean[]
  completionHistory: string[]
  challenge_id?: number | null
  contribution_value?: number
  weekly_target?: number | null
  target_increment?: number
  habit_start_week?: string | null
  currentWeekTarget?: number | null
  currentWeekCompletions?: number | null
}

interface LogResult {
  completedToday: boolean
  weeklyTargetHit?: boolean
}

interface HabitStore {
  habits: Habit[]
  loading: boolean
  fetchHabits: () => Promise<void>
  logToday: (habitId: number) => Promise<LogResult>
  createHabit: (data: {
    title: string
    frequency: 'daily' | 'weekly'
    emoji: string
    color: string
    groups_id?: string | null
    challenge_id?: number | null
    contribution_value?: number
    weekly_target?: number | null
    target_increment?: number
  }) => Promise<void>
  editHabit: (habitId: number, data: {
    title?: string
    emoji?: string
    color?: string
    groups_id?: string | null
    challenge_id?: number | null
    contribution_value?: number
    weekly_target?: number | null
    target_increment?: number
  }) => Promise<void>
  deleteHabit: (habitId: number) => Promise<void>
}

export const useHabitStore = create<HabitStore>((set, get) => ({
  habits: [],
  loading: false,

  fetchHabits: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get('/habits')
      if (data.success) set({ habits: data.habits })
    } catch {
      // 401 handled by interceptor
    } finally {
      set({ loading: false })
    }
  },

  logToday: async (habitId) => {
    const todayStr = new Date().toISOString().slice(0, 10)
    // Optimistic: toggle completedToday, streak, and completionHistory so heatmap updates instantly
    set((s) => ({
      habits: s.habits.map((h) => {
        if (h.habit_id !== habitId) return h
        const logging = !h.completedToday
        return {
          ...h,
          completedToday: logging,
          streak: logging ? h.streak + 1 : Math.max(0, h.streak - 1),
          completionHistory: logging
            ? [...(h.completionHistory ?? []), todayStr]
            : (h.completionHistory ?? []).filter((d) => d !== todayStr),
          currentWeekCompletions: logging
            ? (h.currentWeekCompletions ?? 0) + 1
            : Math.max(0, (h.currentWeekCompletions ?? 0) - 1),
        }
      }),
    }))
    try {
      // The backend log call also drives group pact counters and challenge
      // progress — it must always fire, even though XP is no longer surfaced.
      const { data } = await api.post(`/habits/${habitId}/log`)
      return {
        completedToday: data.completedToday ?? false,
        weeklyTargetHit: data.weeklyTargetHit ?? false,
      }
    } catch {
      get().fetchHabits()
      return { completedToday: false }
    }
  },

  createHabit: async (data) => {
    await api.post('/habits', data)
    await get().fetchHabits()
  },

  editHabit: async (habitId, data) => {
    await api.put(`/habits/${habitId}`, data)
    await get().fetchHabits()
  },

  deleteHabit: async (habitId) => {
    await api.delete(`/habits/${habitId}`)
    set((s) => ({ habits: s.habits.filter((h) => h.habit_id !== habitId) }))
  },
}))
