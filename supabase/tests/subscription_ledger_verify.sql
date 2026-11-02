-- READ-ONLY, aggregate/catalog-only verification. No business/customer/payment
-- rows, secret references or mutating RPC calls are returned by this file.
BEGIN READ ONLY;

SELECT n.nspname AS schema_name, c.relname AS table_name,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls,
       NOT has_schema_privilege('anon',n.oid,'USAGE') AS anon_schema_denied,
       NOT has_schema_privilege('authenticated',n.oid,'USAGE') AS authenticated_schema_denied,
       NOT has_schema_privilege('service_role',n.oid,'USAGE') AS service_schema_denied,
       NOT (has_table_privilege('anon',c.oid,'SELECT') OR has_table_privilege('anon',c.oid,'INSERT') OR has_table_privilege('anon',c.oid,'UPDATE') OR has_table_privilege('anon',c.oid,'DELETE')) AS anon_table_denied,
       NOT (has_table_privilege('authenticated',c.oid,'SELECT') OR has_table_privilege('authenticated',c.oid,'INSERT') OR has_table_privilege('authenticated',c.oid,'UPDATE') OR has_table_privilege('authenticated',c.oid,'DELETE')) AS authenticated_table_denied,
       NOT (has_table_privilege('service_role',c.oid,'SELECT') OR has_table_privilege('service_role',c.oid,'INSERT') OR has_table_privilege('service_role',c.oid,'UPDATE') OR has_table_privilege('service_role',c.oid,'DELETE')) AS service_table_denied
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='subscription_private' AND c.relkind='r'
ORDER BY c.relname;

SELECT n.nspname AS schema_name,p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer,p.proconfig AS configuration,
       has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='subscription_private' OR
 p.oid IN (
  to_regprocedure('public.subscription_open_checkout(uuid,uuid,uuid,text,text,bigint,text,text)'),
  to_regprocedure('public.subscription_bind_checkout(uuid,uuid,uuid,text)'),
  to_regprocedure('public.subscription_activate_payment(uuid,uuid,uuid,text,text,bigint,text,text,text,text)'))
ORDER BY n.nspname,p.proname;

-- Inspect every grantee, not only known client roles. An unrelated inherited
-- default ACL can otherwise escape a fixed-role checklist (even with BYPASSRLS).
WITH objects AS (
 SELECT 'schema'::text AS object_kind,n.nspname AS object_name,
        n.nspowner AS owner_oid,n.nspacl AS acl,'n'::"char" AS acl_kind,false AS public_rpc
 FROM pg_namespace n WHERE n.nspname='subscription_private'
 UNION ALL
 SELECT 'table',n.nspname||'.'||c.relname,c.relowner,c.relacl,'r'::"char",false
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='subscription_private' AND c.relkind='r'
 UNION ALL
 SELECT 'function',n.nspname||'.'||p.oid::regprocedure::text,p.proowner,p.proacl,'f'::"char",n.nspname='public'
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='subscription_private' OR
  p.oid IN (
   to_regprocedure('public.subscription_open_checkout(uuid,uuid,uuid,text,text,bigint,text,text)'),
   to_regprocedure('public.subscription_bind_checkout(uuid,uuid,uuid,text)'),
   to_regprocedure('public.subscription_activate_payment(uuid,uuid,uuid,text,text,bigint,text,text,text,text)'))
)
SELECT o.object_kind,o.object_name,count(*) FILTER (
 WHERE a.grantee<>o.owner_oid AND NOT (
   o.public_rpc AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='service_role')
   AND a.privilege_type='EXECUTE' AND NOT a.is_grantable
 )) AS unexpected_acl_count
FROM objects o CROSS JOIN LATERAL aclexplode(coalesce(o.acl,acldefault(o.acl_kind,o.owner_oid))) a
GROUP BY o.object_kind,o.object_name
ORDER BY o.object_kind,o.object_name;

SELECT n.nspname AS schema_name,c.relname AS table_name,t.tgname AS trigger_name,
       t.tgenabled AS enabled,pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='subscription_private' AND NOT t.tgisinternal
ORDER BY c.relname,t.tgname;

SELECT con.conname AS constraint_name,con.conrelid::regclass::text AS relation,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con JOIN pg_namespace n ON n.oid=con.connamespace
WHERE n.nspname='subscription_private'
ORDER BY con.conrelid::regclass::text,con.conname;

SELECT
 (SELECT count(*) FROM subscription_private.checkout_intents) AS checkout_count,
 (SELECT count(*) FROM subscription_private.activation_receipts) AS receipt_count,
 (SELECT count(*) FROM subscription_private.activation_receipts r
  LEFT JOIN subscription_private.checkout_intents i ON i.id=r.checkout_id
  WHERE i.id IS NULL OR i.restaurant_id<>r.restaurant_id OR i.owner_id<>r.owner_id
   OR i.provider_order_id IS DISTINCT FROM r.provider_order_id
   OR i.plan_code<>r.plan_code OR i.billing_cycle<>r.billing_cycle
   OR i.amount_paise<>r.amount_paise OR i.currency<>r.currency
   OR i.provider_key_id<>r.provider_key_id) AS receipt_binding_mismatches,
 (SELECT count(*)-count(DISTINCT provider_payment_id) FROM subscription_private.activation_receipts) AS duplicate_payment_count,
 (SELECT count(*)-count(DISTINCT provider_order_id) FROM subscription_private.activation_receipts) AS duplicate_order_count;

COMMIT;
