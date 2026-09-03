-- Spec redesign: extra lead fields for the dense workspace.
alter table leads add column if not exists residential_pickup boolean not null default false;
alter table leads add column if not exists residential_delivery boolean not null default false;
alter table leads add column if not exists liftgate boolean not null default false;
alter table leads add column if not exists auction boolean not null default false;
alter table leads add column if not exists insurance text;
alter table leads add column if not exists payment_method text;
alter table leads add column if not exists cod_amount numeric(10,2) default 0;
alter table leads add column if not exists customer_company text;
alter table leads add column if not exists customer_since date;
alter table leads add column if not exists priority text default 'normal';
alter table leads add column if not exists internal_status text;
alter table leads add column if not exists mileage int;
