// Has this (event, occurrence, reminder type) already fired?
// limit(1) instead of maybeSingle(): several rows must mean "sent", not an error.
export async function alreadySent(db, { eventId, occurrenceDate, reminderType }) {
  const { data, error } = await db
    .from("event_reminders_sent")
    .select("event_id")
    .eq("event_id", eventId)
    .eq("occurrence_date", occurrenceDate)
    .eq("reminder_type", reminderType)
    .limit(1);
  if (error) throw new Error(`reminder dedupe check failed: ${error.message}`);
  return data.length > 0;
}
