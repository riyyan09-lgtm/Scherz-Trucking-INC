-- Agent Lead Assignment Management (tenant portal).
-- Rep availability drives auto-assignment priority and is surfaced on the
-- new Lead Management dashboard. Values: active | busy | off_today |
-- vacation | disabled.
alter table agents add column if not exists availability text not null default 'active';
create index if not exists idx_agents_availability on agents(availability);
