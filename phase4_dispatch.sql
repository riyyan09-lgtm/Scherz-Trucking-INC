-- ============================================================
-- Scherz Trucking INC Phase 4: Orders / Dispatch
-- Carriers (roster), interested-carrier board, carrier assignment,
-- payments (customer invoice + carrier settlement), signature history.
--
-- Extends the existing order model: an "order" is a lead with
-- status in ('booked','closed'). The CRM already prices it via
-- leads.total_tariff (customer) and leads.carrier_pay (carrier).
-- This phase turns those bare numbers into real records and adds
-- the carrier/dispatch workflow around them.
--
-- Run in ONE transaction against Postgres. Safe to re-run (guards).
-- ============================================================

BEGIN;

-- ---------- CARRIERS (roster) ----------
-- The actual motor carriers you dispatch loads to. Distinct from `agents`
-- (your internal reps) and `lead_marketplace_offers` (buyer offers).
CREATE TABLE IF NOT EXISTS carriers (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER REFERENCES tenants(id),  -- each broker keeps their own roster
  name            TEXT NOT NULL,
  mc_number       TEXT,                       -- DOT/MC docket
  contact_name    TEXT,
  email           TEXT,
  phone           TEXT,
  equipment       TEXT,                       -- 'open' | 'enclosed' | 'flatbed' | ...
  notes           TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_carriers_active ON carriers (tenant_id, active);

-- ---------- LEAD <-> CARRIERS (interested board + assignment) ----------
-- One row per (lead, carrier). `interested` = carrier wants the load
-- (the dispatch board). `assigned` = this carrier won the load.
-- A lead should have at most one assigned carrier at a time; we enforce
-- that in app logic, not a partial unique index, to keep re-assignment simple.
CREATE TABLE IF NOT EXISTS lead_carriers (
  id           BIGSERIAL PRIMARY KEY,
  lead_id      INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  carrier_id   INTEGER NOT NULL REFERENCES carriers(id) ON DELETE CASCADE,
  interested   BOOLEAN NOT NULL DEFAULT false,   -- on the dispatch board
  assigned     BOOLEAN NOT NULL DEFAULT false,   -- won the load
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lead_id, carrier_id)
);
CREATE INDEX IF NOT EXISTS idx_lead_carriers_lead ON lead_carriers (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_carriers_assigned ON lead_carriers (lead_id, assigned);

-- ---------- PAYMENTS (customer invoice + carrier settlement) ----------
-- Replaces reliance on the bare leads.total_tariff / carrier_pay numbers
-- with an auditable record set. The lead still holds the *current* totals
-- for fast display; payments holds the *ledger* (multiple invoices/refunds,
-- partial carrier settlements, statuses).
CREATE TABLE IF NOT EXISTS payments (
  id            BIGSERIAL PRIMARY KEY,
  lead_id       INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  party         TEXT NOT NULL,                  -- 'customer' | 'carrier'
  kind          TEXT NOT NULL,                  -- 'invoice' | 'settlement' | 'refund' | 'adjustment'
  amount        NUMERIC(10,2) NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',-- pending | paid | refunded | failed
  method        TEXT,                           -- 'card' | 'ach' | 'cod' | 'check' | 'comchek'
  reference     TEXT,                           -- gateway txn id / check no.
  paid_at       TIMESTAMPTZ,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_lead ON payments (lead_id, party);

-- ---------- SIGNATURE HISTORY ----------
-- The leads row stores only the LATEST signature (signed_name/signed_at/
-- signed_ip). Every sign/re-sign (including change orders) is logged here so
-- the full chain of custody survives.
CREATE TABLE IF NOT EXISTS signature_history (
  id              BIGSERIAL PRIMARY KEY,
  lead_id         INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  signer_name     TEXT NOT NULL,
  signed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip              TEXT,
  kind            TEXT NOT NULL DEFAULT 'initial', -- 'initial' | 'change_order'
  contract_snapshot JSONB,                        -- copy of the agreed terms at sign time
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_signature_history_lead ON signature_history (lead_id, signed_at);

COMMIT;
