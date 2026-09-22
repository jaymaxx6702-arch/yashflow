-- YashFlow production diagnostics (READ ONLY)
-- Safe to run in Supabase SQL Editor. This file performs SELECTs only.
-- Purpose: employee/auth mapping, attendance duplicates, RPC contracts,
-- GPS settings, closed-app push subscriptions and cron health.

-- 1) Jayendra employee/auth mapping.
select
  e.id as employee_id,
  e.full_name,
  e.mobile,
  e.auth_user_id,
  e.role,
  e.approval_status,
  e.is_active,
  e.is_hidden,
  u.email as auth_email,
  u.created_at as auth_created_at,
  e.created_at as employee_created_at
from public.employees e
left join auth.users u
  on u.id = e.auth_user_id
where lower(coalesce(e.full_name, '')) like '%jayendra%'
   or lower(coalesce(u.email, '')) like '%jayendra%'
order by e.created_at;

-- 2) Duplicate auth_user_id mappings. Expected: zero rows.
select
  auth_user_id,
  count(*) as employee_rows,
  array_agg(id order by created_at) as employee_ids,
  array_agg(full_name order by created_at) as employee_names,
  array_agg(approval_status order by created_at) as approval_statuses,
  array_agg(is_active order by created_at) as active_flags
from public.employees
where auth_user_id is not null
group by auth_user_id
having count(*) > 1
order by count(*) desc;

-- 3) Unique guard on employees.auth_user_id.
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'employees'
  and indexdef ilike '%auth_user_id%';

-- 4) Jayendra attendance rows, newest first.
select
  a.*
from public.attendance a
join public.employees e
  on e.id = a.employee_id
where lower(coalesce(e.full_name, '')) like '%jayendra%'
order by a.attendance_date desc, a.check_in desc nulls last
limit 100;

-- 5) Duplicate attendance dates for Jayendra. Expected: zero rows.
select
  e.id as employee_id,
  e.full_name,
  a.attendance_date,
  count(*) as rows_on_date,
  array_agg(a.id order by a.check_in nulls last) as attendance_ids,
  array_agg(a.check_in order by a.check_in nulls last) as check_ins,
  array_agg(a.check_out order by a.check_in nulls last) as check_outs
from public.attendance a
join public.employees e
  on e.id = a.employee_id
where lower(coalesce(e.full_name, '')) like '%jayendra%'
group by e.id, e.full_name, a.attendance_date
having count(*) > 1
order by a.attendance_date desc;

-- 6) Required YashFlow RPC/function contracts available in production.
with required(name) as (
  values
    ('has_app_permission'),
    ('employee_start_stage_v1'),
    ('employee_waive_stage_proof'),
    ('employee_complete_stage_v4'),
    ('admin_complete_order_v1'),
    ('admin_save_attendance_geofence'),
    ('save_order_payment_sensitive'),
    ('save_order_billing_sensitive'),
    ('admin_approve_leave_with_handover'),
    ('employee_create_attendance_correction_request'),
    ('admin_review_attendance_correction_request'),
    ('admin_delete_workflow_template_v1'),
    ('create_purchase_order'),
    ('receive_purchase_stock'),
    ('cancel_purchase_order'),
    ('save_order_dispatch'),
    ('yf_scan_stuck_work_alerts'),
    ('yf_dispatch_push_outbox')
)
select
  required.name,
  count(p.oid) > 0 as installed,
  coalesce(
    string_agg(
      pg_get_function_identity_arguments(p.oid),
      ' | ' order by p.oid
    ),
    ''
  ) as signatures
from required
left join pg_proc p
  on p.proname = required.name
left join pg_namespace n
  on n.oid = p.pronamespace
 and n.nspname = 'public'
where p.oid is null or n.nspname = 'public'
group by required.name
order by required.name;

-- 7) Office GPS settings.
select
  id,
  office_name,
  latitude,
  longitude,
  radius_m,
  max_accuracy_m,
  require_check_in,
  require_check_out,
  is_active,
  updated_at
from public.attendance_geofence_settings
order by id;

-- 8) Push processor configuration.
select
  id,
  public_key is not null as public_key_ready,
  private_jwk is not null as private_key_ready,
  process_url,
  cron_enabled,
  updated_at
from public.push_settings
where id = 1;

-- 9) Active push subscription coverage by employee.
select
  e.id as employee_id,
  e.full_name,
  e.approval_status,
  e.is_active,
  count(ps.id) filter (where ps.is_active) as active_push_subscriptions,
  max(ps.last_success_at) as last_push_success,
  max(ps.last_error) filter (where ps.last_error is not null) as latest_push_error
from public.employees e
left join public.push_subscriptions ps
  on ps.employee_id = e.id
where e.approval_status = 'approved'
  and e.is_active = true
group by e.id, e.full_name, e.approval_status, e.is_active
order by e.full_name;

-- 10) Push outbox health.
select
  count(*) filter (where sent_at is null) as pending,
  count(*) filter (where sent_at is not null) as processed,
  max(created_at) filter (where sent_at is null) as oldest_pending_created_at,
  max(last_error) filter (where last_error is not null) as latest_error
from public.push_outbox;

-- 11) Notification -> push outbox trigger exists/enabled.
select
  t.tgname,
  t.tgenabled,
  pg_get_triggerdef(t.oid) as trigger_definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'notifications'
  and not t.tgisinternal
order by t.tgname;

-- 12) Extensions needed by closed-app push dispatch.
select
  extname,
  extversion
from pg_extension
where extname in ('pg_cron', 'pg_net')
order by extname;

-- 13) Scheduled push job. Expected: one active row.
select
  jobid,
  jobname,
  schedule,
  command,
  active
from cron.job
where jobname = 'yashflow-push-outbox';

-- 14) Recent push failures / subscriptions needing attention.
select
  ps.employee_id,
  e.full_name,
  ps.endpoint,
  ps.is_active,
  ps.last_success_at,
  ps.last_error,
  ps.updated_at
from public.push_subscriptions ps
left join public.employees e on e.id = ps.employee_id
where ps.last_error is not null
   or ps.is_active = false
order by ps.updated_at desc
limit 100;
