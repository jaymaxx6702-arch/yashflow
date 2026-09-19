-- YashFlow: fix Admin Manual Punch attendance updates
-- Run once in Supabase SQL Editor.
-- Safe to re-run: policies are replaced deterministically and the data correction
-- only targets Jayendra's exact incorrect 19-09-2026 future checkout.

begin;

drop policy if exists "attendance_manage_permission_select" on public.attendance;
create policy "attendance_manage_permission_select"
on public.attendance
for select
to authenticated
using (
  public.has_app_permission('attendance.manage')
  or exists (
    select 1
    from public.employees e
    where e.auth_user_id = auth.uid()
      and e.role = 'admin'
      and e.approval_status = 'approved'
      and e.is_active = true
  )
);

drop policy if exists "attendance_manage_permission_insert" on public.attendance;
create policy "attendance_manage_permission_insert"
on public.attendance
for insert
to authenticated
with check (
  public.has_app_permission('attendance.manage')
  or exists (
    select 1
    from public.employees e
    where e.auth_user_id = auth.uid()
      and e.role = 'admin'
      and e.approval_status = 'approved'
      and e.is_active = true
  )
);

drop policy if exists "attendance_manage_permission_update" on public.attendance;
create policy "attendance_manage_permission_update"
on public.attendance
for update
to authenticated
using (
  public.has_app_permission('attendance.manage')
  or exists (
    select 1
    from public.employees e
    where e.auth_user_id = auth.uid()
      and e.role = 'admin'
      and e.approval_status = 'approved'
      and e.is_active = true
  )
)
with check (
  public.has_app_permission('attendance.manage')
  or exists (
    select 1
    from public.employees e
    where e.auth_user_id = auth.uid()
      and e.role = 'admin'
      and e.approval_status = 'approved'
      and e.is_active = true
  )
);

-- One-time, tightly scoped correction.
-- Keeps Jayendra's 09:00 check-in, clears only the exact incorrect 18:01 checkout.
update public.attendance a
set
  check_out = null,
  working_minutes = 0,
  admin_note = concat_ws(
    ' | ',
    nullif(a.admin_note, ''),
    'Incorrect future checkout cleared'
  )
where a.attendance_date = date '2026-09-19'
  and a.employee_id in (
    select e.id
    from public.employees e
    where lower(trim(e.full_name)) = 'jayendra'
      and e.is_active = true
  )
  and a.check_out is not null
  and a.working_minutes = 481
  and to_char(
    a.check_out at time zone 'Asia/Kolkata',
    'HH24:MI'
  ) = '18:01';

commit;

-- Verification: check_out_time should be NULL and working_minutes should be 0.
select
  e.full_name,
  a.attendance_date,
  to_char(
    a.check_in at time zone 'Asia/Kolkata',
    'HH24:MI'
  ) as check_in_time,
  case
    when a.check_out is null then null
    else to_char(
      a.check_out at time zone 'Asia/Kolkata',
      'HH24:MI'
    )
  end as check_out_time,
  a.working_minutes,
  a.admin_note
from public.attendance a
join public.employees e on e.id = a.employee_id
where a.attendance_date = date '2026-09-19'
  and lower(trim(e.full_name)) = 'jayendra';
