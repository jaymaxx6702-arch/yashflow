-- YashFlow Push server privileges
-- Keeps server-side push APIs functional with Supabase secret/service_role keys.
-- Safe to re-run.

begin;

grant usage on schema public to service_role;

grant select
on table public.employees
to service_role;

grant select, insert, update
on table public.push_settings
to service_role;

grant select, insert, update
on table public.push_subscriptions
to service_role;

grant select, update
on table public.push_outbox
to service_role;

grant select
on table public.notifications
to service_role;

grant execute
on function public.yf_dispatch_push_outbox()
to service_role;

commit;
