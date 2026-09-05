// Notification creation helper. Respects each recipient's notification_prefs and
// never throws — a failed notification must not break the main request flow.

import webpush from "web-push";
import { supabaseAdmin } from "../db/supabase.js";

// Maps a notification type to the profiles.notification_prefs key that gates it.
const TYPE_PREF_KEY = {
  group_invite: "group_invites",
  event_invite: "event_invites",
  rsvp_reply: "rsvp_replies",
  event_changed: "event_changes",
  event_cancelled: "event_changes",
  event_comment: "event_comments",
};

/**
 * Insert a notification for one or more recipients, skipping anyone who has
 * opted out of that type. `buildPayload` is either a static { title, body, link }
 * object or a function (recipientId) => { title, body, link }.
 *
 * @param {object} client   - a Supabase client, used only to read recipient prefs.
 *                            The notifications INSERT itself goes through
 *                            supabaseAdmin: creating a notification for *another*
 *                            user is an inherently cross-user (privileged) write,
 *                            so it must not depend on a permissive public RLS
 *                            policy on the notifications table.
 * @param {string|string[]} recipients
 * @param {string} type      - one of the keys in TYPE_PREF_KEY
 * @param {object|function} buildPayload
 */
export async function notifyUsers(client, recipients, type, buildPayload) {
  const ids = [...new Set([].concat(recipients || []).filter(Boolean))];
  if (ids.length === 0) return;

  const prefKey = TYPE_PREF_KEY[type];

  try {
    // Read prefs for all recipients at once
    const { data: profiles } = await client
      .from("profiles")
      .select("user_id, notification_prefs")
      .in("user_id", ids);

    const rows = [];
    for (const id of ids) {
      const profile = (profiles || []).find((p) => p.user_id === id);
      const prefs = profile?.notification_prefs || {};
      // Opted out of this type → skip (missing/true means allowed)
      if (prefKey && prefs[prefKey] === false) continue;

      const payload = typeof buildPayload === "function" ? buildPayload(id) : buildPayload;
      if (!payload?.title) continue;
      rows.push({
        user_id: id,
        type,
        title: payload.title,
        body: payload.body ?? null,
        link: payload.link ?? null,
      });
    }

    if (rows.length > 0) {
      // Privileged cross-user write — see JSDoc. supabaseAdmin bypasses RLS so
      // the permissive "insert any notification" policy can be removed.
      const { error: insertErr } = await supabaseAdmin.from("notifications").insert(rows);
      if (insertErr) {
        // Usually means supabaseAdmin fell back to the anon client (missing
        // SUPABASE_SECRET_KEY) and RLS is blocking the cross-user insert.
        console.warn("notifyUsers: notifications insert failed:", insertErr.message);
      }

      // Fire-and-forget web push to all recipients who have subscriptions
      try {
        const recipientIds = rows.map(r => r.user_id);
        const { data: subs } = await supabaseAdmin
          .from("push_subscriptions")
          .select("user_id, endpoint, p256dh, auth")
          .in("user_id", recipientIds);

        if (subs && subs.length > 0) {
          const pushJobs = subs.map(sub => {
            const row = rows.find(r => r.user_id === sub.user_id);
            if (!row) return Promise.resolve();
            const pushPayload = JSON.stringify({ title: row.title, body: row.body ?? "", link: row.link ?? "/" });
            return webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              pushPayload,
              {
                vapidDetails: {
                  subject: "mailto:leberreguillaume.glb@gmail.com",
                  publicKey: process.env.VAPID_PUBLIC_KEY,
                  privateKey: process.env.VAPID_PRIVATE_KEY,
                },
              }
            ).catch(err => {
              // 404/410 = subscription gone; 403 = key mismatch (VAPID rotated) —
              // in all cases the row is dead weight, delete it so we stop retrying.
              if ([403, 404, 410].includes(err.statusCode)) {
                supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint).catch(() => {});
              } else {
                console.warn(`web-push ${err.statusCode ?? "?"} for ${sub.user_id}:`, err.body || err.message);
              }
            });
          });
          await Promise.allSettled(pushJobs);
        }
      } catch (pushErr) {
        console.warn("Push delivery error:", pushErr.message);
      }
    }
  } catch (err) {
    console.warn("notifyUsers failed:", err.message);
  }
}
