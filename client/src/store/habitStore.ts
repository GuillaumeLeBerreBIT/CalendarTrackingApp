import { create } from 'zustand'
import api from '@/api/client'
import { useAuthStore } from '@/store/authStore'

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
  xp_value?: number
  challenge_id?: number | null
  contribution_value?: number
  weekly_target?: number | null
  target_increment?: number
  habit_start_week?: string | null
  currentWeekTarget?: number | null
  currentWeekCompletions?: number | null
}

interface LogResult {
  xpEarned: number
  multiplier: number
  completedToday: boolean
  newTotalXp: number | null
  weeklyTargetHit?: boolean
  bonusXp?: number
  totalXpEarned?: number
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
    xp_value?: number
    groups_id?: string
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
      const { data } = await api.post(`/habits/${habitId}/log`)
      if (data.success && data.newTotalXp !== null && data.newTotalXp !== undefined) {
        useAuthStore.getState().addXp(data.newTotalXp)
      }
      const totalXpEarned = (data.xpEarned ?? 0) + (data.bonusXp ?? 0)
      return {
        xpEarned: totalXpEarned,
        multiplier: data.multiplier ?? 1,
        completedToday: data.completedToday ?? false,
        newTotalXp: data.newTotalXp ?? null,
        weeklyTargetHit: data.weeklyTargetHit ?? false,
        bonusXp: data.bonusXp ?? 0,
        totalXpEarned,
      }
    } catch {
      get().fetchHabits()
      return { xpEarned: 0, multiplier: 1, completedToday: false, newTotalXp: null }
    }
  },

  createHabit: async (data) => {
    await api.post('/habits', data)
    await get().fetchHabits()
  },

  deleteHabit: async (habitId) => {
    await api.delete(`/habits/${habitId}`)
    set((s) => ({ habits: s.habits.filter((h) => h.habit_id !== habitId) }))
  },
}))
