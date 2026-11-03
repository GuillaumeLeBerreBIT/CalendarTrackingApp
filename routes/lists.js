import express from 'express';
import authRequire from '../utils/utils.js';
import { supabaseAdmin } from '../db/supabase.js';
import { cleanTitles, isHttpLink } from '../utils/lists.js';

const router = express.Router();

const MAX_TITLE = 200;
const MAX_NOTE = 1000;
const MAX_LINK = 2000;

// Supabase error -> HTTP response. RLS denials (42501 / 403) are 403, the rest 500.
export function sendDbError(res, error) {
  if (error.code === '42501' || error.status === 403) {
    return res.status(403).json({ success: false, error: 'Not allowed' });
  }
  return res.status(500).json({ success: false, error: error.message });
}

// user_id -> username via the admin client (profiles are not readable across users by RLS).
export async function fillUsernames(ids) {
  const names = new Map();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return names;
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('user_id,username')
    .in('user_id', unique);
  if (error) throw new Error(error.message);
  (data || []).forEach((p) => names.set(p.user_id, p.username ?? null));
  return names;
}

export function itemView(row) {
  return {
    itemId: String(row.item_id),
    title: row.title,
    link: row.link ?? null,
    note: row.note ?? null,
    isDone: !!row.is_done,
    createdAt: row.created_at,
  };
}

function listView(row, items, groupTitles, names) {
  const gid = row.groups_id == null ? null : String(row.groups_id);
  return {
    listId: String(row.list_id),
    title: row.title,
    groupId: gid,
    groupTitle: gid ? (groupTitles.get(gid) ?? null) : null,
    createdBy: row.created_by,
    createdByName: names.get(row.created_by) ?? null,
    items,
  };
}

function cleanTitle(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t && t.length <= MAX_TITLE ? t : null;
}

router.get('/lists', authRequire, async (req, res) => {
  try {
    const { data: lists, error } = await req.supabase
      .from('lists')
      .select('*')
      .eq('kind', 'shopping')
      .order('created_at', { ascending: false });
    if (error) return sendDbError(res, error);

    const listIds = (lists || []).map((l) => l.list_id);
    const itemsByList = new Map();
    if (listIds.length > 0) {
      const { data: items, error: itemsError } = await req.supabase
        .from('list_items')
        .select('*')
        .in('list_id', listIds)
        .order('created_at', { ascending: true });
      if (itemsError) return sendDbError(res, itemsError);
      (items || []).forEach((i) => {
        const k = String(i.list_id);
        if (!itemsByList.has(k)) itemsByList.set(k, []);
        itemsByList.get(k).push(itemView(i));
      });
    }

    const groupIds = [...new Set((lists || []).map((l) => l.groups_id).filter((g) => g != null))];
    const groupTitles = new Map();
    if (groupIds.length > 0) {
      const { data: groups, error: gError } = await req.supabase
        .from('groups')
        .select('groups_id,groups_title')
        .in('groups_id', groupIds);
      if (gError) return sendDbError(res, gError);
      (groups || []).forEach((g) => groupTitles.set(String(g.groups_id), g.groups_title));
    }

    const names = await fillUsernames((lists || []).map((l) => l.created_by));
    res.json({
      success: true,
      lists: (lists || []).map((l) => listView(l, itemsByList.get(String(l.list_id)) || [], groupTitles, names)),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/lists', authRequire, async (req, res) => {
  try {
    const title = cleanTitle(req.body?.title);
    if (!title) return res.status(400).json({ success: false, error: 'A title (1-200 characters) is required' });
    const groupId = req.body?.groupId ?? null;
    if (groupId !== null && !/^\d+$/.test(String(groupId))) {
      return res.status(400).json({ success: false, error: 'Invalid groupId' });
    }

    const userId = req.cookies.userId;
    const { data, error } = await req.supabase
      .from('lists')
      .insert({ kind: 'shopping', title, groups_id: groupId === null ? null : Number(groupId), created_by: userId })
      .select()
      .single();
    if (error) return sendDbError(res, error);
    if (!data) return res.status(403).json({ success: false, error: 'Not allowed' });

    const gid = data.groups_id == null ? null : String(data.groups_id);
    const groupTitles = new Map();
    if (gid) {
      const { data: g } = await req.supabase.from('groups').select('groups_id,groups_title').eq('groups_id', gid);
      (g || []).forEach((x) => groupTitles.set(String(x.groups_id), x.groups_title));
    }
    const names = await fillUsernames([data.created_by]);
    res.status(201).json({ success: true, list: listView(data, [], groupTitles, names) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Item routes first so '/lists/items/:itemId' is never read as '/lists/:listId'.
router.patch('/lists/items/:itemId', authRequire, async (req, res) => {
  const b = req.body || {};
  const patch = {};
  if ('isDone' in b) {
    if (typeof b.isDone !== 'boolean') return res.status(400).json({ success: false, error: 'isDone must be a boolean' });
    patch.is_done = b.isDone;
  }
  if ('title' in b) {
    const t = cleanTitle(b.title);
    if (!t) return res.status(400).json({ success: false, error: 'A title (1-200 characters) is required' });
    patch.title = t;
  }
  if ('link' in b) {
    if (b.link === null || b.link === '') patch.link = null;
    else if (!isHttpLink(b.link) || b.link.length > MAX_LINK) {
      return res.status(400).json({ success: false, error: 'Link must start with http:// or https://' });
    } else patch.link = b.link;
  }
  if ('note' in b) {
    if (b.note === null || b.note === '') patch.note = null;
    else if (typeof b.note !== 'string' || b.note.length > MAX_NOTE) {
      return res.status(400).json({ success: false, error: 'Note can be at most 1000 characters' });
    } else patch.note = b.note;
  }
  if (Object.keys(patch).length === 0) return res.status(400).json({ success: false, error: 'Nothing to update' });

  const { data, error } = await req.supabase
    .from('list_items')
    .update(patch)
    .eq('item_id', req.params.itemId)
    .select();
  if (error) return sendDbError(res, error);
  if (!data || data.length === 0) return res.status(404).json({ success: false, error: 'Item not found' });
  res.json({ success: true, item: itemView(data[0]) });
});

router.delete('/lists/items/:itemId', authRequire, async (req, res) => {
  const { data, error } = await req.supabase
    .from('list_items')
    .delete()
    .eq('item_id', req.params.itemId)
    .select();
  if (error) return sendDbError(res, error);
  if (!data || data.length === 0) return res.status(404).json({ success: false, error: 'Item not found' });
  res.json({ success: true });
});

router.delete('/lists/:listId/items/done', authRequire, async (req, res) => {
  const { data, error } = await req.supabase
    .from('list_items')
    .delete()
    .eq('list_id', req.params.listId)
    .eq('is_done', true)
    .select();
  if (error) return sendDbError(res, error);
  res.json({ success: true, removed: (data || []).length });
});

router.post('/lists/:listId/items', authRequire, async (req, res) => {
  const cleaned = cleanTitles(req.body?.titles);
  if (!cleaned.ok) return res.status(400).json({ success: false, error: cleaned.error });
  if (!/^\d+$/.test(req.params.listId)) return res.status(400).json({ success: false, error: 'Invalid list id' });

  const userId = req.cookies.userId;
  const rows = cleaned.titles.map((title) => ({ list_id: Number(req.params.listId), title, created_by: userId }));
  const { data, error } = await req.supabase.from('list_items').insert(rows).select();
  if (error) return sendDbError(res, error);
  if (!data || data.length === 0) return res.status(403).json({ success: false, error: 'Not allowed' });
  res.status(201).json({ success: true, items: data.map(itemView) });
});

router.patch('/lists/:listId', authRequire, async (req, res) => {
  const title = cleanTitle(req.body?.title);
  if (!title) return res.status(400).json({ success: false, error: 'A title (1-200 characters) is required' });
  const { data, error } = await req.supabase
    .from('lists')
    .update({ title })
    .eq('list_id', req.params.listId)
    .select();
  if (error) return sendDbError(res, error);
  if (!data || data.length === 0) return res.status(404).json({ success: false, error: 'List not found' });
  res.json({ success: true });
});

router.delete('/lists/:listId', authRequire, async (req, res) => {
  const { data, error } = await req.supabase
    .from('lists')
    .delete()
    .eq('list_id', req.params.listId)
    .select();
  if (error) return sendDbError(res, error);
  if (!data || data.length === 0) return res.status(404).json({ success: false, error: 'List not found' });
  res.json({ success: true });
});

export default router;
