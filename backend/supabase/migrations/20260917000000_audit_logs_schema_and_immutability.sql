-- Recreate the current live schema for audit_logs (documented in version
-- control for the first time — this table previously existed only in the
-- live Supabase project, with no migration file anywhere in the repo).
--
-- CREATE TABLE IF NOT EXISTS is a no-op against the already-existing live
-- table (Postgres does not diff/alter an existing table's columns under
-- IF NOT EXISTS) — it exists purely so a fresh environment gets the right
-- schema. The indexes/RLS/trigger statements below are NOT gated by the
-- table's pre-existence and DO take effect against the live table.
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  action varchar not null,
  module varchar,
  entity_type varchar,
  entity_id uuid,
  description text,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_user_id on public.audit_logs (user_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs (created_at);
create index if not exists idx_audit_logs_action on public.audit_logs (action);
create index if not exists idx_audit_logs_module on public.audit_logs (module);
create index if not exists idx_audit_logs_entity_type on public.audit_logs (entity_type);

alter table public.audit_logs enable row level security;

-- Append-only enforcement: blocks UPDATE/DELETE unconditionally, including
-- for service_role. RLS policies cannot do this — service_role bypasses RLS
-- entirely by design — but a trigger fires regardless of that bypass, so
-- this is the only way to make audit_logs genuinely tamper-evident.
--
-- Tradeoff accepted: a legitimate future need to edit/redact a row (e.g. a
-- GDPR erasure request) requires dropping these triggers first.
create or replace function public.hms_audit_logs_block_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only: % is not permitted', tg_op;
end;
$$;

drop trigger if exists trg_audit_logs_block_update on public.audit_logs;
create trigger trg_audit_logs_block_update
  before update on public.audit_logs
  for each row execute function public.hms_audit_logs_block_mutation();

drop trigger if exists trg_audit_logs_block_delete on public.audit_logs;
create trigger trg_audit_logs_block_delete
  before delete on public.audit_logs
  for each row execute function public.hms_audit_logs_block_mutation();
