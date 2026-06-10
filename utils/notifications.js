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
 * @param {object} client   - a Supabase client (use req.supabase for RLS context)
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
      await client.from("notifications").insert(rows);

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
              // 410 Gone = subscription expired, clean it up
              if (err.statusCode === 410) {
                supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint).catch(() => {});
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
