-- YashFlow: structured operational order details
-- Run once in Supabase SQL Editor.

begin;

create table if not exists public.order_operation_details (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  material text,
  size_details text,
  print_size text,
  email_to_print_status text not null default 'pending' check (email_to_print_status in ('pending','sent','not_required')),
  print_taken_status text not null default 'pending' check (print_taken_status in ('pending','done','not_required')),
  print_job_given_by text,
  print_received_status text not null default 'pending' check (print_received_status in ('pending','received','not_required')),
  payment_receiver text,
  bill_created boolean not null default false,
  bill_number text,
  job_start_folder_details text,
  production_note text,
  updated_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_operation_details_order_id_idx
  on public.order_operation_details(order_id);

alter table public.order_operation_details enable row level security;

-- Admin full access.
drop policy if exists "order_operation_details_admin_all" on public.order_operation_details;
create policy "order_operation_details_admin_all"
on public.order_operation_details
for all
to authenticated
using (
  exists (
    select 1
    from public.employees e
    where e.auth_user_id = auth.uid()
      and e.role = 'admin'
      and e.approval_status = 'approved'
      and e.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.employees e
    where e.auth_user_id = auth.uid()
      and e.role = 'admin'
      and e.approval_status = 'approved'
      and e.is_active = true
  )
);

-- Employees granted Order Edit Access can also manage these details.
drop policy if exists "order_operation_details_orders_manage_select" on public.order_operation_details;
create policy "order_operation_details_orders_manage_select"
on public.order_operation_details
for select
to authenticated
using (public.has_app_permission('orders.manage'));

drop policy if exists "order_operation_details_orders_manage_insert" on public.order_operation_details;
create policy "order_operation_details_orders_manage_insert"
on public.order_operation_details
for insert
to authenticated
with check (public.has_app_permission('orders.manage'));

drop policy if exists "order_operation_details_orders_manage_update" on public.order_operation_details;
create policy "order_operation_details_orders_manage_update"
on public.order_operation_details
for update
to authenticated
using (public.has_app_permission('orders.manage'))
with check (public.has_app_permission('orders.manage'));

commit;

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'order_operation_details';
