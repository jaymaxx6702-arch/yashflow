-- YashFlow: Bulk ID Card module
-- Run once in Supabase SQL Editor.
-- Adds permissions, batch/card tables and private storage for logo/photo files.

begin;

create extension if not exists pgcrypto;

insert into public.app_permissions (
  permission_key,
  label,
  description,
  category,
  sort_order,
  is_active
)
values
  (
    'idcards.view',
    'ID Card View',
    'View Bulk ID Card batches and card data.',
    'ID Card',
    10,
    true
  ),
  (
    'idcards.manage',
    'ID Card Manage',
    'Create and manage Bulk ID Card batches, card data and files.',
    'ID Card',
    20,
    true
  )
on conflict (permission_key)
do update set
  label = excluded.label,
  description = excluded.description,
  category = excluded.category,
  sort_order = excluded.sort_order,
  is_active = true;

create table if not exists public.id_card_batches (
  id uuid primary key default gen_random_uuid(),
  batch_name text not null,
  customer_name text not null,
  order_id uuid null references public.orders(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft','in_progress','ready','completed','cancelled')),
  print_matter text null,
  logo_path text null,
  note text null,
  created_by uuid null references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.id_card_entries (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.id_card_batches(id) on delete cascade,
  serial_no integer not null default 1,
  card_number text null,
  full_name text not null,
  designation text null,
  department text null,
  mobile text null,
  blood_group text null,
  custom_text text null,
  photo_path text null,
  status text not null default 'pending'
    check (status in ('pending','ready','printed','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_id_card_batches_order_id
  on public.id_card_batches(order_id);
create index if not exists idx_id_card_batches_status
  on public.id_card_batches(status);
create index if not exists idx_id_card_entries_batch_id
  on public.id_card_entries(batch_id);
create index if not exists idx_id_card_entries_status
  on public.id_card_entries(status);

alter table public.id_card_batches enable row level security;
alter table public.id_card_entries enable row level security;

-- Admin or permission holders can read.
drop policy if exists "id_card_batches_select" on public.id_card_batches;
create policy "id_card_batches_select"
on public.id_card_batches
for select
to authenticated
using (
  public.has_app_permission('idcards.view')
  or public.has_app_permission('idcards.manage')
  or exists (
    select 1
    from public.employees e
    where e.auth_user_id = auth.uid()
      and e.role = 'admin'
      and e.approval_status = 'approved'
      and e.is_active = true
  )
);

drop policy if exists "id_card_entries_select" on public.id_card_entries;
create policy "id_card_entries_select"
on public.id_card_entries
for select
to authenticated
using (
  public.has_app_permission('idcards.view')
  or public.has_app_permission('idcards.manage')
  or exists (
    select 1
    from public.employees e
    where e.auth_user_id = auth.uid()
      and e.role = 'admin'
      and e.approval_status = 'approved'
      and e.is_active = true
  )
);

-- Manage holders can create/update/delete.
drop policy if exists "id_card_batches_manage_insert" on public.id_card_batches;
create policy "id_card_batches_manage_insert"
on public.id_card_batches
for insert
to authenticated
with check (
  public.has_app_permission('idcards.manage')
  or exists (
    select 1 from public.employees e
    where e.auth_user_id = auth.uid()
      and e.role = 'admin'
      and e.approval_status = 'approved'
      and e.is_active = true
  )
);

drop policy if exists "id_card_batches_manage_update" on public.id_card_batches;
create policy "id_card_batches_manage_update"
on public.id_card_batches
for update
to authenticated
using (
  public.has_app_permission('idcards.manage')
  or exists (
    select 1 from public.employees e
    where e.auth_user_id = auth.uid()
      and e.role = 'admin'
      and e.approval_status = 'approved'
      and e.is_active = true
  )
)
with check (
  public.has_app_permission('idcards.manage')
  or exists (
    select 1 from public.employees e
    where e.auth_user_id = auth.uid()
      and e.role = 'admin'
      and e.approval_status = 'approved'
      and e.is_active = true
  )
);

drop policy if exists "id_card_batches_manage_delete" on public.id_card_batches;
create policy "id_card_batches_manage_delete"
on public.id_card_batches
for delete
to authenticated
using (
  public.has_app_permission('idcards.manage')
  or exists (
    select 1 from public.employees e
    where e.auth_user_id = auth.uid()
      and e.role = 'admin'
      and e.approval_status = 'approved'
      and e.is_active = true
  )
);

drop policy if exists "id_card_entries_manage_insert" on public.id_card_entries;
create policy "id_card_entries_manage_insert"
on public.id_card_entries
for insert
to authenticated
with check (
  public.has_app_permission('idcards.manage')
  or exists (
    select 1 from public.employees e
    where e.auth_user_id = auth.uid()
      and e.role = 'admin'
      and e.approval_status = 'approved'
      and e.is_active = true
  )
);

drop policy if exists "id_card_entries_manage_update" on public.id_card_entries;
create policy "id_card_entries_manage_update"
on public.id_card_entries
for update
to authenticated
using (
  public.has_app_permission('idcards.manage')
  or exists (
    select 1 from public.employees e
    where e.auth_user_id = auth.uid()
      and e.role = 'admin'
      and e.approval_status = 'approved'
      and e.is_active = true
  )
)
with check (
  public.has_app_permission('idcards.manage')
  or exists (
    select 1 from public.employees e
    where e.auth_user_id = auth.uid()
      and e.role = 'admin'
      and e.approval_status = 'approved'
      and e.is_active = true
  )
);

drop policy if exists "id_card_entries_manage_delete" on public.id_card_entries;
create policy "id_card_entries_manage_delete"
on public.id_card_entries
for delete
to authenticated
using (
  public.has_app_permission('idcards.manage')
  or exists (
    select 1 from public.employees e
    where e.auth_user_id = auth.uid()
      and e.role = 'admin'
      and e.approval_status = 'approved'
      and e.is_active = true
  )
);

-- Private bucket for batch logo and employee/student photos.
insert into storage.buckets (id, name, public)
values ('id-card-files', 'id-card-files', false)
on conflict (id) do update set public = false;

drop policy if exists "id_card_files_read" on storage.objects;
create policy "id_card_files_read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'id-card-files'
  and (
    public.has_app_permission('idcards.view')
    or public.has_app_permission('idcards.manage')
    or exists (
      select 1 from public.employees e
      where e.auth_user_id = auth.uid()
        and e.role = 'admin'
        and e.approval_status = 'approved'
        and e.is_active = true
    )
  )
);

drop policy if exists "id_card_files_insert" on storage.objects;
create policy "id_card_files_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'id-card-files'
  and (
    public.has_app_permission('idcards.manage')
    or exists (
      select 1 from public.employees e
      where e.auth_user_id = auth.uid()
        and e.role = 'admin'
        and e.approval_status = 'approved'
        and e.is_active = true
    )
  )
);

drop policy if exists "id_card_files_update" on storage.objects;
create policy "id_card_files_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'id-card-files'
  and (
    public.has_app_permission('idcards.manage')
    or exists (
      select 1 from public.employees e
      where e.auth_user_id = auth.uid()
        and e.role = 'admin'
        and e.approval_status = 'approved'
        and e.is_active = true
    )
  )
)
with check (bucket_id = 'id-card-files');

drop policy if exists "id_card_files_delete" on storage.objects;
create policy "id_card_files_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'id-card-files'
  and (
    public.has_app_permission('idcards.manage')
    or exists (
      select 1 from public.employees e
      where e.auth_user_id = auth.uid()
        and e.role = 'admin'
        and e.approval_status = 'approved'
        and e.is_active = true
    )
  )
);

commit;

select permission_key, label, category, is_active
from public.app_permissions
where permission_key in ('idcards.view','idcards.manage')
order by permission_key;
