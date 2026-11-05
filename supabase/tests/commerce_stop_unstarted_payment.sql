-- Isolated SQL-only unstarted checkout controls. No provider/network operation.
begin;
do $$begin
 if current_database()<>'commerce_test' or inet_server_addr() not in ('127.0.0.1'::inet,'::1'::inet) then raise exception 'Isolated loopback commerce_test required';end if;
end$$;
insert into auth.users(id,email,email_confirmed_at) values
 ('61000000-0000-4000-8000-000000000001','stop-owner@example.test',now()),
 ('61000000-0000-4000-8000-000000000002','stop-buyer@example.test',now()),
 ('61000000-0000-4000-8000-000000000003','stop-other@example.test',now()),
 ('61000000-0000-4000-8000-000000000004','stop-unverified@example.test',null);
insert into public.commerce_websites(id,slug,name,status,fulfillment) values
 ('62000000-0000-4000-8000-000000000001','stop-unstarted','Stop unstarted payment','active','{"pickup":true}'),
 ('62000000-0000-4000-8000-000000000002','stop-unstarted-other','Stop foreign payment','active','{"pickup":true}');
insert into public.commerce_memberships(website_id,user_id) values('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001');
insert into public.commerce_products(id,website_id,name,slug,price_paise,stock_quantity) values
 ('64000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001','Stop fixture product','stop-product',251,50);
insert into commerce_private.payment_credential_versions(id,website_id,mode,ciphertext,created_by) values
 ('65000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001','test',repeat('SYNTHETIC_STOP_CIPHERTEXT',5),'admin@example.test');
insert into commerce_private.payment_merchants(website_id,enabled,credential_version) values
 ('62000000-0000-4000-8000-000000000001',true,'65000000-0000-4000-8000-000000000001');

select commerce_test.check_true(has_function_privilege('authenticated','public.commerce_payment_attempt_control(uuid,uuid,text,uuid)','EXECUTE') and not has_function_privilege('anon','public.commerce_payment_attempt_control(uuid,uuid,text,uuid)','EXECUTE') and not has_function_privilege('service_role','public.commerce_payment_attempt_control(uuid,uuid,text,uuid)','EXECUTE'),'unstarted attempt control grants only authenticated caller execution');
select commerce_test.check_true(not has_table_privilege('authenticated','commerce_private.payment_unstarted_cancellations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') and not has_table_privilege('service_role','commerce_private.payment_unstarted_cancellations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') and not has_function_privilege('authenticated','commerce_private.payment_attempt_view(uuid,uuid,uuid)','EXECUTE'),'unstarted proofs and private helper have no direct role bypass');
select commerce_test.check_true((select relrowsecurity from pg_class where oid='commerce_private.payment_unstarted_cancellations'::regclass) and not exists(select 1 from pg_policies where schemaname='commerce_private' and tablename='payment_unstarted_cancellations'),'private unstarted proof table has RLS enabled without direct-read policies');
set local role anon;
select commerce_test.must_fail($q$select public.commerce_payment_attempt_control('62000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000001')$q$,'anonymous buyer cannot inspect or stop payment attempts',array['42501']);
reset role;
set local role service_role;
select commerce_test.must_fail($q$select public.commerce_payment_attempt_control('62000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000001','cancel_unstarted')$q$,'Admin service cannot impersonate buyer cancellation',array['42501']);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select commerce_test.must_fail($q$select public.commerce_payment_attempt_control('62000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000001')$q$,'missing Auth identity cannot inspect attempts',array['42501']);
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000004',true);
select commerce_test.must_fail($q$select public.commerce_payment_attempt_control('62000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000001')$q$,'unverified Auth identity cannot inspect or stop attempts',array['42501']);
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000002',true);
select commerce_test.must_fail($q$select public.commerce_payment_attempt_control(null,'66000000-0000-4000-8000-000000000001')$q$,'unstarted control rejects null website',array['22023']);
select commerce_test.must_fail($q$select public.commerce_payment_attempt_control('62000000-0000-4000-8000-000000000001',null)$q$,'unstarted control rejects null cart key',array['22023']);
select commerce_test.must_fail($q$select public.commerce_payment_attempt_control('62000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000001','cancel')$q$,'unstarted control rejects unsupported action without mutation',array['22023']);
select commerce_test.record('stop_missing',public.commerce_payment_attempt_control('62000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000099'));
select commerce_test.check_true((select value->'found'='false'::jsonb and value->'can_cancel_unstarted'='false'::jsonb and value->'payment'='null'::jsonb and value->'cancellation'='null'::jsonb from commerce_test.state where key='stop_missing'),'missing attempt is explicitly unknown and never cancellation proof');
select commerce_test.must_fail($q$select public.commerce_payment_attempt_control('62000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000099','cancel_unstarted')$q$,'missing attempt cancellation rejects because original create can still arrive',array['23505']);
select commerce_test.record('stop_intent',public.commerce_payment_start('62000000-0000-4000-8000-000000000001','[{"product_id":"64000000-0000-4000-8000-000000000001","quantity":1}]','{"name":"Stop Buyer","phone":"9000000000"}','pickup','66000000-0000-4000-8000-000000000001'));
select commerce_test.record('stop_before',public.commerce_payment_attempt_control('62000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000001'));
select commerce_test.check_true((select value->'found'='true'::jsonb and value->'can_cancel_unstarted'='true'::jsonb and value->'payment'->>'state'='new' and value->'cancellation'='null'::jsonb and value->>'intent_id'=value->'payment'->>'id' from commerce_test.state where key='stop_before'),'cart-only inspection recovers own intent and eligibility before provider dispatch');
select commerce_test.check_true((select value-array['website_id','cart_key','intent_id','payment','cancellation','can_cancel_unstarted','found']='{}'::jsonb and value::text not like '%CIPHERTEXT%' and value::text not like '%credential_version%' from commerce_test.state where key='stop_before'),'attempt inspection uses documented projection without credential evidence');
select commerce_test.must_fail($q$select public.commerce_payment_attempt_control('62000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000001','inspect','67000000-0000-4000-8000-000000000099')$q$,'expected intent mismatch does not authorize inspection',array['42501']);
select commerce_test.must_fail($q$select public.commerce_payment_attempt_control('62000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000001','cancel_unstarted','67000000-0000-4000-8000-000000000099')$q$,'expected intent mismatch cannot cancel another record',array['42501']);
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','service_role',true);
select commerce_test.check_true(public.commerce_payment_attempt_control('62000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000001')->'found'='false'::jsonb,'another buyer with forged service JWT claims cannot discover the original attempt');
select commerce_test.must_fail($q$select public.commerce_payment_attempt_control('62000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000001','cancel_unstarted')$q$,'another buyer cannot cancel the original checkout',array['23505']);
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000002',true);
select commerce_test.check_true(public.commerce_payment_attempt_control('62000000-0000-4000-8000-000000000002','66000000-0000-4000-8000-000000000001')->'found'='false'::jsonb,'same buyer cannot discover the intent through a different website');
select commerce_test.must_fail($q$select public.commerce_payment_attempt_control('62000000-0000-4000-8000-000000000002','66000000-0000-4000-8000-000000000001','cancel_unstarted')$q$,'different website cannot cancel an original checkout',array['23505']);
reset role;

-- Preserve the business ledger exactly while stopping. Intent state/updated_at
-- and the new proof are the only expected records to change in this operation.
create temporary table stop_business_before(table_name text primary key,rows jsonb) on commit drop;
do $$declare relation_value record; actual_rows jsonb;
begin
 for relation_value in select n.nspname schema_name,c.relname table_name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','commerce_private','auth','storage','cron') and c.relkind='r' and not (n.nspname='commerce_private' and c.relname in ('payment_intents','payment_unstarted_cancellations')) order by 1,2 loop
  execute format('select coalesce(jsonb_agg(to_jsonb(row_value) order by to_jsonb(row_value)::text),''[]''::jsonb) from %I.%I row_value',relation_value.schema_name,relation_value.table_name) into actual_rows;
  insert into stop_business_before values(relation_value.schema_name||'.'||relation_value.table_name,actual_rows);
 end loop;
end$$;
select commerce_test.record('stop_original_row',(select to_jsonb(i) from commerce_private.payment_intents i where i.id=(select (value->>'id')::uuid from commerce_test.state where key='stop_intent')));
set local role authenticated;
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000002',true);
select commerce_test.record('stop_cancelled',public.commerce_payment_attempt_control('62000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000001','cancel_unstarted'));
select commerce_test.check_true((select value->'found'='true'::jsonb and value->'can_cancel_unstarted'='false'::jsonb and value->'payment'->>'state'='cancelled_unstarted' and value->'cancellation'->>'reason'='never_dispatched' and value->'cancellation'->>'intent_id'=value->>'intent_id' and value->'cancellation'->>'cancelled_at' is not null from commerce_test.state where key='stop_cancelled'),'stopping records bound immutable cancellation proof and a nonchargeable terminal intent');
select commerce_test.check_true(public.commerce_payment_attempt_control('62000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000001','cancel_unstarted')=(select value from commerce_test.state where key='stop_cancelled'),'duplicate stop is idempotent with the exact original proof and timestamp');
select commerce_test.check_true(public.commerce_payment_start('62000000-0000-4000-8000-000000000001','[{"product_id":"64000000-0000-4000-8000-000000000001","quantity":1}]','{"name":"Stop Buyer","phone":"9000000000"}','pickup','66000000-0000-4000-8000-000000000001')->>'state'='cancelled_unstarted','same-key online replay retains the stopped original instead of creating another intent');
select commerce_test.must_fail($q$select public.commerce_create_cod_order_v2('62000000-0000-4000-8000-000000000001','[{"product_id":"64000000-0000-4000-8000-000000000001","quantity":1}]','{"name":"Stop Buyer","phone":"9000000000"}','pickup','66000000-0000-4000-8000-000000000001')$q$,'stopped old key remains reserved and cannot switch to COD',array['23505']);
reset role;
select commerce_test.check_true((select (to_jsonb(i)-array['state','updated_at'])=(select value-array['state','updated_at'] from commerce_test.state where key='stop_original_row') from commerce_private.payment_intents i where i.id=(select (value->>'id')::uuid from commerce_test.state where key='stop_intent')),'stopping preserves original intent ID, buyer, cart, request, quote, amount, currency, credential version and creation time');
select commerce_test.check_true((select count(*)=1 from commerce_private.payment_unstarted_cancellations where website_id='62000000-0000-4000-8000-000000000001'),'stopping creates exactly one proof for the original attempt');
select commerce_test.must_fail($q$update commerce_private.payment_intents set state='new' where id=(select (value->>'id')::uuid from commerce_test.state where key='stop_intent')$q$,'a stopped intent cannot be reopened even by a direct fixture-owner update',array['42501']);
select commerce_test.must_fail($q$update commerce_private.payment_intents set updated_at=now() where id=(select (value->>'id')::uuid from commerce_test.state where key='stop_intent')$q$,'a stopped intent timestamp cannot be overwritten',array['42501']);
select commerce_test.must_fail($q$update commerce_private.payment_unstarted_cancellations set cancelled_at=now() where website_id='62000000-0000-4000-8000-000000000001'$q$,'unstarted cancellation proof cannot be rewritten',array['42501']);
select commerce_test.must_fail($q$delete from commerce_private.payment_unstarted_cancellations where website_id='62000000-0000-4000-8000-000000000001'$q$,'unstarted cancellation proof cannot be deleted',array['42501']);
set local role service_role;
select commerce_test.check_true(public.commerce_payment_service('claim_create',jsonb_build_object('intent_id',(select value->>'id' from commerce_test.state where key='stop_intent')))->'claimed'='false'::jsonb,'provider creation cannot be claimed after a stopped intent');
select commerce_test.must_fail($q$select public.commerce_payment_service('attach_create',jsonb_build_object('intent_id',(select value->>'id' from commerce_test.state where key='stop_intent'),'lease_token',gen_random_uuid(),'provider_order_id','order_stopped001','amount_paise',251,'currency','INR'))$q$,'late create attachment cannot revive a stopped intent',array['22023']);
select commerce_test.must_fail($q$select public.commerce_payment_service('attach_reconciled',jsonb_build_object('intent_id',(select value->>'id' from commerce_test.state where key='stop_intent'),'provider_order_id','order_stopped001','amount_paise',251,'currency','INR'))$q$,'late reconciliation attachment cannot revive a stopped intent',array['22023']);
select commerce_test.must_fail($q$select public.commerce_payment_service('capture',jsonb_build_object('intent_id',(select value->>'id' from commerce_test.state where key='stop_intent'),'credential_version','65000000-0000-4000-8000-000000000001','provider_order_id','order_stopped001','provider_payment_id','pay_stopped001','amount_paise',251,'currency','INR'))$q$,'late synthetic capture cannot invent a provider binding on a stopped intent',array['22023']);
select commerce_test.check_true(not exists(select 1 from jsonb_array_elements(public.commerce_payment_reconciliation_queue('62000000-0000-4000-8000-000000000001')->'intents') i where i->>'id'=(select value->>'id' from commerce_test.state where key='stop_intent')),'closed unstarted intent disappears from the open Admin recovery queue');
reset role;
do $$declare relation_value record; actual_rows jsonb;
begin
 for relation_value in select * from stop_business_before order by table_name loop
  execute format('select coalesce(jsonb_agg(to_jsonb(row_value) order by to_jsonb(row_value)::text),''[]''::jsonb) from %I.%I row_value',split_part(relation_value.table_name,'.',1),split_part(relation_value.table_name,'.',2)) into actual_rows;
  if actual_rows is distinct from relation_value.rows then raise exception 'Stopping modified business rows in %',relation_value.table_name;end if;
 end loop;
end$$;
select commerce_test.check_true(true,'stopping and rejected provider replays preserve all orders, receipts, stock, coupon usage, wallet, Auth, Storage, merchant and cron rows');

-- Disabling a store/merchant cannot prevent safe recovery of its own original.
set local role authenticated;
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000002',true);
select commerce_test.record('stop_disabled_intent',public.commerce_payment_start('62000000-0000-4000-8000-000000000001','[{"product_id":"64000000-0000-4000-8000-000000000001","quantity":1}]','{"name":"Stop Buyer","phone":"9000000000"}','pickup','66000000-0000-4000-8000-000000000002'));
reset role;
update public.commerce_websites set status='archived' where id='62000000-0000-4000-8000-000000000001';
update commerce_private.payment_merchants set enabled=false where website_id='62000000-0000-4000-8000-000000000001';
set local role authenticated;
select commerce_test.check_true(public.commerce_payment_attempt_control('62000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000002')->'can_cancel_unstarted'='true'::jsonb,'archived store and disabled merchant do not prevent own unstarted inspection');
select commerce_test.check_true(public.commerce_payment_attempt_control('62000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000002','cancel_unstarted')->'payment'->>'state'='cancelled_unstarted','archived store and disabled merchant do not prevent own proven-unstarted stop');
reset role;
update public.commerce_websites set status='active' where id='62000000-0000-4000-8000-000000000001';
update commerce_private.payment_merchants set enabled=true where website_id='62000000-0000-4000-8000-000000000001';

-- Every dispatched or ambiguous state remains protected, including a malformed
-- new fixture with a lease, provider reference or retained receipt.
insert into commerce_private.payment_intents(id,website_id,buyer_id,cart_key,credential_version,request_payload,quote,amount_paise,state,provider_order_id,create_lease)
select ('67000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002',('66000000-0000-4000-8000-'||lpad((n+100)::text,12,'0'))::uuid,'65000000-0000-4000-8000-000000000001','{}','{}',251,state,
 case when n in (3,4,5,7) then 'order_stopblocked'||n else null end,
 case when n=6 then '69000000-0000-4000-8000-000000000001'::uuid else null end
from (values (1,'creating'),(2,'provider_unknown'),(3,'ready'),(4,'captured_unfulfilled'),(5,'fulfilled'),(6,'new'),(7,'new'),(8,'new')) x(n,state);
insert into commerce_private.payment_receipts(website_id,intent_id,credential_version,provider_order_id,provider_payment_id,amount_paise,currency)
values('62000000-0000-4000-8000-000000000001','67000000-0000-4000-8000-000000000008','65000000-0000-4000-8000-000000000001','order_stopreceipt','pay_stopreceipt',251,'INR');
set local role authenticated;
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000002',true);
do $$declare n integer;cart uuid;
begin
 for n in 1..8 loop
  cart:=('66000000-0000-4000-8000-'||lpad((n+100)::text,12,'0'))::uuid;
  perform commerce_test.check_true(public.commerce_payment_attempt_control('62000000-0000-4000-8000-000000000001',cart)->'can_cancel_unstarted'='false'::jsonb,'dispatched/ambiguous payment state remains noncancellable case '||n);
  perform commerce_test.must_fail(format('select public.commerce_payment_attempt_control(%L,%L,''cancel_unstarted'')','62000000-0000-4000-8000-000000000001',cart),'dispatched/ambiguous payment cannot be stopped case '||n,array['23505']);
 end loop;
end$$;
reset role;
select commerce_test.must_fail($q$update commerce_private.payment_intents set state='cancelled_unstarted' where id='67000000-0000-4000-8000-000000000001'$q$,'direct transition cannot fabricate cancellation proof',array['42501']);
select commerce_test.must_fail($q$insert into commerce_private.payment_intents(website_id,buyer_id,cart_key,credential_version,request_payload,quote,amount_paise,state) values('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002',gen_random_uuid(),'65000000-0000-4000-8000-000000000001','{}','{}',251,'cancelled_unstarted')$q$,'terminal payment state cannot be inserted without an original unstarted record',array['42501']);

-- A fresh checkout key, unlike the retained closed one, remains usable.
set local role authenticated;
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000002',true);
select commerce_test.record('stop_fresh_cod',public.commerce_create_cod_order_v2('62000000-0000-4000-8000-000000000001','[{"product_id":"64000000-0000-4000-8000-000000000001","quantity":1}]','{"name":"Stop Buyer","phone":"9000000000"}','pickup','66000000-0000-4000-8000-000000000003'));
select commerce_test.check_true((select value->'order'->>'payment_method'='cod' and value->'order'->>'payment_status'='unpaid' from commerce_test.state where key='stop_fresh_cod'),'new cart UUID permits ordinary COD after stopping the prior unstarted attempt');
select commerce_test.record('stop_fresh_online',public.commerce_payment_start('62000000-0000-4000-8000-000000000001','[{"product_id":"64000000-0000-4000-8000-000000000001","quantity":1}]','{"name":"Stop Buyer","phone":"9000000000"}','pickup','66000000-0000-4000-8000-000000000004'));
select commerce_test.check_true((select value->>'state'='new' and value->>'id'<>(select value->>'id' from commerce_test.state where key='stop_intent') from commerce_test.state where key='stop_fresh_online'),'new cart UUID creates a distinct legitimate online attempt without reusing stopped history');
reset role;
commit;
