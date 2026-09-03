# Scherz Trucking INC App

This is the real, running version of the platform: dynamic landing pages served
from your Postgres database, and a lead capture API wired to the tenant +
marketplace routing logic. It replaces the static HTML mockups with an actual
Next.js app you can deploy.

## What's here

- `app/[service]/[state]/[city]/page.js` — renders a landing page by querying
  the `pages` table. Cached after first visit (ISR), rebuilt at most hourly.
- `app/api/leads/route.js` — the endpoint every quote form submits to. Calls
  the routing logic, then inserts the lead with the correct `routing_mode`.
- `lib/routing.js` — the tenant-cap / marketplace-overflow decision logic,
  matching the model in `schema.sql`.
- `components/QuoteForm.js` — the actual form component used on every page.
- `seed.sql` — inserts the three service categories. Run once after `schema.sql`.

## Setup

1. **Get a Postgres database.** Supabase or Neon both have a free tier that's
   enough to start (see the earlier cost breakdown — this is the ~$0/month
   starting point, ~$25/month once you outgrow the free tier).
2. Run `schema.sql` (from the earlier deliverable) against that database, then
   run `seed.sql` from this project.
3. Import your city/state data and generate `pages` rows — the
   `manifest.csv` inside `500-landing-pages.zip` has the city/state/service
   mapping you need; you'll still need a `states`/`cities` import first since
   the schema references them by ID, not by name.
4. Copy `.env.example` to `.env.local` and set `DATABASE_URL` to your database's
   connection string.
5. Install and run locally:
   ```
   npm install
   npm run dev
   ```
   Then visit `http://localhost:3000/car-shipping/tx/houston` (adjust to a
   city/state/service you've actually loaded).

## Deploying live

1. Push this project to a GitHub repo.
2. Connect that repo to Vercel (Pro plan, ~$20/month — required once this is
   commercial).
3. Add `DATABASE_URL` under Vercel's Environment Variables — same value as
   your `.env.local`.
4. Point your domain at the Vercel project once you've bought it.

## Installing the admin dashboard as an app on your phone

`/admin` is set up as a PWA (installable web app) — once this is deployed to
a real HTTPS domain:

1. Open `yourdomain.com/admin` in your phone's browser.
2. Chrome (Android): tap the menu → "Add to Home Screen" / "Install app".
   Safari (iOS): tap Share → "Add to Home Screen".
3. It now opens like an app, with its own icon, straight to the dashboard.

**This only works after real deployment.** Opening this project locally or
as a raw file won't trigger the install prompt — browsers require HTTPS for
service workers, which is part of what makes an app installable. This is the
same Vercel deployment step covered above; once that's done, this comes free.

**Security note:** `/admin` currently uses a hardcoded demo passcode
(`shipgrid2026`) as a placeholder gate, not real authentication. Anyone who
finds the URL and reads the page source can see the passcode. Replace this
with a real auth provider (Supabase Auth, Clerk, NextAuth) before any real
tenant or lead data lives behind this route — a deployed URL is publicly
reachable in a way a local demo file never was.

## What's intentionally not built yet

- **Authentication** on any admin routes — none of these routes are
  admin-facing yet, but if you add any, they need real auth (Supabase Auth,
  Clerk, NextAuth), not the passcode-gate style used in the admin-portal demo.
- **The AI action queue itself** — this app writes leads with a routing_mode,
  but nothing here yet generates the AI proposals (publish/pause pages, route
  overflow, draft follow-ups) we mocked up in the dashboard. That's a
  scheduled job or webhook calling the Claude API, which is the natural next
  build after this one.
- **Duplicate-content QA scoring** for generated pages — the
  `duplicate_risk_score` column exists in the schema but nothing populates it
  yet.
