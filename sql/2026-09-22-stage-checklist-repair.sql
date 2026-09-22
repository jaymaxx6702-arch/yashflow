-- YashFlow Stage Checklist repair (safe/idempotent)
-- Run in Supabase SQL Editor BEFORE deploying the matching frontend.
-- Repairs legacy/partial checklist schemas without deleting checklist data.

begin;

create extension if not exists pgcrypto;

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

do $repair_master$
declare
  v_rows bigint := 0;
  v_id_type text;
  v_unmapped bigint := 0;
begin
  select count(*) into v_rows from public.stage_checklist_items;

  select data_type into v_id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'stage_checklist_items'
    and column_name = 'id';

  if v_id_type is null then
    if v_rows > 0 then
      raise exception
        'stage_checklist_items has rows but no id column; manual inspection required.';
    end if;

    alter table public.stage_checklist_items
      add column id uuid default gen_random_uuid();
  elsif v_id_type <> 'uuid' then
    raise exception
      'stage_checklist_items.id type is %, expected uuid; manual inspection required.',
      v_id_type;
  end if;

  alter table public.stage_checklist_items
    add column if not exists workflow_template_stage_id uuid,
    add column if not exists label text,
    add column if not exists sort_order integer default 10,
    add column if not exists is_required boolean default true,
    add column if not exists is_active boolean default true,
    add column if not exists created_at timestamptz default now(),
    add column if not exists updated_at timestamptz default now();

  -- Known legacy name: template_stage_id.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stage_checklist_items'
      and column_name = 'template_stage_id'
  ) then
    execute $sql$
      update public.stage_checklist_items
      set workflow_template_stage_id =
        coalesce(workflow_template_stage_id, template_stage_id::uuid)
      where workflow_template_stage_id is null
        and template_stage_id is not null
    $sql$;
  end if;

  -- If legacy rows carry template_id + workflow_stage_id, map exactly.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stage_checklist_items'
      and column_name = 'template_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stage_checklist_items'
      and column_name = 'workflow_stage_id'
  ) then
    execute $sql$
      update public.stage_checklist_items sci
      set workflow_template_stage_id = wts.id
      from public.workflow_template_stages wts
      where sci.workflow_template_stage_id is null
        and sci.template_id::uuid = wts.template_id
        and sci.workflow_stage_id::uuid = wts.stage_id
    $sql$;
  end if;

  -- Generic workflow_stage_id can be repaired only when the mapping is unique.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stage_checklist_items'
      and column_name = 'workflow_stage_id'
  ) then
    execute $sql$
      with unique_stage_map as (
        select
          wts.stage_id,
          (array_agg(wts.id order by wts.sequence_no, wts.id))[1]
            as workflow_template_stage_id
        from public.workflow_template_stages wts
        group by wts.stage_id
        having count(*) = 1
      )
      update public.stage_checklist_items sci
      set workflow_template_stage_id = m.workflow_template_stage_id
      from unique_stage_map m
      where sci.workflow_template_stage_id is null
        and sci.workflow_stage_id::uuid = m.stage_id
    $sql$;
  end if;

  update public.stage_checklist_items t
  set
    label = coalesce(
      nullif(btrim(t.label), ''),
      nullif(btrim(to_jsonb(t)->>'name'), ''),
      nullif(btrim(to_jsonb(t)->>'title'), ''),
      nullif(btrim(to_jsonb(t)->>'item_name'), ''),
      nullif(btrim(to_jsonb(t)->>'step_name'), ''),
      nullif(btrim(to_jsonb(t)->>'checklist_item'), ''),
      nullif(btrim(to_jsonb(t)->>'description'), ''),
      'Checklist Item'
    ),
    sort_order = coalesce(t.sort_order, 10),
    is_required = coalesce(t.is_required, true),
    is_active = coalesce(t.is_active, true),
    created_at = coalesce(t.created_at, now()),
    updated_at = coalesce(t.updated_at, now());

  select count(*) into v_unmapped
  from public.stage_checklist_items
  where workflow_template_stage_id is null;

  if v_unmapped > 0 then
    raise exception
      'Stage Checklist repair stopped: % legacy row(s) cannot be mapped safely to a Product Workflow Stage.',
      v_unmapped;
  end if;

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
$repair_master$;

do $master_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.stage_checklist_items'::regclass
      and contype = 'p'
  ) then
    alter table public.stage_checklist_items
      add constraint stage_checklist_items_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint
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
$master_constraints$;

create index if not exists stage_checklist_items_template_stage_idx
  on public.stage_checklist_items(workflow_template_stage_id, sort_order);

alter table public.stage_checklist_items enable row level security;

drop policy if exists "stage_checklist_items_read" on public.stage_checklist_items;
create policy "stage_checklist_items_read"
on public.stage_checklist_items
for select to authenticated
using (true);

drop policy if exists "stage_checklist_items_admin_manage" on public.stage_checklist_items;
create policy "stage_checklist_items_admin_manage"
on public.stage_checklist_items
for all to authenticated
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

create table if not exists public.order_stage_checklist_items (
  id uuid primary key default gen_random_uuid(),
  order_stage_work_id uuid not null
    references public.order_stage_work(id) on delete cascade,
  source_checklist_item_id uuid null
    references public.stage_checklist_items(id) on delete set null,
  label text not null,
  sort_order integer not null default 10,
  is_required boolean not null default true,
  created_at timestamptz not null default now()
);

do $repair_snapshot_id$
declare
  v_rows bigint := 0;
  v_id_type text;
begin
  select count(*) into v_rows
  from public.order_stage_checklist_items;

  select data_type into v_id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'order_stage_checklist_items'
    and column_name = 'id';

  if v_id_type is null then
    if v_rows > 0 then
      raise exception
        'order_stage_checklist_items has rows but no id column; manual inspection required.';
    end if;
    alter table public.order_stage_checklist_items
      add column id uuid default gen_random_uuid();
  elsif v_id_type <> 'uuid' then
    raise exception
      'order_stage_checklist_items.id type is %, expected uuid.',
      v_id_type;
  end if;
end;
$repair_snapshot_id$;

alter table public.order_stage_checklist_items
  add column if not exists order_stage_work_id uuid,
  add column if not exists source_checklist_item_id uuid,
  add column if not exists label text,
  add column if not exists sort_order integer default 10,
  add column if not exists is_required boolean default true,
  add column if not exists created_at timestamptz default now();

update public.order_stage_checklist_items t
set
  source_checklist_item_id = coalesce(
    t.source_checklist_item_id,
    case
      when to_jsonb(t) ? 'checklist_item_id'
        then nullif(to_jsonb(t)->>'checklist_item_id', '')::uuid
      else null
    end
  ),
  label = coalesce(
    nullif(btrim(t.label), ''),
    nullif(btrim(to_jsonb(t)->>'name'), ''),
    nullif(btrim(to_jsonb(t)->>'title'), ''),
    'Checklist Item'
  ),
  sort_order = coalesce(t.sort_order, 10),
  is_required = coalesce(t.is_required, true),
  created_at = coalesce(t.created_at, now());

do $snapshot_guard$
begin
  if exists (
    select 1
    from public.order_stage_checklist_items
    where order_stage_work_id is null
  ) then
    raise exception
      'order_stage_checklist_items contains legacy rows without order_stage_work_id.';
  end if;
end;
$snapshot_guard$;

alter table public.order_stage_checklist_items
  alter column order_stage_work_id set not null,
  alter column label set not null,
  alter column sort_order set not null,
  alter column is_required set not null,
  alter column created_at set not null;

do $snapshot_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_stage_checklist_items'::regclass
      and contype = 'p'
  ) then
    alter table public.order_stage_checklist_items
      add constraint order_stage_checklist_items_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_stage_checklist_items'::regclass
      and conname = 'order_stage_checklist_items_order_stage_work_id_fkey'
  ) then
    alter table public.order_stage_checklist_items
      add constraint order_stage_checklist_items_order_stage_work_id_fkey
      foreign key (order_stage_work_id)
      references public.order_stage_work(id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_stage_checklist_items'::regclass
      and conname = 'order_stage_checklist_items_source_checklist_item_id_fkey'
  ) then
    alter table public.order_stage_checklist_items
      add constraint order_stage_checklist_items_source_checklist_item_id_fkey
      foreign key (source_checklist_item_id)
      references public.stage_checklist_items(id)
      on delete set null;
  end if;
end;
$snapshot_constraints$;

create unique index if not exists order_stage_checklist_items_work_source_uidx
  on public.order_stage_checklist_items(order_stage_work_id, source_checklist_item_id);

create index if not exists order_stage_checklist_items_work_idx
  on public.order_stage_checklist_items(order_stage_work_id, sort_order);

alter table public.order_stage_checklist_items enable row level security;

drop policy if exists "order_stage_checklist_items_read" on public.order_stage_checklist_items;
create policy "order_stage_checklist_items_read"
on public.order_stage_checklist_items
for select to authenticated
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
join public.orders o on o.id = w.order_id
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
  updated_at timestamptz not null default now()
);

do $repair_checks_id$
declare
  v_rows bigint := 0;
  v_id_type text;
begin
  select count(*) into v_rows
  from public.order_stage_checklist_checks;

  select data_type into v_id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'order_stage_checklist_checks'
    and column_name = 'id';

  if v_id_type is null then
    if v_rows > 0 then
      raise exception
        'order_stage_checklist_checks has rows but no id column; manual inspection required.';
    end if;
    alter table public.order_stage_checklist_checks
      add column id uuid default gen_random_uuid();
  elsif v_id_type <> 'uuid' then
    raise exception
      'order_stage_checklist_checks.id type is %, expected uuid.',
      v_id_type;
  end if;
end;
$repair_checks_id$;

alter table public.order_stage_checklist_checks
  add column if not exists order_stage_work_id uuid,
  add column if not exists snapshot_item_id uuid,
  add column if not exists employee_id uuid,
  add column if not exists is_checked boolean default true,
  add column if not exists checked_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.order_stage_checklist_checks t
set
  snapshot_item_id = coalesce(
    t.snapshot_item_id,
    case
      when to_jsonb(t) ? 'checklist_item_id'
        then nullif(to_jsonb(t)->>'checklist_item_id', '')::uuid
      else null
    end
  ),
  is_checked = coalesce(t.is_checked, true),
  checked_at = coalesce(t.checked_at, now()),
  updated_at = coalesce(t.updated_at, now());

do $checks_guard$
begin
  if exists (
    select 1
    from public.order_stage_checklist_checks
    where order_stage_work_id is null
       or snapshot_item_id is null
  ) then
    raise exception
      'order_stage_checklist_checks contains legacy rows without work/snapshot mapping.';
  end if;
end;
$checks_guard$;

alter table public.order_stage_checklist_checks
  alter column order_stage_work_id set not null,
  alter column snapshot_item_id set not null,
  alter column is_checked set not null,
  alter column checked_at set not null,
  alter column updated_at set not null;

do $checks_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_stage_checklist_checks'::regclass
      and contype = 'p'
  ) then
    alter table public.order_stage_checklist_checks
      add constraint order_stage_checklist_checks_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_stage_checklist_checks'::regclass
      and conname = 'order_stage_checklist_checks_order_stage_work_id_fkey'
  ) then
    alter table public.order_stage_checklist_checks
      add constraint order_stage_checklist_checks_order_stage_work_id_fkey
      foreign key (order_stage_work_id)
      references public.order_stage_work(id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_stage_checklist_checks'::regclass
      and conname = 'order_stage_checklist_checks_snapshot_item_id_fkey'
  ) then
    alter table public.order_stage_checklist_checks
      add constraint order_stage_checklist_checks_snapshot_item_id_fkey
      foreign key (snapshot_item_id)
      references public.order_stage_checklist_items(id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_stage_checklist_checks'::regclass
      and conname = 'order_stage_checklist_checks_employee_id_fkey'
  ) then
    alter table public.order_stage_checklist_checks
      add constraint order_stage_checklist_checks_employee_id_fkey
      foreign key (employee_id)
      references public.employees(id)
      on delete set null;
  end if;
end;
$checks_constraints$;

create unique index if not exists order_stage_checklist_checks_work_snapshot_uidx
  on public.order_stage_checklist_checks(order_stage_work_id, snapshot_item_id);

create index if not exists order_stage_checklist_checks_work_idx
  on public.order_stage_checklist_checks(order_stage_work_id);

alter table public.order_stage_checklist_checks enable row level security;

drop policy if exists "order_stage_checklist_checks_read" on public.order_stage_checklist_checks;
create policy "order_stage_checklist_checks_read"
on public.order_stage_checklist_checks
for select to authenticated
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
for all to authenticated
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

  select count(*) into v_required_count
  from public.order_stage_checklist_items item
  where item.order_stage_work_id = new.id
    and item.is_required = true;

  if v_required_count = 0 then
    return new;
  end if;

  select count(*) into v_checked_count
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

commit;

-- Quick verification
select
  (select count(*) from public.stage_checklist_items) as checklist_definitions,
  (select count(*) from public.order_stage_checklist_items) as checklist_snapshots,
  (select count(*) from public.order_stage_checklist_checks) as checklist_checks;
