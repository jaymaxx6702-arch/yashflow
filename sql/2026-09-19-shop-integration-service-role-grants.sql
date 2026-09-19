-- Minimal service-role privileges required by the Yash Laser Shop -> YashFlow integration.
-- Run in the YashFlow Supabase SQL Editor.

begin;

grant usage on schema public to service_role;

-- Read-only production metadata used to resolve the mapped product and workflow.
grant select on table public.products to service_role;
grant select on table public.workflow_templates to service_role;
grant select on table public.workflow_template_stages to service_role;
grant select on table public.workflow_stages to service_role;

-- Order creation and duplicate detection.
grant select, insert on table public.orders to service_role;
grant select, insert on table public.order_product_configurations to service_role;
grant select, insert on table public.order_stage_history to service_role;
grant select, insert on table public.order_stage_work to service_role;
grant select, insert on table public.order_workflow_history to service_role;

-- Integration-owned tables (idempotent with the original integration migration).
grant select, insert, update on table public.website_product_mappings to service_role;
grant select, insert, update on table public.website_order_imports to service_role;

commit;

-- Verification: every row below should be true.
select
  has_table_privilege('service_role', 'public.products', 'SELECT') as products_select,
  has_table_privilege('service_role', 'public.workflow_templates', 'SELECT') as workflow_templates_select,
  has_table_privilege('service_role', 'public.workflow_template_stages', 'SELECT') as workflow_template_stages_select,
  has_table_privilege('service_role', 'public.workflow_stages', 'SELECT') as workflow_stages_select,
  has_table_privilege('service_role', 'public.orders', 'SELECT,INSERT') as orders_select_insert,
  has_table_privilege('service_role', 'public.order_product_configurations', 'SELECT,INSERT') as order_product_configurations_select_insert,
  has_table_privilege('service_role', 'public.order_stage_history', 'SELECT,INSERT') as order_stage_history_select_insert,
  has_table_privilege('service_role', 'public.order_stage_work', 'SELECT,INSERT') as order_stage_work_select_insert,
  has_table_privilege('service_role', 'public.order_workflow_history', 'SELECT,INSERT') as order_workflow_history_select_insert;
