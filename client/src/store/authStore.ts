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
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  userId: null,
  loading: true,

  fetchMe: async () => {
    try {
      const { data } = await api.get('/profile')
      if (data.success) {
        // /profile already returns camelCase fields (hasCompletedOnboarding,
        // searchable) — spread them through as-is.
        const profile: Profile = { ...data }
        set({ user: profile, userId: data.userId ?? null, loading: false })
        subscribeToPush().catch(() => {})
        // Keep the stored IANA timezone current (used by the daily-summary sweep).
        try {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
          if (tz) api.patch('/notification-prefs', { prefs: { timezone: tz } }).catch(() => {})
        } catch { /* Intl unavailable — ignore */ }
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
