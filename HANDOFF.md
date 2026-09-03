# Scherz Trucking INC / RJ Solutionz — Engineering Handoff

_Last updated by the outgoing session, 2026-07-14._

## 1. What this is
- **RJ Solutionz** (scherztruckinginc.com) is a lead-generation software company. **Scherz Trucking INC**
  is its first product: a multi-tenant **auto-transport (car shipping) lead-gen + CRM**
  platform.
- The platform is white-label per tenant — no customer names are hardcoded
  anywhere in the product; each tenant's branding comes from their tenants row.
- **The real codebase is `C:\Users\123\Downloads\scherz-trucking-app`** — NOT the older
  `loadroute-app` folder, which is a stale earlier iteration. Do not work in loadroute-app.

## 2. Live surfaces (all on https://scherztruckinginc.com)
- `/` and `/car-shipping/<state>/<city>` — 500 SEO landing pages (car-shipping live;
  freight + container exist but are `status='paused'`).
- `/admin` — platform admin (Overview, AI Action Queue, Tenants, Leads, Marketplace,
  + Landing-pages publish/pause, + IndexNow "push all pages").
- `/portal` — tenant portal (blue-pill software / red-pill leads views; Agents tab).
- `/crm` — agent CRM (My Leads / Quotes / Orders, lead detail, quoting, booking, e-sign).
- `/book/<token>` — customer booking + e-signature page.
- `/agreement/<token>` — printable transport agreement + invoice.

## 3. Infrastructure (identifiers only — NO secrets in this file)
- **Hosting:** Vercel, project `prj_DaJr5hGr9YjkuRKDVsEhvPJSOtt6`, team `shipgrid`.
  Auto-deploys on push to `main`.
- **Repo:** GitHub `Shipgrid-Dotcom/scherz-trucking-app` (private).
- **DB:** Supabase project ref `nuzqdrqsaoscwpimxrmu` (Postgres 17), transaction pooler
  `aws-0-us-east-1.pooler.supabase.com:6543` (app) / `:5432` session mode (DDL/scripts).
  Raw `pg` Pool via `lib/db.js`, no ORM, parameterized SQL.
- **Email:** Resend. Domain `scherztruckinginc.com` registered but **still `pending`
  verification** (DNS records ARE live/correct — waiting on Resend's own re-check).
  Until verified, emails only deliver to the Resend account owner's address; sender is still
  `onboarding@resend.dev`. **When it flips to verified:** change the FROM in
  `lib/crmEmails.js` and `lib/notify.js` to something `@scherztruckinginc.com`, redeploy.
- **Auth:** Supabase Auth (email+password). Public signups disabled. Three login
  scopes share one Supabase project but SEPARATE browser storage keys
  (`sg-admin-auth`, `sg-portal-auth`, `sg-crm-auth`) so admin/tenant/agent can be
  signed in simultaneously — see `lib/supabaseBrowser.js`.

### Credentials — READ THIS
- All secrets live in `scherz-trucking-app/.env.local` (gitignored) and in Vercel env vars:
  `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `NOTIFY_EMAIL`, `ADMIN_EMAILS`,
  `NEXT_PUBLIC_SITE_URL`, `INDEXNOW_KEY`.
- The GitHub / Vercel / Supabase account tokens used this session were pasted into chat
  and are **overdue for rotation**. New engineer should generate his OWN tokens from
  each dashboard and the old ones should be revoked. Do not paste master keys into chat.
- Admin login: the email(s) in the ADMIN_EMAILS env var. **Rotate the admin
  password** as part of any handoff.

## 4. Environment / build notes (Windows dev machine)
- Node is at `C:\Program Files\nodejs` but NOT on PATH — prefix commands with it.
- `npm run build` must pass clean before every deploy. Deploy = commit + push to `main`.
- To run SQL/scripts against the DB, use a small node script requiring `./node_modules/pg`
  with `ssl:{rejectUnauthorized:false}` and the session-mode (:5432) connection string.
- There is NO local seed of test data in prod. **Prod DB holds REAL tenants and leads.**

## 5. Data model highlights (`schema.sql` is authoritative; DB has extra migrated cols)
- `tenants` (plan_type blue_pill/red_pill, agent_lead_cap/period, company_address, …)
- `tenant_categories` (page_allowance, leads_per_day, lead_cap, price_per_lead, …)
- `agents` (agent_type='tenant_internal' = a tenant's reps; each gets a Supabase login)
- `pages` (500 published car-shipping; freight/container paused)
- `leads` — the big one. Includes: contact, origin/destination city/state/zip,
  `vehicles` jsonb (year/make/model/inoperable/condition), pickup_date, total_tariff,
  carrier_pay, quoted_at, status, secondary_status, transport_type, quote_expiration,
  assigned_agent_id, agent_assigned_at, follow_up_date, sale_amount, closed_at,
  booking_token, origin_address/destination_address, signed_name/at/ip, contract_dirty,
  carrier_pay_terms, broker_fee_terms, reference_id, internal_memo, …
- `ad_campaigns`, `ad_creatives`, `ai_action_queue`, `lead_marketplace_offers`.

## 6. Lead / quote / order lifecycle (current)
`assigned → contacted → quoted → booked → closed` (+ `dead`). In the CRM:
- Status is a freely-editable dropdown while it's a **quote**; booking is the commit
  point → becomes an **order** (secondary_status "Searching For Carriers", editable).
- "quoted" auto-emails the customer their quote (via Resend).
- Booking link (`/book/<token>`): customer enters full addresses + e-signs → converts to
  booked order, records name/ip/time, stamps sale.
- **Change orders:** editing addresses/price/phone on a SIGNED order sets
  `contract_dirty=true` ("open contract"); the same booking link re-opens for re-sign.
- Leads auto-assign to reps round-robin (`lib/autoAssign.js`), cap-aware, with an email
  alert to the rep.

## 7. CURRENT STATE / WHERE WE ARE (updated 2026-07-16)
- **Deployed + verified on `main`: `2f6a07a`.** Phases 1, 4, and 5 are LIVE:
  activity_log + audit columns + soft delete (Phase 1), carriers/dispatch/
  payments/signature_history (Phase 4), comms_log/notifications/global agent
  search (Phase 5), plus vehicle inoperable-condition shown in the CRM worklist
  ("Condition" column) and the new-lead notification email.
- All three migrations (phase1_audit.sql / phase4_dispatch.sql /
  phase5_extras.sql) were applied to the live DB 2026-07-16 with the owner's
  explicit approval. schema.sql mirrors them.
- The "Hermes" parallel commits (f6e6050..7d06902) were reviewed line-by-line
  before deploy; commit `e6859e0` fixed 5 production-breaking bugs (block-scoped
  fn crash in CrmPortal order view, 3× missing `await isAdminRequest`, wrong
  column names in phase5 sql + /api/search) and 3 security holes (tenant
  directory leaked to agents via search; carriers table was cross-tenant — now
  per-tenant with ownership checks; agents could forge signature_history rows —
  the chain is now written only by the customer booking flow, initial vs
  change_order, with a contract snapshot).
- NOTE for Vercel: commits authored by unrecognized git users are BLOCKED
  (`COMMIT_AUTHOR_REQUIRED`) — always commit with the machine's configured git
  identity or a Vercel team member's.
- Admin password has been rotated; the owner has the current one.
- Phase 3 (tasks, notes tabs, documents, pricing history) is the next phase.
  Phase 5 shipped API-only: notifications bell / Cmd+K search / autosave UI do
  NOT exist yet — the routes and tables are live and producer-wired
  (auto-assign → notifications; quote emails → comms_log).

## 8. Roadmap (agreed order: 2 → 1 → 3 → 4 → 5)
- **Phase 2 — list views:** ✅ DONE (CRM sections/search/filter/sort/CSV).
- **Phase 1 — foundation (IN PROGRESS / NEXT):** audit columns
  (`created_by/updated_by/created_at/updated_at`), an `activity_log` table with an entry
  on every status/price/field change, and **soft delete** (`deleted_at`, filter
  `deleted_at IS NULL` in all lead reads). A Timeline panel in the lead detail.
  _(An `updated_at` auto-touch trigger on `leads` is a clean way to guarantee it.)_
- **Phase 3 — detail depth:** unlimited tasks (type/due/reminder/assignee/priority),
  notes tabs (internal/customer/pinned, rich text), document uploads
  (Supabase Storage; date/uploader/preview/download), pricing history.
- **Phase 4 — orders/dispatch:** carriers (MC/DOT/insurance/contact), dispatch fields,
  payments ledger, interested-carriers, signature history. (Partial parallel work exists
  in `lib/dispatch.js` + `app/api/crm/dispatch/` — review it.)
- **Phase 5 — extras:** email/SMS open/click tracking, notifications, global search,
  autosave drafts.

### Also queued (smaller asks from the customer, not yet built)
- Pickup/drop-off contact (name + phone) on orders, shown on agreement/dispatch.
- Agent "add a lead" (referral/outsourced customer) from the CRM.
- ZIP-code validator in the route section of the opened lead.
- Vehicle-edit block + broker-fee-received field (to show agent earnings) in the detail.
- Fuller BATS status set (VM, Do Not Text, Booking Link Sent, etc.).

## 9. Rules / cautions (important)
- **Treat prod data as real.** (The platform was factory-reset 2026-07-22 —
  zero tenants/agents/leads — but any data created after that belongs to a
  customer.) When testing flows, create a clearly-marked transient tenant,
  test, then delete it by ID. NEVER bulk-delete tenants/leads.
- Business rules baked into the product: no personal belongings on shipments to/from
  **Hawaii or Puerto Rico**; up to **150 lbs below the window line** elsewhere; **Alaska**
  allowed for a fee. No insurance coverage to/from HI/AK/PR.
- Keep `schema.sql` and `.env.example` updated when adding columns/env vars.
- SEO: Houston page is indexed; sitemap valid (apostrophes URL-encoded); IndexNow pushes
  all 500 to Bing/Yandex from the admin Overview button. Google indexing = sitemap + time;
  there is NO bulk instant-index for Google.
