-- YashFlow final stability guards
-- Safe by design: this migration aborts if legacy duplicate data exists.
-- Resolve reported duplicates first; it does not silently delete production data.

begin;

do $$
begin
  if exists (
    select 1
    from public.attendance
    group by employee_id, attendance_date
    having count(*) > 1
  ) then
    raise exception
      'YashFlow stability guard: duplicate attendance exists for employee/date. Resolve duplicates before applying this migration.';
  end if;
end
$$;

create unique index if not exists attendance_employee_date_unique
  on public.attendance (employee_id, attendance_date);

do $$
begin
  if exists (
    select 1
    from public.office_settings
    where is_active = true
    group by is_active
    having count(*) > 1
  ) then
    raise exception
      'YashFlow stability guard: more than one active office_settings row exists.';
  end if;
end
$$;

create unique index if not exists office_settings_one_active_unique
  on public.office_settings (is_active)
  where is_active = true;

do $$
begin
  if exists (
    select 1
    from public.employees
    where auth_user_id is not null
    group by auth_user_id
    having count(*) > 1
  ) then
    raise exception
      'YashFlow stability guard: duplicate employees.auth_user_id exists.';
  end if;
end
$$;

create unique index if not exists employees_auth_user_unique
  on public.employees (auth_user_id)
  where auth_user_id is not null;

create unique index if not exists manual_attendance_one_pending_per_day
  on public.manual_attendance_requests (employee_id, attendance_date)
  where status = 'pending';

do $$
begin
  if exists (
    select 1
    from public.orders
    where order_number is not null
    group by order_number
    having count(*) > 1
  ) then
    raise exception
      'YashFlow stability guard: duplicate order_number exists.';
  end if;
end
$$;

create unique index if not exists orders_order_number_unique
  on public.orders (order_number)
  where order_number is not null;

commit;
