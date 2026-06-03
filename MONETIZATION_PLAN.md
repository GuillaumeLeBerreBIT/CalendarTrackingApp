# CalendarTracking — Monetization Plan
> Generated: 2026-05-26 | Status: Planning

---

## Current State: 65% Ready for SaaS

The app already has solid bones: auth, groups, calendar CRUD with drag-reschedule, task lists with assignments, color theming, email digests via Resend, and a PWA manifest. What it's missing is the billing layer, tier enforcement, and a handful of critical features that flip "nice project" into "I'll pay for this."

### Critical Bugs to Fix Before Taking Any Money

| Priority | Location | Bug |
|---|---|---|
| P0 | `routes/email.js:99` | Selects `list_title` but column is `task_list_title` — digest emails silently fail for task summaries |
| P0 | `routes/events.js` DELETE | No ownership check — any logged-in user can delete anyone's event |
| P0 | `routes/groups.js` `/inviteUsers` | No admin check — any member can invite users |
| P0 | `app.js:25` | `cors()` with default options allows all origins |
| P0 | `routes/email.js` | `/send-digest/:userId` HTTP endpoint is unauthenticated — spam vector |

---

## Tier Structure

### Free (forever)

| Resource | Limit |
|---|---|
| Groups | 2 |
| Members per group | 5 |
| Events per month | 30 |
| Task lists per group | 3 |
| Tasks per list | 20 |
| Email digest | Yes (daily) |
| iCal / CSV export | No |
| Recurring events | No |
| Google Calendar sync | No |
| File attachments | No |
| Calendar views | Month + list only |

### Plus — €5/month or €45/year

Everything unlimited, plus:
- Recurring events
- iCal / CSV export
- Google Calendar sync (read + write)
- Public shareable event links
- File attachments (500 MB/user)
- Event reminder emails (not just digest)
- Week / time-grid calendar views
- Priority email support

**Why €5:** Below Notion (€8+) and Calendly (€8+), above "free toy." The annual option (€45 = 25% off) is critical — annual subscribers churn at a fraction of the rate of monthly subscribers.

**Primary conversion trigger:** The 2-group free limit. Anyone with a job, a family, and a side project hits it immediately.

---

## Feature Roadmap

### Phase 1 — Gate-openers (drive upgrade decisions)

#### 1. Tier enforcement middleware *(Low complexity)*
- New `attachTier` middleware in `utils/utils.js` reads `profiles.tier` after `authRequire`, sets `req.userTier`
- `requirePlusTier` helper returns `{ success: false, upgradeRequired: true }` (HTTP 402) for free users
- Frontend catches `upgradeRequired: true` and shows an in-context upgrade modal (not a redirect)
- [ ] **TODO:** Write `attachTier` and `requirePlusTier` in `utils/utils.js`
- [ ] **TODO:** Wire `attachTier` into `authRequire`

#### 2. Recurring events *(Medium complexity)*
- Single most-requested calendar feature — anyone running a weekly standup or monthly review hits this wall immediately
- DB: add `recurrence_rule TEXT` (RRULE string e.g. `FREQ=WEEKLY;BYDAY=MO`) and `recurrence_parent_id UUID` to `events`
- FullCalendar 6 already supports `@fullcalendar/rrule` plugin for client-side display
- Server-side materialization needed for reminder emails and iCal export
- [ ] **TODO:** Add columns to `events` table
- [ ] **TODO:** Add `@fullcalendar/rrule` and update `calendar.js`
- [ ] **TODO:** Handle RRULE in `routes/events.js` POST

#### 3. iCal / CSV export *(Low-Medium complexity)*
- Lets users subscribe in Apple Calendar, Google Calendar, or Outlook
- A trust-builder — letting users export their data makes them *more* willing to pay
- `npm install ical-generator`
- New `GET /export/ical` and `GET /export/csv` routes behind `requirePlusTier`
- Loops `retrieveEvents()`, responds with `Content-Type: text/calendar` or `text/csv`
- [ ] **TODO:** Create export routes
- [ ] **TODO:** Add Export button to calendar and groups pages

### Phase 2 — Retention and stickiness

#### 4. Event reminder emails *(Medium complexity)*
- Free tier: daily digest only. Plus: individual per-event reminders ("Your meeting starts in 1 hour")
- Add `reminder_minutes_before INT` column to `events`
- Extend cron scheduler in `utils/scheduler.js` to scan for upcoming events and send reminders
- Resend is already wired — extract `Resend` client to a shared singleton in `utils/` or `db/`
- [ ] **TODO:** Add `reminder_minutes_before` to `events`
- [ ] **TODO:** Extend scheduler for reminder sending

#### 5. Google Calendar sync *(High complexity — highest conversion value)*
- v1: one-direction import only (Google → CalendarTracking). Two-way sync is v2.
- Add `google_event_id TEXT` column to `events` to prevent duplicates
- `npm install googleapis`
- Store OAuth tokens in new `google_oauth_tokens` table
- [ ] **TODO:** Enable Google Calendar API in Google Cloud Console
- [ ] **TODO:** Create `google_oauth_tokens` table
- [ ] **TODO:** Add `GET /auth/google` and `GET /auth/google/callback` routes
- [ ] **TODO:** Add `GET /google/sync` route behind `requirePlusTier`
- [ ] **TODO:** Add `DELETE /auth/google` disconnect route

#### 6. Public event pages *(Low-Medium complexity)*
- Add `public_token UUID` (nullable) to `events`
- New unauthenticated route `GET /event/:token` → minimal read-only EJS view
- "Share" button in event modal generates token server-side, copies URL to clipboard
- Free users see the button but hit an upgrade prompt on click
- [ ] **TODO:** Add `public_token` to `events`
- [ ] **TODO:** Create `GET /event/:token` route and view
- [ ] **TODO:** Add Share button to event modal in `calendar.js`

### Phase 3 — Value-add, lower urgency

#### 7. File attachments *(Medium complexity)*
- Use Supabase Storage (already part of your Supabase plan)
- New `attachments` table: `attachment_id`, `entity_type` (event/task), `entity_id`, `storage_path`, `filename`, `file_size`, `uploaded_by`, `created_at`
- 500 MB per user limit enforced by summing `file_size` before each upload
- [ ] **TODO:** Create `attachments` table
- [ ] **TODO:** Add upload/download routes
- [ ] **TODO:** Add attachment UI to event and task modals

#### 8. Analytics dashboard for group admins *(Low-Medium complexity)*
- New route `GET /groups/:groupId/analytics` (admin role only)
- Data computed from existing tables: events per week, task completion rate, member activity
- Chart.js CDN — no new npm packages needed
- [ ] **TODO:** Create analytics route + `analytics.ejs`

#### 9. PWA push notifications *(High complexity)*
- Service worker already registered (`public/js/pwa.js`)
- `npm install web-push` — generate VAPID key pair
- New `push_subscriptions` table: `user_id`, `endpoint`, `p256dh`, `auth`, `created_at`
- Trigger from scheduler alongside email reminders
- [ ] **TODO:** Generate VAPID keys, add to env vars
- [ ] **TODO:** Create `push_subscriptions` table
- [ ] **TODO:** Add `POST /push-subscribe` route
- [ ] **TODO:** Extend scheduler to send push notifications

---

## Payment Integration: Paddle (not Stripe)

**Recommendation: Paddle** — As an EU developer, Paddle acts as Merchant of Record. They collect and remit VAT across all 27 EU countries automatically. With Stripe you become the tax collector for every country you sell into. For a solo dev, Paddle removes this entire concern.

### Database Changes

```sql
-- Add to profiles table
ALTER TABLE profiles ADD COLUMN tier TEXT NOT NULL DEFAULT 'free';
ALTER TABLE profiles ADD COLUMN paddle_customer_id TEXT;

-- New subscriptions table
CREATE TABLE subscriptions (
  subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paddle_subscription_id TEXT UNIQUE,
  paddle_price_id TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active, past_due, cancelled, paused
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
```

### New `routes/billing.js`

| Route | Auth | Purpose |
|---|---|---|
| `POST /billing/webhook` | None (verify Paddle-Signature header) | Handle Paddle subscription events |
| `GET /billing/checkout` | authRequire | Redirect to Paddle checkout |
| `GET /billing/portal` | authRequire | Redirect to Paddle customer portal |
| `GET /billing/status` | authRequire | Return current tier + period end date |

**Webhook events to handle:**
- `subscription.created` → set `profiles.tier = 'plus'`, insert row in `subscriptions`
- `subscription.updated` → update status, period dates
- `subscription.cancelled` → set `cancel_at_period_end = true`
- `subscription.past_due` → 7-day grace period then downgrade to free

**Always verify `Paddle-Signature` before processing any webhook.**

- [ ] **TODO:** Create Paddle account + product (Plus Monthly €5, Plus Annual €45)
- [ ] **TODO:** Create `routes/billing.js`
- [ ] **TODO:** Run DB migration for `profiles` changes + `subscriptions` table
- [ ] **TODO:** Test full checkout → webhook → `tier = 'plus'` in Paddle sandbox

---

## Onboarding & Conversion Flow

### Empty States First
A new user landing on an empty calendar looks like a broken app. Add "Create your first event" empty state cards to all three main pages before anything else. Users who don't understand the product don't upgrade.

- [ ] **TODO:** Empty state in `calendar.ejs` (when events array is empty)
- [ ] **TODO:** Empty state in `groups.ejs` (when groups array is empty)
- [ ] **TODO:** Empty state in `todo.ejs` (when task lists array is empty)

### In-Product Upgrade Triggers

Context-triggered prompts convert at 3–5× the rate of permanent banners. Show the wall only when the user hits it.

| Trigger | Code location | Message |
|---|---|---|
| 3rd group creation | `POST /createGroup` returns 402 | "You've used 2 of 2 free groups. Upgrade for unlimited." |
| 6th member invite | `POST /inviteUsers` returns 402 | "You've reached the 5-member limit on Free." |
| Clicks "Recurring" checkbox | Frontend gate in `calendar.js` | "Recurring events are a Plus feature." |
| Clicks "Export" button | Route-level gate | Upgrade modal with checkout link |
| 28th event this month | Soft nudge from `POST /parseEvent` | "2 events left this month on Free." |
| 30th event this month | Hard block from `POST /parseEvent` | Upgrade required to continue |

### `/pricing` Page
- Static EJS page, unauthenticated
- Two-column Free/Plus comparison table
- "Try free, upgrade anytime" CTA
- Link from navbar (logged-out users) and all upgrade modals
- [ ] **TODO:** Create `views/pricing.ejs`
- [ ] **TODO:** Add `GET /pricing` route (no authRequire)
- [ ] **TODO:** Link from `partials/navbar.ejs`

### Post-Upgrade Flow
After Paddle checkout, redirect to `/billing/success` → flash message "You're now on Plus" → redirect to `/groups`. Get the user back into the product immediately.

---

## Google OAuth & Calendar Sync

### APIs to Enable in Google Cloud Console
1. Google Calendar API
2. Google OAuth2 API (default)
3. **Do NOT enable Gmail API** — use Resend for transactional email. Gmail API requires Google app verification review and has an invasive consent screen.

### Scopes
- v1 (import only): `https://www.googleapis.com/auth/calendar.readonly`
- v2 (two-way sync): `https://www.googleapis.com/auth/calendar`

### Token Storage
```sql
CREATE TABLE google_oauth_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,        -- only returned on first auth, store permanently
  token_expiry TIMESTAMPTZ,
  scope TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```
Google's refresh token is only returned once — store it immediately and never discard it.

### Routes to Add
```
GET  /auth/google           — Build OAuth URL (access_type=offline&prompt=consent), redirect user
GET  /auth/google/callback  — Exchange code for tokens, store in google_oauth_tokens, redirect to /calendar
GET  /google/sync           — authRequire + requirePlusTier → pull events from Google Calendar
DELETE /auth/google         — Revoke token + delete from DB
```

`npm install googleapis` — handles token refresh automatically when initialized with `{ refresh_token }`.

In the sync route:
1. Load tokens from `google_oauth_tokens` for `req.cookies.userId`
2. Initialize `google.auth.OAuth2` client with stored credentials
3. Call `calendar.events.list({ calendarId: 'primary', timeMin, timeMax })`
4. Upsert events into `events` table matching on `google_event_id` to prevent duplicates

---

## Security — Must Fix Before Taking Money

```bash
npm install helmet express-rate-limit
```

| Fix | File | Change |
|---|---|---|
| Add helmet | `app.js` | `app.use(helmet())` before all routes |
| Rate-limit auth | `routes/auth.js` | 20 req/15min on POST /login and POST /register |
| Add `created_by` to events | DB migration | `ALTER TABLE events ADD COLUMN created_by UUID REFERENCES auth.users(id)` |
| Narrow CORS | `app.js` | `cors({ origin: process.env.APP_URL, credentials: true })` |
| Secure cookies in production | `routes/auth.js` | `secure: process.env.NODE_ENV === 'production'` on all 4 cookies |
| Remove public digest endpoint | `routes/email.js` | Delete the `/send-digest/:userId` HTTP route (scheduler imports the function directly) |
| HTTPS redirect | `app.js` | Redirect HTTP → HTTPS in production using `x-forwarded-proto` header |

---

## 6-Week MVP Launch Checklist

### Week 1 — Security hardening
- [ ] `npm install helmet express-rate-limit`
- [ ] Add `app.use(helmet())` to `app.js`
- [ ] Rate-limit `POST /login` and `POST /register`
- [ ] Fix `secure: true` on all 4 cookies in production
- [ ] Narrow CORS to `APP_URL`
- [ ] Remove public `/send-digest/:userId` HTTP route
- [ ] Add `created_by UUID` column to `events` table
- [ ] Set `created_by` on all `POST /parseEvent` inserts

### Week 2 — Database and tier system
- [ ] Run migration: `tier` + `paddle_customer_id` on `profiles`, create `subscriptions` table
- [ ] Fix `list_title` vs `task_list_title` schema mismatch in `routes/email.js` and `utils/scheduler.js`
- [ ] Write `attachTier` middleware
- [ ] Write `requirePlusTier` helper
- [ ] Integrate `attachTier` into `authRequire` in `utils/utils.js`

### Week 3 — Billing integration
- [ ] Create Paddle account
- [ ] Set up "CalendarTracking Plus" product with monthly (€5) and annual (€45) prices
- [ ] Create `routes/billing.js` with webhook, checkout, portal, status routes
- [ ] Implement webhook handler for subscription created/updated/cancelled
- [ ] Test full checkout → webhook → `tier = 'plus'` in Paddle sandbox
- [ ] Add `PADDLE_WEBHOOK_SECRET` to env vars

### Week 4 — Gate the free limits
- [ ] Gate `POST /createGroup` at 2 groups for free tier
- [ ] Gate `POST /inviteUsers` at 5 members for free tier
- [ ] Gate `POST /parseEvent` at 30 events/month (count by `created_by` + current month)
- [ ] Return `{ upgradeRequired: true }` from all gated routes
- [ ] Handle `upgradeRequired: true` in `groups.js` — show upgrade modal
- [ ] Handle `upgradeRequired: true` in `calendar.js` — show upgrade modal

### Week 5 — First Plus-only feature: iCal export
- [ ] `npm install ical-generator`
- [ ] Create `GET /export/ical` route behind `requirePlusTier`
- [ ] Add "Export" button to groups and calendar pages
- [ ] Free users see button but get upgrade modal on click

### Week 6 — Polish and launch
- [ ] Empty states on calendar, groups, and todo pages
- [ ] Add "Plan: Free / Upgrade to Plus" section to `profile.ejs`
- [ ] Create `/pricing` EJS page and link from navbar
- [ ] Add `GET /pricing` route (no authRequire)
- [ ] Full journey test: register → empty state → create group → hit limit → upgrade → Paddle checkout → return as Plus user
- [ ] Configure production env vars: `APP_URL`, `PADDLE_WEBHOOK_SECRET`, `CRON_SECRET`
- [ ] Set up Paddle webhook endpoint in production dashboard

---

## Month 2 Backlog (after first paying customers)

- [ ] Recurring events (Medium — high conversion value, do this first)
- [ ] Google Calendar sync (High — highest conversion value long-term)
- [ ] Public event pages (Low-Medium — quick win alongside recurring events)
- [ ] File attachments via Supabase Storage
- [ ] Analytics dashboard for group admins
- [ ] PWA push notifications

---

## Competitive Positioning

**Own this niche:** "Shared calendar + tasks for families and small teams, at a price that's an easy yes."

| Competitor | Gap this app fills |
|---|---|
| Google Calendar | No group task lists, no RSVP tracking |
| Notion | €8+/month, steep learning curve, database-first not calendar-first |
| Trello | No calendar view, no event scheduling |
| Calendly | Booking-only, no group tasks, €8+/month |

**Pricing page headline:** *"One app for your team's schedule and to-dos. Not another Notion."*

The positioning is not "cheaper than Google Workspace" — it is "the one app for families and small teams who want shared scheduling and task tracking in one place, at a price that is easy to say yes to."

---

## Key Files Reference

| File | Relevance to monetization |
|---|---|
| `app.js` | Add helmet, narrow CORS, HTTPS redirect, register `/billing` and `/pricing` routes |
| `utils/utils.js` | Add `attachTier`, `requirePlusTier`, wire into `authRequire` |
| `routes/auth.js` | Add rate limiting to POST /login and POST /register |
| `routes/events.js` | Gate event creation, add `created_by`, fix ownership check on DELETE |
| `routes/groups.js` | Gate createGroup and inviteUsers, add admin check |
| `routes/email.js` | Remove public `/send-digest/:userId` HTTP route, fix column name bug |
| `utils/scheduler.js` | Fix column name bug, extend for event reminder emails |
| `db/supabase.js` | No changes needed — existing per-user client pattern is correct |
| `views/profile.ejs` | Add "Plan: Free / Upgrade" section |
| `views/navbar.ejs` | Add /pricing link for unauthenticated users |
| New: `routes/billing.js` | Paddle webhook, checkout, portal, status |
| New: `views/pricing.ejs` | Free vs Plus comparison, unauthenticated |