# Eventli — Focus & Polish Roadmap

Product thesis: **a social calendar for real groups** — shared events, RSVP, date voting,
and group accountability. Everything either serves that or gets cut.

Effort tags: **S** = a couple of hours · **M** = ~a day · **L** = several days

---

## Phase 0 — Ship what's already fixed ✅ Done 2026-06-12

- ✅ Deploy current main to Render (auth refresh fix, mobile profile cog, viewport-height fixes incl. iOS `-webkit-fill-available` fallback)
- ✅ Add `SUPABASE_SECRET_KEY` to Render env
- ✅ Re-test bottom nav on iPhone 12 Safari and Samsung A55 after deploy

## Phase 1 — Cut & focus ✅ Done 2026-06-11 (validated: tsc/build green, adversarial code review, live preview pass)

1. ✅ **Remove the interval/Pomodoro timer, keep Countdowns** (M)
   - Drop the interval-timer UI; "Timers" leaves the bottom nav → 5 items
   - Custom standalone countdowns: new `CountdownsPage` (`/countdowns`); `/timers` redirects there
2. ✅ **De-gamify personal habits** (M)
   - Remove: XP values, levels, XPBar, "+10 XP" toasts, total_xp on profile
   - Keep: streaks, heatmap, weekly target arc
3. ✅ **Group gamification stays and becomes THE gamification**: pacts + challenges only,
   social by design (untouched, verified intact — habit logging still drives pact/challenge counters).

## Phase 2 — Make habits social (the differentiator) ✅ Done 2026-06-12

4. ✅ **Habit → group challenge linking UI** (M)
   - `POST /habits` and new `PUT /habits/:id` accept `challenge_id` + `contribution_value`
   - New Habit form: "Share with group" dropdown + "Counts toward challenge" picker (conditional)
   - Contribution-per-log number field; challenge progress now increments on every habit log
5. ✅ **Opt-in habit sharing per group** (L)
   - Habit form group selector sets `groups_id` — privacy default is still private (no group = private)
   - GroupDetailPage: new "Member progress" section — per-habit row with avatar, streak, 7-day dot grid, "✓ today" badge
   - Placed in right column on desktop, Members tab on mobile

**Also done 2026-06-12:** iPad/tablet layout fix — breakpoint raised from 768 → 1024px across all components (`AppShell`, `CalendarPage`, `GroupDetailPage`, `EventModal`, `index.css`). Tablets now get the pill-filter layout instead of the desktop sidebar.

## Phase 3 — Core calendar polish ✅ Done 2026-06-12

6. ✅ **Event share links** (L) — was ~80% built (`PublicEventPage`, public API, share button);
   finished the missing piece: `events.public_token` UUID column (migrated, backfilled),
   `GET /api/e/:token` looks up by token (event IDs no longer enumerable), share button
   uses the native share sheet on mobile (WhatsApp) with clipboard fallback on desktop
7. ✅ **NL quick-add everywhere** (S) — "Quick fill" bar added inside EventFormModal create
   mode (parses "Lunch Friday 1pm at Marco's" → fills title/date/time/location), so it
   works from the mobile "+" button too; desktop quick-add bar unchanged
8. ✅ **Task descriptions** rendered on task cards (2-line clamp, strikethrough when done)
9. ✅ **Group colors** — create-group modal gets a color picker (palette + custom);
   `groupColorFor()` prefers creator-picked `shared_color`, falls back to a stable hash
   of `groups_id` (replaces position-based cycling in GroupsPage/GroupDetail/TodoPage);
   bonus: hex validation added to `setGroupSharedColor`/`setMemberColor` (was P1 #6)
10. ✅ **Discovery feed dedupe** — backend dedupes TM results on title+date+venue
    (TM returns one entry per ticket pool)

## Phase 4 — Monetization readiness ✅ Done 2026-06-14 (built, dormant)

11. ✅ `plan` + `always_free` columns on profiles + **server-side** entitlement middleware
    (`utils/tier.js`: `attachTier`, `checkLimit`)
12. ✅ Free limits enforced (3 groups / 50 events·mo) — `checkLimit` wired into
    `POST /createGroup` and `POST /parseEvent`; 403 `UPGRADE_REQUIRED` → global `UpgradeModal`
13. ✅ Payments via **Stripe** (decision changed from Paddle — see ⚠️ VAT note below).
    `routes/billing.js` + `subscriptions` table (migrated from Paddle columns)
14. ✅ Upgrade flow + billing portal + webhook → plan sync
    (`/billing/create-checkout-session`, `/billing/portal`, `/billing/webhook`;
    handles checkout.completed / subscription.updated / subscription.deleted, idempotent, signature-verified)

**Billing is OFF by default.** Master flag `VITE_BILLING_ENABLED` (client) gates every
upgrade entry point; backend returns 503 until the `STRIPE_*` keys are set. Eventli runs
as a fully-free app for the two `always_free` accounts. To start selling: set the flag +
add Stripe keys + rebuild (no code changes). See LAUNCH_CHECKLIST.md.

> ⚠️ **VAT caveat:** Stripe is *not* a Merchant of Record, so EU VAT on B2C sales is the
> seller's responsibility (Stripe Tax can calculate it, but you file/remit). Paddle/Lemon
> Squeezy would have handled this end-to-end. Acceptable while invite-only/free; revisit
> before charging real EU customers.

## Phase 5 — Pre-launch hardening

15. ✅ supabaseAdmin / IDOR audit — found & fixed: `authRequire` now binds the
    attacker-controllable `userId` cookie to the verified JWT (`req.cookies.userId = req.user.id`),
    closing account-deletion/export/data IDOR across all `supabaseAdmin` routes
16. ⚠️ **Partial** — rate limiting done (global 300/15m on `/api`, `trust proxy` fixed so it
    keys on real client IP, webhook exempt). **Remaining: RLS hardening from advisors** (see Phase 6 #20)
17. ⚠️ **Partial** — ✅ Sentry error monitoring (backend `@sentry/node` + frontend `@sentry/react`,
    source-map upload via vite plugin). ❌ Privacy-friendly analytics (Plausible/PostHog) not added
18. ✅ GDPR basics: privacy policy page (`/privacy`, `PrivacyPage.tsx` — needs `PRIVACY_EMAIL`/`CONTROLLER_NAME`
    filled, see LAUNCH_CHECKLIST.md), **account deletion** (`POST /api/account/delete`, password re-auth,
    FK-safe cascade), data export (`GET /api/account/export`) — UI in ProfilePage "Privacy & data" + "Danger zone"
19. ✅ Onboarding polish: first-run wizard (OnboardingWizard) + QR/username invite

**Also done 2026-06-14:** Content-Security-Policy enabled in `helmet` (was disabled);
external-only scripts verified against the production build.

## Phase 6 — Remaining before public launch

20. ✅ **RLS hardening** — Done 2026-06-14 (migration `db/migrations/2026-06-14_rls_hardening.sql`,
    applied + validated by simulating real authenticated/anon sessions; advisor WARNs cleared):
    - `notifications`: dropped the two `WITH CHECK (true)` INSERT policies (closed the
      notification-spam vector). `notifyUsers` now inserts via `supabaseAdmin` (it's a
      privileged cross-user write) — `utils/notifications.js`.
    - `group_invite_tokens`: dropped permissive `service_update_token` UPDATE (only writer is `supabaseAdmin`)
    - `event_reminders_sent`: dropped permissive `ers_all` (scheduler-only / service role)
    - `profiles_task`: added the missing policy (group members manage assignees) — this also
      **repaired a latent bug** (task assignment was silently failing under RLS)
    - Revoked RPC `EXECUTE` on `handle_new_user()` (signup trigger) and `is_group_member()` from
      anon. `is_group_member` keeps `authenticated` EXECUTE — required because it's used inside RLS
      policies (the resulting 0029 advisor WARN is expected and accepted).
21. **Supabase dashboard toggles** (no code, manual): enable Leaked Password Protection
    (HaveIBeenPwned), upgrade Postgres to latest patch version. *(Both still open — from advisors.)*
22. **Terms of Service page** (legal) — `/terms`, minimum age 13, Belgian governing law
23. **Privacy policy i18n** — FR + NL translations before marketing in Belgium
24. *(Optional)* Privacy-friendly analytics (Plausible or PostHog EU)
25. *(Optional, before charging EU customers)* Stripe Tax or migrate to Paddle/Lemon Squeezy for VAT

### Phase 7 — Security follow-ups (low severity, defense-in-depth)

Surfaced during the 2026-06-14 RLS review; none are exploitable for data theft, all pre-existing:
26. **Task-assignee validation** — neither app nor RLS checks that an *assigned* `user_id` is a
    member of the task's group, so a member can assign a task to an arbitrary user. Add a
    membership check on assignee ids (app-layer in `routes/todo.js` and/or tighten the
    `profiles_task` WITH CHECK).
27. **Broad read policies (review, don't blindly change)** — several SELECT policies are
    `USING (true)` / `auth.uid() IS NOT NULL`, exposing cross-user rows to *any* authenticated
    user: `profiles` (incl. email, also readable by anon), `profiles_events`, `profiles_groups`,
    `event_overrides`. Tightening needs per-feature analysis (and migrating `routes/auth.js` off
    the anon client) so it doesn't break user search / member lists. Defense-in-depth, not urgent.

## Phase 8 — Focus the product (2026-06-15)

28. ✅ **Discovery / Ticketmaster retired** — every viable public-event API is paywalled,
    closed to public search, or commercially grey, and discovery was never the moat. Removed
    `routes/discovery.js`, `routes/saved.js`, `DiscoveryPage`, `SaveToCalendarModal`, `savedStore`,
    `SourceBadge`, the `DiscoveryEvent`/`SavedEvent` types, source CSS vars, the nav item, the
    `saved_events` references in stats/export/deletion, the privacy-policy Ticketmaster line, and
    the `TICKET_MASTER_*` env keys. ⚠️ **The removed keys were live — rotate/revoke them in the
    Ticketmaster developer portal.**
29. ✅ **Date voting upgraded to availability voting** — the existing single-choice tentative-event
    vote (one pick per person) became Doodle/When2meet-style multi-slot voting: each member marks
    every candidate slot yes/maybe/no. Migration `db/migrations/2026-06-15_availability_voting.sql`
    (added `availability` col, re-keyed unique to `(event_id, option_id, user_id)`, applied + verified).
    `/voteEventDate` takes an `availability` (or `clear`); `renderEvents` returns per-option
    `yes/maybe/no` counts + `myVotes`; GroupDetailPage shows a 3-state pill control + overlap meter
    (UX-reviewed: 44px touch targets, glyph + colour, aria-labels). Creator still confirms via
    `/confirmEventDate` (now picks the max-yes slot).

---

### Status summary (2026-06-14)

Phases 0–5 complete; **Phase 6 #20 (RLS hardening) done & validated 2026-06-14** — the one
item with a genuine abuse vector (notification spam) is closed. The app is feature-complete
and shippable for private/free use. What's left before *public, paid* launch:
- **Phase 6 #21–23** — Supabase dashboard toggles + ToS page + FR/NL translations (mostly non-code)
- **Phase 7 #26–27** — low-severity security follow-ups (defense-in-depth, not urgent)
- Manual launch steps in **LAUNCH_CHECKLIST.md** (DPAs, ROPA, Stripe setup, two-person test)

### Suggested order

~~Phase 0 → 1 → 2 → 3 → 4 → 5 → 6 #20~~ → #21 dashboard toggles →
#22–23 legal → #26 assignee check → #24–25 / #27 optional/at-scale.
