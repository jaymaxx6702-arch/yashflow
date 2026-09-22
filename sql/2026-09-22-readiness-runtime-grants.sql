-- YashFlow readiness/runtime table grants
-- Safe/idempotent. Repairs table-level privileges while keeping RLS policies
-- responsible for row-level access.
--
-- Fixes Production Readiness failures for:
--   id_card_batches
--   id_card_entries
--   order_operation_details
--   order_stage_checklist_items
--   order_stage_checklist_checks

begin;

grant usage on schema public to authenticated, service_role;

do $runtime_grants$
begin
  -- Bulk ID Card module: RLS decides view/manage access.
  if to_regclass('public.id_card_batches') is not null then
    execute 'grant select, insert, update, delete on table public.id_card_batches to authenticated';
    execute 'grant select, insert, update, delete on table public.id_card_batches to service_role';
  end if;

  if to_regclass('public.id_card_entries') is not null then
    execute 'grant select, insert, update, delete on table public.id_card_entries to authenticated';
    execute 'grant select, insert, update, delete on table public.id_card_entries to service_role';
  end if;

  -- Order Production Details: current RLS exposes SELECT/INSERT/UPDATE only.
  if to_regclass('public.order_operation_details') is not null then
    execute 'grant select, insert, update on table public.order_operation_details to authenticated';
    execute 'grant select, insert, update on table public.order_operation_details to service_role';
  end if;

  -- Stage Checklist snapshots are created by DB trigger/security-definer code.
  -- Employees/admin only need direct read access.
  if to_regclass('public.order_stage_checklist_items') is not null then
    execute 'grant select on table public.order_stage_checklist_items to authenticated';
    execute 'grant select, insert, update, delete on table public.order_stage_checklist_items to service_role';
  end if;

  -- Checklist checks are toggled by authorized employees/admin under RLS.
  if to_regclass('public.order_stage_checklist_checks') is not null then
    execute 'grant select, insert, update, delete on table public.order_stage_checklist_checks to authenticated';
    execute 'grant select, insert, update, delete on table public.order_stage_checklist_checks to service_role';
  end if;
end
$runtime_grants$;

commit;

-- Verification: expected all existing rows below => true.
with wanted(role_name, table_name, privilege_name) as (
  values
    ('authenticated','id_card_batches','SELECT'),
    ('authenticated','id_card_entries','SELECT'),
    ('authenticated','order_operation_details','SELECT'),
    ('authenticated','order_stage_checklist_items','SELECT'),
    ('authenticated','order_stage_checklist_checks','SELECT'),
    ('authenticated','order_stage_checklist_checks','INSERT'),
    ('authenticated','order_stage_checklist_checks','UPDATE')
)
select
  role_name,
  table_name,
  privilege_name,
  case
    when to_regclass('public.' || table_name) is null then false
    else has_table_privilege(role_name, 'public.' || table_name, privilege_name)
  end as ok
from wanted
order by table_name, privilege_name;
