-- Read-only post-install inspection. Safe to run against the explicitly selected
-- development target; no fixture identities or JWT settings are installed here.
begin transaction read only;

select current_database() as database_name, host(inet_server_addr()) as server_address,
       current_user as database_role, version() as postgres_version;

-- Nine new tables; RLS must be enabled on every table.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
       has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE') as authenticated_direct_write,
       has_table_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as service_access
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in (
  'commerce_websites','commerce_memberships','commerce_applications',
  'commerce_categories','commerce_products','commerce_customers',
  'commerce_orders','commerce_order_items','commerce_audit_logs'
)
order by c.relname;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename like 'commerce\_%' escape '\')
   or (schemaname = 'storage' and tablename = 'objects' and policyname like 'commerce\_%' escape '\')
order by schemaname, tablename, policyname;

-- Only the public catalog is anonymous; Admin is service-role-only.
select p.oid::regprocedure as function_signature, p.prosecdef as security_definer,
       p.proconfig as function_settings,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'commerce_public_catalog','commerce_submit_application','commerce_owner_action',
  'commerce_create_cod_order','commerce_admin_action'
)
order by p.proname;

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'commerce-media';

select c.conrelid::regclass as table_name, c.conname,
       pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.connamespace = 'public'::regnamespace
  and c.conrelid in ('public.commerce_products'::regclass,
                    'public.commerce_orders'::regclass,
                    'public.commerce_order_items'::regclass)
  and c.contype = 'f'
order by table_name, c.conname;

-- Expected zero rows: activation and ownership invariants.
select w.id, w.slug, w.status
from public.commerce_websites w
where w.status = 'active' and (
  w.business_type = 'pharmacy' or not exists (
    select 1 from public.commerce_memberships m join auth.users u on u.id = m.user_id
    where m.website_id = w.id and m.role = 'owner' and m.active
      and u.email_confirmed_at is not null
  )
);

-- Expected zero rows: neither tracking nor order totals may become negative.
select id, website_id, stock_quantity from public.commerce_products where stock_quantity < 0;
select id, website_id, total_paise, subtotal_paise, delivery_fee_paise
from public.commerce_orders
where total_paise <> subtotal_paise + delivery_fee_paise or total_paise < 0;

-- Uses safe RPC output only; exposes no customer, subscription, or audit data.
select slug, status,
       public.commerce_public_catalog(slug) is not null as catalog_visible,
       (status = 'active' and business_type <> 'pharmacy' and features->'catalog' = 'true'::jsonb) as catalog_expected
from public.commerce_websites order by slug;

commit;
