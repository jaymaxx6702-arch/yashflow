-- YashFlow productivity + resilience foundation
-- Stage Checklist Snapshot + Activity History + Offline receipts + Automatic Stuck Alerts
-- Apply before deploying the matching frontend.

begin;

create extension if not exists pgcrypto;
create extension if not exists pg_cron;

-- =========================================================
-- 1) Stage Checklist master definitions
-- =========================================================

create table if not exists public.stage_checklist_items (
  id uuid primary key default gen_random_uuid(),
  workflow_template_stage_id uuid not null
    references public.workflow_template_stages(id) on delete cascade,
  label text not null,
  sort_order integer not null default 10,
  is_required boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stage_checklist_items_template_stage_idx
  on public.stage_checklist_items(workflow_template_stage_id, sort_order);

alter table public.stage_checklist_items enable row level security;

drop policy if exists "stage_checklist_items_read" on public.stage_checklist_items;
create policy "stage_checklist_items_read"
on public.stage_checklist_items
for select
to authenticated
using (true);

drop policy if exists "stage_checklist_items_admin_manage" on public.stage_checklist_items;
create policy "stage_checklist_items_admin_manage"
on public.stage_checklist_items
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

-- =========================================================
-- 2) Immutable per-order-stage checklist snapshot
-- =========================================================

create table if not exists public.order_stage_checklist_items (
  id uuid primary key default gen_random_uuid(),
  order_stage_work_id uuid not null
    references public.order_stage_work(id) on delete cascade,
  source_checklist_item_id uuid null
    references public.stage_checklist_items(id) on delete set null,
  label text not null,
  sort_order integer not null default 10,
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  unique(order_stage_work_id, source_checklist_item_id)
);

create index if not exists order_stage_checklist_items_work_idx
  on public.order_stage_checklist_items(order_stage_work_id, sort_order);

alter table public.order_stage_checklist_items enable row level security;

drop policy if exists "order_stage_checklist_items_read" on public.order_stage_checklist_items;
create policy "order_stage_checklist_items_read"
on public.order_stage_checklist_items
for select
to authenticated
using (
  exists (
    select 1
    from public.employees e
    join public.order_stage_work w
      on w.id = order_stage_checklist_items.order_stage_work_id
    where e.auth_user_id = auth.uid()
      and e.approval_status = 'approved'
      and e.is_active = true
      and (
        e.role = 'admin'
        or w.primary_employee_id = e.id
        or exists (
          select 1
          from public.order_stage_workers osw
          where osw.order_stage_work_id = w.id
            and osw.employee_id = e.id
            and osw.left_at is null
        )
      )
  )
);

create or replace function public.yf_snapshot_stage_checklist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.order_stage_checklist_items (
    order_stage_work_id,
    source_checklist_item_id,
    label,
    sort_order,
    is_required
  )
  select
    new.id,
    sci.id,
    sci.label,
    sci.sort_order,
    sci.is_required
  from public.orders o
  join public.workflow_template_stages wts
    on wts.template_id = o.workflow_template_id
   and wts.stage_id = new.stage_id
  join public.stage_checklist_items sci
    on sci.workflow_template_stage_id = wts.id
   and sci.is_active = true
  where o.id = new.order_id
  order by sci.sort_order
  on conflict (order_stage_work_id, source_checklist_item_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_yf_snapshot_stage_checklist on public.order_stage_work;
create trigger trg_yf_snapshot_stage_checklist
after insert on public.order_stage_work
for each row
execute function public.yf_snapshot_stage_checklist();

-- Backfill any currently existing stage work once, using the checklist definition
-- that exists at the time this migration is applied.
insert into public.order_stage_checklist_items (
  order_stage_work_id,
  source_checklist_item_id,
  label,
  sort_order,
  is_required
)
select
  w.id,
  sci.id,
  sci.label,
  sci.sort_order,
  sci.is_required
from public.order_stage_work w
join public.orders o
  on o.id = w.order_id
join public.workflow_template_stages wts
  on wts.template_id = o.workflow_template_id
 and wts.stage_id = w.stage_id
join public.stage_checklist_items sci
  on sci.workflow_template_stage_id = wts.id
 and sci.is_active = true
on conflict (order_stage_work_id, source_checklist_item_id) do nothing;

create table if not exists public.order_stage_checklist_checks (
  id uuid primary key default gen_random_uuid(),
  order_stage_work_id uuid not null
    references public.order_stage_work(id) on delete cascade,
  snapshot_item_id uuid not null
    references public.order_stage_checklist_items(id) on delete cascade,
  employee_id uuid null
    references public.employees(id) on delete set null,
  is_checked boolean not null default true,
  checked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_stage_work_id, snapshot_item_id)
);

create index if not exists order_stage_checklist_checks_work_idx
  on public.order_stage_checklist_checks(order_stage_work_id);

alter table public.order_stage_checklist_checks enable row level security;

drop policy if exists "order_stage_checklist_checks_read" on public.order_stage_checklist_checks;
create policy "order_stage_checklist_checks_read"
on public.order_stage_checklist_checks
for select
to authenticated
using (
  exists (
    select 1
    from public.employees e
    join public.order_stage_work w
      on w.id = order_stage_checklist_checks.order_stage_work_id
    where e.auth_user_id = auth.uid()
      and e.approval_status = 'approved'
      and e.is_active = true
      and (
        e.role = 'admin'
        or w.primary_employee_id = e.id
        or exists (
          select 1
          from public.order_stage_workers osw
          where osw.order_stage_work_id = w.id
            and osw.employee_id = e.id
            and osw.left_at is null
        )
      )
  )
);

drop policy if exists "order_stage_checklist_checks_employee_manage" on public.order_stage_checklist_checks;
create policy "order_stage_checklist_checks_employee_manage"
on public.order_stage_checklist_checks
for all
to authenticated
using (
  exists (
    select 1
    from public.employees e
    join public.order_stage_work w
      on w.id = order_stage_checklist_checks.order_stage_work_id
    where e.auth_user_id = auth.uid()
      and e.approval_status = 'approved'
      and e.is_active = true
      and (
        e.role = 'admin'
        or w.primary_employee_id = e.id
        or exists (
          select 1
          from public.order_stage_workers osw
          where osw.order_stage_work_id = w.id
            and osw.employee_id = e.id
            and osw.left_at is null
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.employees e
    join public.order_stage_work w
      on w.id = order_stage_checklist_checks.order_stage_work_id
    where e.auth_user_id = auth.uid()
      and e.approval_status = 'approved'
      and e.is_active = true
      and (
        e.role = 'admin'
        or w.primary_employee_id = e.id
        or exists (
          select 1
          from public.order_stage_workers osw
          where osw.order_stage_work_id = w.id
            and osw.employee_id = e.id
            and osw.left_at is null
        )
      )
  )
);

create or replace function public.yf_guard_required_stage_checklist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_required_count integer := 0;
  v_checked_count integer := 0;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status not in ('ready_for_approval', 'completed') then
    return new;
  end if;

  select count(*)
    into v_required_count
  from public.order_stage_checklist_items item
  where item.order_stage_work_id = new.id
    and item.is_required = true;

  if v_required_count = 0 then
    return new;
  end if;

  select count(*)
    into v_checked_count
  from public.order_stage_checklist_items item
  join public.order_stage_checklist_checks chk
    on chk.snapshot_item_id = item.id
   and chk.order_stage_work_id = new.id
   and chk.is_checked = true
  where item.order_stage_work_id = new.id
    and item.is_required = true;

  if v_checked_count < v_required_count then
    raise exception
      'Stage Checklist incomplete: % of % required items checked.',
      v_checked_count,
      v_required_count;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_yf_guard_required_stage_checklist on public.order_stage_work;
create trigger trg_yf_guard_required_stage_checklist
before update of status on public.order_stage_work
for each row
execute function public.yf_guard_required_stage_checklist();

-- =========================================================
-- 3) Unified Activity History (store update diffs, not full duplicate rows)
-- =========================================================

create table if not exists public.audit_activity (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  actor_employee_id uuid null references public.employees(id) on delete set null,
  changed_fields text[] not null default '{}',
  old_data jsonb null,
  new_data jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists audit_activity_created_idx
  on public.audit_activity(created_at desc);

create index if not exists audit_activity_entity_idx
  on public.audit_activity(entity_type, entity_id, created_at desc);

alter table public.audit_activity enable row level security;

drop policy if exists "audit_activity_admin_read" on public.audit_activity;
create policy "audit_activity_admin_read"
on public.audit_activity
for select
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
);

create or replace function public.yf_audit_activity()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_employee_id uuid;
  v_old_full jsonb;
  v_new_full jsonb;
  v_old_diff jsonb;
  v_new_diff jsonb;
  v_changed text[] := array[]::text[];
  v_entity_id text;
  v_action text;
begin
  select e.id
    into v_actor_employee_id
  from public.employees e
  where e.auth_user_id = auth.uid()
  limit 1;

  if tg_op = 'INSERT' then
    v_new_full := to_jsonb(new);
    v_entity_id := coalesce(v_new_full->>'id', '');
    v_action := 'created';
    v_new_diff := v_new_full - 'updated_at';

    select coalesce(array_agg(k.key order by k.key), array[]::text[])
      into v_changed
    from jsonb_object_keys(v_new_diff) as k(key);

  elsif tg_op = 'DELETE' then
    v_old_full := to_jsonb(old);
    v_entity_id := coalesce(v_old_full->>'id', '');
    v_action := 'deleted';
    v_old_diff := v_old_full - 'updated_at';

    select coalesce(array_agg(k.key order by k.key), array[]::text[])
      into v_changed
    from jsonb_object_keys(v_old_diff) as k(key);

  else
    v_old_full := to_jsonb(old);
    v_new_full := to_jsonb(new);
    v_entity_id := coalesce(v_new_full->>'id', v_old_full->>'id', '');
    v_action := 'updated';

    select
      coalesce(array_agg(n.key order by n.key), array[]::text[]),
      coalesce(jsonb_object_agg(n.key, v_old_full -> n.key), '{}'::jsonb),
      coalesce(jsonb_object_agg(n.key, n.value), '{}'::jsonb)
    into v_changed, v_old_diff, v_new_diff
    from jsonb_each(v_new_full) n
    where n.key not in ('created_at', 'updated_at')
      and (v_old_full -> n.key) is distinct from n.value;

    if coalesce(array_length(v_changed, 1), 0) = 0 then
      return new;
    end if;
  end if;

  insert into public.audit_activity (
    entity_type,
    entity_id,
    action,
    actor_employee_id,
    changed_fields,
    old_data,
    new_data
  )
  values (
    tg_argv[0],
    v_entity_id,
    v_action,
    v_actor_employee_id,
    v_changed,
    v_old_diff,
    v_new_diff
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_yf_audit_orders on public.orders;
create trigger trg_yf_audit_orders
after insert or update or delete on public.orders
for each row execute function public.yf_audit_activity('order');

drop trigger if exists trg_yf_audit_order_stage_work on public.order_stage_work;
create trigger trg_yf_audit_order_stage_work
after insert or update or delete on public.order_stage_work
for each row execute function public.yf_audit_activity('order_stage');

drop trigger if exists trg_yf_audit_tasks on public.tasks;
create trigger trg_yf_audit_tasks
after insert or update or delete on public.tasks
for each row execute function public.yf_audit_activity('task');

drop trigger if exists trg_yf_audit_attendance on public.attendance;
create trigger trg_yf_audit_attendance
after insert or update or delete on public.attendance
for each row execute function public.yf_audit_activity('attendance');

drop trigger if exists trg_yf_audit_order_workers on public.order_stage_workers;
create trigger trg_yf_audit_order_workers
after insert or update or delete on public.order_stage_workers
for each row execute function public.yf_audit_activity('order_worker');

drop trigger if exists trg_yf_audit_task_support on public.task_support_workers;
create trigger trg_yf_audit_task_support
after insert or update or delete on public.task_support_workers
for each row execute function public.yf_audit_activity('task_support');

-- =========================================================
-- 4) Offline replay receipts
-- =========================================================

create table if not exists public.offline_action_receipts (
  action_id text primary key,
  employee_id uuid not null references public.employees(id) on delete cascade,
  action_type text not null,
  response jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists offline_action_receipts_employee_idx
  on public.offline_action_receipts(employee_id, created_at desc);

alter table public.offline_action_receipts enable row level security;

-- =========================================================
-- 5) Automatic stuck / overdue alert engine
-- =========================================================

create table if not exists public.stuck_alert_receipts (
  alert_key text primary key,
  related_type text not null,
  related_id text not null,
  alert_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists stuck_alert_receipts_date_idx
  on public.stuck_alert_receipts(alert_date desc);

alter table public.stuck_alert_receipts enable row level security;

create or replace function public.yf_scan_stuck_work_alerts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_alert record;
  v_inserted integer;
  v_created integer := 0;
begin
  for v_alert in
    select
      'stage:' || w.id::text || ':' || v_today::text as alert_key,
      'order'::text as related_type,
      o.id::text as related_id,
      'Workflow Delay Alert'::text as title,
      (
        o.order_number || ' • ' ||
        coalesce(ws.name, 'Stage') || ' • ' ||
        w.status || ' ' ||
        floor(extract(epoch from (now() - w.status_changed_at)) / 60)::int ||
        ' minથી અટકેલું છે.'
      )::text as message
    from public.order_stage_work w
    join public.orders o on o.id = w.order_id
    left join public.workflow_stages ws on ws.id = w.stage_id
    join public.workflow_delay_settings ds
      on ds.status = w.status
     and ds.enabled = true
    where w.status in (
      'waiting',
      'assigned',
      'in_progress',
      'ready_for_approval',
      'hold',
      'rework'
    )
      and w.status_changed_at is not null
      and coalesce(ds.delay_minutes, 0) > 0
      and now() - w.status_changed_at >=
        make_interval(mins => ds.delay_minutes)

    union all

    select
      'order-due:' || o.id::text || ':' || v_today::text,
      'order',
      o.id::text,
      'Overdue Order',
      (
        o.order_number || ' • ' ||
        coalesce(o.customer_name, 'Customer') ||
        ' • Due ' || o.due_date::text
      )
    from public.orders o
    where o.due_date is not null
      and o.due_date::date < v_today
      and coalesce(o.current_stage, '') not in ('completed', 'cancelled')
      and coalesce(o.workflow_status, '') not in ('completed', 'cancelled')

    union all

    select
      'task-due:' || t.id::text || ':' || v_today::text,
      'task',
      t.id::text,
      'Overdue Task',
      (
        t.title || ' • Due ' || t.due_date::text ||
        ' • ' || coalesce(t.priority::text, 'normal') || ' priority'
      )
    from public.tasks t
    where t.due_date is not null
      and t.due_date::date < v_today
      and t.status in ('pending', 'in_progress')
  loop
    insert into public.stuck_alert_receipts (
      alert_key,
      related_type,
      related_id,
      alert_date
    )
    values (
      v_alert.alert_key,
      v_alert.related_type,
      v_alert.related_id,
      v_today
    )
    on conflict (alert_key) do nothing;

    get diagnostics v_inserted = row_count;

    if v_inserted = 0 then
      continue;
    end if;

    insert into public.notifications (
      employee_id,
      notification_type,
      title,
      message,
      related_type,
      related_id
    )
    select
      e.id,
      'escalation',
      v_alert.title,
      v_alert.message,
      v_alert.related_type,
      v_alert.related_id::uuid
    from public.employees e
    where e.role = 'admin'
      and e.approval_status = 'approved'
      and e.is_active = true;

    v_created := v_created + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'created', v_created,
    'date', v_today
  );
end;
$$;

revoke all on function public.yf_scan_stuck_work_alerts() from public;
revoke all on function public.yf_scan_stuck_work_alerts() from authenticated;
grant execute on function public.yf_scan_stuck_work_alerts() to service_role;

-- Keep one scheduled job. Supabase pg_cron runs this independently of
-- whether an Admin has the dashboard open.
do $job$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'yashflow-stuck-alert-scan'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'yashflow-stuck-alert-scan',
    '*/15 * * * *',
    'select public.yf_scan_stuck_work_alerts();'
  );
end;
$job$;

commit;
