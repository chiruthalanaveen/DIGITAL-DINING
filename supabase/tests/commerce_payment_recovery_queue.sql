-- Test-only open payment attempts. No provider, network, or hosted SQL action.
begin;
do $$begin
 if current_database()<>'commerce_test' or inet_server_addr() not in ('127.0.0.1'::inet,'::1'::inet) then raise exception 'Isolated loopback commerce_test required';end if;
end$$;
insert into auth.users(id,email,email_confirmed_at) values
 ('41000000-0000-4000-8000-000000000001','queue-owner@example.test',now()),
 ('41000000-0000-4000-8000-000000000002','PRIVATE_RECOVERY_BUYER@example.test',now()),
 ('41000000-0000-4000-8000-000000000003','queue-foreign@example.test',now());
insert into public.commerce_websites(id,slug,name,status) values
 ('42000000-0000-4000-8000-000000000001','recovery-queue','Recovery queue','archived'),
 ('42000000-0000-4000-8000-000000000002','recovery-foreign','Recovery foreign','suspended'),
 ('42000000-0000-4000-8000-000000000003','recovery-empty','Recovery empty','archived');
insert into public.commerce_memberships(website_id,user_id) values
 ('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001');
insert into public.commerce_customers(website_id,user_id,name,phone,address) values
 ('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000002','PRIVATE_RECOVERY_NAME','9000000000','PRIVATE_RECOVERY_ADDRESS');
insert into public.commerce_products(id,website_id,name,slug,price_paise,stock_quantity) values
 ('44000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','Recovery fixture item','recovery-item',906,5);
insert into commerce_private.payment_credential_versions(id,website_id,mode,ciphertext,created_by) values
 ('45000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','test',repeat('PRIVATE_RECOVERY_CIPHERTEXT',5),'PRIVATE_RECOVERY_ADMIN@example.test'),
 ('45000000-0000-4000-8000-000000000002','42000000-0000-4000-8000-000000000001','live',repeat('PRIVATE_RECOVERY_ROTATED_CIPHERTEXT',5),'PRIVATE_RECOVERY_ADMIN@example.test'),
 ('45000000-0000-4000-8000-000000000003','42000000-0000-4000-8000-000000000002','test',repeat('PRIVATE_RECOVERY_FOREIGN_CIPHERTEXT',5),'PRIVATE_RECOVERY_ADMIN@example.test');
-- The current merchant is disabled and has rotated to live mode. Old attempts
-- retain test mode from their original immutable credential version.
insert into commerce_private.payment_merchants(website_id,enabled,credential_version) values
 ('42000000-0000-4000-8000-000000000001',false,'45000000-0000-4000-8000-000000000002'),
 ('42000000-0000-4000-8000-000000000002',false,'45000000-0000-4000-8000-000000000003');
insert into commerce_private.payment_intents(id,website_id,buyer_id,cart_key,credential_version,request_payload,quote,amount_paise,state,provider_order_id,created_at)
select ('46000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000002',('46000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '45000000-0000-4000-8000-000000000001','{"customer":{"name":"PRIVATE_RECOVERY_NAME","phone":"9000000000","address":"PRIVATE_RECOVERY_ADDRESS"}}','{"private":"PRIVATE_RECOVERY_QUOTE"}',100+n,'ready','order_recoveryready'||n,
 now()-interval '2 days'+case when n<=2 then interval '0' else n*interval '1 second' end
from generate_series(1,101) n;
insert into commerce_private.payment_intents(id,website_id,buyer_id,cart_key,credential_version,request_payload,quote,amount_paise,state,provider_order_id,created_at) values
 ('46000000-0000-4000-8000-000000000901','42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000002','46000000-0000-4000-8000-000000000901','45000000-0000-4000-8000-000000000001','{"private":"PRIVATE_RECOVERY_REQUEST"}','{}',901,'captured_unfulfilled','order_recoverycritical',now()),
 ('46000000-0000-4000-8000-000000000902','42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000002','46000000-0000-4000-8000-000000000902','45000000-0000-4000-8000-000000000001','{}','{}',902,'provider_unknown',null,now()-interval '1 day'),
 ('46000000-0000-4000-8000-000000000903','42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000002','46000000-0000-4000-8000-000000000903','45000000-0000-4000-8000-000000000001','{}','{}',903,'creating',null,now()-interval '3 days'),
 ('46000000-0000-4000-8000-000000000904','42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000002','46000000-0000-4000-8000-000000000904','45000000-0000-4000-8000-000000000002','{}','{}',904,'new',null,now()-interval '4 days'),
 ('46000000-0000-4000-8000-000000000906','42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000002','46000000-0000-4000-8000-000000000906','45000000-0000-4000-8000-000000000001','{}','{}',906,'fulfilled','order_recoveryfulfilled',now()-interval '5 days'),
 ('46000000-0000-4000-8000-000000000801','42000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000003','46000000-0000-4000-8000-000000000801','45000000-0000-4000-8000-000000000003','{}','{}',801,'captured_unfulfilled','order_recoverycritical',now());
update commerce_private.payment_intents set create_lease='49000000-0000-4000-8000-000000000001' where id='46000000-0000-4000-8000-000000000903';
insert into public.commerce_orders(id,website_id,customer_user_id,idempotency_key,request_payload,customer_details,fulfillment_method,payment_method,payment_status,subtotal_paise,delivery_fee_paise,total_paise,inventory_tracked) values
 ('48000000-0000-4000-8000-000000000906','42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000002','46000000-0000-4000-8000-000000000906','{"private":"PRIVATE_RECOVERY_REQUEST"}','{"name":"PRIVATE_RECOVERY_NAME","phone":"9000000000","address":"PRIVATE_RECOVERY_ADDRESS"}','pickup','razorpay','paid',906,0,906,false);
insert into public.commerce_order_items(website_id,order_id,product_id,product_name,quantity,unit_price_paise,line_total_paise) values
 ('42000000-0000-4000-8000-000000000001','48000000-0000-4000-8000-000000000906','44000000-0000-4000-8000-000000000001','PRIVATE_RECOVERY_ITEM',1,906,906);
insert into commerce_private.payment_receipts(id,website_id,intent_id,credential_version,provider_order_id,provider_payment_id,amount_paise,currency,state,order_id,reconciliation_code) values
 ('47000000-0000-4000-8000-000000000901','42000000-0000-4000-8000-000000000001','46000000-0000-4000-8000-000000000901','45000000-0000-4000-8000-000000000001','order_recoverycritical','pay_recoverycritical',901,'INR','captured_unfulfilled',null,'22023'),
 ('47000000-0000-4000-8000-000000000906','42000000-0000-4000-8000-000000000001','46000000-0000-4000-8000-000000000906','45000000-0000-4000-8000-000000000001','order_recoveryfulfilled','pay_recoveryfulfilled',906,'INR','fulfilled','48000000-0000-4000-8000-000000000906',''),
 ('47000000-0000-4000-8000-000000000801','42000000-0000-4000-8000-000000000002','46000000-0000-4000-8000-000000000801','45000000-0000-4000-8000-000000000003','order_recoverycritical','pay_recoverycritical',801,'INR','captured_unfulfilled',null,'23505');

-- Snapshot every business/private table plus existing policy/ACL definitions.
-- This deliberately excludes assertion-helper tables, which record the tests.
create temporary table recovery_queue_before(table_name text primary key,rows jsonb);
do $$declare relation_value record;
begin
 for relation_value in select n.nspname schema_name,c.relname table_name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','commerce_private','auth','storage','cron') and c.relkind='r' order by 1,2 loop
  execute format('insert into recovery_queue_before select %L,coalesce(jsonb_agg(to_jsonb(row_value) order by to_jsonb(row_value)::text),''[]''::jsonb) from %I.%I row_value',relation_value.schema_name||'.'||relation_value.table_name,relation_value.schema_name,relation_value.table_name);
 end loop;
end$$;
select commerce_test.record('recovery_queue_policies',(select jsonb_agg(to_jsonb(policy_value) order by schemaname,tablename,policyname) from pg_policies policy_value where schemaname in ('public','commerce_private','auth','storage','cron')));
select commerce_test.record('recovery_queue_grants',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'acl',c.relacl::text,'rls',c.relrowsecurity) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','commerce_private','auth','storage','cron') and c.relkind='r'));
select commerce_test.check_true(not has_function_privilege('anon','public.commerce_payment_reconciliation_queue(uuid)','EXECUTE') and not has_function_privilege('authenticated','public.commerce_payment_reconciliation_queue(uuid)','EXECUTE') and has_function_privilege('service_role','public.commerce_payment_reconciliation_queue(uuid)','EXECUTE'),'recovery queue explicitly grants execution only to service role');
select commerce_test.check_true((select prosecdef and provolatile='s' and proconfig=array['search_path=""'] and not exists(select 1 from aclexplode(proacl) privilege_value where privilege_value.grantee=0 and privilege_value.privilege_type='EXECUTE') from pg_proc where oid='public.commerce_payment_reconciliation_queue(uuid)'::regprocedure),'recovery queue is stable SECURITY DEFINER with empty search path and no PUBLIC grant');
select commerce_test.must_fail($q$select public.commerce_payment_reconciliation_queue('42000000-0000-4000-8000-000000000001')$q$,'migration owner cannot bypass actual service-role guard',array['42501']);
select set_config('request.jwt.claim.role','service_role',true);
select commerce_test.must_fail($q$select public.commerce_payment_reconciliation_queue('42000000-0000-4000-8000-000000000001')$q$,'forged service JWT does not authorize a definer-owner queue call',array['42501']);
set local role authenticated;
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000001',true);
select commerce_test.must_fail($q$select public.commerce_payment_reconciliation_queue('42000000-0000-4000-8000-000000000001')$q$,'website owner cannot execute Admin payment queue',array['42501']);
select set_config('request.jwt.claim.sub','41000000-0000-4000-8000-000000000002',true);
select commerce_test.must_fail($q$select public.commerce_payment_reconciliation_queue('42000000-0000-4000-8000-000000000001')$q$,'buyer cannot enumerate private payment attempts despite forged service JWT',array['42501']);
reset role;
set local role anon;
select commerce_test.must_fail($q$select public.commerce_payment_reconciliation_queue('42000000-0000-4000-8000-000000000001')$q$,'anonymous caller cannot execute Admin payment queue',array['42501']);
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','authenticated',true);
select commerce_test.record('recovery_queue',public.commerce_payment_reconciliation_queue('42000000-0000-4000-8000-000000000001'));
select commerce_test.check_true((select value->>'website_id'='42000000-0000-4000-8000-000000000001' and value->>'total_count'='105' and value->'has_more'='true'::jsonb and jsonb_array_length(value->'intents')=100 from commerce_test.state where key='recovery_queue'),'actual service role returns exact105 total and at most100 open attempts on an archived disabled merchant');
select commerce_test.check_true((select value-array['website_id','intents','total_count','has_more']='{}'::jsonb from commerce_test.state where key='recovery_queue'),'recovery queue envelope contains only the documented fields');
select commerce_test.check_true((select value->'intents'->0->>'id'='46000000-0000-4000-8000-000000000901' from commerce_test.state where key='recovery_queue'),'newer captured-unfulfilled attempt precedes more than100 older ready attempts');
select commerce_test.check_true((select value->'intents'->1->>'id'='46000000-0000-4000-8000-000000000903' and value->'intents'->2->>'id'='46000000-0000-4000-8000-000000000902' from commerce_test.state where key='recovery_queue'),'provider-unknown and creating attempts use chronological order within their priority bucket');
select commerce_test.check_true((select value->'intents'->3->>'id'='46000000-0000-4000-8000-000000000904' and value->'intents'->4->>'id'='46000000-0000-4000-8000-000000000001' and value->'intents'->5->>'id'='46000000-0000-4000-8000-000000000002' from commerce_test.state where key='recovery_queue'),'ready/new attempts sort by creation and deterministic UUID tie-breaker');
select commerce_test.check_true((select count(distinct item->>'state')=5 and bool_and(item->>'website_id'='42000000-0000-4000-8000-000000000001') from commerce_test.state s cross join lateral jsonb_array_elements(s.value->'intents') item where s.key='recovery_queue'),'all five open states are represented without crossing tenant boundaries');
select commerce_test.check_true((select not exists(select 1 from jsonb_array_elements(value->'intents') item where item->>'state'='fulfilled') and value::text not like '%46000000-0000-4000-8000-000000000906%' and value::text not like '%46000000-0000-4000-8000-000000000801%' from commerce_test.state where key='recovery_queue'),'fulfilled and foreign-tenant attempts do not appear in projected rows or count');
select commerce_test.check_true((select bool_and(item-array['id','website_id','cart_key','state','amount_paise','currency','mode','provider_order_id','created_at','receipt']='{}'::jsonb and item ?& array['id','website_id','cart_key','state','amount_paise','currency','mode','provider_order_id','created_at','receipt']) from commerce_test.state s cross join lateral jsonb_array_elements(s.value->'intents') item where s.key='recovery_queue'),'every intent uses the exact safe projection rather than a private row snapshot');
select commerce_test.check_true((select value->'intents'->0->'receipt'='{"id":"47000000-0000-4000-8000-000000000901","state":"captured_unfulfilled","order_id":null,"reconciliation_code":"22023"}'::jsonb and value->'intents'->1->'receipt'='null'::jsonb from commerce_test.state where key='recovery_queue'),'receipt projection contains only safe immutable references and absent receipts stay null');
select commerce_test.check_true((select value->'intents'->0->>'mode'='test' and value->'intents'->3->>'mode'='live' from commerce_test.state where key='recovery_queue'),'intent mode comes from its original credential version despite disabled rotated merchant settings');
select commerce_test.check_true((select value::text not like '%PRIVATE_RECOVERY_%' and value::text not like '%41000000-0000-4000-8000-000000000002%' and value::text not like '%49000000-0000-4000-8000-000000000001%' and value::text not like '%45000000-0000-4000-8000-000000000001%' and value::text not like '%provider_payment_id%' from commerce_test.state where key='recovery_queue'),'queue reveals no buyer PII, actor emails, credential ciphertext/version, request/quote payloads or private leases');
select commerce_test.check_true(public.commerce_payment_reconciliation_queue('42000000-0000-4000-8000-000000000001')=(select value from commerce_test.state where key='recovery_queue'),'unchanged repeated queue reads are deterministic');
select commerce_test.record('recovery_queue_foreign',public.commerce_payment_reconciliation_queue('42000000-0000-4000-8000-000000000002'));
select commerce_test.check_true((select value->>'total_count'='1' and value->'has_more'='false'::jsonb and jsonb_array_length(value->'intents')=1 and value->'intents'->0->>'website_id'='42000000-0000-4000-8000-000000000002' and value->'intents'->0->'receipt'->>'reconciliation_code'='23505' from commerce_test.state where key='recovery_queue_foreign'),'separate suspended tenant gets only its own count, intent and bound receipt');
select commerce_test.check_true(public.commerce_payment_reconciliation_queue('42000000-0000-4000-8000-000000000003')='{"website_id":"42000000-0000-4000-8000-000000000003","intents":[],"total_count":0,"has_more":false}'::jsonb,'archived unconfigured website returns an exact empty queue');
select commerce_test.must_fail($q$select public.commerce_payment_reconciliation_queue(null)$q$,'service queue rejects missing website identifier',array['22023']);
select commerce_test.must_fail($q$select public.commerce_payment_reconciliation_queue('42000000-0000-4000-8000-000000000099')$q$,'service queue rejects nonexistent website',array['22023']);
reset role;
do $$declare relation_value record; actual_rows jsonb;
begin
 for relation_value in select * from recovery_queue_before order by table_name loop
  execute format('select coalesce(jsonb_agg(to_jsonb(row_value) order by to_jsonb(row_value)::text),''[]''::jsonb) from %I.%I row_value',split_part(relation_value.table_name,'.',1),split_part(relation_value.table_name,'.',2)) into actual_rows;
  if actual_rows is distinct from relation_value.rows then raise exception 'Recovery queue modified existing rows in %',relation_value.table_name;end if;
 end loop;
end$$;
select commerce_test.check_true(true,'queue reads preserve every private payment, order, stock, wallet, Auth, Storage and cron fixture row');
select commerce_test.check_true((select value=(select jsonb_agg(to_jsonb(policy_value) order by schemaname,tablename,policyname) from pg_policies policy_value where schemaname in ('public','commerce_private','auth','storage','cron')) from commerce_test.state where key='recovery_queue_policies'),'queue reads preserve every existing RLS policy definition');
select commerce_test.check_true((select value=(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,'acl',c.relacl::text,'rls',c.relrowsecurity) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','commerce_private','auth','storage','cron') and c.relkind='r') from commerce_test.state where key='recovery_queue_grants'),'queue reads preserve every table grant and RLS enablement setting');
-- Exercise the exact100 boundary without deleting historical rows: add a
-- separate synthetic website with exactly100 unstarted attempts.
insert into public.commerce_websites(id,slug,name,status) values('42000000-0000-4000-8000-000000000004','recovery-exact100','Recovery exact100','setup');
insert into commerce_private.payment_credential_versions(id,website_id,mode,ciphertext,created_by) values('45000000-0000-4000-8000-000000000004','42000000-0000-4000-8000-000000000004','test',repeat('PRIVATE_RECOVERY_EXACT_CIPHERTEXT',5),'admin@example.test');
insert into commerce_private.payment_intents(website_id,buyer_id,cart_key,credential_version,request_payload,quote,amount_paise)
select '42000000-0000-4000-8000-000000000004','41000000-0000-4000-8000-000000000002',gen_random_uuid(),'45000000-0000-4000-8000-000000000004','{}','{}',100 from generate_series(1,100);
set local role service_role;
select commerce_test.record('recovery_exact100',public.commerce_payment_reconciliation_queue('42000000-0000-4000-8000-000000000004'));
select commerce_test.check_true((select value->>'total_count'='100' and value->'has_more'='false'::jsonb and jsonb_array_length(value->'intents')=100 from commerce_test.state where key='recovery_exact100'),'exact100 open attempts return100 rows with has_more false');
reset role;
commit;
