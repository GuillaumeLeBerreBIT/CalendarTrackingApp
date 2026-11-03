# Wishlists during event creation

Supersedes the task-wishlist plan: the requested parent is a calendar event.

- Restore Tasks to its pre-wishlist behavior and remove task wishlist endpoints.
- Keep applied migration history. Add a forward migration restoring event-only
  list constraints/helpers. Abort if any task wishlist exists; never discard gifts.
- Place the optional, collapsed Add a wishlist section in New event, after its
  group/invitation section. Use the modal's current surfaces, typography and
  controls. Gift rows offer name, link, note and Remove; support up to 100 gifts.
- Create the event, invitations, tentative dates, wishlist and gifts atomically.
  Preserve personal, appointment, social, tentative and recurring event behavior.
- Reuse existing event detail wishlists and their private reservations. A new
  recurring event has one wishlist on the series, matching existing behavior.
- Keep entered values and show an inline error on failure. Existing events keep
  their current Add a wishlist action in event details.
- Verify migration rollback guard, atomic creation, personal/group access,
  reservation privacy, ordinary creation, tentative dates and event metadata.
- Deliver through a PR to main, then apply migrations and rerun access checks.

## Validation

- All 218 Vitest tests pass; TypeScript and production frontend build pass.
- Event creation access test: EVENT_CREATION_WISHLISTS_OK in a rollback transaction.
- Original shopping/event lists access test: LISTS_ACCESS_OK after both new migrations in a rollback transaction.
- Seeded a task wishlist in a rollback transaction; removal migration refused to proceed as designed.
- Production inspection found zero task wishlists and zero associated gifts.
- Visual browser verification remains unavailable in this session.
