-- YashFlow: permission-based Order + Attendance management
-- Run once in Supabase SQL Editor.
-- Safe design: existing Admin policies remain untouched; these are additive.

begin;

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
    'orders.manage',
    'Order Edit Access',
    'Allow employee to view and edit order details through Management Access.',
    'Admin Access',
    10,
    true
  ),
  (
    'attendance.manage',
    'Attendance Edit Access',
    'Allow employee to view and correct employee attendance through Management Access.',
    'Admin Access',
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

-- ORDERS: permission holder can view + edit all orders.
drop policy if exists "orders_manage_permission_select" on public.orders;
create policy "orders_manage_permission_select"
on public.orders
for select
to authenticated
using (public.has_app_permission('orders.manage'));

drop policy if exists "orders_manage_permission_update" on public.orders;
create policy "orders_manage_permission_update"
on public.orders
for update
to authenticated
using (public.has_app_permission('orders.manage'))
with check (public.has_app_permission('orders.manage'));

-- ATTENDANCE: permission holder can view, create and correct attendance.
drop policy if exists "attendance_manage_permission_select" on public.attendance;
create policy "attendance_manage_permission_select"
on public.attendance
for select
to authenticated
using (public.has_app_permission('attendance.manage'));

drop policy if exists "attendance_manage_permission_insert" on public.attendance;
create policy "attendance_manage_permission_insert"
on public.attendance
for insert
to authenticated
with check (public.has_app_permission('attendance.manage'));

drop policy if exists "attendance_manage_permission_update" on public.attendance;
create policy "attendance_manage_permission_update"
on public.attendance
for update
to authenticated
using (public.has_app_permission('attendance.manage'))
with check (public.has_app_permission('attendance.manage'));

-- Attendance manager needs employee names/list.
drop policy if exists "employees_attendance_manage_select" on public.employees;
create policy "employees_attendance_manage_select"
on public.employees
for select
to authenticated
using (public.has_app_permission('attendance.manage'));

-- Attendance calculation reads office timings.
drop policy if exists "office_settings_attendance_manage_select" on public.office_settings;
create policy "office_settings_attendance_manage_select"
on public.office_settings
for select
to authenticated
using (public.has_app_permission('attendance.manage'));

commit;

-- Verification after running:
select permission_key, label, category, is_active
from public.app_permissions
where permission_key in ('orders.manage', 'attendance.manage')
order by permission_key;
