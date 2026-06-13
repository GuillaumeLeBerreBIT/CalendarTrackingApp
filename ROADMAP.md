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

## Phase 4 — Monetization readiness (before marketing)

11. `plan` column on profiles + **server-side** entitlement middleware (M)
12. Enforce Free limits (3 groups / 50 events·mo) and make PricingPage promises real;
    reconsider weak gates (iCal/colors) in favor of capacity & advanced group features (M)
13. Payments via Merchant of Record — **Paddle** or Lemon Squeezy (handles EU VAT;
    being Belgium-based makes raw Stripe a VAT admin burden) (L)
14. Upgrade flow, billing portal, webhook → plan sync (L)

## Phase 5 — Pre-launch hardening

15. supabaseAdmin route audit (IDOR risk where RLS is bypassed)
16. Run Supabase advisors (RLS), rate-limit all mutating routes
17. Error monitoring (Sentry) + privacy-friendly analytics (Plausible/PostHog)
18. ✅ GDPR basics: privacy policy page (`/privacy`, `PrivacyPage.tsx` — needs `PRIVACY_EMAIL`/`CONTROLLER_NAME` filled, see LAUNCH_CHECKLIST.md), **account deletion** (`POST /api/account/delete`, password re-auth, FK-safe cascade), data export (`GET /api/account/export`) — UI in ProfilePage "Privacy & data" + "Danger zone"
19. Onboarding polish: first-run path straight into "create a group → invite → first event"

---

### Suggested order

~~Phase 0~~ → ~~Phase 1~~ → ~~Phase 2~~ → ~~Phase 3~~ →
Phase 4 (monetization) → Phase 5 alongside beta testing with a real group.
