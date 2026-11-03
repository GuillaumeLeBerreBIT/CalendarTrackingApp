# Task wishlists

Add a collapsed, optional Wishlist section to New task, below the due date. Use
the existing modal typography, surface colors and controls. Gift rows contain a
name, optional link and note, and a remove action. Keep drafts when a save fails;
show errors inline. The modal scrolls on small screens.

Save the task, wishlist and initial items in one database transaction. A wishlist
belongs to exactly one event or task. Task wishlists follow accepted membership
of the task list's group. Reuse item editing and claims, keeping all reservations
hidden from the wishlist creator. Removing a task cascades to its wishlist.

Show a Wishlist action on saved tasks; open the shared wishlist component in a
modal. Existing tasks can add a wishlist there too. Event wishlists retain their
current behavior. Test atomic creation, access, immutable parent, claims privacy,
and unchanged event access; run route tests and frontend type/build checks.

## Verification

- 218 Vitest tests pass, including task creation, validation and wishlist privacy routes.
- TypeScript check and production frontend build pass.
- `task_wishlists_access_test.sql` returns `TASK_WISHLISTS_ACCESS_OK` in a rollback transaction.
- Existing `lists_access_test.sql` returns `LISTS_ACCESS_OK` with the new migration in a rollback transaction.
- Confirmed no schema change or test group persisted.
- Browser verification blocked: computer-use browser host unavailable.
- Migration is prepared and tested, pending application before deploying the app changes.
