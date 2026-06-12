import supabase from '../db/supabase.js';

export const FREE_MAX_GROUPS = 3;
export const FREE_MAX_EVENTS_MONTH = 50;

/**
 * attachTier — middleware, must run AFTER authRequire.
 * Fetches plan/always_free from profiles and sets req.tier to 'plus' or 'free'.
 * On any DB error we default to 'free' and continue (never 500 the request,
 * never fail open to 'plus').
 */
export async function attachTier(req, res, next) {
  req.tier = 'free';
  try {
    const client = req.supabase || supabase;
    const { data: profile, error } = await client
      .from('profiles')
      .select('plan, always_free')
      .eq('user_id', req.cookies.userId)
      .single();

    if (!error && profile && (profile.plan === 'plus' || profile.always_free === true)) {
      req.tier = 'plus';
    }
  } catch (_) {
    // Default to 'free' — do not block the request
  }
  next();
}

/**
 * countAcceptedGroups — number of groups the user is an accepted member of.
 * Returns the count, or 0 on error.
 */
export async function countAcceptedGroups(client, userId) {
  const { count, error } = await client
    .from('profiles_groups')
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('invite_status', 'accepted');
  if (error) return 0;
  return count || 0;
}

/**
 * countEventsThisMonth — events created by the user within the current
 * calendar month (based on events.created_at). Returns the count, or 0 on error.
 */
export async function countEventsThisMonth(client, userId) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  const { count, error } = await client
    .from('events')
    .select('event_id', { count: 'exact', head: true })
    .eq('created_by', userId)
    .gte('created_at', monthStart)
    .lt('created_at', nextMonthStart);
  if (error) return 0;
  return count || 0;
}

/**
 * checkLimit — returns middleware enforcing a free-tier limit.
 * Must run after attachTier. Plus users skip checks entirely.
 *
 * @param {'groups'|'events_month'} limitType
 */
export function checkLimit(limitType) {
  return async (req, res, next) => {
    if (req.tier === 'plus') return next();

    const client = req.supabase || supabase;
    const userId = req.cookies.userId;

    try {
      if (limitType === 'groups') {
        const count = await countAcceptedGroups(client, userId);
        if (count >= FREE_MAX_GROUPS) {
          return res.status(403).json({
            success: false,
            code: 'UPGRADE_REQUIRED',
            limit: 'groups',
            current: count,
            max: FREE_MAX_GROUPS,
          });
        }
        return next();
      }

      if (limitType === 'events_month') {
        const count = await countEventsThisMonth(client, userId);
        if (count >= FREE_MAX_EVENTS_MONTH) {
          return res.status(403).json({
            success: false,
            code: 'UPGRADE_REQUIRED',
            limit: 'events_month',
            current: count,
            max: FREE_MAX_EVENTS_MONTH,
          });
        }
        return next();
      }

      // Unknown limit type — don't block the request
      return next();
    } catch (_) {
      // Counting failed — don't block the request on infrastructure errors
      return next();
    }
  };
}
