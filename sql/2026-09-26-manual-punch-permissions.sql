begin;

alter table public.manual_attendance_requests enable row level security;

-- Browser clients only need read access. Create/review stays server-side.
revoke insert, update, delete on table public.manual_attendance_requests from authenticated;
grant select on table public.manual_attendance_requests to authenticated;

-- YashFlow server routes create and review Manual Punch requests.
grant select, insert, update on table public.manual_attendance_requests to service_role;

drop policy if exists "manual_attendance_requests_read_own_or_admin"
  on public.manual_attendance_requests;

create policy "manual_attendance_requests_read_own_or_admin"
on public.manual_attendance_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.employees e
    where e.auth_user_id = auth.uid()
      and e.approval_status = 'approved'
      and e.is_active = true
      and (
        e.role = 'admin'
        or e.id = manual_attendance_requests.employee_id
      )
  )
);

commit;
