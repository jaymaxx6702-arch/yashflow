-- YashFlow: centralized Order + Task employee notifications
-- Purpose:
-- 1) Any meaningful Order/Task change creates an employee notification.
-- 2) Primary + active Support employees are covered.
-- 3) Assignment/support add/remove is covered at relationship-table level.
-- 4) Frontend bell/realtime handles the notification tone.
--
-- Apply this migration before deploying the frontend cleanup that removes
-- duplicate manual notification inserts.

begin;

create or replace function public.yf_notify_employee(
  p_employee_id uuid,
  p_notification_type text,
  p_title text,
  p_message text,
  p_related_type text,
  p_related_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_employee_id is null then
    return;
  end if;

  -- One business action can touch orders + stage work in the same transaction.
  -- Avoid notification/tone storms for the same employee/entity within 2 seconds.
  if exists (
    select 1
    from public.notifications n
    where n.employee_id = p_employee_id
      and n.related_type = p_related_type
      and n.related_id = p_related_id
      and n.created_at >= now() - interval '2 seconds'
  ) then
    return;
  end if;

  insert into public.notifications (
    employee_id,
    notification_type,
    title,
    message,
    related_type,
    related_id
  )
  values (
    p_employee_id,
    p_notification_type,
    p_title,
    p_message,
    p_related_type,
    p_related_id
  );
end;
$$;

revoke all on function public.yf_notify_employee(uuid, text, text, text, text, uuid) from public;

create or replace function public.yf_notify_task_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
  v_changes text[] := array[]::text[];
  v_message text;
begin
  if tg_op = 'UPDATE' then
    if new.title is distinct from old.title then
      v_changes := array_append(v_changes, 'Title');
    end if;
    if new.description is distinct from old.description then
      v_changes := array_append(v_changes, 'Description');
    end if;
    if new.assigned_to is distinct from old.assigned_to then
      v_changes := array_append(v_changes, 'Primary Employee');
    end if;
    if new.priority is distinct from old.priority then
      v_changes := array_append(v_changes, 'Priority');
    end if;
    if new.status is distinct from old.status then
      v_changes := array_append(v_changes, 'Status');
    end if;
    if new.due_date is distinct from old.due_date then
      v_changes := array_append(v_changes, 'Due Date');
    end if;
    if new.employee_note is distinct from old.employee_note then
      v_changes := array_append(v_changes, 'Employee Note');
    end if;
    if new.admin_note is distinct from old.admin_note then
      v_changes := array_append(v_changes, 'Admin Note');
    end if;
    if new.started_at is distinct from old.started_at then
      v_changes := array_append(v_changes, 'Started');
    end if;
    if new.completed_at is distinct from old.completed_at then
      v_changes := array_append(v_changes, 'Completed');
    end if;

    -- Ignore timestamp-only/internal writes.
    if coalesce(array_length(v_changes, 1), 0) = 0 then
      return new;
    end if;

    v_message :=
      coalesce(new.title, 'Task') ||
      ' • Changed: ' ||
      array_to_string(v_changes, ', ');
  else
    v_message :=
      coalesce(new.title, 'Task') ||
      ' • Priority: ' ||
      coalesce(new.priority::text, 'normal');
  end if;

  -- Current primary employee.
  perform public.yf_notify_employee(
    new.assigned_to,
    case when tg_op = 'INSERT' then 'task_assignment' else 'task' end,
    case when tg_op = 'INSERT' then 'New Task Assigned' else 'Task Updated' end,
    v_message,
    'task',
    new.id
  );

  -- Current active support employees.
  for v_employee_id in
    select distinct tsw.employee_id
    from public.task_support_workers tsw
    where tsw.task_id = new.id
      and tsw.is_active = true
      and tsw.employee_id is distinct from new.assigned_to
  loop
    perform public.yf_notify_employee(
      v_employee_id,
      'task',
      case when tg_op = 'INSERT' then 'New Task' else 'Task Updated' end,
      v_message,
      'task',
      new.id
    );
  end loop;

  -- If primary assignment moved away from someone, tell the previous primary too.
  if tg_op = 'UPDATE'
     and old.assigned_to is not null
     and old.assigned_to is distinct from new.assigned_to then
    perform public.yf_notify_employee(
      old.assigned_to,
      'task_assignment',
      'Task Reassigned',
      coalesce(new.title, old.title, 'Task') || ' • Primary assignment changed.',
      'task',
      new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_yf_notify_task_change on public.tasks;
create trigger trg_yf_notify_task_change
after insert or update on public.tasks
for each row
execute function public.yf_notify_task_change();

create or replace function public.yf_notify_task_support_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_id uuid;
  v_employee_id uuid;
  v_title text;
  v_added boolean;
begin
  v_task_id := coalesce(new.task_id, old.task_id);
  v_employee_id := coalesce(new.employee_id, old.employee_id);

  select t.title
    into v_title
  from public.tasks t
  where t.id = v_task_id;

  if tg_op = 'INSERT' then
    v_added := coalesce(new.is_active, true);
  elsif tg_op = 'UPDATE' then
    if new.is_active is not distinct from old.is_active
       and new.employee_id is not distinct from old.employee_id then
      return new;
    end if;
    v_added := coalesce(new.is_active, false);
  else
    return old;
  end if;

  perform public.yf_notify_employee(
    v_employee_id,
    'task_assignment',
    case when v_added then 'Task Support Assigned' else 'Task Support Removed' end,
    coalesce(v_title, 'Task') ||
      case
        when v_added then ' • તમે Support Employee તરીકે add થયા છો.'
        else ' • તમારું Support assignment remove થયું છે.'
      end,
    'task',
    v_task_id
  );

  return new;
end;
$$;

drop trigger if exists trg_yf_notify_task_support_change on public.task_support_workers;
create trigger trg_yf_notify_task_support_change
after insert or update on public.task_support_workers
for each row
execute function public.yf_notify_task_support_change();

create or replace function public.yf_notify_order_team(
  p_order_id uuid,
  p_title text,
  p_message text,
  p_notification_type text default 'order_assignment'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
begin
  for v_employee_id in
    with active_work as (
      select w.id, w.primary_employee_id, w.status
      from public.order_stage_work w
      where w.order_id = p_order_id
      order by
        case
          when w.status in (
            'waiting',
            'assigned',
            'in_progress',
            'ready_for_approval',
            'hold',
            'rework'
          ) then 0
          else 1
        end,
        w.created_at desc
      limit 1
    ),
    team as (
      select aw.primary_employee_id as employee_id
      from active_work aw
      where aw.primary_employee_id is not null

      union

      select osw.employee_id
      from active_work aw
      join public.order_stage_workers osw
        on osw.order_stage_work_id = aw.id
      where
        aw.status not in (
          'waiting',
          'assigned',
          'in_progress',
          'ready_for_approval',
          'hold',
          'rework'
        )
        or osw.left_at is null
    )
    select distinct employee_id
    from team
    where employee_id is not null
  loop
    perform public.yf_notify_employee(
      v_employee_id,
      p_notification_type,
      p_title,
      p_message,
      'order',
      p_order_id
    );
  end loop;
end;
$$;

revoke all on function public.yf_notify_order_team(uuid, text, text, text) from public;

create or replace function public.yf_notify_order_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changes text[] := array[]::text[];
  v_message text;
begin
  if new.customer_name is distinct from old.customer_name then
    v_changes := array_append(v_changes, 'Customer');
  end if;
  if new.customer_mobile is distinct from old.customer_mobile then
    v_changes := array_append(v_changes, 'Mobile');
  end if;
  if new.product_name is distinct from old.product_name then
    v_changes := array_append(v_changes, 'Product');
  end if;
  if new.quantity is distinct from old.quantity then
    v_changes := array_append(v_changes, 'Quantity');
  end if;
  if new.priority is distinct from old.priority then
    v_changes := array_append(v_changes, 'Priority');
  end if;
  if new.due_date is distinct from old.due_date then
    v_changes := array_append(v_changes, 'Due Date');
  end if;
  if new.current_stage is distinct from old.current_stage
     or new.current_stage_id is distinct from old.current_stage_id then
    v_changes := array_append(v_changes, 'Stage');
  end if;
  if new.workflow_status is distinct from old.workflow_status then
    v_changes := array_append(v_changes, 'Workflow Status');
  end if;
  if new.workflow_mode is distinct from old.workflow_mode then
    v_changes := array_append(v_changes, 'Workflow Mode');
  end if;
  if new.customer_note is distinct from old.customer_note then
    v_changes := array_append(v_changes, 'Customer Note');
  end if;
  if new.admin_note is distinct from old.admin_note then
    v_changes := array_append(v_changes, 'Admin Note');
  end if;
  if new.completed_at is distinct from old.completed_at then
    v_changes := array_append(v_changes, 'Completion');
  end if;

  -- Ignore internal updated_at-only writes.
  if coalesce(array_length(v_changes, 1), 0) = 0 then
    return new;
  end if;

  v_message :=
    coalesce(new.order_number, 'Order') ||
    ' • Changed: ' ||
    array_to_string(v_changes, ', ');

  perform public.yf_notify_order_team(
    new.id,
    case
      when new.workflow_status = 'completed' and old.workflow_status is distinct from new.workflow_status
        then 'Order Completed'
      else 'Order Updated'
    end,
    v_message,
    'order_assignment'
  );

  return new;
end;
$$;

drop trigger if exists trg_yf_notify_order_change on public.orders;
create trigger trg_yf_notify_order_change
after update on public.orders
for each row
execute function public.yf_notify_order_change();

create or replace function public.yf_notify_order_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_number text;
  v_stage_name text;
  v_changes text[] := array[]::text[];
begin
  if new.status is distinct from old.status then
    v_changes := array_append(v_changes, 'Status');
  end if;
  if new.primary_employee_id is distinct from old.primary_employee_id then
    v_changes := array_append(v_changes, 'Primary Employee');
  end if;
  if new.hold_reason is distinct from old.hold_reason then
    v_changes := array_append(v_changes, 'Hold');
  end if;
  if new.rework_reason is distinct from old.rework_reason then
    v_changes := array_append(v_changes, 'Rework');
  end if;
  if new.started_at is distinct from old.started_at then
    v_changes := array_append(v_changes, 'Started');
  end if;
  if new.completed_at is distinct from old.completed_at then
    v_changes := array_append(v_changes, 'Completed');
  end if;

  if coalesce(array_length(v_changes, 1), 0) = 0 then
    return new;
  end if;

  select o.order_number, ws.name
    into v_order_number, v_stage_name
  from public.orders o
  left join public.workflow_stages ws on ws.id = new.stage_id
  where o.id = new.order_id;

  perform public.yf_notify_order_team(
    new.order_id,
    'Order Stage Updated',
    coalesce(v_order_number, 'Order') ||
      ' • ' ||
      coalesce(v_stage_name, 'Stage') ||
      ' • Changed: ' ||
      array_to_string(v_changes, ', '),
    'order_assignment'
  );

  -- If primary changed away from someone, inform the previous primary as well.
  if old.primary_employee_id is not null
     and old.primary_employee_id is distinct from new.primary_employee_id then
    perform public.yf_notify_employee(
      old.primary_employee_id,
      'order_assignment',
      'Order Assignment Changed',
      coalesce(v_order_number, 'Order') || ' • Primary assignment changed.',
      'order',
      new.order_id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_yf_notify_order_stage_change on public.order_stage_work;
create trigger trg_yf_notify_order_stage_change
after update on public.order_stage_work
for each row
execute function public.yf_notify_order_stage_change();

create or replace function public.yf_notify_order_worker_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_number text;
  v_stage_name text;
  v_added boolean;
begin
  select w.order_id, o.order_number, ws.name
    into v_order_id, v_order_number, v_stage_name
  from public.order_stage_work w
  join public.orders o on o.id = w.order_id
  left join public.workflow_stages ws on ws.id = w.stage_id
  where w.id = coalesce(new.order_stage_work_id, old.order_stage_work_id);

  if v_order_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_added := new.left_at is null;
  elsif tg_op = 'UPDATE' then
    if new.left_at is not distinct from old.left_at
       and new.employee_id is not distinct from old.employee_id
       and new.worker_role is not distinct from old.worker_role then
      return new;
    end if;
    v_added := new.left_at is null;
  else
    return old;
  end if;

  perform public.yf_notify_employee(
    coalesce(new.employee_id, old.employee_id),
    'order_assignment',
    case when v_added then 'Order Assigned' else 'Order Assignment Removed' end,
    coalesce(v_order_number, 'Order') ||
      ' • ' ||
      coalesce(v_stage_name, 'Stage') ||
      case
        when v_added then ' • તમને આ Stage માટે assign કરવામાં આવ્યા છે.'
        else ' • આ Stageમાંથી તમારું assignment remove થયું છે.'
      end,
    'order',
    v_order_id
  );

  return new;
end;
$$;

drop trigger if exists trg_yf_notify_order_worker_change on public.order_stage_workers;
create trigger trg_yf_notify_order_worker_change
after insert or update on public.order_stage_workers
for each row
execute function public.yf_notify_order_worker_change();

commit;
