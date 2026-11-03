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

export function cleanWishlistItems(items) {
  if (!Array.isArray(items) || items.length > 100) return { ok: false, error: 'Use up to 100 wishlist items' };
  const cleaned = [];
  for (const item of items) {
    if (!item || typeof item.title !== 'string' || !item.title.trim() || item.title.trim().length > 200) {
      return { ok: false, error: 'Each gift needs a name (1–200 characters)' };
    }
    if ((item.link != null && typeof item.link !== 'string') || (item.note != null && typeof item.note !== 'string')) {
      return { ok: false, error: 'Gift links and notes must be text' };
    }
    const link = item.link?.trim() || null;
    const note = item.note?.trim() || null;
    if (link && (!isHttpLink(link) || link.length > 2000)) return { ok: false, error: 'Use an http:// or https:// link (up to 2000 characters)' };
    if (note && note.length > 1000) return { ok: false, error: 'Gift notes can be at most 1000 characters' };
    cleaned.push({ title: item.title.trim(), link, note });
  }
  return { ok: true, items: cleaned };
}
