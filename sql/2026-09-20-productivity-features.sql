-- YashFlow productivity features foundation
-- Stage Checklist + Activity History + Offline Sync receipts + Stuck Alert receipts
-- Apply only after preview code is verified and before main/live merge.

begin;

create extension if not exists pgcrypto;

-- =========================================================
-- 1) Stage Checklist
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

create table if not exists public.order_stage_checklist_checks (
  id uuid primary key default gen_random_uuid(),
  order_stage_work_id uuid not null
    references public.order_stage_work(id) on delete cascade,
  checklist_item_id uuid not null
    references public.stage_checklist_items(id) on delete cascade,
  employee_id uuid null
    references public.employees(id) on delete set null,
  is_checked boolean not null default true,
  checked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_stage_work_id, checklist_item_id)
);

create index if not exists order_stage_checklist_checks_work_idx
  on public.order_stage_checklist_checks(order_stage_work_id);

alter table public.stage_checklist_items enable row level security;
alter table public.order_stage_checklist_checks enable row level security;

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
  v_template_stage_id uuid;
  v_required_count integer := 0;
  v_checked_count integer := 0;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status not in ('ready_for_approval', 'completed') then
    return new;
  end if;

  select wts.id
    into v_template_stage_id
  from public.orders o
  join public.workflow_template_stages wts
    on wts.template_id = o.workflow_template_id
   and wts.stage_id = new.stage_id
  where o.id = new.order_id
  order by wts.sequence_no
  limit 1;

  if v_template_stage_id is null then
    return new;
  end if;

  select count(*)
    into v_required_count
  from public.stage_checklist_items sci
  where sci.workflow_template_stage_id = v_template_stage_id
    and sci.is_active = true
    and sci.is_required = true;

  if v_required_count = 0 then
    return new;
  end if;

  select count(*)
    into v_checked_count
  from public.stage_checklist_items sci
  join public.order_stage_checklist_checks chk
    on chk.checklist_item_id = sci.id
   and chk.order_stage_work_id = new.id
   and chk.is_checked = true
  where sci.workflow_template_stage_id = v_template_stage_id
    and sci.is_active = true
    and sci.is_required = true;

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
-- 2) Unified Activity History
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
  v_old jsonb;
  v_new jsonb;
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
    v_new := to_jsonb(new);
    v_entity_id := coalesce(v_new->>'id', '');
    v_action := 'created';
    select coalesce(array_agg(key order by key), array[]::text[])
      into v_changed
    from jsonb_object_keys(v_new) as key
    where key not in ('created_at', 'updated_at');
  elsif tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_entity_id := coalesce(v_old->>'id', '');
    v_action := 'deleted';
    select coalesce(array_agg(key order by key), array[]::text[])
      into v_changed
    from jsonb_object_keys(v_old) as key
    where key not in ('created_at', 'updated_at');
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_entity_id := coalesce(v_new->>'id', v_old->>'id', '');
    v_action := 'updated';

    select coalesce(array_agg(n.key order by n.key), array[]::text[])
      into v_changed
    from jsonb_each(v_new) n
    where n.key not in ('created_at', 'updated_at')
      and (v_old -> n.key) is distinct from n.value;

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
    v_old,
    v_new
  );

  return coalesce(new, old);
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
-- 3) Offline replay idempotency
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

-- Server-only table. Do not add authenticated RLS policies.
alter table public.offline_action_receipts enable row level security;

-- =========================================================
-- 4) Stuck alert de-duplication
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

commit;
