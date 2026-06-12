import { create } from 'zustand'

interface UpgradeState {
  open: boolean
  limit: string | null
  showUpgrade: (limit: string) => void
  hideUpgrade: () => void
}

/**
 * Global "you hit a plan limit" modal state.
 * Triggered by the axios interceptor on 403 UPGRADE_REQUIRED responses.
 */
export const useUpgradeStore = create<UpgradeState>((set) => ({
  open: false,
  limit: null,
  showUpgrade: (limit) => set({ open: true, limit }),
  hideUpgrade: () => set({ open: false, limit: null }),
}))
