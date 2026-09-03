-- ============================================================
-- Scherz Trucking INC Phase 1 (foundation): audit fields, activity log, soft delete
-- Run in this SINGLE transaction against your Postgres (Supabase SQL editor
-- or `psql`). Safe to run once. Idempotent guards included where practical.
--
-- What this adds (the repo has none of this today — confirmed by reading
-- schema.sql): no created_by/updated_by/updated_at, no activity_log table,
-- and DELETE is currently HARD (tenants/leads/agents are physically removed).
-- ============================================================

BEGIN;

-- ---------- 1. AUDIT COLUMNS on the core write tables ----------
-- created_by / updated_by store the admin email (resolved from the Supabase
-- session via lib/audit.js). They are plain TEXT so a write still succeeds
-- even if we can't attribute it (graceful, per CLAUDE.md conventions).

ALTER TABLE tenants   ADD COLUMN IF NOT EXISTS created_by TEXT, ADD COLUMN IF NOT EXISTS updated_by TEXT, ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE leads     ADD COLUMN IF NOT EXISTS created_by TEXT, ADD COLUMN IF NOT EXISTS updated_by TEXT, ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE agents    ADD COLUMN IF NOT EXISTS created_by TEXT, ADD COLUMN IF NOT EXISTS updated_by TEXT, ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE pages     ADD COLUMN IF NOT EXISTS created_by TEXT, ADD COLUMN IF NOT EXISTS updated_by TEXT, ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE tenant_categories ADD COLUMN IF NOT EXISTS created_by TEXT, ADD COLUMN IF NOT EXISTS updated_by TEXT, ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Keep updated_at fresh on every UPDATE for the tables above.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop silently if it already exists (idempotent re-run safety).
DROP TRIGGER IF EXISTS trg_tenants_updated_at   ON tenants;
DROP TRIGGER IF EXISTS trg_leads_updated_at     ON leads;
DROP TRIGGER IF EXISTS trg_agents_updated_at    ON agents;
DROP TRIGGER IF EXISTS trg_pages_updated_at     ON pages;
DROP TRIGGER IF EXISTS trg_tenant_categories_updated_at ON tenant_categories;

CREATE TRIGGER trg_tenants_updated_at   BEFORE UPDATE ON tenants   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_leads_updated_at     BEFORE UPDATE ON leads     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_agents_updated_at    BEFORE UPDATE ON agents    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pages_updated_at     BEFORE UPDATE ON pages     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tenant_categories_updated_at BEFORE UPDATE ON tenant_categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- 2. ACTIVITY LOG (timeline on every record) ----------
-- One append-only table for the whole platform. `entity_type`/`entity_id`
-- let any record's history be reconstructed with a single indexed query.
CREATE TABLE IF NOT EXISTS activity_log (
  id           BIGSERIAL PRIMARY KEY,
  entity_type  TEXT NOT NULL,                 -- 'tenant' | 'lead' | 'agent' | 'page' | 'system'
  entity_id    INTEGER,                       -- the row the event is about (NULL for system events)
  action       TEXT NOT NULL,                 -- 'created' | 'updated' | 'deleted' | 'assigned' | 'status_changed' | ...
  actor        TEXT,                          -- admin email (who did it); NULL if unattributed
  summary      TEXT,                          -- human-readable line for the timeline
  details      JSONB,                         -- optional structured before/after
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log (created_at DESC);

-- ---------- 3. SOFT DELETE ----------
-- Replaces the hard DELETE in app/api/admin/tenants/[id]/route.js. Existing
-- DELETE routes for agents/leads are left hard for now (out of Phase 1 scope)
-- but the columns below make them convertible later.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE leads   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE agents  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Exclude soft-deleted rows from the admin tenant list by default.
-- (The tenant list query in app/api/admin/tenants/route.js is updated to add
--  `where t.deleted_at is null` — see the route patch in this Phase 1 work.)
CREATE INDEX IF NOT EXISTS idx_tenants_deleted ON tenants (deleted_at);

COMMIT;
