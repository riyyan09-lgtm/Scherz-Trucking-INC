-- Spec #15 / #18: order conversion support on leads.
alter table leads add column if not exists order_number text;
alter table leads add column if not exists converted_at timestamptz;
alter table leads add column if not exists booking_viewed_at timestamptz;
alter table leads add column if not exists booking_started_at timestamptz;
alter table leads add column if not exists agreement_version text;
alter table leads add column if not exists booking_ip text;
alter table leads add column if not exists booking_device text;
