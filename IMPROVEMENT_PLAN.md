# Eventli — Full Application Analysis & Improvement Plan

**Date:** 2026-06-10 · **Branch:** `phase3-react-frontend` · **Goal:** a downloadable app people pay for, with **groups** as the core differentiator.

---

## 1. Where the app actually stands

The app is much further along than the May audit suggested. All five P0 bugs from that audit are **fixed and verified** (event delete ownership, invite admin check, CORS, digest endpoint, email column bug).

### Working today
| Area | State |
|---|---|
| Auth (Supabase, cookie-based, refresh flow) | Solid |
| Events: 3 types, recurring (full RRULE), date voting, reactions, comments, public share page | Complete |
| Groups: roles, admin checks, invite links, member colors, activity feed | Complete |
| **Gamification (uncommitted):** habits + streaks + XP/levels, group challenges + leaderboards, pacts (locked reward events), timers/countdowns | ~90% complete |
| Notifications: in-app + **real web push** (verified: `utils/notifications.js:74` sends, cleans up 410s) | Working |
| Email daily digest (Resend) + 4 cron jobs (digest, reminder sweep, countdown sweep, pact resolution) | Working |
| iCal export (token feed) + import (5MB, dedup by UID) | Complete |
| PWA: manifest, service worker (Workbox), push handlers, installable | ~95% |
| Discovery (Ticketmaster, cached, rate-limited) | Working |

### The three real gaps
1. **Monetization = 0%.** No Stripe code, no `tier` column, no `subscriptions` table, no enforcement middleware anywhere. PricingPage is display-only and its numbers (3 groups / 50 events) contradict the decided limits (2 groups / 30 events).
2. **Tests broken.** The only test file (`tests/authRequire.test.js`) has 6 failing tests (mocks not updated after the JSON-API refactor). Coverage <5%.
3. **No ops layer.** No `.env.example`, no CI, no Dockerfile. (Already deploys to Render manually.)

---

## 2. Security & correctness fixes (do BEFORE taking money)

### P0 — real vulnerabilities
| # | Issue | Where | Fix |
|---|---|---|---|
| 1 | `GET /getGroupMembers/:groupId` has **no membership check** — any logged-in user can list any group's members | `routes/groups.js:434` | Verify caller is an accepted member first |
| 2 | `POST /createTask` doesn't verify the caller is in the group; assignee list not validated | `routes/todo.js` | Membership check + validate assignees are group members |
| 3 | Notification pref map missing `event_reminder` (and countdown types) → those pushes **bypass user opt-out** | `utils/notifications.js:8` | Add keys to `TYPE_PREF_KEY` |
| 4 | No global rate limiter; public `/e/:eventId` and `/joinGroup/:token` are enumerable | `app.js` | App-wide limiter (e.g. 300 req/15min/IP) + stricter on public routes |

### P1 — hardening
| # | Issue | Where |
|---|---|---|
| 5 | VAPID subject hardcoded to personal email | `utils/notifications.js:79` → `process.env.VAPID_SUBJECT` |
| 6 | `setMemberColor` accepts arbitrary strings (no hex validation) | `routes/groups.js:494` |
| 7 | Comment delete: owner-only — admins/creators can't remove abuse | `routes/events.js:~1275` |
| 8 | Reactions endpoint unthrottled (spam vector) | `routes/events.js:1095` |
| 9 | Timers: no validation on `target_date` format / `duration_seconds > 0` | `routes/timers.js` |
| 10 | Group cascade delete = 7 sequential queries, not atomic — partial failure leaves orphans | `routes/groups.js` → Supabase RPC/transaction |
| 11 | Pact↔habit coupling is implicit (habits discover active pacts by group); fragile | `routes/habits.js:356`, `routes/pacts.js` |
| 12 | Fix the 6 failing auth tests (add `res.status().json()` mock, `createUserClient` export) | `tests/authRequire.test.js` |

---

## 3. Monetization design (Free vs Plus)

**Processor: Stripe** (decided 2026-06-07). Checkout + Billing Portal + webhooks — no custom card UI.

### Proposed tier split (updated for the gamification layer)

| Feature | Free | Plus (€5/mo, €45/yr) |
|---|---|---|
| Groups | **2** | Unlimited |
| Members per group | 5 | Unlimited |
| Events / month | 30 | Unlimited |
| Habits | 3 | Unlimited |
| Habit history / heatmap | 4 weeks | Full (16w+ / all-time) |
| Group challenges | — (view only) | Create + leaderboards |
| Pacts (locked reward events) | 1 active trial | Unlimited |
| Recurring events | Basic (weekly) | Full RRULE |
| iCal export feed | — | ✓ |
| Countdown timers | 3 | Unlimited |
| Event reminders (push) | D-1 only | Custom reminder times |
| XP, streaks, basic calendar, discovery, tasks | ✓ | ✓ |

**Conversion triggers (in-context modals, not banners):**
- Creating group #3 → upgrade modal (primary trigger — job + family + personal hits it fast)
- Creating habit #4 / pact #2 / a challenge → "Plus unlocks group challenges"
- Toggling iCal export → Plus gate
- Scrolling heatmap past 4 weeks → blurred + upgrade CTA

### DB migration needed
```sql
ALTER TABLE profiles ADD COLUMN tier TEXT NOT NULL DEFAULT 'free';
ALTER TABLE profiles ADD COLUMN stripe_customer_id TEXT;

CREATE TABLE subscriptions (
  subscription_id TEXT PRIMARY KEY,        -- Stripe sub id
  user_id UUID REFERENCES profiles(user_id),
  status TEXT,                              -- active/past_due/canceled/trialing
  price_id TEXT,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Backend pieces
- `utils/tier.js` — `attachTier` middleware (reads `profiles.tier`, caches per request) + `requirePlus` + `checkLimit(resource)` helpers
- `routes/billing.js` — `POST /billing/checkout` (Stripe Checkout session), `POST /billing/portal`, `POST /billing/webhook` (raw body! mount **before** `express.json()`), handling `checkout.session.completed`, `customer.subscription.updated/deleted`
- Enforcement points: `createGroup`, `parseEvent` (monthly count), `POST /habits`, `POST /pacts`, `POST /challenges`, iCal token routes, joinGroup (member cap on the **group owner's** tier)

---

## 4. "An app people download" — distribution strategy

The PWA is ~95% done and this is your fastest path:

1. **Phase 1 — PWA-first (now):** installable on Android + iOS (push works on iOS ≥16.4 when installed to home screen). Add an in-app "Install Eventli" prompt (`beforeinstallprompt` on Android, instruction sheet on iOS). Zero store fees, instant updates.
2. **Phase 2 — Store presence (post-launch):** wrap with **Capacitor** (same codebase) for App Store / Play Store. Caveat: selling digital subscriptions **inside** the iOS app requires Apple IAP (30/15% cut). Common pattern: app is free to download, subscription purchased on the website (Stripe), app just reads tier. Plan the upgrade flow so it can hide payment buttons on iOS.

---

## 5. Strengthening the GROUPS differentiator

Your moat is "habits + calendar **with people you know**" — no major competitor combines group accountability with a shared calendar. Prioritized ideas:

| Priority | Feature | Why |
|---|---|---|
| ★★★ | **Inline invite accept/decline** from notifications (currently must navigate away) | Friction on the #1 growth loop |
| ★★★ | **Group habit visibility polish** — "who did their habit today" strip on GroupDetail (data already exists via `GET /groups/:id/habits`) | Makes accountability visceral, daily-open driver |
| ★★★ | **Pact progress notifications** ("3 completions left to unlock Pizza Night!") | Pacts are your most original feature; make them loud |
| ★★ | Challenge completion celebration + push to all members | Closes the loop on challenges |
| ★★ | **Streak rescue / nudge**: "Hanne hasn't logged today — send a nudge 👋" (one tap, push to them) | Social pressure = retention; classic Duolingo move |
| ★★ | Weekly group recap (push/email): leaderboard movement, streaks, upcoming events | Re-engagement |
| ★ | Group availability heat ("best evening this week") from RSVP/event data | Strengthens scheduling value |
| ★ | Shared group streak (group-level streak when everyone completes) | Team identity |

---

## 6. Step-by-step plan

### Phase A — Stabilize & commit (≈3–4 days)
1. Fix P0 security items #1–4 (section 2)
2. Fix P1 items #5–9 (quick wins, ~1 day combined)
3. Repair the 6 failing tests; add route tests for habits XP logic + `canManageEvent` + group membership checks (the money paths)
4. Add `.env.example` documenting all vars (SUPABASE_*, VAPID_*, TICKET_MASTER_KEY, RESEND/FROM_EMAIL, APP_URL, future STRIPE_*)
5. Add habit **edit** endpoint + UI (only CRUD gap in the new layer)
6. **Commit the gamification layer** — it's large and entirely uncommitted; split into logical commits (habits, timers, pacts/challenges, push/PWA)

### Phase B — Tier foundation (≈1 week)
1. DB migration: `tier`, `stripe_customer_id`, `subscriptions` (section 3)
2. `attachTier` + `requirePlus` + `checkLimit` middleware with tests
3. Enforce free limits at the 6 enforcement points; return `403 { code: 'UPGRADE_REQUIRED', limit: ... }`
4. Frontend: `UpgradeModal` component triggered by that error code; align PricingPage numbers with real limits
5. Everything behaves as "free tier" until billing ships — safe to deploy

### Phase C — Stripe billing (≈1 week)
1. Stripe account + products (monthly €5 / yearly €45, 14-day trial optional)
2. `routes/billing.js`: checkout, portal, webhook (raw-body mount before json parser)
3. Tier flips on webhook events; downgrade-grace handling (`past_due` keeps Plus for X days)
4. Profile page: plan card + "Manage subscription" → Stripe portal
5. Test end-to-end with Stripe test clocks (renewal, cancel, payment failure)

### Phase D — Group differentiator features (≈1–1.5 weeks)
Work through section 5 top-down: inline invites → group habit strip → pact notifications → nudges → weekly recap.

### Phase E — Distribution & onboarding (≈1 week)
1. Install prompt (Android `beforeinstallprompt`, iOS instruction sheet)
2. Extend onboarding: create first group → invite someone → create first habit → enable push (the activation funnel)
3. Global error toast system + offline indicator (service worker already caches)
4. Per-user timezone column; digest/reminders in user-local time
5. Optional: Capacitor wrap for store listings (subscription stays web-purchased)

### Phase F — Launch ops (parallel, ≈3 days)
1. GitHub Actions CI: `npm test` + `cd client && tsc && vite build` on PR
2. Render: auto-deploy from main, health-check endpoint, `VAPID_SUBJECT`/`APP_URL` env vars set
3. Basic analytics (PostHog or Plausible) — track the conversion triggers specifically
4. Uptime monitor + Stripe webhook failure alerting

**Total estimate: ~5–6 weeks to a paid launch.**

---

## 7. Deferred / backlog
- Recurring EDIT "this and following" (series split) — delete supports it, edit doesn't
- Google Calendar sync (big Plus-tier carrot for v1.1)
- Transactional emails (welcome, upgrade receipt) — Resend is already wired
- File attachments on events (Supabase Storage)
- Interval-timer presets persistence
- Accessibility pass (focus rings, modal labels, color-only badges)
