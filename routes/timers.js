import express from 'express';
import authRequire from '../utils/utils.js';

const router = express.Router();

router.get('/timers', authRequire, async (req, res) => {
  const userId = req.cookies.userId;
  const { data: timers, error } = await req.supabase
    .from('timers')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ success: false, error: error.message });
  return res.json({ success: true, timers: timers || [] });
});

router.post('/timers', authRequire, async (req, res) => {
  const { type, title, emoji, target_date, duration_seconds } = req.body;

  if (!type || !['countdown', 'interval'].includes(type))
    return res.status(400).json({ success: false, error: "type must be 'countdown' or 'interval'." });

  if (!title || typeof title !== 'string' || title.trim() === '')
    return res.status(400).json({ success: false, error: 'title is required.' });

  const { data: timer, error } = await req.supabase
    .from('timers')
    .insert([{
      user_id: req.cookies.userId,
      type,
      title: title.trim(),
      emoji: emoji || '⏱️',
      target_date: type === 'countdown' ? (target_date || null) : null,
      duration_seconds: type === 'interval' ? (parseInt(duration_seconds, 10) || null) : null,
    }])
    .select()
    .single();

  if (error) return res.status(500).json({ success: false, error: error.message });
  return res.json({ success: true, timer });
});

router.delete('/timers/:id', authRequire, async (req, res) => {
  const timerId = parseInt(req.params.id, 10);
  if (isNaN(timerId)) return res.status(400).json({ success: false, error: 'Invalid timer id.' });

  const { error } = await req.supabase
    .from('timers')
    .delete()
    .eq('timer_id', timerId)
    .eq('user_id', req.cookies.userId);

  if (error) return res.status(500).json({ success: false, error: error.message });
  return res.status(204).send();
});

export default router;
