-- Scherz Trucking INC spec (BATS parity) — Phase A schema.
-- Run AFTER phase1_audit.sql / phase4_dispatch.sql / phase5_extras.sql / phase3_detail.sql.
-- All rows scoped to agent_id + tenant_id so one rep never sees another's data.

-- Vehicles: full spec (#5). lead-scoped.
create table if not exists lead_vehicles (
  id            bigserial primary key,
  lead_id       bigint not null references leads(id) on delete cascade,
  agent_id      bigint not null references agents(id) on delete cascade,
  tenant_id     bigint not null references tenants(id) on delete cascade,
  year          int,
  make          text,
  model         text,
  type          text,            -- sedan | suv | truck | van | motorcycle | trailer | other
  vin           text,
  running       boolean not null default true,
  modified      boolean not null default false,
  lift_kit      boolean not null default false,
  lowered       boolean not null default false,
  oversized_tires boolean not null default false,
  color         text,
  plate         text,
  lot_number    text,
  keys_available boolean not null default true,
  weight        numeric(8,2),
  photos        jsonb not null default '[]',   -- array of {url, caption}
  damage_notes  text,
  title         text,            -- vehicle title status (e.g. clear / salvage / missing)
  carrier_notes text,            -- dispatcher/carrier notes about this vehicle
  carrier_pay   numeric(10,2),                  -- carrier pay allocated to this vehicle
  broker_fee_allocation numeric(10,2),
  created_at    timestamptz not null default now()
);
create index if not exists lead_vehicles_lead_idx on lead_vehicles(lead_id);

-- Sales activity (#10): agent-scoped per lead.
create table if not exists sales_activity (
  id            bigserial primary key,
  lead_id       bigint not null references leads(id) on delete cascade,
  agent_id      bigint not null references agents(id) on delete cascade,
  tenant_id     bigint not null references tenants(id) on delete cascade,
  kind          text not null,  -- email_sent | sms_sent | call | voicemail | booking_link_sent | quote_viewed | booking_started | booking_completed | agreement_signed
  detail        text,
  created_at    timestamptz not null default now()
);
create index if not exists sales_activity_lead_idx on sales_activity(lead_id, created_at desc);

-- Change log (#11): full audit of field edits. Append-only (no delete route).
create table if not exists change_log (
  id            bigserial primary key,
  lead_id       bigint not null references leads(id) on delete cascade,
  agent_id      bigint not null references agents(id) on delete cascade,
  actor         text,
  field         text not null,
  old_value     text,
  new_value     text,
  created_at    timestamptz not null default now()
);
create index if not exists change_log_lead_idx on change_log(lead_id, created_at desc);

-- Booking events (#15): booking card states over time.
create table if not exists booking_events (
  id            bigserial primary key,
  lead_id       bigint not null references leads(id) on delete cascade,
  agent_id      bigint not null references agents(id) on delete cascade,
  state         text not null,  -- link_sent | viewed | started | partially_completed | signed | order_created
  detail        text,           -- JSON: ip, device, agreement_version
  created_at    timestamptz not null default now()
);
create index if not exists booking_events_lead_idx on booking_events(lead_id, created_at desc);

-- Extend crm_tasks for full task system (#6)
alter table crm_tasks add column if not exists assigned_user text;
alter table crm_tasks add column if not exists reminder timestamptz;
alter table crm_tasks add column if not exists status text not null default 'open';  -- open | in_progress | completed | cancelled
alter table crm_tasks add column if not exists description text;
alter table crm_tasks add column if not exists recurring text;  -- none | daily | weekly | monthly

-- Extend crm_notes for internal/customer/pinned + author/edited/attachments/mentions (#7)
alter table crm_notes add column if not exists author text;
alter table crm_notes add column if not exists edited_at timestamptz;
alter table crm_notes add column if not exists attachments jsonb not null default '[]';
alter table crm_notes add column if not exists mentions jsonb not null default '[]';

-- Extend lead_documents with version history (#8)
alter table lead_documents add column if not exists doc_type text not null default 'other';  -- image | pdf | doc | docx | agreement | invoice | bol | other
alter table lead_documents add column if not exists version int not null default 1;
alter table lead_documents add column if not exists versions jsonb not null default '[]';  -- [{version, url, created_at}]

-- Extend pricing_history with old/new + reason + user (#9)
alter table pricing_history add column if not exists old_total_tariff numeric(10,2);
alter table pricing_history add column if not exists old_carrier_pay numeric(10,2);
alter table pricing_history add column if not exists old_broker_fee numeric(10,2);
alter table pricing_history add column if not exists new_broker_fee numeric(10,2);
alter table pricing_history add column if not exists reason text;
alter table pricing_history add column if not exists actor text;

-- Extend leads with the missing quote/customer/route fields (#1-#4)
alter table leads add column if not exists quote_id text;
alter table leads add column if not exists last_updated timestamptz;
alter table leads add column if not exists require_edoc boolean not null default false;
alter table leads add column if not exists alt_phone text;
alter table leads add column if not exists secondary_email text;
alter table leads add column if not exists timezone text;
alter table leads add column if not exists preferred_contact text;  -- phone | email | sms | any
alter table leads add column if not exists lead_source text;
alter table leads add column if not exists customer_tags jsonb not null default '[]';
alter table leads add column if not exists lifetime_value numeric(10,2) default 0;
alter table leads add column if not exists total_quotes int default 0;
alter table leads add column if not exists total_bookings int default 0;
alter table leads add column if not exists last_contacted timestamptz;
alter table leads add column if not exists pickup_contact text;
alter table leads add column if not exists delivery_contact text;
alter table leads add column if not exists pickup_notes text;
alter table leads add column if not exists delivery_notes text;
alter table leads add column if not exists distance_miles int;
alter table leads add column if not exists est_transit_days int;
alter table leads add column if not exists booking_clicks int not null default 0;
alter table leads add column if not exists deposit numeric(10,2) default 0;
alter table leads add column if not exists quote_viewed_at timestamptz;
alter table leads add column if not exists booking_started_at timestamptz;
