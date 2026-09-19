-- Targeted fix for 27 Wooden Mement Shop products.
-- Uses the exact active YashFlow product UUID confirmed in Supabase.

begin;

with mappings(shop_product_id, yashflow_product_id) as (
values
  ('yl-31850300', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid),
  ('yl-31851402', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid),
  ('yl-31851471', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid),
  ('yl-32176581', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid),
  ('yl-32176587', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid),
  ('yl-32176603', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid),
  ('yl-32176609', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid),
  ('yl-32176612', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid),
  ('yl-32176651', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid),
  ('yl-32176872', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid),
  ('yl-32176876', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid),
  ('yl-32176892', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid),
  ('yl-32176895', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid),
  ('yl-32176911', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid),
  ('yl-32176912', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid),
  ('yl-32178561', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid),
  ('yl-32178564', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid),
  ('yl-32178569', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid),
  ('yl-32178584', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid),
  ('yl-32178599', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid),
  ('yl-32178608', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid),
  ('yl-32346160', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid),
  ('yl-32346167', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid),
  ('yl-32798381', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid),
  ('yl-32818384', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid),
  ('yl-32868888', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid),
  ('yl-32869658', '99c4aa83-479c-4c63-b07c-88de79999766'::uuid)
)
insert into public.website_product_mappings (
  shop_product_id,
  yashflow_product_id,
  is_active,
  updated_at
)
select
  m.shop_product_id,
  m.yashflow_product_id,
  true,
  now()
from mappings m
join public.products p
  on p.id = m.yashflow_product_id
 and p.is_active = true
on conflict (shop_product_id)
do update set
  yashflow_product_id = excluded.yashflow_product_id,
  is_active = true,
  updated_at = now();

commit;

select
  p.name as yashflow_product,
  count(*) as mapped_shop_products
from public.website_product_mappings w
join public.products p on p.id = w.yashflow_product_id
where w.is_active = true
group by p.name
order by p.name;

select count(*) as total_active_mappings
from public.website_product_mappings
where is_active = true;
