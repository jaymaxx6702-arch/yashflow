-- YashFlow: atomic admin direct-complete
-- Apply in Supabase before deploying the frontend that calls this RPC.

begin;

create or replace function public.admin_complete_order_v1(
  p_order_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_admin_id uuid;
  v_now timestamptz := now();
  v_order record;
  v_work record;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select e.id
    into v_admin_id
  from public.employees e
  where e.auth_user_id = auth.uid()
    and e.role = 'admin'
    and e.approval_status = 'approved'
    and e.is_active = true
  limit 1;

  if v_admin_id is null then
    raise exception 'Admin access required';
  end if;

  select
    o.id,
    o.order_number,
    o.current_stage,
    o.current_stage_id,
    o.workflow_status,
    o.completed_at
  into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if coalesce(v_order.workflow_status, '') = 'cancelled'
     or coalesce(v_order.current_stage, '') = 'cancelled' then
    raise exception 'Cancelled order cannot be completed';
  end if;

  if coalesce(v_order.workflow_status, '') = 'completed'
     or coalesce(v_order.current_stage, '') = 'completed' then
    return jsonb_build_object(
      'ok', true,
      'already_completed', true,
      'order_id', v_order.id,
      'order_number', v_order.order_number
    );
  end if;

  select
    w.id,
    w.stage_id,
    w.status
  into v_work
  from public.order_stage_work w
  where w.order_id = p_order_id
    and w.status in (
      'waiting',
      'assigned',
      'in_progress',
      'ready_for_approval',
      'hold',
      'rework'
    )
  order by w.created_at desc
  limit 1
  for update;

  -- Close active support/primary team links so no ghost assignment remains.
  update public.order_stage_workers osw
  set left_at = coalesce(osw.left_at, v_now)
  where osw.left_at is null
    and exists (
      select 1
      from public.order_stage_work w
      where w.id = osw.order_stage_work_id
        and w.order_id = p_order_id
        and w.status in (
          'waiting',
          'assigned',
          'in_progress',
          'ready_for_approval',
          'hold',
          'rework'
        )
    );

  -- Explicit audited admin override: Direct Complete is allowed to bypass
  -- the normal required Stage Checklist guard for this transaction only.
  perform set_config('yashflow.admin_direct_complete', '1', true);

  -- Close every active stage work for the order in this same transaction.
  update public.order_stage_work w
  set
    status = 'completed',
    completed_at = coalesce(w.completed_at, v_now),
    approved_by = coalesce(w.approved_by, v_admin_id),
    approved_at = coalesce(w.approved_at, v_now),
    updated_at = v_now
  where w.order_id = p_order_id
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
  values (
    p_order_id,
    v_order.current_stage,
    'completed',
    v_admin_id,
    coalesce(v_note, 'Admin direct completed order')
  );

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
    p_order_id,
    v_work.id,
    'order_completed',
    coalesce(v_work.stage_id, v_order.current_stage_id),
    null,
    coalesce(v_work.status, v_order.workflow_status),
    'completed',
    v_admin_id,
    coalesce(v_note, 'Admin direct completed order')
  );

  update public.orders
  set
    current_stage = 'completed',
    current_stage_id = null,
    workflow_status = 'completed',
    completed_at = coalesce(completed_at, v_now),
    updated_at = v_now
  where id = p_order_id;

  return jsonb_build_object(
    'ok', true,
    'already_completed', false,
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'completed_at', v_now
  );
end;
$$;

revoke all on function public.admin_complete_order_v1(uuid, text) from public;
grant execute on function public.admin_complete_order_v1(uuid, text) to authenticated;

commit;
