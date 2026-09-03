# Scherz Trucking INC — Project Memory

## What this is
Multi-tenant logistics lead-gen SaaS. Programmatic landing pages (car shipping
for now; freight/container held back deliberately for cost reasons) by
city/state, lead capture, and routing to either tenants, marketplace, or
in-house depending on the model below.

## Rollout sequence — don't scope-creep past this
Launch as web portals first: the platform admin portal (`app/admin`) and,
later, a tenant portal (not built yet — see below). Native PC/Android/iPhone
apps only get built after first paying tenants are secured. Nothing today
should involve native app wrappers or app-store work — the web app already
works fine on any device via any browser in the meantime.

## Tech stack
- Next.js 14, App Router
- Postgres (Supabase), accessed via a `pg` Pool in `lib/db.js` — no ORM, raw
  parameterized SQL throughout
- Resend for email notifications (`lib/notify.js`) — optional, silently
  no-ops if `RESEND_API_KEY`/`NOTIFY_EMAIL` aren't set

## Commands
- `npm install`
- `npm run dev` — local dev server
- `npm run build` — must pass clean before every deploy

## File layout
- `app/[service]/[state]/[city]/page.js` — dynamic landing pages, ISR
  (revalidate hourly), reads the `pages` table
- `app/api/leads/route.js` — lead capture endpoint, calls `lib/routing.js`
- `lib/routing.js` — the routing engine (see "Two plan types" below)
- `app/admin/` — platform admin dashboard, PWA-installable
- `schema.sql`, `seed.sql`, `seed-data.sql` — run against Postgres in that
  exact order (schema first, then services, then the 500 real pages)
- `reference/tenant-dashboard-design.html` — static design reference for the
  tenant-facing dashboard (not yet a real route — see below)

## Two plan types — this is the core business model, don't blur them
- **blue_pill** tenants buy the software. They own their pages
  (`pages.tenant_id`). Every lead from their pages is unconditionally
  theirs — no cap, no cap-check in routing. Metered by `page_allowance`
  (how many pages they're allowed), not lead volume.
- **red_pill** tenants buy leads only. They own no pages. `lib/routing.js`
  actively assigns them leads from platform-owned pages, capped by
  `tenant_categories.leads_per_day` and `.lead_cap`.
- Capping a blue_pill tenant's own paid traffic, or letting a red_pill
  tenant own pages, breaks the pricing pitch for that plan. Keep the two
  paths structurally separate in any new code.

## Known placeholders — do not treat as production-ready
- ~~`app/admin` passcode gate~~ RESOLVED 2026-07-06: `app/admin` now uses real
  Supabase Auth (email + password; public signups disabled on the Supabase
  project; `ADMIN_EMAILS` allowlist enforced server-side by
  `/api/admin/stats`). Admin users are provisioned via the Supabase Auth
  admin API, not self-signup.
- ~~No tenant-facing dashboard~~ RESOLVED 2026-07-07: `/portal` implements
  both views from `reference/tenant-dashboard-design.html`, wired to real
  data (blue pill: pages/leads by city + ad self-service creating
  pending_launch rows only; red pill: daily counter + quota). Tenant login =
  Supabase Auth user whose email matches `tenants.contact_email`; tenant
  users are provisioned via the Supabase admin API.
- `pages.duplicate_risk_score` exists in the schema; nothing populates it yet.
- **Ad self-service (blue pill only)**: tenants can select which of their
  city pages to run ads on and pick an ad creative per city
  (`ad_campaigns`/`ad_creatives` tables). Selecting a city + creative + budget
  only ever creates a `draft`/`pending_launch` row — it must NEVER
  automatically spend money or hit a real ad platform. Actually launching a
  campaign requires a real Google Ads API integration (OAuth + a Google
  developer token, which needs Google's own approval process) that doesn't
  exist yet. Until that's built, `pending_launch` rows should surface in
  `ai_action_queue` for manual human review, same propose-then-approve
  pattern as everything else in this system. Red pill tenants don't get this
  feature at all -- they own no pages to advertise.

## Conventions
- Every DB-touching function should degrade gracefully (try/catch → sensible
  fallback) rather than hard-crash, since `DATABASE_URL` may not always be
  set — see `generateStaticParams` in the location page for the pattern.
- Keep `.env.example` current whenever a new env var is introduced.
