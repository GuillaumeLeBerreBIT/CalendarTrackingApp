// Explicit authorization checks, so correctness does not rest on RLS alone.

export async function isGroupMember(client, userId, groupId) {
  if (!groupId || !userId) return false;
  const { data, error } = await client
    .from("profiles_groups")
    .select("user_id")
    .eq("groups_id", groupId)
    .eq("user_id", userId)
    .eq("invite_status", "accepted")
    .limit(1);
  if (error) throw new Error(`membership check failed: ${error.message}`);
  return data.length > 0;
}

// The event if the user created it, is an accepted member of its group, or is a participant.
export async function canAccessEvent(client, userId, eventId) {
  const { data: event, error } = await client
    .from("events")
    .select("event_id, created_by, groups_id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw new Error(`event lookup failed: ${error.message}`);
  if (!event) return null;
  if (event.created_by === userId) return event;
  if (event.groups_id && (await isGroupMember(client, userId, event.groups_id))) return event;
  const { data: part, error: partError } = await client
    .from("profiles_events")
    .select("user_id")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .limit(1);
  if (partError) throw new Error(`participant lookup failed: ${partError.message}`);
  return part.length ? event : null;
}
