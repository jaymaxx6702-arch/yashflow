-- YashFlow native Android FCM device tokens
-- Safe/idempotent. Run once in Supabase SQL Editor.

begin;

create table if not exists public.native_push_tokens (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  token text not null unique,
  platform text not null default 'android'
    check (platform in ('android')),
  is_active boolean not null default true,
  last_success_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists native_push_tokens_employee_idx
  on public.native_push_tokens(employee_id, is_active);

alter table public.native_push_tokens enable row level security;

-- Tokens are managed server-side through authenticated API routes.
grant usage on schema public to service_role;
grant select, insert, update
on table public.native_push_tokens
to service_role;

commit;

select
  to_regclass('public.native_push_tokens') is not null as table_ready,
  has_table_privilege('service_role','public.native_push_tokens','SELECT') as service_select,
  has_table_privilege('service_role','public.native_push_tokens','INSERT') as service_insert,
  has_table_privilege('service_role','public.native_push_tokens','UPDATE') as service_update;
