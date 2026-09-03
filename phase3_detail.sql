-- Scherz Trucking INC Phase 3: lead detail depth — tasks, notes, documents, pricing history.
-- Run in the Supabase SQL editor AFTER phase1_audit.sql / phase4_dispatch.sql / phase5_extras.sql.
-- Convention: raw parameterized SQL; every row is scoped to the owning agent
-- (agent_id) and, where relevant, the tenant (tenant_id) so one rep never sees
-- another's private notes/tasks. Leads are already scoped to the agent via
-- assigned_agent_id in the routes.

-- Tasks: type / due / reminder / assignee / priority / done
create table if not exists crm_tasks (
  id            bigserial primary key,
  lead_id       bigint not null references leads(id) on delete cascade,
  agent_id      bigint not null references agents(id) on delete cascade,
  tenant_id     bigint not null references tenants(id) on delete cascade,
  title         text not null,
  type          text not null default 'call',   -- call | email | follow_up | other
  due_date      date,
  priority      text not null default 'normal', -- low | normal | high
  done          boolean not null default false,
  done_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists crm_tasks_lead_idx on crm_tasks(lead_id);
create index if not exists crm_tasks_agent_idx on crm_tasks(agent_id, done, due_date);

-- Notes: internal / customer / pinned, with lightweight rich text (store HTML-free text + a kind flag)
create table if not exists crm_notes (
  id            bigserial primary key,
  lead_id       bigint not null references leads(id) on delete cascade,
  agent_id      bigint not null references agents(id) on delete cascade,
  tenant_id     bigint not null references tenants(id) on delete cascade,
  kind          text not null default 'internal', -- internal | customer | pinned
  body          text not null,
  pinned        boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists crm_notes_lead_idx on crm_notes(lead_id);
create index if not exists crm_notes_agent_idx on crm_notes(agent_id, created_at desc);

-- Documents: metadata records (name, url, kind). Uploads land in Supabase Storage
-- from the client; this table just records what exists and who added it.
create table if not exists lead_documents (
  id            bigserial primary key,
  lead_id       bigint not null references leads(id) on delete cascade,
  agent_id      bigint not null references agents(id) on delete cascade,
  tenant_id     bigint not null references tenants(id) on delete cascade,
  name          text not null,
  url           text not null,
  kind          text not null default 'other',  -- bill_of_lading | contract | photo | other
  created_at    timestamptz not null default now()
);
create index if not exists lead_documents_lead_idx on lead_documents(lead_id);

-- Pricing history: every tariff / carrier_pay change on a lead, so the agent
-- can see how the quote evolved. Written by the CRM on price edits.
create table if not exists pricing_history (
  id            bigserial primary key,
  lead_id       bigint not null references leads(id) on delete cascade,
  agent_id      bigint not null references agents(id) on delete cascade,
  total_tariff  numeric(10,2),
  carrier_pay   numeric(10,2),
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists pricing_history_lead_idx on pricing_history(lead_id, created_at desc);
