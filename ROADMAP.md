# Eventli — Focus & Polish Roadmap

Product thesis: **a social calendar for real groups** — shared events, RSVP, date voting,
and group accountability. Everything either serves that or gets cut.

Effort tags: **S** = a couple of hours · **M** = ~a day · **L** = several days

---

## Phase 0 — Ship what's already fixed

- [ ] Deploy current main to Render (auth refresh fix, mobile profile cog, viewport-height fixes incl. iOS `-webkit-fill-available` fallback)
- [ ] Add `SUPABASE_SECRET_KEY` (sb_secret_…) to Render env — without it crons/pacts/iCal silently fail RLS
- [ ] Re-test bottom nav on iPhone 12 Safari and Samsung A55 **after** deploy

## Phase 1 — Cut & focus ✅ Done 2026-06-11 (validated: tsc/build green, adversarial code review, live preview pass)

1. ✅ **Remove the interval/Pomodoro timer, keep Countdowns** (M)
   - Drop the interval-timer UI; "Timers" leaves the bottom nav → 5 items
     (also satisfies the bottom-nav ≤ 5 UX guideline)
   - Event↔countdown coupling: EventModal already renders a `CountdownPill` for any
     future event (unconditional — simpler than a toggle, shipped as-is)
   - Custom standalone countdowns: new `CountdownsPage` (`/countdowns`), reached from
     the Calendar header on desktop + mobile; `/timers` redirects there
   - Backend timer routes/table untouched; legacy interval rows filtered client-side
2. ✅ **De-gamify personal habits** (M)
   - Remove: XP values, levels, XPBar, "+10 XP" toasts, total_xp on profile
   - Keep: streaks, heatmap, weekly target arc — that's tracking, not gamification
   - Keep DB columns for now (no destructive migration); `xp_value` may later become
     challenge contribution weight
3. ✅ **Group gamification stays and becomes THE gamification**: pacts + challenges only,
   social by design (untouched, verified intact — habit logging still drives pact/challenge counters).

## Phase 2 — Make habits social (the differentiator)

4. **Habit → group challenge linking UI** (M)
   - The challenge leaderboard already says "link a habit" but no UI exists — finish it:
     habit form gets "counts toward challenge X"; leaderboard starts working
5. **Opt-in habit sharing per group** (L)
   - Per habit: "share progress with <group>" (privacy default = private)
   - GroupDetailPage gets a "Member progress" section: per-member weekly count + streak
   - This + pacts/challenges = the training-group story (swim club, gym buddies, …)

## Phase 3 — Core calendar polish

6. **Event share links** (L) — public read-only event page (`/e/:token`) shareable via
   WhatsApp; RSVP/join gated behind signup. Primary growth loop.
7. **Mobile natural-language quick-add** (S/M) — the NL parser is desktop-only today
8. **Render task descriptions** on task cards, or drop the field (S)
9. **Group colors**: let the creator pick a color; stable hash fallback instead of a
   6-color cycling palette (S)
10. **Discovery feed dedupe** across filter switches (S)

## Phase 4 — Monetization readiness (before marketing)

11. `plan` column on profiles + **server-side** entitlement middleware (M)
12. Enforce Free limits (3 groups / 50 events·mo) and make PricingPage promises real;
    reconsider weak gates (iCal/colors) in favor of capacity & advanced group features (M)
13. Payments via Merchant of Record — Paddle or Lemon Squeezy (handles EU VAT;
    being Belgium-based makes raw Stripe a VAT admin burden) (L)
14. Upgrade flow, billing portal, webhook → plan sync (L)

## Phase 5 — Pre-launch hardening

15. supabaseAdmin route audit (task chip already created — IDOR risk where RLS is bypassed)
16. Run Supabase advisors (RLS), rate-limit all mutating routes
17. Error monitoring (Sentry) + privacy-friendly analytics (Plausible/PostHog)
18. GDPR basics: privacy policy, **account deletion** (doesn't exist yet — legally required), data export
19. Onboarding polish: first-run path straight into "create a group → invite → first event"

---

### Suggested order

Phase 0 now → Phase 1 (one sitting) → Phase 2 (the differentiator) →
item 6 (share links) → Phase 4 → Phase 5 alongside beta testing with a real group.
