-- YashFlow final live feature audit (READ ONLY)
-- Safe to run in Supabase SQL Editor after runtime permission repairs.

-- A) Required functions/RPCs for the final hardening feature set.
with required(name) as (
  values
    ('has_app_permission'),
    ('employee_start_stage_v1'),
    ('employee_complete_stage_v4'),
    ('employee_waive_stage_proof'),
    ('admin_complete_order_v1'),
    ('admin_delete_workflow_template_v1'),
    ('admin_approve_leave_with_handover'),
    ('save_order_dispatch'),
    ('create_purchase_order'),
    ('receive_purchase_stock'),
    ('cancel_purchase_order'),
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

-- B) Core tables introduced/used by productivity + checklist features.
with required(name) as (
  values
    ('stage_checklist_items'),
    ('order_stage_checklist_items'),
    ('order_stage_checklist_checks'),
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

-- C) Important triggers.
with wanted(table_name, trigger_hint) as (
  values
    ('notifications', 'push'),
    ('order_stage_work', 'checklist'),
    ('order_stage_work', 'audit'),
    ('orders', 'audit'),
    ('tasks', 'audit'),
    ('attendance', 'audit')
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

-- D) Attendance runtime privileges used by Employee + server APIs.
select
  'PRIVILEGE' as check_type,
  'authenticated attendance SELECT' as item,
  has_table_privilege('authenticated','public.attendance','SELECT') as ok
union all
select
  'PRIVILEGE',
  'service_role attendance SELECT',
  has_table_privilege('service_role','public.attendance','SELECT')
union all
select
  'PRIVILEGE',
  'service_role attendance INSERT',
  has_table_privilege('service_role','public.attendance','INSERT')
union all
select
  'PRIVILEGE',
  'service_role attendance UPDATE',
  has_table_privilege('service_role','public.attendance','UPDATE')
union all
select
  'PRIVILEGE',
  'service_role office_settings SELECT',
  has_table_privilege('service_role','public.office_settings','SELECT')
union all
select
  'PRIVILEGE',
  'service_role geofence SELECT',
  has_table_privilege('service_role','public.attendance_geofence_settings','SELECT')
union all
select
  'PRIVILEGE',
  'service_role offline receipts SELECT',
  has_table_privilege('service_role','public.offline_action_receipts','SELECT')
union all
select
  'PRIVILEGE',
  'service_role offline receipts INSERT',
  has_table_privilege('service_role','public.offline_action_receipts','INSERT')
union all
select
  'PRIVILEGE',
  'service_role offline receipts UPDATE',
  has_table_privilege('service_role','public.offline_action_receipts','UPDATE')
union all
select
  'PRIVILEGE',
  'service_role notifications INSERT',
  has_table_privilege('service_role','public.notifications','INSERT');

-- E) Required employee attendance/settings RLS policies.
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
select
  'COLUMN',
  'stage_checklist_items.label',
  exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='stage_checklist_items'
      and column_name='label'
  )
union all
select
  'LEGACY_NOT_NULL',
  'stage_checklist_items.stage_id relaxed',
  not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='stage_checklist_items'
      and column_name='stage_id'
      and is_nullable='NO'
  )
union all
select
  'LEGACY_NOT_NULL',
  'stage_checklist_items.item_text relaxed',
  not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='stage_checklist_items'
      and column_name='item_text'
      and is_nullable='NO'
  );

-- G) Scheduled jobs for automatic alerts/push.
select
  'CRON' as check_type,
  jobname as item,
  active as ok
from cron.job
where jobname in ('yashflow-stuck-alert-scan','yashflow-push-outbox')
order by jobname;
