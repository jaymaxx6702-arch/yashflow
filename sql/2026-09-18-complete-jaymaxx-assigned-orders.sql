-- YashFlow: Complete all active orders currently assigned to JayMaxx
-- Scope: orders visible under JayMaxx "My Assigned Orders" (Primary or Support Employee).
-- This is intentionally idempotent for already-completed orders.
-- Run in Supabase SQL Editor only when you want these assigned orders force-completed.

begin;

do $$
declare
  v_employee_count integer;
begin
  select count(*)
    into v_employee_count
  from public.employees
  where full_name = 'JayMaxx'
    and is_active = true;

  if v_employee_count <> 1 then
    raise exception 'Expected exactly 1 active employee named JayMaxx, found %', v_employee_count;
  end if;
end
$$;

create temporary table _yf_my_orders_to_complete
on commit drop
as
with me as (
  select id
  from public.employees
  where full_name = 'JayMaxx'
    and is_active = true
  limit 1
)
select distinct on (o.id)
  o.id as order_id,
  o.order_number,
  o.current_stage as from_stage,
  o.current_stage_id as from_stage_id,
  o.workflow_status as from_status,
  w.id as current_work_id,
  w.stage_id as work_stage_id,
  w.status as work_status,
  me.id as employee_id
from public.orders o
cross join me
join public.order_stage_work w
  on w.order_id = o.id
where coalesce(o.current_stage, '') not in ('completed', 'cancelled')
  and coalesce(o.workflow_status, '') not in ('completed', 'cancelled')
  and w.status in (
    'waiting',
    'assigned',
    'in_progress',
    'ready_for_approval',
    'hold',
    'rework'
  )
  and (
    w.primary_employee_id = me.id
    or exists (
      select 1
      from public.order_stage_workers osw
      where osw.order_stage_work_id = w.id
        and osw.employee_id = me.id
        and osw.left_at is null
    )
  )
order by o.id, w.created_at desc;

-- Close active team assignments for the target orders.
update public.order_stage_workers osw
set left_at = coalesce(osw.left_at, now())
where osw.left_at is null
  and exists (
    select 1
    from public.order_stage_work w
    join _yf_my_orders_to_complete t
      on t.order_id = w.order_id
    where w.id = osw.order_stage_work_id
      and w.status in (
        'waiting',
        'assigned',
        'in_progress',
        'ready_for_approval',
        'hold',
        'rework'
      )
  );

-- Close any active workflow work on those orders so no ghost task remains.
update public.order_stage_work w
set
  status = 'completed',
  completed_at = coalesce(w.completed_at, now()),
  approved_by = coalesce(w.approved_by, t.employee_id),
  approved_at = coalesce(w.approved_at, now()),
  updated_at = now()
from _yf_my_orders_to_complete t
where w.order_id = t.order_id
  and w.status in (
    'waiting',
    'assigned',
    'in_progress',
    'ready_for_approval',
    'hold',
    'rework'
  );

insert into public.order_stage_history (
  order_id,
  from_stage,
  to_stage,
  changed_by,
  note
)
select
  t.order_id,
  t.from_stage,
  'completed',
  t.employee_id,
  'Bulk completed by admin request'
from _yf_my_orders_to_complete t;

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
select
  t.order_id,
  t.current_work_id,
  'order_completed',
  t.work_stage_id,
  null,
  t.work_status,
  'completed',
  t.employee_id,
  'Bulk completed by admin request'
from _yf_my_orders_to_complete t;

update public.orders o
set
  current_stage = 'completed',
  current_stage_id = null,
  workflow_status = 'completed',
  completed_at = coalesce(o.completed_at, now()),
  updated_at = now()
from _yf_my_orders_to_complete t
where o.id = t.order_id;

-- Result shown before commit closes the temporary table.
select
  order_number,
  from_stage,
  from_status,
  'completed' as new_status
from _yf_my_orders_to_complete
order by order_number;

commit;
