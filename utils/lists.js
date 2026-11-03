// Pure validation helpers for quick lists (shopping lists + wishlists).

const MAX_TITLE = 200;
const MAX_BATCH = 100;

export function cleanTitles(titles) {
  if (!Array.isArray(titles)) return { ok: false, error: 'titles must be an array' };
  const cleaned = titles
    .map((t) => (typeof t === 'string' ? t.trim() : ''))
    .filter(Boolean);
  if (cleaned.some((t) => t.length > MAX_TITLE)) {
    return { ok: false, error: 'Item names can be at most 200 characters' };
  }
  if (cleaned.length > MAX_BATCH) return { ok: false, error: 'Max 100 items at once' };
  if (cleaned.length === 0) return { ok: false, error: 'Nothing to add' };
  return { ok: true, titles: cleaned };
}

export function isHttpLink(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}
