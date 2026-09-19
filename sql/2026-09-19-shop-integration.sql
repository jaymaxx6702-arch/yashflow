-- YashFlow website/shop integration mapping.
begin;

create table if not exists public.website_product_mappings (
  id uuid primary key default gen_random_uuid(),
  shop_product_id text not null unique,
  yashflow_product_id uuid not null references public.products(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.website_order_imports (
  id uuid primary key default gen_random_uuid(),
  shop_order_id text not null,
  shop_order_no text not null,
  shop_order_item_id text not null unique,
  yashflow_order_id uuid not null references public.orders(id) on delete cascade,
  payload_hash text,
  imported_at timestamptz not null default now()
);

create index if not exists website_order_imports_shop_order_idx
  on public.website_order_imports(shop_order_id);

alter table public.website_product_mappings enable row level security;
alter table public.website_order_imports enable row level security;

-- Admin may manage product mappings.
drop policy if exists "website_product_mappings_admin_all" on public.website_product_mappings;
create policy "website_product_mappings_admin_all"
on public.website_product_mappings
for all
to authenticated
using (
  exists (
    select 1 from public.employees e
    where e.auth_user_id = auth.uid()
      and e.role = 'admin'
      and e.approval_status = 'approved'
      and e.is_active = true
  )
)
with check (
  exists (
    select 1 from public.employees e
    where e.auth_user_id = auth.uid()
      and e.role = 'admin'
      and e.approval_status = 'approved'
      and e.is_active = true
  )
);

-- Import records are server/service-role only.
revoke all on public.website_order_imports from anon, authenticated;
grant all on public.website_order_imports to service_role;
grant all on public.website_product_mappings to service_role;

commit;
