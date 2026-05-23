import cron from 'node-cron';
import supabase from '../db/supabase.js';
import { sendDigestForUser } from '../routes/email.js';

/**
 * Start the cron scheduler.
 * Schedules the daily digest email job at 07:00 server time.
 */
export function startScheduler() {
  // 0 7 * * *  →  every day at 07:00 (server local time)
  cron.schedule('0 7 * * *', async () => {
    console.log('[scheduler] Starting daily digest run...');

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('user_id, email');

    if (error) {
      console.error('[scheduler] Could not fetch profiles:', error.message);
      return;
    }

    if (!profiles || profiles.length === 0) {
      console.log('[scheduler] No profiles found — nothing to send.');
      return;
    }

    console.log(`[scheduler] Sending digest to ${profiles.length} user(s)...`);

    // Send to each user in sequence to avoid hammering Resend rate limits
    for (const profile of profiles) {
      try {
        const result = await sendDigestForUser(profile.user_id);

        if (result.skipped) {
          console.log(`[scheduler] Skipped ${profile.email}: ${result.reason}`);
        } else {
          console.log(`[scheduler] Sent digest to ${profile.email} (emailId: ${result.emailId})`);
        }
      } catch (err) {
        // Log and continue — one failure must not stop the rest of the run
        console.error(`[scheduler] Failed to send digest to ${profile.email}:`, err.message);
      }
    }

    console.log('[scheduler] Daily digest run complete.');
  });

  console.log('[scheduler] Daily digest cron registered (07:00 server time).');
}
