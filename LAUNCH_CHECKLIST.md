# Manual Launch Checklist (non-code steps)

Things that must be done by hand before accepting the first paid subscriber.
Code-side GDPR work (delete account, data export, privacy page, Sentry) is tracked in ROADMAP.md.

## Legal / GDPR

- [ ] **Sign the Supabase DPA** — https://supabase.com/legal/dpa (~5 min, required under GDPR Art. 28 since Supabase processes user data on your behalf)
- [ ] **Sign the Resend DPA** — https://resend.com/legal (needed because the daily digest emails go through Resend)
- [ ] **Create a privacy contact email** (e.g. `privacy@eventli.app` or a dedicated Gmail alias) and put the real address into `client/src/pages/PrivacyPage.tsx` (search for `PRIVACY_EMAIL`)
- [ ] **Fill in controller identity** in the privacy policy (full name + city, Belgium) — search for `CONTROLLER_NAME` in `PrivacyPage.tsx`
- [ ] **Translate the privacy policy to French + Dutch** (recommended for Belgian users; English-only is legally risky if complaints are filed with the GBA). Can wait until real launch, do before marketing in Belgium.
- [ ] **Write a one-page breach response note**: "If a breach occurs → notify the GBA within 72h via gegevensbeschermingsautoriteit.be/professioneel, document what happened, notify affected users if high risk." Keep it anywhere findable.
- [ ] **Start a Record of Processing Activities (ROPA)** — a simple spreadsheet: activity, purpose, legal basis, data categories, processors, retention. Required because processing is continuous, not occasional.
- [ ] **Terms of Service page** — minimum age 13 (Belgian digital consent age), governing law = Belgian law. (Not yet built; consider a generator like Termly/iubenda and adapt.)

## Sentry

- [ ] Confirm `SENTRY_DSN_KEY` is set in the **Render** environment (it's in local `.env` already)
- [ ] Add `VITE_SENTRY_DSN` to `client/.env` locally AND make sure the production build on Render gets it (Vite bakes it in at build time)
- [ ] After deploy: trigger a test error and confirm it shows up in the Sentry dashboard

## Database (Supabase dashboard)

- [x] `always_free = true` set for your own account (done 2026-06-12)
- [ ] Set `always_free = true` for your girlfriend's account once she registers:
      `UPDATE profiles SET always_free = true WHERE email = '<her email>';`

## Pre-launch sanity

- [ ] Real-world two-person test: register a second account on another phone → QR invite → join group → create event → RSVP → tentative event vote → habit share
- [ ] Verify Render cron jobs actually fire in production (digest 07:00, reminders, pact resolution 00:05, habit reminder 20:00) — check Sentry/logs the next morning
- [ ] Run Supabase Advisors (Dashboard → Advisors) and fix any RLS warnings
