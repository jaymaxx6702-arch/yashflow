-- YashFlow attendance settings read access
-- Safe/idempotent. Required for employee dashboard and attendance API reads.

begin;

-- Table-level privileges are required in addition to RLS policies.
grant usage on schema public to authenticated, service_role;

grant select
on table public.office_settings
to authenticated, service_role;

grant select
on table public.attendance_geofence_settings
to authenticated, service_role;

alter table public.office_settings enable row level security;
alter table public.attendance_geofence_settings enable row level security;

-- Approved active employees need office timing settings on their dashboard
-- and during attendance actions.
drop policy if exists "office_settings_active_employee_select"
on public.office_settings;

create policy "office_settings_active_employee_select"
on public.office_settings
for select
to authenticated
using (
  exists (
    select 1
    from public.employees e
    where e.auth_user_id = auth.uid()
      and e.approval_status = 'approved'
      and e.is_active = true
  )
);

-- Approved active employees need current geofence rules before check-in/out.
drop policy if exists "attendance_geofence_active_employee_select"
on public.attendance_geofence_settings;

create policy "attendance_geofence_active_employee_select"
on public.attendance_geofence_settings
for select
to authenticated
using (
  exists (
    select 1
    from public.employees e
    where e.auth_user_id = auth.uid()
      and e.approval_status = 'approved'
      and e.is_active = true
  )
);

commit;
