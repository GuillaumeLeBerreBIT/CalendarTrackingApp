// Per-device theme preference. index.html applies the same rule inline before React
// mounts (no flash); this module is what the Profile page uses to change it.
export type ThemePref = 'light' | 'dark' | 'system'
export type Theme = 'light' | 'dark'

export const THEME_KEY = 'eventli-theme'

export function parseThemePref(value: string | null | undefined): ThemePref {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'dark'
}

export function resolveTheme(pref: ThemePref, prefersDark: boolean): Theme {
  if (pref === 'system') return prefersDark ? 'dark' : 'light'
  return pref
}

export function readThemePref(): ThemePref {
  try {
    return parseThemePref(window.localStorage.getItem(THEME_KEY))
  } catch {
    return 'dark'
  }
}

function prefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return true
  }
}

export function applyTheme(pref: ThemePref): void {
  document.documentElement.dataset.theme = resolveTheme(pref, prefersDark())
}

export function setThemePref(pref: ThemePref): void {
  try {
    window.localStorage.setItem(THEME_KEY, pref)
  } catch {
    // storage blocked: still apply for this session
  }
  applyTheme(pref)
}
