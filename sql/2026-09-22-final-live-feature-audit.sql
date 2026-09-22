-- YashFlow final live feature audit (SAFE / READ-ONLY)
-- Run in Supabase SQL Editor after runtime permission repairs.
-- Uses catalog/introspection checks only; it does not change application data.

-- A) Required functions/RPCs for the current production feature set.
with required(name) as (
  values
    ('has_app_permission'),
    ('employee_start_stage_v1'),
    ('employee_complete_stage_v4'),
    ('employee_waive_stage_proof'),
    ('admin_complete_order_v1'),
    ('admin_delete_workflow_template_v1'),
    ('admin_approve_leave_with_handover'),
    ('admin_save_attendance_geofence'),
    ('employee_create_attendance_correction_request'),
    ('admin_review_attendance_correction_request'),
    ('save_order_payment_sensitive'),
    ('save_order_billing_sensitive'),
    ('save_order_dispatch'),
    ('create_purchase_order'),
    ('receive_purchase_stock'),
    ('cancel_purchase_order'),
    ('yf_notify_employee'),
    ('yf_notify_order_team'),
    ('yf_scan_stuck_work_alerts'),
    ('yf_dispatch_push_outbox')
)
select
  'FUNCTION' as check_type,
  required.name as item,
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = required.name
  ) as ok
from required
order by required.name;

-- B) Core tables used by productivity, stage planning, checklist and push.
with required(name) as (
  values
    ('stage_checklist_items'),
    ('order_stage_checklist_items'),
    ('order_stage_checklist_checks'),
    ('order_stage_plans'),
    ('order_stage_plan_workers'),
    ('offline_action_receipts'),
    ('audit_activity'),
    ('push_settings'),
    ('push_subscriptions'),
    ('push_outbox')
)
select
  'TABLE' as check_type,
  required.name as item,
  to_regclass('public.' || required.name) is not null as ok
from required
order by required.name;

-- C) Important trigger coverage. Matching by table + trigger-name hint keeps
-- this compatible with harmless trigger renames while still proving coverage.
with wanted(table_name, trigger_hint) as (
  values
    ('notifications', 'push'),
    ('order_stage_work', 'checklist'),
    ('order_stage_work', 'audit'),
    ('orders', 'audit'),
    ('tasks', 'audit'),
    ('attendance', 'audit'),
    ('orders', 'notify'),
    ('tasks', 'notify'),
    ('order_stage_work', 'notify')
)
select
  'TRIGGER' as check_type,
  w.table_name || ':' || w.trigger_hint as item,
  exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = w.table_name
      and not t.tgisinternal
      and lower(t.tgname) like '%' || w.trigger_hint || '%'
  ) as ok
from wanted w
order by w.table_name, w.trigger_hint;

-- D) Attendance/runtime privileges.
-- CASE + to_regclass prevents this audit itself from failing if an optional
-- table has not been created yet.
select
  'PRIVILEGE' as check_type,
  'authenticated attendance SELECT' as item,
  case when to_regclass('public.attendance') is not null
    then has_table_privilege('authenticated','public.attendance','SELECT')
    else false end as ok
union all
select 'PRIVILEGE','service_role attendance SELECT',
  case when to_regclass('public.attendance') is not null
    then has_table_privilege('service_role','public.attendance','SELECT')
    else false end
union all
select 'PRIVILEGE','service_role attendance INSERT',
  case when to_regclass('public.attendance') is not null
    then has_table_privilege('service_role','public.attendance','INSERT')
    else false end
union all
select 'PRIVILEGE','service_role attendance UPDATE',
  case when to_regclass('public.attendance') is not null
    then has_table_privilege('service_role','public.attendance','UPDATE')
    else false end
union all
select 'PRIVILEGE','authenticated office_settings SELECT',
  case when to_regclass('public.office_settings') is not null
    then has_table_privilege('authenticated','public.office_settings','SELECT')
    else false end
union all
select 'PRIVILEGE','service_role office_settings SELECT',
  case when to_regclass('public.office_settings') is not null
    then has_table_privilege('service_role','public.office_settings','SELECT')
    else false end
union all
select 'PRIVILEGE','authenticated geofence SELECT',
  case when to_regclass('public.attendance_geofence_settings') is not null
    then has_table_privilege('authenticated','public.attendance_geofence_settings','SELECT')
    else false end
union all
select 'PRIVILEGE','service_role geofence SELECT',
  case when to_regclass('public.attendance_geofence_settings') is not null
    then has_table_privilege('service_role','public.attendance_geofence_settings','SELECT')
    else false end
union all
select 'PRIVILEGE','service_role offline receipts SELECT',
  case when to_regclass('public.offline_action_receipts') is not null
    then has_table_privilege('service_role','public.offline_action_receipts','SELECT')
    else false end
union all
select 'PRIVILEGE','service_role offline receipts INSERT',
  case when to_regclass('public.offline_action_receipts') is not null
    then has_table_privilege('service_role','public.offline_action_receipts','INSERT')
    else false end
union all
select 'PRIVILEGE','service_role offline receipts UPDATE',
  case when to_regclass('public.offline_action_receipts') is not null
    then has_table_privilege('service_role','public.offline_action_receipts','UPDATE')
    else false end
union all
select 'PRIVILEGE','service_role notifications INSERT',
  case when to_regclass('public.notifications') is not null
    then has_table_privilege('service_role','public.notifications','INSERT')
    else false end
union all
select 'PRIVILEGE','service_role push_settings SELECT',
  case when to_regclass('public.push_settings') is not null
    then has_table_privilege('service_role','public.push_settings','SELECT')
    else false end
union all
select 'PRIVILEGE','service_role push_subscriptions SELECT',
  case when to_regclass('public.push_subscriptions') is not null
    then has_table_privilege('service_role','public.push_subscriptions','SELECT')
    else false end
union all
select 'PRIVILEGE','service_role push_outbox SELECT',
  case when to_regclass('public.push_outbox') is not null
    then has_table_privilege('service_role','public.push_outbox','SELECT')
    else false end;

-- E) Required attendance/settings RLS policies.
with wanted(table_name, policy_name) as (
  values
    ('attendance','attendance_employee_own_select'),
    ('office_settings','office_settings_active_employee_select'),
    ('attendance_geofence_settings','attendance_geofence_active_employee_select')
)
select
  'POLICY' as check_type,
  w.table_name || ':' || w.policy_name as item,
  exists (
    select 1
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = w.table_name
      and p.policyname = w.policy_name
  ) as ok
from wanted w
order by w.table_name;

-- F) Stage Checklist canonical columns and legacy blockers.
select
  'COLUMN' as check_type,
  'stage_checklist_items.workflow_template_stage_id' as item,
  exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='stage_checklist_items'
      and column_name='workflow_template_stage_id'
  ) as ok
union all
select 'COLUMN','stage_checklist_items.label',
  exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='stage_checklist_items'
      and column_name='label'
  )
union all
select 'LEGACY_NOT_NULL','stage_checklist_items.stage_id relaxed',
  not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='stage_checklist_items'
      and column_name='stage_id'
      and is_nullable='NO'
  )
union all
select 'LEGACY_NOT_NULL','stage_checklist_items.item_text relaxed',
  not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='stage_checklist_items'
      and column_name='item_text'
      and is_nullable='NO'
  );

-- G) Extensions / scheduler substrate required by automatic alerts + push.
with required(extname) as (
  values ('pg_cron'), ('pg_net')
)
select
  'EXTENSION' as check_type,
  required.extname as item,
  exists (
    select 1 from pg_extension e where e.extname = required.extname
  ) as ok
from required
order by required.extname;

select
  'SCHEDULER' as check_type,
  'cron.job relation available' as item,
  to_regclass('cron.job') is not null as ok;

-- H) Compact summary for quick tally.
with checks as (
  select 'function:' || x.name as item,
    exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=x.name
    ) as ok
  from (values
    ('has_app_permission'),
    ('employee_complete_stage_v4'),
    ('admin_complete_order_v1'),
    ('admin_delete_workflow_template_v1'),
    ('yf_scan_stuck_work_alerts'),
    ('yf_dispatch_push_outbox')
  ) x(name)
  union all
  select 'table:' || x.name,
    to_regclass('public.' || x.name) is not null
  from (values
    ('stage_checklist_items'),
    ('order_stage_checklist_items'),
    ('order_stage_checklist_checks'),
    ('offline_action_receipts'),
    ('audit_activity'),
    ('push_settings'),
    ('push_subscriptions'),
    ('push_outbox')
  ) x(name)
)
select
  'SUMMARY' as check_type,
  count(*) filter (where ok) || '/' || count(*) || ' core checks OK' as item,
  bool_and(ok) as ok
from checks;
