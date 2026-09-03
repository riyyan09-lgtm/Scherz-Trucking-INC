-- Scherz Trucking INC Phase 5 extras: comms tracking, notifications, search plumbing.
-- Run in the Supabase SQL editor (or psql) AFTER phase1_audit.sql and phase4_dispatch.sql.
-- Convention: raw parameterized SQL, no ORM. Times stored as timestamptz.

-- ─────────────────────────────────────────────────────────────
-- comms_log: every email/SMS we send for a lead (tracking/auditability)
-- ─────────────────────────────────────────────────────────────
create table if not exists comms_log (
  id            bigserial primary key,
  lead_id       bigint references leads(id) on delete cascade,
  channel       text not null check (channel in ('email', 'sms')),
  to_address    text,                              -- recipient email or phone
  template      text,                              -- e.g. 'quote', 'booking', 'agreement'
  status        text not null default 'pending'
                  check (status in ('pending', 'sent', 'failed', 'bounced')),
  error         text,                              -- failure detail if status='failed'
  external_id   text,                              -- provider message id (Resend/SMS gateway)
  created_at    timestamptz not null default now()
);
create index if not exists comms_log_lead_idx on comms_log(lead_id);

-- ─────────────────────────────────────────────────────────────
-- notifications: per-agent in-app notifications
-- ─────────────────────────────────────────────────────────────
create table if not exists notifications (
  id            bigserial primary key,
  agent_id      bigint references agents(id) on delete cascade,
  kind          text not null,                    -- 'lead_assigned','payment_paid','order_closed', etc.
  payload       jsonb not null default '{}'::jsonb,
  read          boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists notifications_agent_idx on notifications(agent_id, read, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- Search plumbing: trigram index makes ILIKE %term% fast.
-- (postgres contrib "pg_trgm" is enabled by default on Supabase.)
-- ─────────────────────────────────────────────────────────────
create extension if not exists pg_trgm;

-- leads: name/email/phone/city search (leads has origin_city/destination_city, no bare "city")
create index if not exists leads_search_idx on leads
  using gin ((coalesce(name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(phone,'') || ' ' || coalesce(origin_city,'') || ' ' || coalesce(destination_city,'')) gin_trgm_ops);

-- carriers: name / mc_number search
create index if not exists carriers_search_idx on carriers
  using gin ((coalesce(name,'') || ' ' || coalesce(mc_number,'')) gin_trgm_ops);

-- tenants: company_name / contact_email / contact_phone search (admin-side only)
create index if not exists tenants_search_idx on tenants
  using gin ((coalesce(company_name,'') || ' ' || coalesce(contact_email,'') || ' ' || coalesce(contact_phone,'')) gin_trgm_ops);
