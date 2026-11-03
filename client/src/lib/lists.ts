export type ListKind = 'shopping' | 'wishlist'

const MARKER = /^([-*•·]|\d+[.)])\s+/
const BARE_MARKER = /^([-*•·]|\d+[.)])$/

/** Split pasted text into item titles: lines (plus commas for shopping), markers stripped. */
export function splitPasted(text: string, kind: ListKind): string[] {
  const sep = kind === 'shopping' ? /[\n,]/ : /\n/
  return text
    .split(sep)
    .map((s) => s.trim().replace(MARKER, '').trim())
    .filter((s) => s && !BARE_MARKER.test(s))
}

export function isSafeLink(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

export function splitDone<T extends { isDone: boolean }>(items: T[]): { open: T[]; done: T[] } {
  return {
    open: items.filter((i) => !i.isDone),
    done: items.filter((i) => i.isDone),
  }
}
