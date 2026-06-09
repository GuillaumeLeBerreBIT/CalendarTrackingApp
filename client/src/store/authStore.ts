import { create } from 'zustand'
import api from '@/api/client'
import type { Profile } from '@/types'

interface AuthState {
  user: Profile | null
  userId: string | null
  loading: boolean
  fetchMe: () => Promise<boolean>
  logout: () => Promise<void>
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
        }
        set({ user: profile, userId: data.userId ?? null, loading: false })
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
}))
