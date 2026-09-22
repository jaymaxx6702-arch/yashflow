-- YashFlow attendance runtime privileges
-- Safe/idempotent. Completes the DB privileges required by employee dashboard
-- and server-side Check In / Check Out APIs.

begin;

grant usage on schema public to authenticated, service_role;

-- Employee/dashboard reads attendance through the authenticated client.
-- Admin/management pages also rely on authenticated privileges, with RLS
-- continuing to decide which rows each user may access.
grant select, insert, update
on table public.attendance
to authenticated;

-- Server-side attendance APIs use the Supabase secret/service_role client.
grant select, insert, update
on table public.attendance
to service_role;

grant select
on table public.employees
to service_role;

grant select
on table public.office_settings
to service_role;

grant select
on table public.attendance_geofence_settings
to service_role;

grant select, insert, update
on table public.offline_action_receipts
to service_role;

grant select, insert
on table public.notifications
to service_role;

alter table public.attendance enable row level security;

-- Normal approved employees must be able to read only their own attendance.
drop policy if exists "attendance_employee_own_select"
on public.attendance;

create policy "attendance_employee_own_select"
on public.attendance
for select
to authenticated
using (
  exists (
    select 1
    from public.employees e
    where e.id = attendance.employee_id
      and e.auth_user_id = auth.uid()
      and e.approval_status = 'approved'
      and e.is_active = true
  )
);

commit;
