# Eventli — Full Build Plan
### From CalendarTracking to a shippable social calendar with event discovery

> Start point: existing Express + EJS + Supabase + Vanilla JS calendar app
> End point: rebranded "Eventli" with React frontend, Discovery feed, billing, PWA push, deployed
> Total timeline: 8 weeks part-time
> This document is meant to be read top to bottom. Don't skip phases.

---

## What you're building

**Eventli** — shared calendar + tasks for your groups, with a supplementary local events feed.

Three core values in order of importance:
1. **Group coordination** — calendar + tasks shared between family/friends/teams (your existing product)
2. **Social context** — see who's going, RSVP, activity feed (already mostly built)
3. **Event discovery** — local concerts, workshops, markets saveable into your calendar (new, supplementary)

Why the order matters: most users will sign up for #1, stay because of #2, and discover #3 as a delightful extra. Don't lead with discovery — lead with "shared calendar for your groups."

---

## Phase 0 — Audit and decide (1 day)

Before writing code, finalise these decisions. Write them down somewhere.

### 0.1 Naming
- App name: **Eventli** (already in Claude Design)
- Domain: register `eventli.app` or `eventli.io` if available, fallback `geteventli.com`
- Project folder: rename `CalendarTracking/` → `eventli/` locally

### 0.2 Pricing
Keep what's in your monetization plan:
- Free: 2 groups, 5 members/group, 30 events/month, save 5 discovery events/month
- Plus €5/month or €45/year: unlimited everything + iCal export + push notifications + recurring events

### 0.3 Stack decisions
- Backend: Express.js API-only (strip EJS)
- Frontend: React + Vite + Tailwind + shadcn/ui — **using Eventli's design system from Claude Design**
- Database: Supabase (existing)
- Payments: Paddle (EU VAT handled automatically)
- Discovery sync: Vercel Cron Jobs OR a simple `setInterval` on your existing server
- Deploy: Vercel for React, Render for Express, Supabase for DB

### 0.4 Discovery scope for MVP
Only two sources:
- Eventbrite API (workshops, community, free events)
- Ticketmaster API (concerts, sports)
Filter to Brussels metro area + add user-selectable city later.
Skip: Meetup (deprecated for new apps), Facebook Events (deprecated for non-page admins).

---

## Phase 1 — Security hardening on existing stack (Week 1, 1 weekend)

Don't migrate frontend yet. Fix the existing code first so the foundation is solid.

### 1.1 Install packages
```bash
npm install helmet express-rate-limit
```

### 1.2 Add to `app.js` (before all routes)
```js
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

app.use(helmet())

// HTTPS redirect in production
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`)
  }
  next()
})

// Narrow CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.APP_URL
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}))
```

### 1.3 Rate-limit auth routes in `routes/auth.js`
```js
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 })
router.post('/login', authLimiter, ...)
router.post('/register', authLimiter, ...)
```

### 1.4 Fix all 4 cookies in `routes/auth.js`
Add `secure: process.env.NODE_ENV === 'production'` to every `res.cookie()` call.

### 1.5 Database migration
```sql
ALTER TABLE events ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
```

### 1.6 Fix `routes/events.js`
- Add `created_by: req.cookies.userId` to every INSERT
- Add ownership check before DELETE — verify `event.created_by === req.cookies.userId`

### 1.7 Fix `routes/groups.js`
Add admin check to `/inviteUsers`:
```js
const { data: membership } = await supabase.from('profiles_groups')
  .select('role').eq('groups_id', groupId).eq('user_id', req.cookies.userId).single()
if (membership.role !== 'admin') {
  return res.status(403).json({ success: false, error: 'Admin only' })
}
```

### 1.8 Fix `routes/email.js`
- Replace every `list_title` with `task_list_title` (column name bug)
- Delete the entire `/send-digest/:userId` HTTP route — scheduler calls the function directly

### 1.9 Verify
```bash
node app.js
# Test login, create event, delete someone else's event (should fail),
# invite as non-admin (should fail)
```

✅ **Phase 1 complete when:** All P0 security bugs fixed, existing app still works end-to-end.

---

## Phase 2 — Convert Express to JSON API only (Week 1, 2-3 days)

The EJS views stay on disk as reference. They just stop being served.

### 2.1 Strip EJS rendering
For every route that uses `res.render('view.ejs', { data })`, replace with:
```js
res.json({ success: true, data })
```
The data shape is identical — just the format changes.

### 2.2 Prefix all routes with `/api`
In `app.js`:
```js
app.use('/api', authRouter)
app.use('/api', eventsRouter)
app.use('/api', groupsRouter)
app.use('/api', todoRouter)
app.use('/api', emailRouter)
```

Update route paths in each router file. So `router.post('/login')` becomes `router.post('/login')` but mounted at `/api/login`.

### 2.3 Change auth failures from redirect to 401
In `utils/utils.js` `authRequire`:
```js
// OLD: return res.redirect('/login')
// NEW: return res.status(401).json({ success: false, error: 'Unauthorized' })
```
React will handle the redirect on receiving 401.

### 2.4 Remove static file serving from Express
Delete or comment out `app.use(express.static('public'))`. React will serve its own static files.

Keep the `views/`, `public/css/`, `public/js/` folders on disk for now as reference — delete them after Phase 4 is complete and verified.

### 2.5 Add production catch-all for React
At the bottom of `app.js`, after all API routes:
```js
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/dist')))
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/dist/index.html'))
  })
}
```

### 2.6 Verify
```bash
node app.js
curl http://localhost:3000/api/groups -H "Cookie: authCookie=..."
# Should return JSON, not HTML
```

✅ **Phase 2 complete when:** Every route returns JSON, no EJS rendering happens, server runs cleanly.

---

## Phase 3 — Scaffold the Eventli React frontend (Week 2, 2-3 days)

### 3.1 Create the client folder
```bash
mkdir client && cd client
npm create vite@latest . -- --template react-ts
npm install
```

### 3.2 Install everything
```bash
# Core
npm install axios react-router-dom zustand
npm install date-fns

# Styling
npm install -D tailwindcss @tailwindcss/vite
npm install lucide-react
npm install @fontsource/inter

# Calendar
npm install @fullcalendar/react @fullcalendar/core
npm install @fullcalendar/daygrid @fullcalendar/timegrid
npm install @fullcalendar/interaction @fullcalendar/list

# shadcn (init only — install components as needed)
npx shadcn@latest init
# When prompted: TypeScript yes, Default style, Zinc base, CSS variables yes
```

### 3.3 Configure Vite for the Express proxy
`client/vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
```

### 3.4 Port the Eventli design system
Copy `styles.css` from the Claude Design zip into `client/src/index.css`. The CSS variables (`--accent`, `--bg`, `--surface`, `--text-1`, etc.) become your design tokens.

Add to top of `index.css`:
```css
@import '@fontsource/inter/400.css';
@import '@fontsource/inter/500.css';
@import '@fontsource/inter/600.css';
@import '@fontsource/inter/700.css';
@import '@fontsource/inter/800.css';
@import 'tailwindcss';
```

### 3.5 Set up the folder structure
```
client/src/
  api/
    auth.ts
    events.ts
    groups.ts
    todo.ts
    discovery.ts
    billing.ts
  components/
    layout/
      AppShell.tsx
      Sidebar.tsx
      BottomNav.tsx
      MobileTopBar.tsx
      UpNext.tsx
    primitives/
      Avatar.tsx
      AvatarStack.tsx
      Icon.tsx
      IconButton.tsx
      Logo.tsx
    calendar/
      CalendarView.tsx
      EventChip.tsx
      EventModal.tsx
    groups/
      GroupCard.tsx
      GroupDetail.tsx
      MemberList.tsx
      ActivityFeed.tsx
      TaskList.tsx
    discovery/
      DiscoveryFeed.tsx
      EventCard.tsx
      SocialLine.tsx
    shared/
      UpgradeModal.tsx
      UpgradeBanner.tsx
      EmptyState.tsx
      Toast.tsx
    ui/                  # shadcn components live here
  hooks/
    useAuth.ts
    useGroups.ts
    useEvents.ts
    useTodos.ts
    useDiscovery.ts
    useTier.ts
  lib/
    axios.ts
    utils.ts
  pages/
    Login.tsx
    Register.tsx
    Discovery.tsx
    Calendar.tsx
    Groups.tsx
    GroupDetail.tsx
    Profile.tsx
    Pricing.tsx
  store/
    appStore.ts          # Zustand: view, modal, toast
  types/
    index.ts
  App.tsx
  main.tsx
```

### 3.6 Set up axios with credentials
`client/src/lib/axios.ts`:
```ts
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

api.interceptors.response.use(
  res => {
    // Global upgrade modal trigger
    if (res.data?.upgradeRequired) {
      window.dispatchEvent(new CustomEvent('upgrade-required', { detail: res.data }))
    }
    return res
  },
  err => {
    if (err.response?.status === 401) {
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
```

### 3.7 Set up React Router with the Eventli nav structure
The 4-tab nav from Claude Design: Discover, Calendar, Groups, Profile.

```tsx
// client/src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppShell from './components/layout/AppShell'
// ... imports

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/" element={<Protected><AppShell /></Protected>}>
          <Route index element={<Navigate to="/calendar" />} />
          <Route path="discover" element={<Discovery />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="groups" element={<Groups />} />
          <Route path="groups/:groupId" element={<GroupDetail />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
```

Default route is `/calendar`, not `/discover` — because **calendar is your core product**, discovery is supplementary. This is the one place where you diverge from the Claude Design default.

### 3.8 Verify
Two terminals:
```bash
# Terminal 1
node app.js  # Express on :3000

# Terminal 2
cd client && npm run dev  # Vite on :5173
```
Open localhost:5173, login flows through to Express. Confirm no CORS errors.

✅ **Phase 3 complete when:** Scaffolded React app loads, Express API responds, Vite proxy works, design tokens applied.

---

## Phase 4 — Port the Eventli UI page by page (Week 2-3, 5-7 days)

Port one page at a time. Don't try to port everything at once. Get each one working end-to-end against real Express API data before moving on.

### 4.1 Login + Register (half day)
- Centered card, dark Eventli theme
- shadcn Input + Button + Label
- On success: navigate to `/calendar`
- On 401: show inline error, don't redirect

### 4.2 AppShell layout (1 day)
Port from `shell.jsx`:
- Desktop: 230px left sidebar with logo, nav, UpNext mini-card, user avatar
- Mobile: bottom nav bar + top bar
- Responsive switch at 1024px breakpoint

Use the `NAV` array from shell.jsx as-is, but with React Router `Link` instead of `onClick`.

### 4.3 Calendar page (1.5 days)
Port from `calendar.jsx`:
- FullCalendar React month view
- Group filter sidebar (calendars list with color dots, toggle visibility)
- EventChip component: solid for group events, **dashed border for discovery events**
- Click event → open EventModal with details + RSVP
- Drag to reschedule (already in your existing logic)
- "+ New event" button → opens create modal
- Free tier: block at 30 events/month, show UpgradeModal

This is the most important page. Spend time on it. It's the core product.

### 4.4 Groups page (1 day)
Port from `groups.jsx`:
- Grid of group cards (color stripe, name, member count, event count, task progress)
- Click group → navigate to `/groups/:groupId` (GroupDetail page)
- "+ New group" button → block at 2 groups for free tier
- Each card shows recent activity preview

### 4.5 GroupDetail page (1 day)
Three tabs: Events | Tasks | Members
- Events tab: list view of upcoming events for this group, RSVP inline
- Tasks tab: TaskList component — checkbox tasks, assigned avatar, due date
- Members tab: member list with role badges, invite button (admin only)
- Right rail: ActivityFeed for this group
- Header: group name, color, settings dropdown (admin only)

### 4.6 Profile page (half day)
- Avatar + name + email
- Plan card: Free with upgrade button, or Plus with manage subscription
- Notification preferences: email digest toggle, push notifications toggle
- Danger zone: delete account

### 4.7 Pricing page (half day)
- Two columns: Free vs Plus
- Feature comparison with check/cross icons
- Monthly/Annual toggle (€5/mo or €45/yr — show "Save 25%" badge)
- "Start free" + "Upgrade to Plus" CTAs
- Accessible at `/pricing` without auth

### 4.8 Discovery page (placeholder for now)
Just create the page with an empty state: *"Discovery feed coming soon — we're connecting local event sources."*
Real implementation comes in Phase 6.

### 4.9 UpgradeModal (half day)
Global modal listening to the `upgrade-required` event from axios interceptor.
Shows: the limit you hit, what Plus unlocks, link to /pricing.

✅ **Phase 4 complete when:** All pages render with real data, navigation works, all CRUD operations work, free tier limits are visible (gating comes Phase 5).

---

## Phase 5 — Paddle billing + tier enforcement (Week 4, 5 days)

### 5.1 Database migration
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS paddle_customer_id TEXT;

CREATE TABLE IF NOT EXISTS subscriptions (
  subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paddle_subscription_id TEXT UNIQUE,
  paddle_price_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.2 Tier middleware
In `utils/utils.js`:
```js
export async function attachTier(req, res, next) {
  const { data: profile } = await supabase
    .from('profiles').select('tier').eq('user_id', req.cookies.userId).single()
  req.userTier = profile?.tier ?? 'free'
  next()
}

export function requirePlusTier(req, res, next) {
  if (req.userTier !== 'plus') {
    return res.status(402).json({ success: false, upgradeRequired: true, reason: 'plus_only' })
  }
  next()
}
```

Wire `attachTier` to run after every `authRequire`.

### 5.3 Gate the free tier limits
In each relevant route:

**`POST /api/createGroup`** — block if user already in 2 groups
**`POST /api/inviteUsers`** — block if group already has 5 members
**`POST /api/parseEvent`** — block if user created 30 events this calendar month
**`POST /api/discovery/save`** — block if user saved 5 discovery events this month

All return `{ success: false, upgradeRequired: true, reason: 'group_limit' | 'member_limit' | 'event_limit' | 'discovery_limit' }`

### 5.4 Set up Paddle
- Create Paddle account at paddle.com
- Verify your business details (Paddle is Merchant of Record — they need this)
- Create product: "Eventli Plus"
- Create two prices: €5.00/month and €45.00/year
- Note both Price IDs for env vars
- Enable webhook endpoint URL (you'll add this URL in 5.5)

### 5.5 Create `routes/billing.js`
```js
import { Router } from 'express'
import express from 'express'
import authRequire, { attachTier } from '../utils/utils.js'
import supabase from '../db/supabase.js'
import crypto from 'crypto'

const router = Router()

router.get('/billing/status', authRequire, attachTier, async (req, res) => {
  const { data: subscription } = await supabase.from('subscriptions')
    .select('*').eq('user_id', req.cookies.userId)
    .eq('status', 'active').maybeSingle()
  res.json({ success: true, tier: req.userTier, subscription })
})

// Paddle webhook — must use raw body for signature verification
router.post('/billing/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  const signature = req.headers['paddle-signature']
  // Verify signature using PADDLE_WEBHOOK_SECRET
  // Parse event, handle subscription.created/updated/cancelled
  // Update profiles.tier and subscriptions table accordingly
  res.json({ received: true })
})

export default router
```

Mount in `app.js`: `app.use('/api', billingRouter)`

### 5.6 Frontend Paddle integration
Add Paddle.js to `client/index.html`:
```html
<script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>
```

In Pricing.tsx:
```tsx
declare const Paddle: any

function startCheckout(priceId: string) {
  Paddle.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customer: { email: user.email },
    successUrl: `${window.location.origin}/profile?upgraded=true`,
  })
}
```

### 5.7 Test in Paddle sandbox
- Test card: 4000 0000 0000 0002 (Paddle test card)
- Complete checkout → webhook fires → tier = 'plus' in DB
- Refresh app — Plus features unlocked

✅ **Phase 5 complete when:** Free user hits limits and sees UpgradeModal. Paddle sandbox checkout activates Plus tier via webhook. Plus user has no limits.

---

## Phase 6 — Discovery feed with external APIs (Week 5, 5 days)

This is where the "supplementary" event discovery comes in. Read-only, cached, low-cost.

### 6.1 Database schema for discovery
```sql
CREATE TABLE IF NOT EXISTS discovery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL,             -- Eventbrite/Ticketmaster ID
  source TEXT NOT NULL,                  -- 'eventbrite' | 'ticketmaster'
  category TEXT,                         -- 'music' | 'sports' | 'workshop' | 'food' | 'art' | 'market'
  title TEXT NOT NULL,
  description TEXT,
  venue_name TEXT,
  venue_area TEXT,                       -- 'Centre', 'Saint-Gilles', etc
  city TEXT NOT NULL DEFAULT 'Brussels',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  price_min NUMERIC(10,2),
  price_currency TEXT DEFAULT 'EUR',
  is_free BOOLEAN DEFAULT FALSE,
  image_url TEXT,
  external_url TEXT NOT NULL,
  tags TEXT[],
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source, external_id)
);

CREATE INDEX idx_discovery_start_at ON discovery_events(start_at);
CREATE INDEX idx_discovery_category ON discovery_events(category);

CREATE TABLE IF NOT EXISTS discovery_saves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  discovery_event_id UUID NOT NULL REFERENCES discovery_events(id) ON DELETE CASCADE,
  saved_to_group_id UUID,                -- null = saved to personal calendar
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, discovery_event_id)
);
```

### 6.2 Sign up for APIs
- **Eventbrite**: developer.eventbrite.com — create app, get OAuth token (free tier: 1000 req/hr)
- **Ticketmaster**: developer.ticketmaster.com — register app, get API key (free tier: 5000 req/day)

Add to `.env`:
```
EVENTBRITE_TOKEN=
TICKETMASTER_API_KEY=
```

### 6.3 Create sync service
`services/discoverySync.js`:
```js
import supabase from '../db/supabase.js'

async function syncEventbrite() {
  const url = `https://www.eventbriteapi.com/v3/events/search/?location.address=Brussels&location.within=20km&token=${process.env.EVENTBRITE_TOKEN}`
  const res = await fetch(url)
  const data = await res.json()

  const rows = data.events.map(ev => ({
    external_id: ev.id,
    source: 'eventbrite',
    category: mapEventbriteCategory(ev.category_id),
    title: ev.name.text,
    description: ev.description?.text?.substring(0, 500),
    venue_name: ev.venue?.name,
    venue_area: ev.venue?.address?.locality,
    city: 'Brussels',
    start_at: ev.start.utc,
    end_at: ev.end?.utc,
    price_min: ev.is_free ? 0 : null,
    is_free: ev.is_free,
    image_url: ev.logo?.url,
    external_url: ev.url,
  }))

  await supabase.from('discovery_events').upsert(rows, { onConflict: 'source,external_id' })
}

async function syncTicketmaster() {
  const url = `https://app.ticketmaster.com/discovery/v2/events.json?countryCode=BE&city=Brussels&apikey=${process.env.TICKETMASTER_API_KEY}&size=50`
  const res = await fetch(url)
  const data = await res.json()

  const rows = (data._embedded?.events || []).map(ev => ({
    external_id: ev.id,
    source: 'ticketmaster',
    category: mapTicketmasterCategory(ev.classifications?.[0]?.segment?.name),
    title: ev.name,
    description: ev.info?.substring(0, 500),
    venue_name: ev._embedded?.venues?.[0]?.name,
    venue_area: ev._embedded?.venues?.[0]?.city?.name,
    city: 'Brussels',
    start_at: ev.dates.start.dateTime,
    price_min: ev.priceRanges?.[0]?.min,
    image_url: ev.images?.[0]?.url,
    external_url: ev.url,
  }))

  await supabase.from('discovery_events').upsert(rows, { onConflict: 'source,external_id' })
}

export async function syncAllSources() {
  try { await syncEventbrite() } catch (e) { console.error('Eventbrite sync failed:', e) }
  try { await syncTicketmaster() } catch (e) { console.error('Ticketmaster sync failed:', e) }
  console.log('Discovery sync complete at', new Date().toISOString())
}
```

### 6.4 Schedule the sync
Two options:

**Option A — Vercel Cron** (if you deploy frontend to Vercel and add an API route):
Create `client/api/cron/sync-discovery.ts`:
```ts
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  await fetch(`${process.env.APP_URL}/api/discovery/admin-sync`, {
    headers: { 'x-admin-secret': process.env.ADMIN_SECRET }
  })
  return Response.json({ ok: true })
}
```
Add to `client/vercel.json`:
```json
{ "crons": [{ "path": "/api/cron/sync-discovery", "schedule": "0 */6 * * *" }] }
```

**Option B — Existing scheduler** (simpler — just extend `utils/scheduler.js`):
```js
import cron from 'node-cron'
import { syncAllSources } from '../services/discoverySync.js'

// Every 6 hours
cron.schedule('0 */6 * * *', syncAllSources)
```

Pick whichever fits your deploy setup.

### 6.5 Discovery API routes
`routes/discovery.js`:
```js
router.get('/discovery', authRequire, attachTier, async (req, res) => {
  const { category, when } = req.query
  let q = supabase.from('discovery_events').select('*').gte('start_at', new Date().toISOString())
  if (category && category !== 'all') q = q.eq('category', category)
  if (when === 'today') q = q.lte('start_at', new Date(Date.now() + 24*60*60*1000).toISOString())
  if (when === 'weekend') /* ... */
  const { data } = await q.order('start_at').limit(40)
  res.json({ success: true, data })
})

router.post('/discovery/save', authRequire, attachTier, async (req, res) => {
  const { discoveryEventId, groupId } = req.body

  // Free tier limit: 5 saves per month
  if (req.userTier === 'free') {
    const { count } = await supabase.from('discovery_saves')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.cookies.userId)
      .gte('created_at', startOfMonth())
    if (count >= 5) {
      return res.status(402).json({ success: false, upgradeRequired: true, reason: 'discovery_limit' })
    }
  }

  await supabase.from('discovery_saves').insert({
    user_id: req.cookies.userId,
    discovery_event_id: discoveryEventId,
    saved_to_group_id: groupId || null,
  })

  // Also create a calendar event from this save (kind='discovery')
  // ... insert into events table with kind='discovery' and link to discoveryEventId
  res.json({ success: true })
})
```

### 6.6 Build the Discovery page
Port the design from `discovery.jsx`:
- Filter chips at top (All, Today, This Weekend, Music, Sports, Food, Free)
- Grid layout (or list on mobile)
- EventCard: image placeholder, title, venue, date/time, price, "Save" button
- SocialLine: "Amir & Noor are going" — query saves from user's group members
- Click card → open EventModal with full details, RSVP, link to external page

### 6.7 Calendar integration for saved events
Discovery saves create a calendar event with `kind: 'discovery'`.
In CalendarView, render these chips with **dashed borders** instead of solid (the design already supports this).

### 6.8 Verify
- Trigger manual sync: open Supabase, check `discovery_events` table has rows
- Open Discovery page — see real Brussels events
- Save one → check it appears in Calendar with dashed border
- Free user — save 5, try the 6th → UpgradeModal appears

✅ **Phase 6 complete when:** Discovery feed shows real events, saves flow into calendar, free tier discovery limit enforced.

---

## Phase 7 — PWA push notifications + iCal export (Week 6, 4 days)

### 7.1 First Plus-only feature: iCal export
```bash
npm install ical-generator
```

`routes/export.js`:
```js
router.get('/export/ical', authRequire, attachTier, requirePlusTier, async (req, res) => {
  const events = await retrieveEvents(req.cookies.userId)
  const cal = ical({ name: 'Eventli' })
  events.forEach(event => {
    cal.createEvent({
      start: new Date(`${event.start_date}T${event.start_time || '00:00:00'}`),
      end: new Date(`${event.end_date}T${event.end_time || '23:59:59'}`),
      summary: event.event_title,
      description: event.event_description,
      allDay: event.all_day,
    })
  })
  res.set('Content-Type', 'text/calendar')
  res.set('Content-Disposition', 'attachment; filename="eventli.ics"')
  res.send(cal.toString())
})
```

Add "Export to Apple/Google Calendar" button on Calendar page — Plus users get download, free users get UpgradeModal.

### 7.2 Update PWA manifest
`client/public/manifest.json`:
```json
{
  "name": "Eventli",
  "short_name": "Eventli",
  "description": "Shared calendar and tasks for your groups",
  "theme_color": "#7c6cf6",
  "background_color": "#0b0b12",
  "display": "standalone",
  "orientation": "portrait",
  "start_url": "/calendar",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Design icons in Figma — 512x512 PNG with the Eventli purple square logo on dark background. Use a maskable safe zone.

### 7.3 Push notifications
```bash
npm install web-push
npx web-push generate-vapid-keys
```

Save keys to `.env`:
```
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_CONTACT_EMAIL=
```

Database:
```sql
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Client: request permission, subscribe to push service worker, send subscription to `POST /api/push/subscribe`.

Trigger push notifications from `utils/scheduler.js` — extend the existing daily digest cron to also send push for upcoming events 30 min before.

### 7.4 Service worker updates
`client/public/sw.js` — handle push events:
```js
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'Eventli', {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge.png',
      data: { url: data.url || '/calendar' }
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.openWindow(event.notification.data.url))
})
```

### 7.5 Verify
- Install Eventli as PWA on Android Chrome — icon appears on home screen
- Grant push permission in settings
- Trigger test notification from admin panel — receive on device
- Export iCal — Plus user downloads file, opens in Apple Calendar, events appear

✅ **Phase 7 complete when:** PWA installs cleanly, push notifications fire, iCal export downloads valid file.

---

## Phase 8 — Polish, empty states, launch prep (Week 7, 4 days)

### 8.1 Empty states everywhere
Every page that can have no data needs proper empty state:
- Calendar with no events: "No events yet — create your first or invite a group to share theirs"
- Groups page with 0 groups: illustration + "Create your first group to start sharing"
- Tasks tab with 0 tasks: "No tasks yet — add one for this group"
- Discovery with no nearby events: "We're working on adding more sources in your area"

### 8.2 Loading states
Every API call should show a skeleton loader, not a blank screen.
Use shadcn Skeleton component.

### 8.3 Error boundaries
Wrap each page in an ErrorBoundary that catches React errors and shows a friendly retry screen instead of a white page of death.

### 8.4 Onboarding flow
New user first login → onboarding wizard:
1. "Welcome to Eventli — let's set you up"
2. Create your first group (name, type: Family/Friends/Team)
3. Invite a member (or skip)
4. Add your first event (or skip)
5. Done → land on Calendar

Track completion in `profiles.onboarding_completed` boolean.

### 8.5 Email templates
Polish the existing Resend email digest template. Add:
- Welcome email on registration
- Plus upgrade confirmation
- Weekly digest improvements (cleaner layout, group activity preview)

### 8.6 Analytics
Add Plausible or PostHog (privacy-friendly, EU-hosted):
```bash
npm install posthog-js
```
Track: page views, signup, group_created, event_created, discovery_saved, upgrade_clicked, checkout_completed.

### 8.7 Production environment variables
Document everything in a `.env.example`:
```
# Required
SUPABASE_URL=
SUPABASE_KEY=
APP_URL=https://eventli.app
NODE_ENV=production

# Auth
SESSION_SECRET=

# Email
RESEND_API_KEY=

# Payments
PADDLE_VENDOR_ID=
PADDLE_PUBLIC_KEY=
PADDLE_WEBHOOK_SECRET=
PADDLE_PRICE_MONTHLY=
PADDLE_PRICE_ANNUAL=

# Discovery
EVENTBRITE_TOKEN=
TICKETMASTER_API_KEY=

# Push
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_CONTACT_EMAIL=

# Cron
CRON_SECRET=
ADMIN_SECRET=
```

### 8.8 Deploy
- **Frontend (Vercel):** Connect GitHub repo, set env vars, point to `client/` directory, deploy
- **Backend (Render):** Connect GitHub repo, set start command `node app.js`, set env vars
- **Database:** Already on Supabase production
- Configure custom domain on both
- Set up Paddle webhook URL: `https://api.eventli.app/api/billing/webhook`
- Set Supabase email redirect URLs to include production domain

### 8.9 Pre-launch checklist
- [ ] All pages render without console errors
- [ ] Full user journey works: register → create group → invite → create event → upgrade → Paddle checkout → return as Plus
- [ ] iCal export works
- [ ] Push notifications fire on Android
- [ ] PWA installs from Chrome menu
- [ ] Discovery feed shows ~30+ events for Brussels
- [ ] Free tier limits properly blocked
- [ ] All routes return JSON, never HTML
- [ ] Mobile layout works at 375px width
- [ ] Dark mode + light mode both look polished

✅ **Phase 8 complete when:** App is live at your domain, fully working, ready for first users.

---

## Phase 9 — First 10 users (Week 8 onwards)

This is the hardest phase. The build is done. Now you need users.

### Where to find first users
- **Personal network first** — friends, family who'd actually use a shared calendar. Free Plus for life if they give honest feedback.
- **Reddit**: r/SideProject, r/ProductHunt, r/SaaS — share your launch with the "I built this for X" angle
- **Indie Hackers**: post in the launches section
- **Twitter/X**: build in public, share progress screenshots
- **Product Hunt launch**: aim for Tuesday/Wednesday for best visibility — prepare assets a week in advance

### What to track
First 30 days, watch only:
- Signups per day
- Day-1 retention (% of signups who return next day)
- Free → Plus conversion rate (target: 3-5%)
- Top complaint in support emails

Don't track vanity metrics. These four tell you everything.

### When to know you're winning
- 100 signups → 50 active users → 3-5 paying = product-market fit signal
- Less than 30% day-1 retention = product needs work
- Less than 1% Plus conversion = pricing or feature gating needs work

---

## Quick reference — total file changes

### Existing files modified
- `app.js` — security, JSON-only, /api prefix, catch-all
- `routes/auth.js` — rate limit, secure cookies
- `routes/events.js` — ownership check, created_by, tier gating
- `routes/groups.js` — admin check, tier gating
- `routes/email.js` — column name fix, remove public route
- `routes/todo.js` — JSON only
- `utils/utils.js` — add attachTier, requirePlusTier
- `utils/scheduler.js` — column name fix, push notifications

### New files
- `routes/billing.js`
- `routes/discovery.js`
- `routes/export.js`
- `routes/push.js`
- `services/discoverySync.js`
- Entire `client/` folder (React app)

### New tables
- `subscriptions`
- `discovery_events`
- `discovery_saves`
- `push_subscriptions`

### Files to delete after Phase 4 verified
- All `views/*.ejs`
- `public/js/calendar.js`
- `public/js/groups.js`
- `public/js/todo.js`
- `public/js/navbar.js`
- `public/css/*` (except keep manifest icons in `public/icons/`)

---

## Timeline summary

| Week | Phase | Outcome |
|---|---|---|
| 1 | Phase 1 + 2 | Security fixed, Express is API-only |
| 2 | Phase 3 + 4 (start) | React scaffolded, first pages ported |
| 3 | Phase 4 (finish) | All pages ported, app fully functional |
| 4 | Phase 5 | Paddle billing live, tier gating working |
| 5 | Phase 6 | Discovery feed live with real Brussels events |
| 6 | Phase 7 | PWA push + iCal export |
| 7 | Phase 8 | Polish, deploy to production |
| 8+ | Phase 9 | First users, iterate based on feedback |

---

## Honest reality check

**What this plan does well:**
- Builds on what you already have, no rewrites
- Phases are independently shippable — you can stop at any phase and still have a working product
- Keeps your core product (group calendar + tasks) at the centre
- Discovery is additive, not foundational
- EU-friendly billing via Paddle

**Where you'll get stuck:**
- Phase 4 will take longer than you think — porting EJS to React always does
- Phase 6 Eventbrite/Ticketmaster APIs have edge cases (timezones, categories, missing fields) that need patient handling
- Phase 7 push notifications on iOS Safari are still flaky — Android Chrome works perfectly, iOS is hit or miss

**What to skip if you fall behind:**
- Skip Phase 6 entirely and ship without Discovery — you still have a great product
- Skip Phase 7 push notifications — iCal export alone is enough for first Plus feature
- Skip Phase 8 onboarding wizard — just have good empty states

**What you cannot skip:**
- Phase 1 security fixes — non-negotiable before taking money
- Phase 5 billing — no revenue without it
- Phase 8 deploy — obviously

---

*This plan assumes ~10-15 hours per week of focused work. Adjust phase durations if you have more or less time.*
*Stack: Express.js API + React 18 + Vite + Tailwind + shadcn/ui + Supabase + Paddle + Vercel + Render*