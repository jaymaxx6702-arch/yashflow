-- YashFlow Stage Team Plan + Closed-App Web Push
-- Apply after:
-- 1) 2026-09-20-order-task-change-notifications.sql
-- 2) 2026-09-20-productivity-features.sql

begin;

create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- =========================================================
-- 1) Per-order Stage Team Plan snapshot
-- =========================================================

create table if not exists public.order_stage_plans (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  workflow_template_stage_id uuid null
    references public.workflow_template_stages(id) on delete set null,
  stage_id uuid not null references public.workflow_stages(id) on delete restrict,
  sequence_no integer not null,
  primary_employee_id uuid null references public.employees(id) on delete set null,
  source text not null default 'default'
    check (source in ('default', 'override', 'auto')),
  activated_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id, stage_id)
);

create index if not exists order_stage_plans_order_sequence_idx
  on public.order_stage_plans(order_id, sequence_no);

create table if not exists public.order_stage_plan_workers (
  id uuid primary key default gen_random_uuid(),
  order_stage_plan_id uuid not null
    references public.order_stage_plans(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  worker_role text not null check (worker_role in ('primary', 'support')),
  created_at timestamptz not null default now(),
  unique(order_stage_plan_id, employee_id)
);

create index if not exists order_stage_plan_workers_employee_idx
  on public.order_stage_plan_workers(employee_id, order_stage_plan_id);

alter table public.order_stage_plans enable row level security;
alter table public.order_stage_plan_workers enable row level security;

drop policy if exists "order_stage_plans_read_assigned" on public.order_stage_plans;
create policy "order_stage_plans_read_assigned"
on public.order_stage_plans
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
        or order_stage_plans.primary_employee_id = e.id
        or exists (
          select 1
          from public.order_stage_plan_workers pw
          where pw.order_stage_plan_id = order_stage_plans.id
            and pw.employee_id = e.id
        )
      )
  )
);

drop policy if exists "order_stage_plans_admin_manage" on public.order_stage_plans;
create policy "order_stage_plans_admin_manage"
on public.order_stage_plans
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

drop policy if exists "order_stage_plan_workers_read_self" on public.order_stage_plan_workers;
create policy "order_stage_plan_workers_read_self"
on public.order_stage_plan_workers
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
        or order_stage_plan_workers.employee_id = e.id
      )
  )
);

drop policy if exists "order_stage_plan_workers_admin_manage" on public.order_stage_plan_workers;
create policy "order_stage_plan_workers_admin_manage"
on public.order_stage_plan_workers
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

-- When a future stage becomes actual work, force the saved Stage Plan.
create or replace function public.yf_apply_stage_plan_before_work()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan record;
begin
  select p.id, p.primary_employee_id
    into v_plan
  from public.order_stage_plans p
  where p.order_id = new.order_id
    and p.stage_id = new.stage_id
  limit 1;

  if not found then
    return new;
  end if;

  new.primary_employee_id := v_plan.primary_employee_id;

  if new.primary_employee_id is not null
     and new.status = 'waiting' then
    new.status := 'assigned';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_yf_apply_stage_plan_before_work on public.order_stage_work;
create trigger trg_yf_apply_stage_plan_before_work
before insert on public.order_stage_work
for each row
execute function public.yf_apply_stage_plan_before_work();

-- Suppress template/default workers that are not in the saved plan and
-- suppress duplicate worker inserts from later workflow logic.
create or replace function public.yf_enforce_stage_plan_worker()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_role text;
begin
  select p.id
    into v_plan_id
  from public.order_stage_work w
  join public.order_stage_plans p
    on p.order_id = w.order_id
   and p.stage_id = w.stage_id
  where w.id = new.order_stage_work_id
  limit 1;

  if v_plan_id is null then
    if exists (
      select 1
      from public.order_stage_workers existing
      where existing.order_stage_work_id = new.order_stage_work_id
        and existing.employee_id = new.employee_id
        and existing.left_at is null
    ) then
      return null;
    end if;

    return new;
  end if;

  select pw.worker_role
    into v_role
  from public.order_stage_plan_workers pw
  where pw.order_stage_plan_id = v_plan_id
    and pw.employee_id = new.employee_id
  limit 1;

  if v_role is null then
    return null;
  end if;

  if exists (
    select 1
    from public.order_stage_workers existing
    where existing.order_stage_work_id = new.order_stage_work_id
      and existing.employee_id = new.employee_id
      and existing.left_at is null
  ) then
    return null;
  end if;

  new.worker_role := v_role;
  return new;
end;
$$;

drop trigger if exists trg_yf_enforce_stage_plan_worker on public.order_stage_workers;
create trigger trg_yf_enforce_stage_plan_worker
before insert on public.order_stage_workers
for each row
execute function public.yf_enforce_stage_plan_worker();

create or replace function public.yf_activate_stage_plan_after_work()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
begin
  select p.id
    into v_plan_id
  from public.order_stage_plans p
  where p.order_id = new.order_id
    and p.stage_id = new.stage_id
  limit 1;

  if v_plan_id is null then
    return new;
  end if;

  update public.order_stage_plans
  set activated_at = coalesce(activated_at, now()),
      updated_at = now()
  where id = v_plan_id;

  insert into public.order_stage_workers (
    order_stage_work_id,
    employee_id,
    worker_role
  )
  select
    new.id,
    pw.employee_id,
    pw.worker_role
  from public.order_stage_plan_workers pw
  where pw.order_stage_plan_id = v_plan_id
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists trg_yf_activate_stage_plan_after_work on public.order_stage_work;
create trigger trg_yf_activate_stage_plan_after_work
after insert on public.order_stage_work
for each row
execute function public.yf_activate_stage_plan_after_work();

-- Inform planned staff as soon as the Order is created.
create or replace function public.yf_notify_stage_plan_worker()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_order record;
  v_plan record;
  v_stage_name text;
begin
  select p.order_id, p.stage_id, p.sequence_no
    into v_plan
  from public.order_stage_plans p
  where p.id = new.order_stage_plan_id;

  select
    o.id,
    o.order_number,
    o.product_name,
    o.current_stage_id
  into v_order
  from public.orders o
  where o.id = v_plan.order_id;

  select ws.name
    into v_stage_name
  from public.workflow_stages ws
  where ws.id = v_plan.stage_id;

  perform public.yf_notify_employee(
    new.employee_id,
    'order_assignment',
    case
      when v_order.current_stage_id = v_plan.stage_id
        then 'New Order Assigned'
      else 'Upcoming Order'
    end,
    v_order.order_number || ' • ' ||
    coalesce(v_order.product_name, 'Order') || ' • ' ||
    coalesce(v_stage_name, 'Stage') ||
    case
      when v_order.current_stage_id = v_plan.stage_id
        then ' • કામ હવે તમારા Stageમાં છે.'
      else ' • આ Order આગળ તમારા Stageમાં આવશે. તૈયારી રાખો.'
    end,
    'order',
    v_order.id
  );

  return new;
end;
$$;

drop trigger if exists trg_yf_notify_stage_plan_worker on public.order_stage_plan_workers;
create trigger trg_yf_notify_stage_plan_worker
after insert on public.order_stage_plan_workers
for each row
execute function public.yf_notify_stage_plan_worker();

-- =========================================================
-- 2) Closed-App Web Push subscriptions + outbox
-- =========================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  endpoint text not null unique,
  p256dh text null,
  auth_secret text null,
  user_agent text null,
  is_active boolean not null default true,
  last_notification_id uuid null references public.notifications(id) on delete set null,
  last_success_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_employee_idx
  on public.push_subscriptions(employee_id, is_active);

alter table public.push_subscriptions enable row level security;

create table if not exists public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  attempts integer not null default 0,
  last_error text null,
  sent_at timestamptz null,
  created_at timestamptz not null default now(),
  unique(notification_id)
);

create index if not exists push_outbox_pending_idx
  on public.push_outbox(sent_at, created_at);

alter table public.push_outbox enable row level security;

create table if not exists public.push_settings (
  id integer primary key check (id = 1),
  public_key text null,
  private_jwk jsonb null,
  vapid_subject text not null default 'mailto:admin@yashlaser.in',
  process_url text null,
  process_token text not null default gen_random_uuid()::text,
  cron_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.push_settings enable row level security;

insert into public.push_settings (id)
values (1)
on conflict (id) do nothing;

create or replace function public.yf_queue_push_outbox()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.push_outbox (
    notification_id,
    employee_id
  )
  values (
    new.id,
    new.employee_id
  )
  on conflict (notification_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_yf_queue_push_outbox on public.notifications;
create trigger trg_yf_queue_push_outbox
after insert on public.notifications
for each row
execute function public.yf_queue_push_outbox();

create or replace function public.yf_dispatch_push_outbox()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings record;
  v_request_id bigint;
begin
  select *
    into v_settings
  from public.push_settings
  where id = 1;

  if not found
     or not coalesce(v_settings.cron_enabled, false)
     or nullif(v_settings.process_url, '') is null then
    return jsonb_build_object(
      'ok', true,
      'dispatched', false,
      'reason', 'push cron disabled'
    );
  end if;

  select net.http_post(
    url := v_settings.process_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-YashFlow-Push-Token', v_settings.process_token
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  )
  into v_request_id;

  return jsonb_build_object(
    'ok', true,
    'dispatched', true,
    'request_id', v_request_id
  );
end;
$$;

revoke all on function public.yf_dispatch_push_outbox() from public;
revoke all on function public.yf_dispatch_push_outbox() from authenticated;
grant execute on function public.yf_dispatch_push_outbox() to service_role;

do $job$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'yashflow-push-outbox'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'yashflow-push-outbox',
    '* * * * *',
    'select public.yf_dispatch_push_outbox();'
  );
end;
$job$;

commit;
