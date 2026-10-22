-- All data below is fictional and exists only in the isolated commerce_test DB.
BEGIN;
CREATE SCHEMA commerce_test;
CREATE TABLE commerce_test.results(id bigint GENERATED ALWAYS AS IDENTITY, label text NOT NULL);
CREATE TABLE commerce_test.state(key text PRIMARY KEY, value jsonb NOT NULL);
GRANT USAGE ON SCHEMA commerce_test TO anon, authenticated, service_role;
GRANT SELECT ON commerce_test.state TO anon, authenticated, service_role;

CREATE FUNCTION commerce_test.check_true(ok boolean, label text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %', label; END IF;
  INSERT INTO commerce_test.results(label) VALUES (label);
END $$;
CREATE FUNCTION commerce_test.record(key text, value jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO commerce_test.state(key, value) VALUES (key, value)
  ON CONFLICT (key) DO UPDATE SET value = excluded.value
$$;
CREATE FUNCTION commerce_test.must_fail(statement text, label text, states text[] DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE failed boolean := false; actual text;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN failed := true; actual := SQLSTATE;
  END;
  PERFORM commerce_test.check_true(failed AND (states IS NULL OR actual = ANY(states)), label || coalesce(' [' || actual || ']', ''));
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA commerce_test TO anon, authenticated, service_role;

SELECT commerce_test.check_true((SELECT balance_paise = 123456 AND order_history = '[{"order":"existing","payment":"preserved"}]'::jsonb FROM public.legacy_preservation_fixture), 'existing balance and order-history fixture preserved');
SELECT commerce_test.check_true((SELECT s.acl IS NOT DISTINCT FROM c.relacl::text AND s.rls = c.relrowsecurity FROM commerce_test_bootstrap.guard_snapshot s CROSS JOIN pg_class c WHERE c.oid = 'public.legacy_preservation_fixture'::regclass), 'existing table privileges and RLS preserved');
SELECT commerce_test.check_true((SELECT policies = (SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'legacy_preservation_fixture') FROM commerce_test_bootstrap.guard_snapshot), 'existing RLS policy preserved');
SELECT commerce_test.check_true(EXISTS(SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'fixture_existing_storage_access'), 'existing storage policy preserved');
SELECT commerce_test.check_true((SELECT schedule='0 0 * * *' AND command='existing settlement fixture' AND active FROM cron.job WHERE jobid=1), 'existing scheduled-job fixture preserved');
SELECT commerce_test.check_true((SELECT public AND file_size_limit=5242880 AND allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp'] FROM storage.buckets WHERE id='commerce-media'), 'commerce media bucket has a bounded image-only upload configuration');
SELECT commerce_test.check_true(NOT has_function_privilege('anon','public.commerce_owner_action(uuid,text,jsonb)','EXECUTE') AND NOT has_function_privilege('anon','public.commerce_create_cod_order(uuid,jsonb,jsonb,text,uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.commerce_submit_application(jsonb)','EXECUTE'), 'inherited default grants do not expose private authenticated RPCs');
SELECT commerce_test.check_true(NOT has_function_privilege('authenticated','public.commerce_admin_action(text,jsonb,text)','EXECUTE') AND NOT has_function_privilege('anon','public.commerce_admin_action(text,jsonb,text)','EXECUTE') AND has_function_privilege('service_role','public.commerce_admin_action(text,jsonb,text)','EXECUTE'), 'Admin RPC retains service-only execution despite inherited default grants');
SELECT commerce_test.check_true(NOT has_function_privilege('anon','commerce_private.audit(uuid,text,uuid,jsonb,jsonb,text)','EXECUTE') AND NOT has_function_privilege('authenticated','commerce_private.audit(uuid,text,uuid,jsonb,jsonb,text)','EXECUTE') AND NOT has_function_privilege('service_role','commerce_private.audit(uuid,text,uuid,jsonb,jsonb,text)','EXECUTE'), 'private helper functions revoke inherited role execution');

INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
('10000000-0000-4000-8000-000000000001','owner-a@example.test',now()),
('10000000-0000-4000-8000-000000000002','owner-b@example.test',now()),
('10000000-0000-4000-8000-000000000003','buyer@example.test',now()),
('10000000-0000-4000-8000-000000000004','other-buyer@example.test',now()),
('10000000-0000-4000-8000-000000000005','unverified@example.test',NULL);
INSERT INTO public.commerce_websites(id,slug,name,business_type,status) VALUES
('20000000-0000-4000-8000-000000000001','alpha-store','Alpha Store','general','active'),
('20000000-0000-4000-8000-000000000002','beta-store','Beta Store','general','active');
INSERT INTO public.commerce_memberships(website_id,user_id,role,active) VALUES
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner',true),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','owner',true);
INSERT INTO public.commerce_categories(id,website_id,name,slug) VALUES
('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Fruit','fruit'),
('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Other','other');
INSERT INTO public.commerce_products(id,website_id,category_id,name,slug,price_paise,stock_quantity) VALUES
('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Apple','apple',250,10),
('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','Other Product','other-product',999,20),
('40000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Sold Out','sold-out',100,0);
INSERT INTO storage.objects(bucket_id,name) VALUES ('commerce-media','20000000-0000-4000-8000-000000000002/foreign.png');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
SELECT commerce_test.check_true((SELECT count(*) = 1 FROM public.commerce_websites), 'owner sees only own website');
SELECT commerce_test.check_true((SELECT count(*) = 2 AND bool_and(website_id = '20000000-0000-4000-8000-000000000001') FROM public.commerce_products), 'owner product RLS excludes other website');
SELECT commerce_test.must_fail($q$UPDATE public.commerce_products SET stock_quantity=999 WHERE id='40000000-0000-4000-8000-000000000001'$q$, 'direct product and stock writes denied', ARRAY['42501']);
SELECT commerce_test.must_fail($q$UPDATE public.commerce_websites SET features='{"cod":true}'$q$, 'owner cannot modify privileged website flags', ARRAY['42501']);
SELECT commerce_test.must_fail('SELECT * FROM public.commerce_audit_logs', 'administrative snapshots do not bypass owner customer/order permissions', ARRAY['42501']);
SELECT commerce_test.must_fail($q$SELECT public.commerce_admin_action('assign_owner','{}','forged@example.test')$q$, 'authenticated callers cannot execute admin RPC', ARRAY['42501']);
SELECT commerce_test.must_fail($q$SELECT public.commerce_owner_action('20000000-0000-4000-8000-000000000002','adjust_stock','{"product_id":"40000000-0000-4000-8000-000000000002","delta":1}')$q$, 'owner mutation cannot target another tenant', ARRAY['42501']);
SELECT commerce_test.must_fail($q$SELECT public.commerce_owner_action('20000000-0000-4000-8000-000000000001','save_product','{"id":"40000000-0000-4000-8000-000000000001","name":"Apple","slug":"apple","price_paise":250,"category_id":"30000000-0000-4000-8000-000000000002"}')$q$, 'owner cannot attach a foreign category', ARRAY['42501','22023','23503']);
SELECT commerce_test.must_fail($q$INSERT INTO storage.objects(bucket_id,name) VALUES ('commerce-media','20000000-0000-4000-8000-000000000002/forged.png')$q$, 'new storage guards prevent foreign uploads despite permissive legacy policy', ARRAY['42501']);
WITH attempted AS (UPDATE storage.objects SET metadata='{"forged":true}' WHERE bucket_id='commerce-media' AND name='20000000-0000-4000-8000-000000000002/foreign.png' RETURNING id)
SELECT commerce_test.check_true(count(*)=0, 'foreign media updates are blocked despite broad legacy policies') FROM attempted;
WITH attempted AS (DELETE FROM storage.objects WHERE bucket_id='commerce-media' AND name='20000000-0000-4000-8000-000000000002/foreign.png' RETURNING id)
SELECT commerce_test.check_true(count(*)=0, 'foreign media deletion is blocked despite broad legacy policies') FROM attempted;
INSERT INTO storage.objects(bucket_id,name) VALUES ('commerce-media','20000000-0000-4000-8000-000000000001/owned.png');
SELECT commerce_test.check_true(EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='commerce-media' AND name='20000000-0000-4000-8000-000000000001/owned.png'), 'owner may upload to own media prefix');
WITH attempted AS (UPDATE storage.objects SET name='20000000-0000-4000-8000-000000000002/moved.png' WHERE bucket_id='commerce-media' AND name='20000000-0000-4000-8000-000000000001/owned.png' RETURNING id)
SELECT commerce_test.check_true(count(*)=0, 'immutable media cannot be overwritten or moved through product permissions') FROM attempted;
WITH attempted AS (DELETE FROM storage.objects WHERE bucket_id='commerce-media' AND name='20000000-0000-4000-8000-000000000001/owned.png' RETURNING id)
SELECT commerce_test.check_true(count(*)=0, 'immutable media cannot be deleted through sibling branding/product permissions') FROM attempted;
INSERT INTO storage.objects(bucket_id,name) VALUES ('legacy-fixture','still-writable.txt');
SELECT commerce_test.check_true(EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='legacy-fixture' AND name='still-writable.txt'), 'pre-existing storage write behavior remains unchanged for other buckets');
WITH attempted AS (UPDATE storage.objects SET metadata='{"preserved_access":true}' WHERE bucket_id='legacy-fixture' AND name='still-writable.txt' RETURNING id)
SELECT commerce_test.check_true(count(*)=1, 'immutable-commerce guards preserve legacy bucket updates') FROM attempted;
WITH attempted AS (DELETE FROM storage.objects WHERE bucket_id='legacy-fixture' AND name='still-writable.txt' RETURNING id)
SELECT commerce_test.check_true(count(*)=1, 'immutable-commerce guards preserve legacy bucket deletion') FROM attempted;

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT commerce_test.must_fail('SELECT * FROM public.commerce_products', 'anonymous private base-table access denied', ARRAY['42501']);
SELECT commerce_test.must_fail($q$INSERT INTO storage.objects(bucket_id,name) VALUES ('commerce-media','20000000-0000-4000-8000-000000000001/anonymous.png')$q$, 'anonymous media writes are blocked despite broad legacy policy', ARRAY['42501']);
INSERT INTO storage.objects(bucket_id,name) VALUES ('legacy-fixture','anonymous-existing-behavior.txt');
SELECT commerce_test.check_true(EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='legacy-fixture' AND name='anonymous-existing-behavior.txt'), 'new anonymous media guards leave other buckets unchanged');
SELECT commerce_test.record('catalog',public.commerce_public_catalog('alpha-store'));
SELECT commerce_test.check_true((SELECT value->'website'->>'slug'='alpha-store' AND jsonb_array_length(value->'products')=2 FROM commerce_test.state WHERE key='catalog'), 'public catalog returns only selected active website');
SELECT commerce_test.check_true((SELECT NOT (value->'website' ?| ARRAY['owner_permissions','subscription_plan','monthly_price_paise']) FROM commerce_test.state WHERE key='catalog'), 'public catalog excludes private subscription and permission fields');
SELECT commerce_test.check_true((SELECT value->'website'->>'status'='active' FROM commerce_test.state WHERE key='catalog'), 'public catalog includes the safe activation state required by the API');

RESET ROLE;
UPDATE public.commerce_websites SET status='suspended' WHERE id='20000000-0000-4000-8000-000000000002';
SET LOCAL ROLE anon;
SELECT commerce_test.check_true(public.commerce_public_catalog('beta-store') IS NULL, 'suspended website has no public catalog');
RESET ROLE;
UPDATE public.commerce_websites SET status='active' WHERE id='20000000-0000-4000-8000-000000000002';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
SELECT commerce_test.record('order',public.commerce_create_cod_order('20000000-0000-4000-8000-000000000001',
 '[{"product_id":"40000000-0000-4000-8000-000000000001","quantity":1},{"product_id":"40000000-0000-4000-8000-000000000001","quantity":2}]',
 '{"name":"Test Buyer","phone":"9000000000","address":"Local development address"}','pickup','50000000-0000-4000-8000-000000000001'));
SELECT commerce_test.check_true((SELECT (value->'order'->>'subtotal_paise')::bigint=750 AND (value->'order'->>'total_paise')::bigint=750 AND jsonb_array_length(value->'items')=1 FROM commerce_test.state WHERE key='order'), 'checkout aggregates duplicate lines and computes database prices');
SELECT commerce_test.record('replay',public.commerce_create_cod_order('20000000-0000-4000-8000-000000000001',
 '[{"product_id":"40000000-0000-4000-8000-000000000001","quantity":1},{"product_id":"40000000-0000-4000-8000-000000000001","quantity":2}]',
 '{"name":"Test Buyer","phone":"9000000000","address":"Local development address"}','pickup','50000000-0000-4000-8000-000000000001'));
SELECT commerce_test.check_true((SELECT value->'order'->>'id' FROM commerce_test.state WHERE key='order')=(SELECT value->'order'->>'id' FROM commerce_test.state WHERE key='replay'), 'identical idempotent replay returns original order');
SELECT commerce_test.must_fail($q$SELECT public.commerce_create_cod_order('20000000-0000-4000-8000-000000000001','[{"product_id":"40000000-0000-4000-8000-000000000001","quantity":4}]','{"name":"Test Buyer","phone":"9000000000","address":"Local development address"}','pickup','50000000-0000-4000-8000-000000000001')$q$, 'changed idempotency replay is rejected', ARRAY['22023','40001','23505']);
SELECT commerce_test.must_fail($q$SELECT public.commerce_create_cod_order('20000000-0000-4000-8000-000000000001','[{"product_id":"40000000-0000-4000-8000-000000000001","quantity":1},{"product_id":"40000000-0000-4000-8000-000000000003","quantity":1}]','{"name":"Test Buyer","phone":"9000000000","address":"Local development address"}','pickup','50000000-0000-4000-8000-000000000002')$q$, 'insufficient stock aborts whole checkout', ARRAY['22023','40001']);
SELECT commerce_test.must_fail($q$SELECT public.commerce_create_cod_order('20000000-0000-4000-8000-000000000001','[{"product_id":"40000000-0000-4000-8000-000000000002","quantity":1}]','{"name":"Test Buyer","phone":"9000000000","address":"Local development address"}','pickup','50000000-0000-4000-8000-000000000003')$q$, 'checkout rejects products from another tenant', ARRAY['22023','42501']);
SELECT commerce_test.check_true((SELECT count(*)=1 FROM public.commerce_orders), 'customer sees own order history only');
SELECT commerce_test.must_fail('UPDATE public.commerce_orders SET total_paise=1', 'customers cannot alter order prices or status directly', ARRAY['42501']);
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
SELECT commerce_test.check_true((SELECT count(*)=0 FROM public.commerce_orders), 'another customer cannot read the first customer order history');

RESET ROLE;
SELECT commerce_test.check_true((SELECT stock_quantity=7 FROM public.commerce_products WHERE id='40000000-0000-4000-8000-000000000001'), 'replay and failed checkout do not double-consume stock');
SELECT commerce_test.check_true((SELECT count(*)=1 FROM public.commerce_orders), 'failed checkout leaves no partial order');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
SELECT public.commerce_owner_action('20000000-0000-4000-8000-000000000001','update_order_status',jsonb_build_object('order_id',(SELECT value->'order'->>'id' FROM commerce_test.state WHERE key='order'),'status','cancelled'));
SELECT public.commerce_owner_action('20000000-0000-4000-8000-000000000001','update_order_status',jsonb_build_object('order_id',(SELECT value->'order'->>'id' FROM commerce_test.state WHERE key='order'),'status','cancelled'));
RESET ROLE;
SELECT commerce_test.check_true((SELECT stock_quantity=10 FROM public.commerce_products WHERE id='40000000-0000-4000-8000-000000000001'), 'repeated cancellation restocks exactly once');
SELECT commerce_test.check_true((SELECT inventory_released_at IS NOT NULL AND status='cancelled' FROM public.commerce_orders LIMIT 1), 'cancellation records release state');

UPDATE public.commerce_websites SET owner_permissions=jsonb_set(owner_permissions,'{products}','false') WHERE id='20000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
SELECT commerce_test.must_fail($q$SELECT public.commerce_owner_action('20000000-0000-4000-8000-000000000001','save_product','{"name":"Forbidden","slug":"forbidden","price_paise":100}')$q$, 'admin-assigned product permission is enforced in RPC', ARRAY['42501']);
RESET ROLE;
UPDATE public.commerce_websites SET features=jsonb_set(features,'{cod}','false') WHERE id='20000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
SELECT commerce_test.must_fail($q$SELECT public.commerce_create_cod_order('20000000-0000-4000-8000-000000000001','[{"product_id":"40000000-0000-4000-8000-000000000001","quantity":1}]','{"name":"Test Buyer","phone":"9000000000","address":"Local development address"}','pickup','50000000-0000-4000-8000-000000000004')$q$, 'disabled COD feature blocks checkout', ARRAY['42501','22023']);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT commerce_test.must_fail($q$SELECT public.commerce_admin_action('assign_owner','{"website_id":"20000000-0000-4000-8000-000000000002","user_id":"10000000-0000-4000-8000-000000000005"}','admin@example.test')$q$, 'unverified accounts cannot be assigned as owners', ARRAY['42501','22023']);
SELECT commerce_test.must_fail($q$SELECT public.commerce_admin_action('create_website','{"slug":"unowned-store","name":"Unowned Store","status":"active"}','admin@example.test')$q$, 'a website cannot activate without an assigned verified owner', ARRAY['22023']);
SELECT commerce_test.must_fail($q$SELECT public.commerce_admin_action('create_website','{"slug":"restricted-pharmacy","name":"Restricted Pharmacy","business_type":"pharmacy","status":"active","owner_user_id":"10000000-0000-4000-8000-000000000001"}','admin@example.test')$q$, 'pharmacy activation remains blocked', ARRAY['23514','22023']);
SELECT public.commerce_admin_action('save_website','{"id":"20000000-0000-4000-8000-000000000002","name":"Renamed Beta"}','admin@example.test');
SELECT commerce_test.check_true((SELECT name='Renamed Beta' AND slug='beta-store' FROM public.commerce_websites WHERE id='20000000-0000-4000-8000-000000000002'), 'partial administrative website saves preserve omitted fields');
RESET ROLE;
UPDATE public.commerce_websites SET features=jsonb_set(features,'{catalog}','false') WHERE id='20000000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
SELECT commerce_test.must_fail($q$SELECT public.commerce_owner_action('20000000-0000-4000-8000-000000000002','save_category','{"name":"Blocked Category","slug":"blocked-category"}')$q$, 'direct owner RPC honors the disabled catalog feature', ARRAY['42501']);
RESET ROLE;
UPDATE public.commerce_websites SET features=jsonb_set(features,'{catalog}','true') WHERE id='20000000-0000-4000-8000-000000000002';
SELECT commerce_test.must_fail($q$INSERT INTO public.commerce_products(website_id,category_id,name,slug,price_paise) VALUES('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','Foreign Category','foreign-category',100)$q$, 'composite foreign key prevents cross-tenant category references even for privileged writes', ARRAY['23503']);
SELECT commerce_test.check_true((SELECT owner_permissions->'branding'='false'::jsonb AND owner_permissions->'customers'='false'::jsonb FROM public.commerce_websites WHERE id='20000000-0000-4000-8000-000000000001'), 'new websites use least-privilege branding and customer permissions');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
SELECT commerce_test.record('application',public.commerce_submit_application('{"owner_name":"Owner A","business_name":"New Client Shop","business_type":"general","phone":"9000000000","address":"Local development address","preferred_slug":"new-client-shop"}'));
SELECT commerce_test.check_true((SELECT value->>'email'='owner-a@example.test' AND value->>'status'='submitted' FROM commerce_test.state WHERE key='application'), 'application identity comes from the verified Auth account');
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
SELECT commerce_test.must_fail($q$SELECT public.commerce_submit_application('{"owner_name":"Unverified","business_name":"Not Allowed","business_type":"general","phone":"9000000000","address":"Local address","preferred_slug":"not-allowed"}')$q$, 'unverified accounts cannot submit website applications', ARRAY['42501']);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT commerce_test.must_fail($q$SELECT public.commerce_admin_action('create_website',jsonb_build_object('slug','new-client-shop','name','New Client Shop','application_id',(SELECT value->>'id' FROM commerce_test.state WHERE key='application')),'admin@example.test')$q$, 'website setup cannot bypass application approval', ARRAY['22023']);
SELECT public.commerce_admin_action('review_application',jsonb_build_object('application_id',(SELECT value->>'id' FROM commerce_test.state WHERE key='application'),'status','approved'),'admin@example.test');
SELECT commerce_test.record('created_website',public.commerce_admin_action('create_website',jsonb_build_object('slug','new-client-shop','name','New Client Shop','application_id',(SELECT value->>'id' FROM commerce_test.state WHERE key='application')),'admin@example.test'));
SELECT commerce_test.check_true((SELECT value->>'status'='setup' FROM commerce_test.state WHERE key='created_website') AND EXISTS(SELECT 1 FROM public.commerce_memberships m WHERE m.website_id=(SELECT (value->>'id')::uuid FROM commerce_test.state WHERE key='created_website') AND m.user_id='10000000-0000-4000-8000-000000000001' AND m.active), 'approved setup assigns the application owner without activating prematurely');
SELECT public.commerce_admin_action('save_website',jsonb_build_object('id',(SELECT value->>'id' FROM commerce_test.state WHERE key='created_website'),'status','active'),'admin@example.test');
SELECT commerce_test.check_true((SELECT status='active' FROM public.commerce_websites WHERE slug='new-client-shop'), 'an owner-assigned website can be activated through a partial configuration update');
RESET ROLE;
SELECT commerce_test.check_true((SELECT balance_paise=123456 FROM public.legacy_preservation_fixture), 'legacy wallet fixture unchanged after commerce checkout');
COMMIT;
