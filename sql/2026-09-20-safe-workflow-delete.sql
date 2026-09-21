-- YashFlow: safe atomic workflow-template deletion
-- Deletes child stage/team configuration only when no Order uses the template.

begin;

create or replace function public.admin_delete_workflow_template_v1(
  p_template_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_admin_id uuid;
  v_template record;
  v_order_count integer;
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

  select wt.id, wt.name, wt.is_default
    into v_template
  from public.workflow_templates wt
  where wt.id = p_template_id
  for update;

  if not found then
    raise exception 'Workflow template not found';
  end if;

  if v_template.is_default then
    raise exception 'Default workflow cannot be deleted';
  end if;

  select count(*)
    into v_order_count
  from public.orders o
  where o.workflow_template_id = p_template_id;

  if v_order_count > 0 then
    raise exception 'Workflow is used by % order(s). Deactivate it instead.', v_order_count;
  end if;

  delete from public.workflow_template_stage_workers w
  where w.workflow_template_stage_id in (
    select s.id
    from public.workflow_template_stages s
    where s.template_id = p_template_id
  );

  delete from public.workflow_template_stages s
  where s.template_id = p_template_id;

  delete from public.workflow_templates wt
  where wt.id = p_template_id;

  return jsonb_build_object(
    'ok', true,
    'template_id', p_template_id,
    'name', v_template.name
  );
end;
$$;

revoke all on function public.admin_delete_workflow_template_v1(uuid) from public;
grant execute on function public.admin_delete_workflow_template_v1(uuid) to authenticated;

commit;
