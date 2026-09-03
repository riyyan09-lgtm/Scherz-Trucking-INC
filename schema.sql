-- ============================================================
-- Logistics Lead Generation Platform — Core Database Schema
-- PostgreSQL
-- ============================================================

-- ---------- LOCATIONS ----------

CREATE TABLE states (
    id            SERIAL PRIMARY KEY,
    name          TEXT NOT NULL,
    abbreviation  CHAR(2) NOT NULL UNIQUE,   -- includes AK, HI, PR
    region        TEXT                        -- e.g. 'West', 'Northeast', 'Territory'
);

CREATE TABLE cities (
    id           SERIAL PRIMARY KEY,
    state_id     INTEGER NOT NULL REFERENCES states(id),
    name         TEXT NOT NULL,
    population   INTEGER,
    lat          NUMERIC(9,6),
    lng          NUMERIC(9,6),
    metro_area   TEXT,
    UNIQUE (state_id, name)
);

-- ---------- SERVICES ----------

CREATE TABLE services (
    id        SERIAL PRIMARY KEY,
    name      TEXT NOT NULL,                 -- 'Car Shipping', 'Freight Trucking', 'Container Shipping'
    slug      TEXT NOT NULL UNIQUE,
    category  TEXT NOT NULL                  -- 'car' | 'freight' | 'container'
);

-- Optional: origin -> destination route pages (big SEO opportunity for auto transport)
CREATE TABLE routes (
    id                  SERIAL PRIMARY KEY,
    origin_city_id      INTEGER NOT NULL REFERENCES cities(id),
    destination_city_id INTEGER NOT NULL REFERENCES cities(id),
    service_id          INTEGER NOT NULL REFERENCES services(id),
    distance_miles      NUMERIC(8,2),
    UNIQUE (origin_city_id, destination_city_id, service_id)
);

-- ---------- TENANTS (SaaS customers) ----------

CREATE TABLE tenants (
    id             SERIAL PRIMARY KEY,
    company_name   TEXT NOT NULL,
    contact_email  TEXT NOT NULL UNIQUE,
    contact_phone  TEXT,
    brand_config   JSONB NOT NULL DEFAULT '{}',   -- companyName, colors, logo, phone -- feeds the white-label CONFIG object
    plan_type      TEXT NOT NULL DEFAULT 'blue_pill', -- 'red_pill' (buys leads only) | 'blue_pill' (buys the software)
    plan_tier      TEXT NOT NULL DEFAULT 'starter', -- 'starter' | 'growth' | 'enterprise'
    status         TEXT NOT NULL DEFAULT 'active', -- active | suspended | cancelled
    agent_lead_cap    INTEGER,                     -- max leads assignable to one of this tenant's agents per period
    agent_cap_period  TEXT DEFAULT 'day',          -- 'day' | 'week'
    receiving_leads   BOOLEAN NOT NULL DEFAULT true,-- admin toggle: does new inbound traffic route to this tenant?
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A tenant's category access is its own table, not a column, because categories
-- are sold as add-ons: a tenant can start with one category and buy more later.
CREATE TABLE tenant_categories (
    id             SERIAL PRIMARY KEY,
    tenant_id      INTEGER NOT NULL REFERENCES tenants(id),
    service_id     INTEGER NOT NULL REFERENCES services(id),
    is_addon       BOOLEAN NOT NULL DEFAULT false,   -- false = included in base plan, true = purchased add-on
    monthly_price  NUMERIC(10,2),

    -- BLUE PILL fields (software tenants -- they own pages, no lead cap applies)
    page_allowance INTEGER,                          -- how many city/state pages this tier includes (e.g. 25 / 75 / unlimited=NULL)

    -- RED PILL fields (lead tenants -- they own nothing, just receive a metered drip)
    leads_per_day  INTEGER,                          -- how many leads/day get dropped to this tenant, based on what they paid
    lead_cap       INTEGER,                           -- max leads/month this tenant absorbs; overflow -> marketplace
    price_per_lead NUMERIC(10,2),                     -- what this tenant pays per delivered lead; editable as they buy more/less

    status         TEXT NOT NULL DEFAULT 'active',    -- active | paused | cancelled
    subscribed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at   TIMESTAMPTZ,
    UNIQUE (tenant_id, service_id)
);

CREATE INDEX idx_tenant_categories_tenant ON tenant_categories(tenant_id);

-- NOTE ON THE TWO PLAN TYPES:
--   blue_pill tenants: use `page_allowance`. Their pages (pages.tenant_id = this
--     tenant) are their own branded pages, driven by their own ad spend. No
--     lead_cap/leads_per_day applies -- capping or reselling leads they paid to
--     generate would break the "you own this" pitch. lead_cap should stay NULL.
--   red_pill tenants: use `leads_per_day` (pacing) and `lead_cap` (monthly
--     ceiling matching what they paid for). They own no pages -- pages.tenant_id
--     stays NULL for the pages that ultimately feed them, since these leads are
--     sourced from platform-owned pages or overflow, then actively assigned to
--     the tenant via lead_assignments rather than the tenant's own traffic.

-- ---------- LANDING PAGES ----------

CREATE TABLE pages (
    id                SERIAL PRIMARY KEY,
    url_slug          TEXT NOT NULL UNIQUE,
    tenant_id         INTEGER REFERENCES tenants(id),      -- NULL = platform/generic page, not yet claimed by a tenant
    location_city_id  INTEGER REFERENCES cities(id),      -- nullable if it's a route page
    route_id          INTEGER REFERENCES routes(id),       -- nullable if it's a location page
    service_id        INTEGER NOT NULL REFERENCES services(id),
    content_json      JSONB NOT NULL DEFAULT '{}',         -- headline, intro, FAQs, local stats
    status            TEXT NOT NULL DEFAULT 'draft',       -- draft | pending_approval | published | paused
    duplicate_risk_score NUMERIC(4,3),                     -- 0-1, flagged by AI QA pass
    last_generated_at TIMESTAMPTZ,
    published_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (location_city_id IS NOT NULL OR route_id IS NOT NULL)
);

CREATE INDEX idx_pages_service ON pages(service_id);
CREATE INDEX idx_pages_status ON pages(status);
CREATE INDEX idx_pages_tenant ON pages(tenant_id);

-- ---------- AGENTS ----------

CREATE TABLE agents (
    id              SERIAL PRIMARY KEY,
    tenant_id       INTEGER REFERENCES tenants(id),  -- NULL = platform's own agent/buyer; set = belongs to this tenant's internal team
    name            TEXT NOT NULL,
    email           TEXT NOT NULL UNIQUE,
    phone           TEXT,
    agent_type      TEXT NOT NULL,           -- 'in_house' | 'marketplace_buyer' | 'tenant_internal'
    categories      TEXT[] NOT NULL,         -- e.g. ARRAY['car','freight']
    states_covered  TEXT[],                  -- state abbreviations this agent/buyer serves; NULL = nationwide
    daily_cap       INTEGER,                 -- max leads/day (in-house / tenant capacity control)
    pricing_tier    TEXT,                    -- marketplace buyers only: 'standard' | 'premium' | 'exclusive'
    price_per_lead  NUMERIC(10,2),           -- marketplace buyers only
    active          BOOLEAN NOT NULL DEFAULT true,
    availability    TEXT NOT NULL DEFAULT 'active', -- active | busy | off_today | vacation | disabled (tenant_internal reps; drives auto-assign + Lead Management dashboard)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agents_type ON agents(agent_type);
CREATE INDEX idx_agents_tenant ON agents(tenant_id);
CREATE INDEX idx_agents_availability ON agents(availability);

-- ---------- LEADS ----------

CREATE TABLE leads (
    id                  SERIAL PRIMARY KEY,
    source_page_id      INTEGER REFERENCES pages(id),
    tenant_id           INTEGER REFERENCES tenants(id),  -- which tenant's page captured this lead, if any
    service_id          INTEGER NOT NULL REFERENCES services(id),

    -- contact info
    name                TEXT NOT NULL,
    phone               TEXT NOT NULL,
    email               TEXT,

    -- shipment details (nullable fields vary by category)
    origin_city_id       INTEGER REFERENCES cities(id),
    destination_city_id  INTEGER REFERENCES cities(id),
    origin_state         TEXT,               -- pickup state (USPS abbreviation) from the quote form
    origin_zip           TEXT,               -- pickup ZIP from the quote form
    origin_city          TEXT,               -- pickup city resolved from the ZIP lookup
    destination_state    TEXT,               -- drop-off state (USPS abbreviation)
    destination_zip      TEXT,               -- drop-off ZIP
    destination_city     TEXT,               -- drop-off city resolved from the ZIP lookup
    pickup_date          DATE,               -- requested pickup date
    vehicle_year         INTEGER,            -- car shipping: first vehicle's year (kept for compat)
    vehicle_make         TEXT,               -- car shipping: first vehicle's make
    vehicle_model        TEXT,               -- car shipping: first vehicle's model
    vehicles             JSONB,              -- car shipping: full list [{year,make,model}], 1-9 vehicles
    vehicle_type         TEXT,               -- car shipping
    cargo_type            TEXT,              -- freight
    cargo_weight_lbs       NUMERIC(10,2),    -- freight
    container_size          TEXT,            -- container shipping
    timeline              TEXT,              -- e.g. 'within 2 weeks'

    -- tracking
    utm_source          TEXT,
    utm_campaign        TEXT,
    submitted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- validation & scoring
    is_validated        BOOLEAN NOT NULL DEFAULT false,
    is_duplicate        BOOLEAN NOT NULL DEFAULT false,
    quality_score        NUMERIC(4,3),        -- 0-1, set by AI scoring step

    -- tenant-side agent assignment (tenant portal CRM-lite)
    assigned_agent_id    INTEGER REFERENCES agents(id),  -- which of the tenant's reps works this lead
    agent_assigned_at    TIMESTAMPTZ,                    -- when it was handed to that rep (drives per-day/week caps)
    follow_up_date       DATE,                           -- CRM: when the rep plans to follow up
    sale_amount          NUMERIC(10,2),                  -- CRM: booked amount when the rep closes the lead
    closed_at            TIMESTAMPTZ,                    -- CRM: set when status moves to 'booked'/'closed' (drives weekly sales)
    total_tariff         NUMERIC(10,2),                  -- CRM: quoted price to the customer
    carrier_pay          NUMERIC(10,2),                  -- CRM: carrier's cut (broker fee = tariff - carrier pay)
    quoted_at            TIMESTAMPTZ,                    -- CRM: set when the quote email goes out
    transport_type       TEXT DEFAULT 'Open',            -- CRM: 'Open' | 'Enclosed'
    quote_expiration     DATE,                           -- CRM: quote valid-until
    special_terms        TEXT,                           -- CRM: free text on the quote
    reference_id         TEXT,                           -- CRM: order reference (post-booking)
    secondary_status     TEXT,                           -- CRM: order sub-status e.g. 'Searching For Carriers'
    carrier_pay_terms    TEXT,                           -- CRM: e.g. 'COD - Cash'
    broker_fee_terms     TEXT,                           -- CRM: e.g. 'Charge on Order'
    -- broker earnings (rolled up from payments.direction = 'customer_broker')
    broker_collected     NUMERIC(10,2) DEFAULT 0,        -- sum of customer_broker payments
    broker_remaining     NUMERIC(10,2) DEFAULT 0,        -- broker_fee - broker_collected
    broker_refunded      NUMERIC(10,2) DEFAULT 0,        -- sum of refunded/chargeback payments
    broker_chargebacks   NUMERIC(10,2) DEFAULT 0,        -- sum of chargeback payments (subset of refunded)
    broker_payment_status TEXT DEFAULT 'Unpaid',         -- Unpaid | Partial | Paid
    desired_delivery_date DATE,                          -- CRM: order desired delivery
    internal_memo        TEXT,                           -- CRM: agent's private memo/task note
    -- customer booking + e-signature (public booking link)
    booking_token        TEXT UNIQUE,                    -- opaque token for /book/<token>
    do_not_email         BOOLEAN NOT NULL DEFAULT false,  -- customer opted out of quote/marketing email
    origin_address       TEXT,                           -- full pickup address entered by the customer
    destination_address  TEXT,                           -- full drop-off address entered by the customer
    signed_name          TEXT,                           -- typed signature
    signed_at            TIMESTAMPTZ,                    -- when the agreement was signed
    signed_ip            TEXT,                           -- signer IP for the record
    contract_dirty       BOOLEAN NOT NULL DEFAULT false, -- signed order's key details changed; needs a re-signed change order

    -- routing
    routing_mode         TEXT,                -- 'tenant' | 'in_house' | 'marketplace' | 'pending'
    overflow_reason       TEXT,               -- set when routing_mode = 'marketplace' but tenant_id is not null,
                                               -- e.g. 'tenant_at_cap' | 'tenant_category_not_subscribed' -- overflow, not wasted
    status                TEXT NOT NULL DEFAULT 'new',  -- new | assigned | claimed | contacted | closed | dead

    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_service ON leads(service_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_routing_mode ON leads(routing_mode);
CREATE INDEX idx_leads_tenant ON leads(tenant_id);

-- ---------- LEAD ASSIGNMENTS (in-house) ----------

CREATE TABLE lead_assignments (
    id            SERIAL PRIMARY KEY,
    lead_id       INTEGER NOT NULL REFERENCES leads(id),
    agent_id      INTEGER NOT NULL REFERENCES agents(id),
    assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at  TIMESTAMPTZ,
    outcome       TEXT                        -- 'won' | 'lost' | 'no_response' | 'reassigned'
);

-- ---------- MARKETPLACE CLAIMS / SALES ----------

CREATE TABLE lead_marketplace_offers (
    id            SERIAL PRIMARY KEY,
    lead_id       INTEGER NOT NULL REFERENCES leads(id),
    offered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    price         NUMERIC(10,2) NOT NULL,
    claimed_by    INTEGER REFERENCES agents(id),
    claimed_at    TIMESTAMPTZ,
    status        TEXT NOT NULL DEFAULT 'open'  -- open | claimed | expired
);

-- ---------- AI ACTION QUEUE (copilot approval workflow) ----------

CREATE TABLE ai_action_queue (
    id             SERIAL PRIMARY KEY,
    action_type    TEXT NOT NULL,           -- 'route_lead' | 'publish_page' | 'pause_page' | 'set_price' | 'send_followup'
    target_table   TEXT NOT NULL,           -- e.g. 'leads', 'pages'
    target_id      INTEGER NOT NULL,
    proposed_action JSONB NOT NULL,         -- structured description of what AI wants to do
    confidence     NUMERIC(4,3),
    reasoning      TEXT,                    -- AI's short explanation, shown to you in the dashboard
    status         TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | auto_approved
    reviewed_by    TEXT,
    reviewed_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_queue_status ON ai_action_queue(status);
CREATE INDEX idx_ai_queue_type ON ai_action_queue(action_type);

-- ---------- NOTES ----------
-- 1. `agents.agent_type = 'in_house'` rows use daily_cap for round-robin capacity.
--    `agent_type = 'marketplace_buyer'` rows use pricing_tier + price_per_lead instead.
--    `agent_type = 'tenant_internal'` rows belong to a tenant's own team (agents.tenant_id set).
-- 2. Route pages (city A -> city B) reuse the `pages` table via route_id instead of location_city_id.
-- 3. ai_action_queue is the backbone of the copilot workflow: every AI-proposed action
--    (routing, publishing, pricing, follow-ups) lands here first, nothing executes
--    against leads/pages/agents directly until approved.
-- 4. TWO PLAN TYPES, TWO DIFFERENT FLOWS:
--
--    BLUE PILL (tenants.plan_type = 'blue_pill') -- they buy the software:
--    - A tenant only gets pages for categories listed in tenant_categories (status='active').
--    - Category access can be the base plan (is_addon=false) or a purchased add-on (is_addon=true).
--    - `page_allowance` caps how many city/state pages they can have live at once, not leads.
--    - Every lead captured on one of their pages (pages.tenant_id = tenant.id) is theirs,
--      unmetered -- it came from traffic they paid for. lead_cap/leads_per_day don't apply.
--
--    RED PILL (tenants.plan_type = 'red_pill') -- they buy leads only:
--    - They own no pages (pages.tenant_id stays NULL for whatever generated the lead).
--    - `leads_per_day` paces how many leads get actively assigned to them per day;
--      `lead_cap` is the monthly ceiling matching what they paid for.
--    - Once a red-pill tenant hits either limit, further leads for that category route to
--      'marketplace' (overflow_reason='tenant_at_cap') instead of piling up unassigned --
--      nothing captured ever goes to waste, it just gets sold to someone else instead.
--
-- ---------- ADS (blue pill self-service only) ----------
-- Red pill tenants own no pages, so ad self-service doesn't apply to them --
-- this whole feature is blue_pill-only, same as page ownership itself.

CREATE TABLE ad_creatives (
    id          SERIAL PRIMARY KEY,
    service_id  INTEGER NOT NULL REFERENCES services(id),
    headline    TEXT NOT NULL,
    description TEXT NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE ad_campaigns (
    id                    SERIAL PRIMARY KEY,
    tenant_id             INTEGER NOT NULL REFERENCES tenants(id),
    page_id               INTEGER REFERENCES pages(id),    -- single-city campaign target (or NULL for state-wide)
    state_id              INTEGER REFERENCES states(id),   -- state-wide campaign target (or NULL for single-city)
    platform              TEXT,                             -- 'google_ads' | 'meta' | 'microsoft_ads' | 'tiktok'
    ad_creative_id        INTEGER REFERENCES ad_creatives(id),
    daily_budget          NUMERIC(10,2),
    status                TEXT NOT NULL DEFAULT 'draft',  -- draft | pending_launch | active | paused
    external_campaign_id  TEXT,                            -- set once a real ad-platform integration creates it
    requested_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    launched_at           TIMESTAMPTZ,
    CHECK (daily_budget IS NULL OR daily_budget >= 0),
    CHECK (page_id IS NOT NULL OR state_id IS NOT NULL)   -- must target a city page or a whole state
);

CREATE INDEX idx_ad_campaigns_tenant ON ad_campaigns(tenant_id);

-- NOTE: a tenant selecting a city + creative + budget only creates a 'draft'
-- (or 'pending_launch' once they confirm) row here -- it does NOT spend any
-- money or touch a real ad platform by itself.
--
-- CURRENT WORKFLOW (manual, no ad-platform API integration exists yet):
--   1. Tenant submits a request -> status='pending_launch'.
--   2. It surfaces in ai_action_queue for human review, same
--      propose-then-approve pattern as everything else in this system.
--   3. If approved, a real person manually creates the campaign in Google
--      Ads / Meta Ads Manager / wherever, using the tenant's page, creative
--      text, and budget as the brief.
--   4. That person pastes the resulting campaign ID into
--      external_campaign_id and flips status to 'active' -- this column is
--      just a reference/tracking field right now, not something an API
--      writes to automatically.
--
-- FUTURE (once tenant volume justifies the build): a real Google Ads API
-- integration (OAuth + a Google-approved developer token) and/or Meta
-- Marketing API integration (separate OAuth + Meta app review) could
-- automate step 3. Each is a distinct engineering project gated by that
-- platform's own approval process, not something to build speculatively
-- before there's enough volume to need it. Even once automated, keep a
-- human-approval step for spend above some threshold -- don't let a bug
-- auto-spend a tenant's ad budget unchecked.

-- ============================================================
-- Phases 1/4/5 (2026-07): audit foundation, dispatch, extras.
-- Applied live via phase1_audit.sql / phase4_dispatch.sql /
-- phase5_extras.sql — mirrored here so schema.sql stays authoritative.
-- ============================================================

-- Phase 1: audit columns on core tables (tenants, leads, agents, pages,
-- tenant_categories all gain created_by / updated_by TEXT and updated_at
-- TIMESTAMPTZ kept fresh by the set_updated_at() trigger), plus soft delete
-- (deleted_at TIMESTAMPTZ on tenants, leads, agents — reads filter
-- `deleted_at is null`).

CREATE TABLE IF NOT EXISTS activity_log (
  id           BIGSERIAL PRIMARY KEY,
  entity_type  TEXT NOT NULL,                 -- 'tenant' | 'lead' | 'agent' | 'page' | 'system'
  entity_id    INTEGER,
  action       TEXT NOT NULL,                 -- 'created' | 'updated' | 'deleted' | ...
  actor        TEXT,                          -- admin/agent email; NULL if unattributed
  summary      TEXT,
  details      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Phase 4: dispatch. Carriers are PER-TENANT rosters.
CREATE TABLE IF NOT EXISTS carriers (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER REFERENCES tenants(id),
  name            TEXT NOT NULL,
  mc_number       TEXT,
  contact_name    TEXT,
  email           TEXT,
  phone           TEXT,
  equipment       TEXT,
  notes           TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_carriers (
  id           BIGSERIAL PRIMARY KEY,
  lead_id      INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  carrier_id   INTEGER NOT NULL REFERENCES carriers(id) ON DELETE CASCADE,
  interested   BOOLEAN NOT NULL DEFAULT false,
  assigned     BOOLEAN NOT NULL DEFAULT false,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lead_id, carrier_id)
);

-- Payment ledger. `direction` is 'customer_broker' (customer pays broker) or
-- 'broker_carrier' (broker pays carrier). recomputeBroker() rolls customer_broker
-- sums into leads.broker_collected / broker_remaining / broker_payment_status.
CREATE TABLE IF NOT EXISTS payments (
  id            BIGSERIAL PRIMARY KEY,
  lead_id       INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  payment_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  type          TEXT NOT NULL,                  -- cash | ach | check | wire | zelle | credit_card | other
  direction     TEXT NOT NULL DEFAULT 'customer_broker', -- customer_broker | broker_carrier
  amount        NUMERIC(10,2) NOT NULL,
  identification TEXT,                          -- check # / gateway txn id
  notes         TEXT,
  user_email    TEXT,                           -- agent who recorded it
  confirmed     BOOLEAN NOT NULL DEFAULT true,  -- counts toward Broker Collected when true
  is_broker_fee BOOLEAN NOT NULL DEFAULT false, -- auto-generated broker-fee draft
  refunded      BOOLEAN NOT NULL DEFAULT false, -- reversed: excluded from Collected, kept in history
  refund_type  TEXT,                            -- 'refund' | 'chargeback' when refunded
  refund_reason TEXT,                           -- why it was reversed
  refund_date  DATE,                            -- when the reversal happened
  refund_ref   TEXT,                            -- gateway/chargeback case #
  chargeback_status TEXT,                       -- NULL | 'New' | 'Fighting' | 'Won' | 'Lost' (chargeback lifecycle)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_lead ON payments (lead_id);

-- Agent activity log — powers per-agent statistics (calls, texts, emails,
-- lead assignments, quotes, conversions, logins, last active).
CREATE TABLE IF NOT EXISTS agent_activity (
  id            BIGSERIAL PRIMARY KEY,
  agent_id      INTEGER NOT NULL REFERENCES agents (id) ON DELETE CASCADE,
  tenant_id     INTEGER,
  activity_type TEXT NOT NULL,                    -- call | text | email | assign | quote | convert | login | active
  lead_id       INTEGER,
  meta          JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_activity_agent ON agent_activity (agent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_activity_type ON agent_activity (activity_type, created_at);

-- Centralized feedback / bug-report / feature-request system (Agents + Tenants).
-- A row here also creates an ai_action_queue task (action_type='feedback') so
-- feedback shows up in the admin AI Action Queue alongside campaign proposals.
CREATE TABLE IF NOT EXISTS feedback (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  agent_id      INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  agent_name    TEXT,
  company       TEXT,
  subject       TEXT NOT NULL,
  message       TEXT NOT NULL,
  attachments   JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{name, type, data_url}]
  browser_info  TEXT,
  page          TEXT,
  crm_version   TEXT,
  status        TEXT NOT NULL DEFAULT 'new',  -- new | in_progress | resolved | closed
  admin_reply   TEXT,
  replied_at    TIMESTAMPTZ,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feedback_tenant ON feedback (tenant_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback (status);

-- Written ONLY by the customer booking flow (chain of custody).
CREATE TABLE IF NOT EXISTS signature_history (
  id              BIGSERIAL PRIMARY KEY,
  lead_id         INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  signer_name     TEXT NOT NULL,
  signed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip              TEXT,
  kind            TEXT NOT NULL DEFAULT 'initial', -- 'initial' | 'change_order'
  contract_snapshot JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Phase 5: comms tracking + per-agent notifications.
CREATE TABLE IF NOT EXISTS comms_log (
  id            BIGSERIAL PRIMARY KEY,
  lead_id       BIGINT REFERENCES leads(id) ON DELETE CASCADE,
  channel       TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  to_address    TEXT,
  template      TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'bounced')),
  error         TEXT,
  external_id   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id            BIGSERIAL PRIMARY KEY,
  agent_id      BIGINT REFERENCES agents(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  read          BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Text/SMS templates for the agent CRM. Company templates are shared across
-- the tenant (agent_id IS NULL); personal templates belong to one agent.
CREATE TABLE IF NOT EXISTS sms_templates (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id    INTEGER REFERENCES agents(id) ON DELETE CASCADE, -- NULL = company/shared
  category    TEXT NOT NULL CHECK (category IN ('personal', 'company')),
  name        TEXT NOT NULL,
  body        TEXT NOT NULL,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sms_templates_tenant ON sms_templates(tenant_id);

-- SUPERSEDED (2026-07-28) by invoice_template_versions' 'html' kind
-- (lib/htmlInvoice.js, a real Puppeteer-rendered PDF) -- no code reads this
-- table anymore. Left in place (not dropped) so existing rows aren't lost;
-- safe to remove in a future cleanup once confirmed nothing depends on it.
-- Invoice templates for the tenant portal. Same model as sms_templates:
-- company-shared (agent_id IS NULL) or personal (bound to an agent).
-- Bodies use {{token}} placeholders resolved against an order at generation time.
CREATE TABLE IF NOT EXISTS invoice_templates (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id    INTEGER REFERENCES agents(id) ON DELETE CASCADE, -- NULL = company/shared
  category    TEXT NOT NULL CHECK (category IN ('personal', 'company')),
  name        TEXT NOT NULL,
  body        TEXT NOT NULL,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_templates_tenant ON invoice_templates(tenant_id);

-- Default invoice template seeded when a tenant first opens the manager.
INSERT INTO invoice_templates (tenant_id, agent_id, category, name, body, is_default)
SELECT t.id, NULL, 'company', 'Standard Invoice',
'INVOICE
{{company_name}}
Agent: {{agent_name}} | {{agent_phone}}

Bill To:
{{customer_name}}
{{customer_email}}
{{customer_phone}}

Invoice #: {{order_id}}
Date: {{invoice_date}}

Route: {{origin}}  →  {{destination}}
Vehicle: {{vehicle}}
Pickup: {{pickup_date}}   Delivery: {{delivery_date}}

--------------------------------------------------
Total Amount:        {{total_amount}}
Broker Fee:          {{broker_fee}}
Amount Paid:         {{amount_paid}}
Balance Due:         {{broker_due}}
--------------------------------------------------

Payment Status: {{payment_status}}

Thank you for your business!
{{company_name}}', true
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM invoice_templates it WHERE it.tenant_id = t.id)
ON CONFLICT DO NOTHING;

-- Self-managed ads (2026-07-22): tenants may bring their own ad manager.
-- Tag IDs are format-validated in app/api/portal/adsettings before save and
-- rendered ONLY on landing pages that tenant owns.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS ga4_id TEXT,                 -- G-XXXXXXXXXX
  ADD COLUMN IF NOT EXISTS gads_conversion_id TEXT,     -- AW-#########
  ADD COLUMN IF NOT EXISTS gads_conversion_label TEXT,
  ADD COLUMN IF NOT EXISTS meta_pixel_id TEXT;

-- Tenant invoice template (2026-07-24): each tenant may upload a branded
-- invoice template (PDF/image). Stored as a base64 data URL + parsed structure;
-- invoice generation falls back to the default Scherz Trucking INC template when absent.
-- SUPERSEDED by invoice_template_versions below (adds versioning) -- these
-- flat columns are unused by current code, kept only so old rows aren't lost.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS invoice_template_file TEXT,
  ADD COLUMN IF NOT EXISTS invoice_template_name TEXT,
  ADD COLUMN IF NOT EXISTS invoice_template_type TEXT,
  ADD COLUMN IF NOT EXISTS invoice_template_parsed_json JSONB;

-- Versioned branded invoice templates (2026-07-27ish; never backfilled into
-- this file until now). Three generation paths share this one table via
-- template_kind: 'pdf_coord' (coordinate-overlay onto an uploaded flat PDF,
-- lib/pdfInvoice.js), 'acroform' (same table, is_acroform=true, fills real
-- PDF form fields by name), and 'html' (lib/htmlInvoice.js, Puppeteer
-- renders html_body + logo_data to PDF -- the newer, lower-maintenance path
-- that doesn't need coordinate mapping at all). A tenant's active version is
-- tenants.active_invoice_template_version_id; past versions are kept so
-- already-generated invoices keep rendering the way they did at the time.
CREATE TABLE IF NOT EXISTS invoice_template_versions (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL,
  name            TEXT,
  template_kind   TEXT NOT NULL DEFAULT 'pdf_coord', -- 'pdf_coord' | 'html'
  -- pdf_coord / acroform fields:
  file            TEXT,   -- base64 data URL of the uploaded PDF/image
  type            TEXT,   -- 'pdf' | 'png' | 'jpg' | ...
  parsed_json     JSONB,
  is_acroform     BOOLEAN DEFAULT false,
  acroform_fields JSONB,
  field_map       JSONB DEFAULT '[]'::jsonb, -- InvoiceFieldMapper.js output
  -- html fields:
  html_body       TEXT,   -- raw HTML/CSS with {{token}} placeholders
  logo_data       TEXT,   -- base64 data URL of the uploaded logo image
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      TEXT
);
CREATE INDEX IF NOT EXISTS idx_invoice_template_versions_tenant ON invoice_template_versions(tenant_id);

-- This table predates template_kind='html' and originally had file/type as
-- NOT NULL (fine when every version was a PDF/image upload); an HTML-kind
-- version legitimately has neither. No-op on a fresh database (columns are
-- already nullable above); needed on any database that had this table
-- before 2026-07-28.
ALTER TABLE invoice_template_versions
  ALTER COLUMN file DROP NOT NULL,
  ALTER COLUMN type DROP NOT NULL;

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS active_invoice_template_version_id INTEGER REFERENCES invoice_template_versions(id);

-- Ad-click attribution captured by the quote form (gclid/UTM from the URL).
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS gclid TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

-- ============================================================
-- Security hardening (2026-07-22): close the Supabase Security Advisor
-- findings. The app connects as the `postgres` role (bypassrls) and makes
-- ZERO client-side DB calls — it only uses Supabase for Auth — so enabling
-- RLS with no policies blocks the public anon/authenticated PostgREST API
-- entirely while leaving the app untouched.
-- ============================================================

-- 1. Enable RLS on every public table (no policies = no anon/authenticated
--    access via the data API; the server bypasses RLS as the table owner).
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- 2. Pin the trigger function's search_path (prevents search_path hijacking).
ALTER FUNCTION public.set_updated_at() SET search_path = '';

-- 3. Keep pg_trgm out of the public schema (Supabase pre-creates `extensions`).
--    Existing gin_trgm_ops indexes reference the opclass by OID, so the move
--    does not invalidate them.
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- 4. Leaked-password protection (HaveIBeenPwned) is a Supabase Auth setting,
--    NOT SQL. It requires the Pro plan; enable it in Dashboard → Auth once
--    upgraded. password_min_length raised to 8 via the Management API.
