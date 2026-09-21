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

-- Compatibility repair:
-- An earlier/partial database can already contain stage_checklist_items with
-- a legacy shape. CREATE TABLE IF NOT EXISTS does not repair that schema.
-- Normalize the columns used by the current YashFlow UI without deleting rows.
do $stage_checklist_compat$
declare
  v_row_count bigint := 0;
  v_null_count bigint := 0;
  v_id_type text;
begin
  select count(*) into v_row_count
  from public.stage_checklist_items;

  -- The current schema requires a UUID primary identifier because snapshot
  -- rows reference stage_checklist_items(id).
  select data_type into v_id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'stage_checklist_items'
    and column_name = 'id';

  if v_id_type is null then
    if v_row_count > 0 then
      raise exception
        'stage_checklist_items has % existing row(s) but no id column. Migration stopped to avoid destructive repair.',
        v_row_count;
    end if;

    alter table public.stage_checklist_items
      add column id uuid default gen_random_uuid();
  elsif v_id_type <> 'uuid' then
    raise exception
      'stage_checklist_items.id is %, expected uuid. Migration stopped to avoid unsafe type conversion.',
      v_id_type;
  end if;

  -- Normalize the workflow-template-stage foreign key.
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stage_checklist_items'
      and column_name = 'workflow_template_stage_id'
  ) then
    alter table public.stage_checklist_items
      add column workflow_template_stage_id uuid;
  end if;

  -- Copy a known legacy FK name when present. to_jsonb(row) lets this remain
  -- safe even when those legacy columns do not exist in a particular database.
  update public.stage_checklist_items t
  set workflow_template_stage_id =
    coalesce(
      t.workflow_template_stage_id,
      nullif(to_jsonb(t)->>'template_stage_id', '')::uuid
    )
  where t.workflow_template_stage_id is null
    and (to_jsonb(t) ? 'template_stage_id');

  -- A generic workflow_stage_id cannot safely identify one template-stage
  -- when the same workflow stage is reused by multiple templates.
  if exists (
    select 1
    from public.stage_checklist_items t
    where t.workflow_template_stage_id is null
      and (to_jsonb(t) ? 'workflow_stage_id')
  ) then
    raise exception
      'stage_checklist_items contains legacy workflow_stage_id values that cannot be mapped safely to workflow_template_stage_id. Existing rows were not modified.';
  end if;

  select count(*) into v_null_count
  from public.stage_checklist_items
  where workflow_template_stage_id is null;

  if v_null_count > 0 then
    raise exception
      'stage_checklist_items has % row(s) without workflow_template_stage_id. Migration stopped to avoid data loss.',
      v_null_count;
  end if;

  -- Normalize the display text used by the current Checklist UI.
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stage_checklist_items'
      and column_name = 'label'
  ) then
    alter table public.stage_checklist_items
      add column label text;
  end if;

  update public.stage_checklist_items t
  set label = coalesce(
    nullif(btrim(t.label), ''),
    nullif(btrim(to_jsonb(t)->>'name'), ''),
    nullif(btrim(to_jsonb(t)->>'title'), ''),
    nullif(btrim(to_jsonb(t)->>'item_name'), ''),
    nullif(btrim(to_jsonb(t)->>'step_name'), ''),
    nullif(btrim(to_jsonb(t)->>'checklist_item'), ''),
    nullif(btrim(to_jsonb(t)->>'description'), ''),
    'Checklist Item'
  )
  where t.label is null
     or btrim(t.label) = '';

  -- Normalize the remaining fields expected by app/admin/checklists.
  alter table public.stage_checklist_items
    add column if not exists sort_order integer default 10,
    add column if not exists is_required boolean default true,
    add column if not exists is_active boolean default true,
    add column if not exists created_at timestamptz default now(),
    add column if not exists updated_at timestamptz default now();

  update public.stage_checklist_items
  set
    sort_order = coalesce(sort_order, 10),
    is_required = coalesce(is_required, true),
    is_active = coalesce(is_active, true),
    created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now());

  alter table public.stage_checklist_items
    alter column workflow_template_stage_id set not null,
    alter column label set not null,
    alter column sort_order set default 10,
    alter column sort_order set not null,
    alter column is_required set default true,
    alter column is_required set not null,
    alter column is_active set default true,
    alter column is_active set not null,
    alter column created_at set default now(),
    alter column created_at set not null,
    alter column updated_at set default now(),
    alter column updated_at set not null;
end;
$stage_checklist_compat$;

do $stage_checklist_constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.stage_checklist_items'::regclass
      and contype = 'p'
  ) then
    alter table public.stage_checklist_items
      add constraint stage_checklist_items_pkey primary key (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.stage_checklist_items'::regclass
      and conname = 'stage_checklist_items_workflow_template_stage_id_fkey'
  ) then
    alter table public.stage_checklist_items
      add constraint stage_checklist_items_workflow_template_stage_id_fkey
      foreign key (workflow_template_stage_id)
      references public.workflow_template_stages(id)
      on delete cascade;
  end if;
end;
$stage_checklist_constraints$;

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

  if current_setting('yashflow.admin_direct_complete', true) = '1' then
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
-- 4) Atomic employee Stage Start
-- =========================================================

create or replace function public.employee_start_stage_v1(
  p_work_id uuid,
  p_expected_status text,
  p_action_at timestamptz default now(),
  p_action_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_employee_id uuid;
  v_work record;
  v_action_at timestamptz := coalesce(p_action_at, now());
begin
  select e.id
    into v_employee_id
  from public.employees e
  where e.auth_user_id = auth.uid()
    and e.approval_status = 'approved'
    and e.is_active = true
  limit 1;

  if v_employee_id is null then
    raise exception 'Active employee profile required';
  end if;

  select
    w.id,
    w.order_id,
    w.stage_id,
    w.status,
    w.primary_employee_id,
    w.started_at
  into v_work
  from public.order_stage_work w
  where w.id = p_work_id
  for update;

  if not found then
    raise exception 'Order Stage not found';
  end if;

  if not (
    v_work.primary_employee_id = v_employee_id
    or exists (
      select 1
      from public.order_stage_workers osw
      where osw.order_stage_work_id = v_work.id
        and osw.employee_id = v_employee_id
        and osw.left_at is null
    )
  ) then
    raise exception 'This Order Stage is not assigned to you';
  end if;

  if v_work.status = 'in_progress' then
    return jsonb_build_object(
      'ok', true,
      'already_started', true,
      'work_id', v_work.id
    );
  end if;

  if v_work.status is distinct from p_expected_status then
    raise exception
      'Stage status changed from % to %',
      p_expected_status,
      v_work.status;
  end if;

  if v_work.status not in ('assigned', 'rework') then
    raise exception 'Stage cannot start from status %', v_work.status;
  end if;

  if v_action_at > now() + interval '5 minutes'
     or v_action_at < now() - interval '24 hours' then
    raise exception 'Captured Start time is outside the allowed sync window';
  end if;

  update public.order_stage_work
  set
    status = 'in_progress',
    started_at = coalesce(started_at, v_action_at),
    updated_at = now()
  where id = v_work.id;

  update public.orders
  set
    workflow_status = 'in_progress',
    updated_at = now()
  where id = v_work.order_id;

  insert into public.order_workflow_history (
    order_id,
    order_stage_work_id,
    action_type,
    from_stage_id,
    to_stage_id,
    from_status,
    to_status,
    employee_id,
    note
  )
  values (
    v_work.order_id,
    v_work.id,
    case
      when p_action_id is null then 'employee_started_work'
      else 'employee_started_work_offline_sync'
    end,
    v_work.stage_id,
    v_work.stage_id,
    v_work.status,
    'in_progress',
    v_employee_id,
    case
      when p_action_id is null then null
      else 'Offline action synced • ' || p_action_id
    end
  );

  return jsonb_build_object(
    'ok', true,
    'already_started', false,
    'work_id', v_work.id,
    'started_at', coalesce(v_work.started_at, v_action_at)
  );
end;
$$;

revoke all on function public.employee_start_stage_v1(uuid, text, timestamptz, text) from public;
grant execute on function public.employee_start_stage_v1(uuid, text, timestamptz, text) to authenticated;

-- =========================================================
-- 5) Offline replay receipts
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
-- 6) Automatic stuck / overdue alert engine
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
        make_interval(mins => ds.delay_minutes::int)

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
