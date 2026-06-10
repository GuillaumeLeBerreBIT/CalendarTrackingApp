import { create } from 'zustand'
import api from '@/api/client'
import type { Profile } from '@/types'
import { subscribeToPush } from '@/lib/pushNotifications'

interface AuthState {
  user: Profile | null
  userId: string | null
  loading: boolean
  fetchMe: () => Promise<boolean>
  logout: () => Promise<void>
  addXp: (newTotal: number) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  userId: null,
  loading: true,

  fetchMe: async () => {
    try {
      const { data } = await api.get('/profile')
      if (data.success) {
        const profile: Profile = {
          ...data,
          hasCompletedOnboarding: data.has_completed_onboarding ?? undefined,
          searchable: data.searchable ?? undefined,
          total_xp: data.total_xp ?? 0,
        }
        set({ user: profile, userId: data.userId ?? null, loading: false })
        subscribeToPush().catch(() => {})
        return true
      }
    } catch {
      // 401 handled by interceptor
    }
    set({ user: null, userId: null, loading: false })
    return false
  },

  logout: async () => {
    await api.post('/logout').catch(() => {})
    set({ user: null, userId: null })
    window.location.href = '/login'
  },

  addXp: (newTotal) => {
    set((s) => s.user ? { user: { ...s.user, total_xp: newTotal } } : {})
  },
}))
