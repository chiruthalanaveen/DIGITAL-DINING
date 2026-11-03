-- Synthetic SQL-only provider evidence; run only after baseline + core/customer/growth.
begin;
do $$begin
 if current_database()<>'commerce_test' or inet_server_addr() not in ('127.0.0.1'::inet,'::1'::inet) then raise exception 'Isolated loopback commerce_test required';end if;
end$$;
insert into auth.users(id,email,email_confirmed_at) values
 ('71000000-0000-4000-8000-000000000001','payment-owner@example.test',now()),
 ('71000000-0000-4000-8000-000000000002','payment-buyer@example.test',now()),
 ('71000000-0000-4000-8000-000000000003','payment-foreign@example.test',now()),
 ('71000000-0000-4000-8000-000000000004','payment-unverified@example.test',null);
insert into public.commerce_websites(id,slug,name,status,owner_permissions,fulfillment) values
 ('72000000-0000-4000-8000-000000000001','payment-store','Payment store','active','{"orders":true,"products":true,"inventory":true}','{"pickup":true,"delivery":true,"delivery_fee_paise":50}'),
 ('72000000-0000-4000-8000-000000000002','payment-foreign','Payment foreign','active','{"orders":true}','{"pickup":true}');
insert into public.commerce_memberships(website_id,user_id) values ('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001');
insert into public.commerce_products(id,website_id,name,slug,price_paise,stock_quantity) values
 ('74000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','Payment product','payment-product',251,20),
 ('74000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000002','Foreign product','foreign-product',1,20);
select commerce_test.check_true(not has_function_privilege('authenticated','public.commerce_payment_service(text,jsonb)','EXECUTE') and not has_function_privilege('anon','public.commerce_payment_admin(uuid,text,jsonb)','EXECUTE'),'payment service and admin revoke inherited user execution');
select commerce_test.check_true(not has_function_privilege('service_role','commerce_private.payment_fulfill(uuid)','EXECUTE') and not has_table_privilege('service_role','commerce_private.payment_receipts','INSERT') and not has_table_privilege('authenticated','commerce_private.payment_intents','SELECT'),'no role has a direct financial table or private fulfillment bypass');
select commerce_test.must_fail($q$select public.commerce_payment_service('context','{}')$q$,'actual service role required even for definer owner',array['42501']);
select set_config('request.jwt.claim.role','service_role',true);
select commerce_test.must_fail($q$select public.commerce_payment_admin('72000000-0000-4000-8000-000000000001','readiness','{}')$q$,'forged role claim cannot invoke payment administration',array['42501']);
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select commerce_test.must_fail($q$select public.commerce_payment_start('72000000-0000-4000-8000-000000000001','[{"product_id":"74000000-0000-4000-8000-000000000001","quantity":2}]','{"name":"Buyer","phone":"9000000000"}','pickup','76000000-0000-4000-8000-000000000001')$q$,'merchant defaults disabled',array['42501']);
select commerce_test.must_fail($q$select public.commerce_payment_service('capture','{}')$q$,'customer cannot claim captured status with forged service JWT claims',array['42501']);
reset role;
set local role service_role;
select public.commerce_payment_admin('72000000-0000-4000-8000-000000000001','configure',jsonb_build_object('version_id','75000000-0000-4000-8000-000000000001','mode','test','ciphertext',repeat('x',100),'enabled',true,'actor_email','admin@example.test'));
reset role;
set local role anon;
select commerce_test.check_true(public.commerce_payment_availability('72000000-0000-4000-8000-000000000001')='{"available":true,"provider":"razorpay","mode":"test"}'::jsonb,'anonymous availability exposes no key or private configuration');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000004',true);
select commerce_test.must_fail($q$select public.commerce_payment_start('72000000-0000-4000-8000-000000000001','[{"product_id":"74000000-0000-4000-8000-000000000001","quantity":2}]','{"name":"Buyer","phone":"9000000000"}','pickup','76000000-0000-4000-8000-000000000001')$q$,'unverified Auth row cannot create online intent',array['42501']);
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select commerce_test.must_fail($q$select public.commerce_payment_start('72000000-0000-4000-8000-000000000001','[{"product_id":"74000000-0000-4000-8000-000000000001","quantity":2,"price_paise":1}]','{"name":"Buyer","phone":"9000000000"}','pickup','76000000-0000-4000-8000-000000000001')$q$,'online intent rejects caller prices',array['22023']);
select commerce_test.must_fail($q$select public.commerce_payment_start('72000000-0000-4000-8000-000000000001','[{"product_id":"74000000-0000-4000-8000-000000000002","quantity":1}]','{"name":"Buyer","phone":"9000000000"}','pickup','76000000-0000-4000-8000-000000000001')$q$,'online intent rejects another tenant product',array['42501']);
select commerce_test.record('payment_intent',public.commerce_payment_start('72000000-0000-4000-8000-000000000001','[{"product_id":"74000000-0000-4000-8000-000000000001","quantity":2}]','{"name":"Buyer","phone":"9000000000"}','pickup','76000000-0000-4000-8000-000000000001'));
select commerce_test.check_true((select (value->>'amount_paise')::bigint=502 and value->>'state'='new' and value->>'currency'='INR' from commerce_test.state where key='payment_intent'),'intent locks authoritative exact-paise INR quote');
select commerce_test.check_true(public.commerce_payment_start('72000000-0000-4000-8000-000000000001','[{"product_id":"74000000-0000-4000-8000-000000000001","quantity":2}]','{"name":"Buyer","phone":"9000000000"}','pickup','76000000-0000-4000-8000-000000000001')->>'id'=(select value->>'id' from commerce_test.state where key='payment_intent'),'same cart retry returns original intent');
select commerce_test.must_fail($q$select public.commerce_payment_start('72000000-0000-4000-8000-000000000001','[{"product_id":"74000000-0000-4000-8000-000000000001","quantity":1}]','{"name":"Buyer","phone":"9000000000"}','pickup','76000000-0000-4000-8000-000000000001')$q$,'cart key cannot bind a different quote',array['22023']);
select commerce_test.must_fail($q$select public.commerce_create_cod_order_v2('72000000-0000-4000-8000-000000000001','[{"product_id":"74000000-0000-4000-8000-000000000001","quantity":2}]','{"name":"Buyer","phone":"9000000000"}','pickup','76000000-0000-4000-8000-000000000001')$q$,'online cart key cannot become COD while payment is unresolved',array['23505']);
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',true);
select commerce_test.must_fail($q$select public.commerce_payment_status((select (value->>'id')::uuid from commerce_test.state where key='payment_intent'))$q$,'another customer cannot read intent or receipt',array['42501']);
select commerce_test.must_fail($q$select public.commerce_payment_readiness('72000000-0000-4000-8000-000000000001')$q$,'nonowner cannot read private merchant readiness',array['42501']);
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
select commerce_test.check_true(public.commerce_payment_readiness('72000000-0000-4000-8000-000000000001')->>'mode'='test','owner orders permission receives safe merchant readiness');
reset role;
set local role service_role;
select commerce_test.record('payment_lease',public.commerce_payment_service('claim_create',jsonb_build_object('intent_id',(select value->>'id' from commerce_test.state where key='payment_intent'),'buyer_id','71000000-0000-4000-8000-000000000002')));
select commerce_test.check_true(not (public.commerce_payment_service('claim_create',jsonb_build_object('intent_id',(select value->>'id' from commerce_test.state where key='payment_intent')))->>'claimed')::boolean,'concurrent or repeated create cannot post another provider order');
select commerce_test.must_fail($q$select public.commerce_payment_service('attach_create',jsonb_build_object('intent_id',(select value->>'id' from commerce_test.state where key='payment_intent'),'lease_token',(select value->>'lease_token' from commerce_test.state where key='payment_lease'),'provider_order_id','order_fixture001','amount_paise',1,'currency','INR'))$q$,'provider order amount must match saved quote',array['22023']);
select public.commerce_payment_service('attach_create',jsonb_build_object('intent_id',(select value->>'id' from commerce_test.state where key='payment_intent'),'lease_token',(select value->>'lease_token' from commerce_test.state where key='payment_lease'),'provider_order_id','order_fixture001','amount_paise',502,'currency','INR'));
select commerce_test.must_fail($q$select public.commerce_payment_service('capture',jsonb_build_object('intent_id',(select value->>'id' from commerce_test.state where key='payment_intent'),'credential_version','75000000-0000-4000-8000-000000000001','provider_order_id','order_fixture001','provider_payment_id','pay_fixture001','amount_paise',1,'currency','INR'))$q$,'capture cannot underpay exact paise',array['22023']);
select commerce_test.must_fail($q$select public.commerce_payment_service('capture',jsonb_build_object('intent_id',(select value->>'id' from commerce_test.state where key='payment_intent'),'credential_version','75000000-0000-4000-8000-000000000001','provider_order_id','order_wrong001','provider_payment_id','pay_fixture001','amount_paise',502,'currency','INR'))$q$,'capture cannot switch provider order',array['22023']);
select commerce_test.record('payment_capture',public.commerce_payment_service('capture',jsonb_build_object('intent_id',(select value->>'id' from commerce_test.state where key='payment_intent'),'credential_version','75000000-0000-4000-8000-000000000001','provider_order_id','order_fixture001','provider_payment_id','pay_fixture001','amount_paise',502,'currency','INR')));
select commerce_test.record('payment_capture_replay',public.commerce_payment_service('capture',jsonb_build_object('intent_id',(select value->>'id' from commerce_test.state where key='payment_intent'),'credential_version','75000000-0000-4000-8000-000000000001','provider_order_id','order_fixture001','provider_payment_id','pay_fixture001','amount_paise',502,'currency','INR')));
select commerce_test.check_true((select value->>'state'='fulfilled' and value->'order'->>'payment_method'='razorpay' and value->'order'->>'payment_status'='paid' from commerce_test.state where key='payment_capture'),'captured payment fulfills paid online order through bound private pricing');
select commerce_test.check_true((select value->'receipt'->>'id' from commerce_test.state where key='payment_capture')=(select value->'receipt'->>'id' from commerce_test.state where key='payment_capture_replay') and (select value->'order'->>'id' from commerce_test.state where key='payment_capture')=(select value->'order'->>'id' from commerce_test.state where key='payment_capture_replay'),'capture replay has one immutable receipt and original order');
reset role;
select commerce_test.check_true((select stock_quantity=18 from public.commerce_products where id='74000000-0000-4000-8000-000000000001') and (select count(*)=1 from commerce_private.payment_receipts where provider_payment_id='pay_fixture001'),'capture replay consumes stock exactly once');
select commerce_test.must_fail($q$update commerce_private.payment_receipts set amount_paise=1 where provider_payment_id='pay_fixture001'$q$,'captured financial evidence immutable even to migration owner',array['42501']);
select commerce_test.must_fail($q$delete from commerce_private.payment_credential_versions where id='75000000-0000-4000-8000-000000000001'$q$,'credential versions cannot be deleted',array['42501']);

-- Unknown provider responses are durable and cannot auto-create another order.
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select commerce_test.record('payment_unknown',public.commerce_payment_start('72000000-0000-4000-8000-000000000001','[{"product_id":"74000000-0000-4000-8000-000000000001","quantity":1}]','{"name":"Buyer","phone":"9000000000"}','pickup','76000000-0000-4000-8000-000000000002'));
reset role;
set local role service_role;
select commerce_test.record('unknown_lease',public.commerce_payment_service('claim_create',jsonb_build_object('intent_id',(select value->>'id' from commerce_test.state where key='payment_unknown'))));
select public.commerce_payment_service('create_unknown',jsonb_build_object('intent_id',(select value->>'id' from commerce_test.state where key='payment_unknown'),'lease_token',(select value->>'lease_token' from commerce_test.state where key='unknown_lease')));
select commerce_test.check_true(public.commerce_payment_service('claim_create',jsonb_build_object('intent_id',(select value->>'id' from commerce_test.state where key='payment_unknown')))='{"claimed":false,"state":"provider_unknown"}'::jsonb,'unknown provider response never recreates a chargeable order');
select public.commerce_payment_service('attach_reconciled',jsonb_build_object('intent_id',(select value->>'id' from commerce_test.state where key='payment_unknown'),'provider_order_id','order_fixture002','amount_paise',251,'currency','INR'));
reset role;
update public.commerce_products set stock_quantity=0 where id='74000000-0000-4000-8000-000000000001';
set local role service_role;
select commerce_test.record('payment_stock_held',public.commerce_payment_service('capture',jsonb_build_object('intent_id',(select value->>'id' from commerce_test.state where key='payment_unknown'),'credential_version','75000000-0000-4000-8000-000000000001','provider_order_id','order_fixture002','provider_payment_id','pay_fixture002','amount_paise',251,'currency','INR')));
select commerce_test.check_true((select value->>'state'='captured_unfulfilled' and value->'receipt'->>'state'='captured_unfulfilled' and value->'receipt'->>'order_id' is null from commerce_test.state where key='payment_stock_held'),'stock failure retains captured receipt without order or fake refund');
reset role;
update public.commerce_products set stock_quantity=18 where id='74000000-0000-4000-8000-000000000001';
set local role service_role;
select commerce_test.record('payment_stock_recovered',public.commerce_payment_service('capture',jsonb_build_object('intent_id',(select value->>'id' from commerce_test.state where key='payment_unknown'),'credential_version','75000000-0000-4000-8000-000000000001','provider_order_id','order_fixture002','provider_payment_id','pay_fixture002','amount_paise',251,'currency','INR')));
select commerce_test.check_true((select value->>'state'='fulfilled' from commerce_test.state where key='payment_stock_recovered') and (select value->'receipt'->>'id' from commerce_test.state where key='payment_stock_held')=(select value->'receipt'->>'id' from commerce_test.state where key='payment_stock_recovered'),'stock recovery fulfills the same captured receipt without another charge');

-- Webhook deduplication, payload collision and leases are durable database state.
select commerce_test.record('payment_webhook',public.commerce_payment_service('webhook_claim',jsonb_build_object('website_id','72000000-0000-4000-8000-000000000001','credential_version','75000000-0000-4000-8000-000000000001','event_id','evt_fixture001','body_hash',repeat('a',64),'provider_order_id','order_fixture001','provider_payment_id','pay_fixture001')));
select commerce_test.check_true(not (public.commerce_payment_service('webhook_claim',jsonb_build_object('website_id','72000000-0000-4000-8000-000000000001','credential_version','75000000-0000-4000-8000-000000000001','event_id','evt_fixture001','body_hash',repeat('a',64),'provider_order_id','order_fixture001','provider_payment_id','pay_fixture001'))->>'claimed')::boolean,'active webhook lease prevents parallel worker replay');
select commerce_test.must_fail($q$select public.commerce_payment_service('webhook_claim',jsonb_build_object('website_id','72000000-0000-4000-8000-000000000001','credential_version','75000000-0000-4000-8000-000000000001','event_id','evt_fixture001','body_hash',repeat('b',64),'provider_order_id','order_fixture001','provider_payment_id','pay_fixture001'))$q$,'same event id cannot substitute webhook body',array['22023']);
select commerce_test.must_fail($q$select public.commerce_payment_service('webhook_ack',jsonb_build_object('event_id',(select value->>'id' from commerce_test.state where key='payment_webhook'),'lease_token','77000000-0000-4000-8000-000000000001','processed',true))$q$,'stale or forged lease cannot acknowledge webhook',array['22023']);
reset role;
update commerce_private.payment_webhooks set lease_expires_at=now()-interval '1 second' where event_id='evt_fixture001';
set local role service_role;
select commerce_test.must_fail($q$select public.commerce_payment_service('webhook_ack',jsonb_build_object('event_id',(select value->>'id' from commerce_test.state where key='payment_webhook'),'lease_token',(select value->>'lease_token' from commerce_test.state where key='payment_webhook'),'processed',true))$q$,'expired lease cannot acknowledge webhook',array['22023']);
select commerce_test.record('payment_webhook_retry',public.commerce_payment_service('webhook_claim',jsonb_build_object('website_id','72000000-0000-4000-8000-000000000001','credential_version','75000000-0000-4000-8000-000000000001','event_id','evt_fixture001','body_hash',repeat('a',64),'provider_order_id','order_fixture001','provider_payment_id','pay_fixture001')));
select commerce_test.check_true((select (value->>'claimed')::boolean from commerce_test.state where key='payment_webhook_retry') and (select value->>'lease_token' from commerce_test.state where key='payment_webhook')<>(select value->>'lease_token' from commerce_test.state where key='payment_webhook_retry'),'expired webhook lease is reclaimed with a new token');
select public.commerce_payment_service('webhook_ack',jsonb_build_object('event_id',(select value->>'id' from commerce_test.state where key='payment_webhook_retry'),'lease_token',(select value->>'lease_token' from commerce_test.state where key='payment_webhook_retry'),'processed',true));
select commerce_test.check_true(public.commerce_payment_service('webhook_claim',jsonb_build_object('website_id','72000000-0000-4000-8000-000000000001','credential_version','75000000-0000-4000-8000-000000000001','event_id','evt_fixture001','body_hash',repeat('a',64),'provider_order_id','order_fixture001','provider_payment_id','pay_fixture001'))->>'state'='processed','processed webhook stays deduplicated');
reset role;
select commerce_test.check_true((select balance_paise=123456 from public.legacy_preservation_fixture) and (select command='existing settlement fixture' from cron.job where jobid=1),'online payments preserve legacy balance/history and cron fixtures');

-- Online-only stores must quote through verified online merchant availability,
-- without borrowing the COD feature gate or creating any financial state.
update public.commerce_websites set features=jsonb_set(features,'{cod}','false') where id='72000000-0000-4000-8000-000000000001';
select commerce_test.record('payment_quote_before',jsonb_build_object(
 'orders',(select count(*) from public.commerce_orders),
 'intents',(select count(*) from commerce_private.payment_intents),
 'receipts',(select count(*) from commerce_private.payment_receipts),
 'redemptions',(select count(*) from public.commerce_coupon_redemptions),
 'stock',(select stock_quantity from public.commerce_products where id='74000000-0000-4000-8000-000000000001')));
select commerce_test.check_true(not has_function_privilege('anon','public.commerce_payment_quote(uuid,jsonb,jsonb,text,text)','EXECUTE') and not has_function_privilege('service_role','public.commerce_payment_quote(uuid,jsonb,jsonb,text,text)','EXECUTE'),'online quote clears inherited anonymous and service execution grants');
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select commerce_test.record('payment_online_quote',public.commerce_payment_quote('72000000-0000-4000-8000-000000000001','[{"product_id":"74000000-0000-4000-8000-000000000001","quantity":1}]','{"name":"Online quote buyer","phone":"9000000000"}','pickup'));
select commerce_test.check_true((select value->>'total_paise'='251' and jsonb_array_length(value->'items')=1 and not(value ?| array['coupon','inventory_tracked','intent_id']) from commerce_test.state where key='payment_online_quote'),'online-only merchant quote uses authoritative paise and excludes private pricing/intent fields');
select commerce_test.must_fail($q$select public.commerce_checkout_quote_v2('72000000-0000-4000-8000-000000000001','[{"product_id":"74000000-0000-4000-8000-000000000001","quantity":1}]','{"name":"Online quote buyer","phone":"9000000000"}','pickup')$q$,'online quote does not weaken the distinct disabled COD quote gate',array['42501']);
select commerce_test.must_fail($q$select public.commerce_payment_quote('72000000-0000-4000-8000-000000000001','[{"product_id":"74000000-0000-4000-8000-000000000002","quantity":1}]','{"name":"Online quote buyer","phone":"9000000000"}','pickup')$q$,'online quote rejects another tenant product',array['42501']);
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000004',true);
select commerce_test.must_fail($q$select public.commerce_payment_quote('72000000-0000-4000-8000-000000000001','[{"product_id":"74000000-0000-4000-8000-000000000001","quantity":1}]','{"name":"Online quote buyer","phone":"9000000000"}','pickup')$q$,'unverified customer cannot quote an online-only store',array['42501']);
reset role;
set local role anon;
select commerce_test.must_fail($q$select public.commerce_payment_quote('72000000-0000-4000-8000-000000000001','[{"product_id":"74000000-0000-4000-8000-000000000001","quantity":1}]','{"name":"Online quote buyer","phone":"9000000000"}','pickup')$q$,'anonymous customer cannot quote an online-only store',array['42501']);
reset role;
update commerce_private.payment_merchants set enabled=false where website_id='72000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select commerce_test.must_fail($q$select public.commerce_payment_quote('72000000-0000-4000-8000-000000000001','[{"product_id":"74000000-0000-4000-8000-000000000001","quantity":1}]','{"name":"Online quote buyer","phone":"9000000000"}','pickup')$q$,'disabled merchant configuration prevents online quote',array['42501']);
reset role;
update commerce_private.payment_merchants set enabled=true where website_id='72000000-0000-4000-8000-000000000001';
update public.commerce_websites set features=jsonb_set(features,'{cod}','true') where id='72000000-0000-4000-8000-000000000001';
select commerce_test.check_true((select value=jsonb_build_object(
 'orders',(select count(*) from public.commerce_orders),
 'intents',(select count(*) from commerce_private.payment_intents),
 'receipts',(select count(*) from commerce_private.payment_receipts),
 'redemptions',(select count(*) from public.commerce_coupon_redemptions),
 'stock',(select stock_quantity from public.commerce_products where id='74000000-0000-4000-8000-000000000001')) from commerce_test.state where key='payment_quote_before'),'online quote never writes orders, intents, receipts, redemptions or inventory');
commit;
