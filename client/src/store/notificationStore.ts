import { create } from 'zustand'
import api from '@/api/client'
import type { AppNotification } from '@/types'

interface NotifState {
  items: AppNotification[]
  unread: number
  loading: boolean
  fetch: () => Promise<void>
  markRead: (id: number) => Promise<void>
  markAllRead: () => Promise<void>
  remove: (id: number) => Promise<void>
}

export const useNotificationStore = create<NotifState>((set, get) => ({
  items: [],
  unread: 0,
  loading: false,

  fetch: async () => {
    set({ loading: true })
    try {
      const { data } = await api.get('/notifications')
      if (data.success) set({ items: data.notifications, unread: data.unread })
    } catch {
      // 401 handled by interceptor
    } finally {
      set({ loading: false })
    }
  },

  markRead: async (id) => {
    const wasUnread = get().items.find((n) => n.notification_id === id && !n.is_read)
    set((s) => ({
      items: s.items.map((n) => (n.notification_id === id ? { ...n, is_read: true } : n)),
      unread: wasUnread ? Math.max(0, s.unread - 1) : s.unread,
    }))
    await api.patch(`/notifications/${id}/read`).catch(() => {})
  },

  markAllRead: async () => {
    set((s) => ({ items: s.items.map((n) => ({ ...n, is_read: true })), unread: 0 }))
    await api.post('/notifications/read-all').catch(() => {})
  },

  remove: async (id) => {
    const was = get().items.find((n) => n.notification_id === id)
    set((s) => ({
      items: s.items.filter((n) => n.notification_id !== id),
      unread: was && !was.is_read ? Math.max(0, s.unread - 1) : s.unread,
    }))
    await api.delete(`/notifications/${id}`).catch(() => {})
  },
}))
