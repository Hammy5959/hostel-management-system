-- hostel_settings has no prior migration in this repo (same situation
-- audit_logs was in) — this recreates its current schema for the first time,
-- then adds branding/locale columns and a real singleton guarantee.

create table if not exists public.hostel_settings (
  id uuid primary key default gen_random_uuid(),
  hostel_name text not null,
  hostel_code text,
  address text,
  city text,
  state text,
  country text,
  phone text,
  email text,
  total_capacity integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hostel_settings add column if not exists logo_url text;
alter table public.hostel_settings add column if not exists timezone text default 'Asia/Karachi';
alter table public.hostel_settings add column if not exists currency text default 'PKR';

-- Collapse to one row before the singleton constraint can be added — safe
-- no-op if 0 or 1 rows exist. Keeps the same row get_current() already
-- treated as "the active settings" (most recently created).
delete from public.hostel_settings
where id not in (
  select id from public.hostel_settings order by created_at desc limit 1
);

alter table public.hostel_settings add column if not exists singleton boolean not null default true;

do $$
begin
  alter table public.hostel_settings add constraint hostel_settings_singleton_check check (singleton);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.hostel_settings add constraint hostel_settings_singleton_key unique (singleton);
exception when duplicate_object then null;
end $$;

-- Seed the one default row if the table is empty (fresh environment).
insert into public.hostel_settings (hostel_name, timezone, currency, singleton)
select 'My Hostel', 'Asia/Karachi', 'PKR', true
where not exists (select 1 from public.hostel_settings);
