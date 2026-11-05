-- Fictional fixtures only; run after foundation baseline + expansion migrations.
begin;
do $$begin
 if current_database()<>'commerce_test' or inet_server_addr() not in ('127.0.0.1'::inet,'::1'::inet) then raise exception 'Isolated loopback commerce_test required';end if;
end$$;
insert into auth.users(id,email,email_confirmed_at) values
 ('91000000-0000-4000-8000-000000000001','catalog-owner@example.test',now()),
 ('91000000-0000-4000-8000-000000000002','catalog-foreign@example.test',now()),
 ('91000000-0000-4000-8000-000000000003','catalog-buyer@example.test',now()),
 ('91000000-0000-4000-8000-000000000004','catalog-unverified@example.test',null);
insert into public.commerce_websites(id,slug,name,status,owner_permissions,fulfillment) values
 ('92000000-0000-4000-8000-000000000001','catalog-extension','Catalog extension','active','{"products":true,"categories":true,"inventory":true,"orders":true,"branding":true,"customers":true}','{"pickup":true,"delivery":true,"delivery_fee_paise":50,"minimum_order_paise":0,"pickup_address":"Fixture"}'),
 ('92000000-0000-4000-8000-000000000002','catalog-foreign','Foreign extension','active','{"products":true,"categories":true,"inventory":true,"orders":true,"branding":true}','{"pickup":true,"delivery":false}');
insert into public.commerce_memberships(website_id,user_id) values
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001'),
 ('92000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000002');
insert into public.commerce_products(id,website_id,name,slug,price_paise,stock_quantity) values
 ('94000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','Variant garment','variant-garment',100,9),
 ('94000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000001','Simple garment','simple-garment',250,10),
 ('94000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000002','Foreign garment','foreign-garment',999,10);
select commerce_test.check_true(not has_function_privilege('anon','public.commerce_checkout_quote_v2(uuid,jsonb,jsonb,text,text)','EXECUTE') and not has_function_privilege('service_role','public.commerce_create_cod_order_v2(uuid,jsonb,jsonb,text,uuid,text)','EXECUTE'),'quote and checkout explicitly revoke inherited inappropriate execution');
select commerce_test.check_true(not has_function_privilege('authenticated','commerce_private.legacy_create_cod_order(uuid,jsonb,jsonb,text,uuid)','EXECUTE') and not has_function_privilege('authenticated','commerce_private.release_order_inventory(uuid,uuid)','EXECUTE'),'private legacy and restock helpers cannot bypass public validation');
select commerce_test.check_true(not has_function_privilege('authenticated','public.commerce_catalog_admin_action(uuid,text,jsonb)','EXECUTE') and has_function_privilege('service_role','public.commerce_catalog_admin_action(uuid,text,jsonb)','EXECUTE'),'template administration is service-only');
select commerce_test.check_true(not has_table_privilege('authenticated','public.commerce_product_variants','INSERT') and not has_table_privilege('anon','public.commerce_store_settings','SELECT'),'catalog extension tables revoke direct public writes and anonymous reads');
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select public.commerce_catalog_owner_action('92000000-0000-4000-8000-000000000001','save_product_options','{"product_id":"94000000-0000-4000-8000-000000000001","variants_required":true,"images":[{"url":"https://example.test/garment.webp","alt":"Fixture garment"},{"url":"https://example.test/back.webp","alt":"Back"}]}');
select commerce_test.record('catalog_variant',public.commerce_catalog_owner_action('92000000-0000-4000-8000-000000000001','save_variant','{"product_id":"94000000-0000-4000-8000-000000000001","sku":"GARMENT-M","name":"Medium blue","options":{"Size":"M","Color":"Blue"},"price_paise":375}'));
select public.commerce_catalog_owner_action('92000000-0000-4000-8000-000000000001','adjust_variant_stock',jsonb_build_object('variant_id',(select value->>'id' from commerce_test.state where key='catalog_variant'),'delta',8));
select public.commerce_catalog_owner_action('92000000-0000-4000-8000-000000000001','save_settings','{"delivery_zones_enabled":true,"policies":{"shipping":"Delivery after confirmation.","returns":"Contact the store within seven days.","returns_enabled":true,"return_days":7},"faq":[{"question":"Collection?","answer":"Use the pickup address."}],"sections":[{"id":"intro","type":"hero","enabled":true,"title":"Fixture"}],"seo":{"title":"Catalog fixture","description":"Synthetic test only."}}');
select public.commerce_catalog_owner_action('92000000-0000-4000-8000-000000000001','save_delivery_zone','{"name":"Local fixture zone","pincodes":["560001","560002"],"delivery_fee_paise":125,"minimum_order_paise":500}');
select commerce_test.must_fail($q$select public.commerce_catalog_owner_action('92000000-0000-4000-8000-000000000001','save_settings','{"template":"food"}')$q$,'owner cannot assign template',array['22023']);
select commerce_test.must_fail($q$select public.commerce_catalog_owner_action('92000000-0000-4000-8000-000000000001','save_settings','{"policies":{"returns_enabled":true}}')$q$,'enabled returns require explicit valid days',array['22023']);
select commerce_test.must_fail($q$select public.commerce_catalog_owner_action('92000000-0000-4000-8000-000000000001','save_settings','{"policies":{"terms":"<script>bad</script>"}}')$q$,'policies reject raw HTML',array['22023']);
select commerce_test.must_fail($q$select public.commerce_catalog_owner_action('92000000-0000-4000-8000-000000000001','save_product_options','{"product_id":"94000000-0000-4000-8000-000000000003","variants_required":true,"images":[]}')$q$,'catalog owner cannot edit another tenant product',array['42501']);
select commerce_test.must_fail($q$select public.commerce_catalog_owner_action('92000000-0000-4000-8000-000000000001','save_delivery_zone','{"name":"Overlapping","pincodes":["560001"],"delivery_fee_paise":0}')$q$,'active delivery coverage is unambiguous',array['22023']);
select commerce_test.check_true((public.commerce_catalog_workspace('92000000-0000-4000-8000-000000000001')->'settings'->'policies'->>'return_days')='7','workspace reads durable allowlisted settings');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
select commerce_test.check_true((select count(*)=0 from public.commerce_product_variants where website_id='92000000-0000-4000-8000-000000000001'),'variant SELECT respects owner tenant RLS');
select commerce_test.must_fail($q$select public.commerce_catalog_workspace('92000000-0000-4000-8000-000000000001')$q$,'foreign owner cannot read extension workspace',array['42501']);
select commerce_test.must_fail($q$select public.commerce_catalog_owner_action('92000000-0000-4000-8000-000000000001','save_settings','{"faq":[]}')$q$,'foreign owner cannot mutate extension settings',array['42501']);
reset role;
set local role service_role;
select public.commerce_catalog_admin_action('92000000-0000-4000-8000-000000000001','save_template','{"template":"fashion"}');
select commerce_test.check_true(public.commerce_catalog_admin_action('92000000-0000-4000-8000-000000000001','get_settings','{}')->>'template'='fashion','Admin can refresh assigned template');
reset role;
select commerce_test.check_true((select template='general' from public.commerce_websites where id='92000000-0000-4000-8000-000000000001'),'extension template preserves legacy website column');
set local role anon;
select commerce_test.record('expanded_catalog',public.commerce_public_catalog_v2('catalog-extension'));
select commerce_test.check_true((select value->'website'->>'template'='fashion' and jsonb_array_length(value->'delivery_zones')=1 and jsonb_array_length(value->'products'->0->'images')>=0 from commerce_test.state where key='expanded_catalog'),'public v2 catalog exposes safe optional template and coverage');
select commerce_test.check_true(not (public.commerce_public_catalog_v2('catalog-extension')->'website' ?| array['owner_permissions','subscription_plan']) and not (public.commerce_public_catalog_v2('catalog-extension')->'website'->'settings' ? 'website_id'),'public extension catalog excludes private fields');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000004',true);
select commerce_test.must_fail($q$select public.commerce_checkout_quote_v2('92000000-0000-4000-8000-000000000001','[{"product_id":"94000000-0000-4000-8000-000000000002","quantity":1}]','{"name":"Buyer","phone":"9000000000","address":"Fixture"}','pickup')$q$,'unverified customer cannot quote',array['42501']);
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000003',true);
select commerce_test.must_fail($q$select public.commerce_create_cod_order('92000000-0000-4000-8000-000000000001','[{"product_id":"94000000-0000-4000-8000-000000000001","quantity":1}]','{"name":"Buyer","phone":"9000000000","address":"Fixture"}','pickup','95000000-0000-4000-8000-000000000001')$q$,'legacy checkout cannot bypass required variant selection',array['22023']);
select commerce_test.must_fail($q$select public.commerce_create_cod_order('92000000-0000-4000-8000-000000000001','[{"product_id":"94000000-0000-4000-8000-000000000002","quantity":2}]','{"name":"Buyer","phone":"9000000000","address":"Fixture","pincode":"999999"}','delivery','95000000-0000-4000-8000-000000000002')$q$,'legacy checkout cannot bypass configured delivery coverage',array['22023']);
select commerce_test.must_fail($q$select public.commerce_checkout_quote_v2('92000000-0000-4000-8000-000000000001','[{"product_id":"94000000-0000-4000-8000-000000000002","quantity":1,"unit_price_paise":1}]','{"name":"Buyer","phone":"9000000000","address":"Fixture"}','pickup')$q$,'quote rejects submitted price fields',array['22023']);
select commerce_test.must_fail($q$select public.commerce_checkout_quote_v2('92000000-0000-4000-8000-000000000001','[{"product_id":"94000000-0000-4000-8000-000000000002","quantity":1}]','{"name":"Buyer","phone":"9000000000","address":"Fixture","pincode":"560001"}','delivery')$q$,'zone minimum order value is enforced',array['22023']);
select commerce_test.record('variant_quote',public.commerce_checkout_quote_v2('92000000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object('product_id','94000000-0000-4000-8000-000000000001','variant_id',(select value->>'id' from commerce_test.state where key='catalog_variant'),'quantity',2)),'{"name":"Buyer","phone":"9000000000","address":"Fixture","pincode":"560001"}','delivery'));
select commerce_test.check_true((select (value->>'subtotal_paise')::bigint=750 and (value->>'delivery_fee_paise')::bigint=125 and (value->>'total_paise')::bigint=875 from commerce_test.state where key='variant_quote'),'quote uses authoritative variant paise and delivery zone fee');
select commerce_test.record('variant_order',public.commerce_create_cod_order_v2('92000000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object('product_id','94000000-0000-4000-8000-000000000001','variant_id',(select value->>'id' from commerce_test.state where key='catalog_variant'),'quantity',2)),'{"name":"Buyer","phone":"9000000000","address":"Fixture","pincode":"560001"}','delivery','95000000-0000-4000-8000-000000000003'));
select commerce_test.record('variant_replay',public.commerce_create_cod_order_v2('92000000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object('product_id','94000000-0000-4000-8000-000000000001','variant_id',(select value->>'id' from commerce_test.state where key='catalog_variant'),'quantity',2)),'{"name":"Buyer","phone":"9000000000","address":"Fixture","pincode":"560001"}','delivery','95000000-0000-4000-8000-000000000003'));
select commerce_test.check_true((select value->'order'->>'id' from commerce_test.state where key='variant_order')=(select value->'order'->>'id' from commerce_test.state where key='variant_replay'),'variant idempotent replay returns the same order');
select commerce_test.check_true((select value->'items'->0->>'sku'='GARMENT-M' and value->'items'->0->'option_snapshot'->>'Size'='M' from commerce_test.state where key='variant_order'),'order line snapshots preserve SKU and options');
reset role;
select commerce_test.check_true((select stock_quantity=6 from public.commerce_product_variants where website_id='92000000-0000-4000-8000-000000000001') and (select stock_quantity=9 from public.commerce_products where id='94000000-0000-4000-8000-000000000001'),'quote is read-only and variant order consumes only variant stock once');
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select public.commerce_catalog_owner_action('92000000-0000-4000-8000-000000000001','save_variant',jsonb_build_object('id',(select value->>'id' from commerce_test.state where key='catalog_variant'),'product_id','94000000-0000-4000-8000-000000000001','sku','GARMENT-M-NEW','name','Edited','options','{"Size":"New"}'::jsonb,'price_paise',999));
select public.commerce_catalog_owner_action('92000000-0000-4000-8000-000000000001','archive_variant',jsonb_build_object('variant_id',(select value->>'id' from commerce_test.state where key='catalog_variant')));
select public.commerce_owner_action('92000000-0000-4000-8000-000000000001','update_order_status',jsonb_build_object('order_id',(select value->'order'->>'id' from commerce_test.state where key='variant_order'),'status','cancelled'));
select public.commerce_owner_action('92000000-0000-4000-8000-000000000001','update_order_status',jsonb_build_object('order_id',(select value->'order'->>'id' from commerce_test.state where key='variant_order'),'status','cancelled'));
reset role;
select commerce_test.check_true((select stock_quantity=8 from public.commerce_product_variants where website_id='92000000-0000-4000-8000-000000000001') and (select stock_quantity=9 from public.commerce_products where id='94000000-0000-4000-8000-000000000001'),'repeated cancellation restores archived variant exactly once without base stock inflation');
select commerce_test.check_true((select sku='GARMENT-M' and unit_price_paise=375 and option_snapshot->>'Size'='M' from public.commerce_order_items where order_id=(select (value->'order'->>'id')::uuid from commerce_test.state where key='variant_order')),'catalog edits cannot rewrite historical variant SKU/options/price');
select commerce_test.must_fail($q$insert into public.commerce_product_profiles(website_id,product_id) values('92000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000003')$q$,'profile composite FK rejects privileged cross-tenant references',array['23503']);
select commerce_test.check_true((select balance_paise=123456 from public.legacy_preservation_fixture) and (select command='existing settlement fixture' from cron.job where jobid=1),'catalog expansion preserves legacy wallet and cron fixtures');

-- Several variants of one product and a base line must coexist and restock
-- their own stock sources, without multiplying the base quantity by a join.
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select public.commerce_catalog_owner_action('92000000-0000-4000-8000-000000000001','save_product_options','{"product_id":"94000000-0000-4000-8000-000000000001","variants_required":false,"images":[]}');
select public.commerce_catalog_owner_action('92000000-0000-4000-8000-000000000001','save_variant',jsonb_build_object('id',(select value->>'id' from commerce_test.state where key='catalog_variant'),'product_id','94000000-0000-4000-8000-000000000001','sku','GARMENT-M-NEW','name','Edited','options','{"Size":"New"}'::jsonb,'price_paise',999,'active',true));
select commerce_test.record('second_variant',public.commerce_catalog_owner_action('92000000-0000-4000-8000-000000000001','save_variant','{"product_id":"94000000-0000-4000-8000-000000000001","sku":"GARMENT-L","name":"Large","options":{"Size":"L"},"price_paise":222}'));
select public.commerce_catalog_owner_action('92000000-0000-4000-8000-000000000001','adjust_variant_stock',jsonb_build_object('variant_id',(select value->>'id' from commerce_test.state where key='second_variant'),'delta',8));
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000003',true);
select commerce_test.record('mixed_lines',jsonb_build_array(jsonb_build_object('product_id','94000000-0000-4000-8000-000000000001','quantity',1),jsonb_build_object('product_id','94000000-0000-4000-8000-000000000001','variant_id',(select value->>'id' from commerce_test.state where key='catalog_variant'),'quantity',1),jsonb_build_object('product_id','94000000-0000-4000-8000-000000000001','variant_id',(select value->>'id' from commerce_test.state where key='second_variant'),'quantity',2),jsonb_build_object('product_id','94000000-0000-4000-8000-000000000002','quantity',2)));
select commerce_test.record('mixed_order',public.commerce_create_cod_order_v2('92000000-0000-4000-8000-000000000001',(select value from commerce_test.state where key='mixed_lines'),'{"name":"Buyer","phone":"9000000000","address":"Fixture"}','pickup','95000000-0000-4000-8000-000000000004'));
select commerce_test.check_true((select jsonb_array_length(value->'items')=4 and (value->'order'->>'subtotal_paise')::bigint=2043 from commerce_test.state where key='mixed_order'),'multiple variants and base line coexist with exact integer totals');
reset role;
select commerce_test.check_true((select stock_quantity=8 from public.commerce_products where id='94000000-0000-4000-8000-000000000001') and (select stock_quantity=8 from public.commerce_products where id='94000000-0000-4000-8000-000000000002') and (select stock_quantity=7 from public.commerce_product_variants where id=(select (value->>'id')::uuid from commerce_test.state where key='catalog_variant')) and (select stock_quantity=6 from public.commerce_product_variants where id=(select (value->>'id')::uuid from commerce_test.state where key='second_variant')),'mixed checkout decrements each authoritative stock source');
set local role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select public.commerce_owner_action('92000000-0000-4000-8000-000000000001','update_order_status',jsonb_build_object('order_id',(select value->'order'->>'id' from commerce_test.state where key='mixed_order'),'status','cancelled'));
reset role;
select commerce_test.check_true((select stock_quantity=9 from public.commerce_products where id='94000000-0000-4000-8000-000000000001') and (select stock_quantity=10 from public.commerce_products where id='94000000-0000-4000-8000-000000000002') and (select bool_and(stock_quantity=8) from public.commerce_product_variants where website_id='92000000-0000-4000-8000-000000000001'),'mixed cancellation aggregates base and variant sources correctly');
commit;
