-- Real synthetic order/item/timeline facts; never a hosted fixture.
begin;
do $$begin
 if current_database()<>'commerce_test' or inet_server_addr() not in ('127.0.0.1'::inet,'::1'::inet) then raise exception 'Isolated loopback commerce_test required';end if;
end$$;
insert into auth.users(id,email,email_confirmed_at) values
 ('31000000-0000-4000-8000-000000000001','analytics-owner@example.test',now()),
 ('31000000-0000-4000-8000-000000000002','analytics-foreign@example.test',now()),
 ('31000000-0000-4000-8000-000000000003','analytics-buyer@example.test',now());
insert into public.commerce_websites(id,slug,name,status,owner_permissions) values
 ('32000000-0000-4000-8000-000000000001','analytics-fixture','Analytics fixture','active','{"orders":true,"products":true,"inventory":true}'),
 ('32000000-0000-4000-8000-000000000002','analytics-foreign','Analytics foreign','active','{"orders":true,"products":true,"inventory":true}');
insert into public.commerce_memberships(website_id,user_id) values
 ('32000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001'),
 ('32000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000002');
insert into public.commerce_customers(website_id,user_id,name,phone,address) values
 ('32000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000003','Analytics buyer','9000000000','Synthetic fixture address'),
 ('32000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000003','Foreign buyer','9000000000','Synthetic fixture address');
insert into public.commerce_categories(id,website_id,name,slug,active) values
 ('33000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001','Hidden category','hidden-category',false);
insert into public.commerce_products(id,website_id,name,slug,price_paise,stock_quantity,active,category_id) values
 ('34000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001','Variant item','variant-item',400,0,true,null),
 ('34000000-0000-4000-8000-000000000002','32000000-0000-4000-8000-000000000001','Simple item','simple-item',100,2,true,null),
 ('34000000-0000-4000-8000-000000000003','32000000-0000-4000-8000-000000000001','Archived item','archived-item',100,0,false,null),
 ('34000000-0000-4000-8000-000000000004','32000000-0000-4000-8000-000000000002','Foreign private item','foreign-private-item',99999,0,true,null),
 ('34000000-0000-4000-8000-000000000005','32000000-0000-4000-8000-000000000001','Hidden category item','hidden-category-item',100,0,true,'33000000-0000-4000-8000-000000000001');
insert into public.commerce_product_profiles(website_id,product_id,variants_required) values
 ('32000000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000001',true);
insert into public.commerce_product_variants(id,website_id,product_id,sku,name,price_paise,stock_quantity,active) values
 ('34100000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000001','AN-BLUE','Blue',200,3,true),
 ('34100000-0000-4000-8000-000000000002','32000000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000001','AN-RED','Red',300,8,true),
 ('34100000-0000-4000-8000-000000000003','32000000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000001','AN-OLD','Archived variant',100,0,false);

-- An order created as completed records its supplied synthetic creation fact.
-- The exact UTC boundaries do not depend on the session's TimeZone setting.
insert into public.commerce_orders(id,website_id,customer_user_id,idempotency_key,request_payload,customer_details,fulfillment_method,status,subtotal_paise,delivery_fee_paise,discount_paise,total_paise,inventory_tracked,created_at)
select x.id::uuid,'32000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000003',x.id::uuid,'{}','{"name":"Analytics buyer"}','pickup',x.status,x.subtotal,x.fee,x.discount,x.subtotal+x.fee-x.discount,false,
 (((now() at time zone 'UTC')::date+x.day_offset)::timestamp at time zone 'UTC')+x.time_offset
from (values
 ('35000000-0000-4000-8000-000000000001','completed',700::bigint,50::bigint,100::bigint,-2,interval '12 hours'),
 ('35000000-0000-4000-8000-000000000002','completed',300,0,0,0,interval '0'),
 ('35000000-0000-4000-8000-000000000003','completed',200,0,0,-6,interval '0'),
 ('35000000-0000-4000-8000-000000000004','completed',800,0,0,-7,interval '23 hours 59 minutes 59.999999 seconds'),
 ('35000000-0000-4000-8000-000000000005','completed',500,0,0,-31,interval '12 hours'),
 ('35000000-0000-4000-8000-000000000006','placed',700,0,0,0,interval '1 hour'),
 ('35000000-0000-4000-8000-000000000007','cancelled',1100,0,0,0,interval '2 hours'),
 ('35000000-0000-4000-8000-000000000009','completed',1300,0,0,1,interval '0'),
 ('35000000-0000-4000-8000-000000000010','completed',100,0,0,-89,interval '0'),
 ('35000000-0000-4000-8000-000000000011','completed',1700,0,0,-90,interval '23 hours 59 minutes 59.999999 seconds')
) x(id,status,subtotal,fee,discount,day_offset,time_offset);
insert into public.commerce_orders(id,website_id,customer_user_id,idempotency_key,request_payload,customer_details,fulfillment_method,status,subtotal_paise,delivery_fee_paise,total_paise,inventory_tracked)
values('35000000-0000-4000-8000-000000000008','32000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000003','35000000-0000-4000-8000-000000000008','{}','{"name":"Foreign buyer"}','pickup','completed',99999,0,99999,false);
insert into public.commerce_order_items(website_id,order_id,product_id,product_name,variant_id,quantity,unit_price_paise,line_total_paise) values
 ('32000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000001','Variant item','34100000-0000-4000-8000-000000000001',2,200,400),
 ('32000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000001','Variant item','34100000-0000-4000-8000-000000000002',1,300,300),
 ('32000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000002','34000000-0000-4000-8000-000000000002','Simple item',null,3,100,300),
 ('32000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000003','34000000-0000-4000-8000-000000000001','Variant item','34100000-0000-4000-8000-000000000001',1,200,200),
 ('32000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000004','34000000-0000-4000-8000-000000000001','Variant item','34100000-0000-4000-8000-000000000001',4,200,800),
 ('32000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000005','34000000-0000-4000-8000-000000000002','Simple item',null,5,100,500),
 ('32000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000006','34000000-0000-4000-8000-000000000002','Simple item',null,7,100,700),
 ('32000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000007','34000000-0000-4000-8000-000000000002','Simple item',null,11,100,1100),
 ('32000000-0000-4000-8000-000000000002','35000000-0000-4000-8000-000000000008','34000000-0000-4000-8000-000000000004','Foreign private item',null,1,99999,99999),
 ('32000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000009','34000000-0000-4000-8000-000000000002','Simple item',null,13,100,1300),
 ('32000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000010','34000000-0000-4000-8000-000000000002','Simple item',null,1,100,100),
 ('32000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000011','34000000-0000-4000-8000-000000000002','Simple item',null,17,100,1700);
-- These append extra facts whose status also says completed. They must not
-- multiply the first completion or shift it to the payment update date.
update public.commerce_orders set payment_status='paid' where id='35000000-0000-4000-8000-000000000001';
update public.commerce_orders set payment_status='unpaid' where id='35000000-0000-4000-8000-000000000001';

select commerce_test.check_true(not has_function_privilege('anon','public.commerce_growth_analytics(uuid,integer)','EXECUTE') and not has_function_privilege('service_role','public.commerce_growth_analytics(uuid,integer)','EXECUTE'),'analytics clears inherited anonymous and service execution grants');
set local role authenticated;
select set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000001',true);
select commerce_test.record('analytics_7',public.commerce_growth_analytics('32000000-0000-4000-8000-000000000001',7));
select commerce_test.record('analytics_30',public.commerce_growth_analytics('32000000-0000-4000-8000-000000000001',30));
select commerce_test.record('analytics_90',public.commerce_growth_analytics('32000000-0000-4000-8000-000000000001',90));
select commerce_test.check_true((select value->>'period_days'='7' and value->>'timezone'='UTC' and jsonb_array_length(value->'daily_trend')=7 and value->>'period_start_date'=((now() at time zone 'UTC')::date-6)::text and value->>'period_end_date'=((now() at time zone 'UTC')::date)::text from commerce_test.state where key='analytics_7'),'analytics returns a bounded seven-day UTC calendar period');
select commerce_test.check_true((select jsonb_array_length(value->'daily_trend')=30 from commerce_test.state where key='analytics_30') and (select jsonb_array_length(value->'daily_trend')=90 from commerce_test.state where key='analytics_90'),'analytics accepts only explicit bounded thirty/ninety-day periods');
select commerce_test.check_true((select value->>'completed_cod_orders'='3' and value->>'completed_cod_value_paise'='1150' from commerce_test.state where key='analytics_7'),'completion totals include the first UTC boundary and exclude later upper-bound/future facts');
select commerce_test.check_true((select value->>'completed_cod_orders'='4' and value->>'completed_cod_value_paise'='1950' from commerce_test.state where key='analytics_30') and (select value->>'completed_cod_orders'='6' and value->>'completed_cod_value_paise'='2550' from commerce_test.state where key='analytics_90'),'completion periods distinguish seven/thirty/ninety days and exclude the instant before the ninety-day boundary');
select commerce_test.check_true((select count(*)=4 from commerce_test.state s cross join lateral jsonb_array_elements(s.value->'daily_trend') day where s.key='analytics_7' and day->>'completed_orders'='0'),'daily completion series fills every zero day');
select commerce_test.check_true((select sum((day->>'completed_orders')::integer)=3 and sum((day->>'completed_order_value_paise')::bigint)=1150 from commerce_test.state s cross join lateral jsonb_array_elements(s.value->'daily_trend') day where s.key='analytics_7'),'payment-status history cannot duplicate or redate daily completed orders');
select commerce_test.check_true((select value->'daily_trend'->0->>'completed_orders'='1' and value->'daily_trend'->6->>'completed_orders'='1' from commerce_test.state where key='analytics_7'),'daily trend retains exact UTC start and current-day ordering');
select commerce_test.check_true((select value->'best_selling_products'->0->>'product_id'='34000000-0000-4000-8000-000000000001' and value->'best_selling_products'->0->>'units'='4' and value->'best_selling_products'->0->>'gross_item_value_paise'='900' from commerce_test.state where key='analytics_7'),'best sellers aggregate several variants by product using actual completed item units and pre-coupon gross');
select commerce_test.check_true((select value->'best_selling_products'->0->>'units'='8' and value->'best_selling_products'->0->>'gross_item_value_paise'='1700' from commerce_test.state where key='analytics_30') and (select value->'best_selling_products'->0->>'product_id'='34000000-0000-4000-8000-000000000002' and value->'best_selling_products'->0->>'units'='9' from commerce_test.state where key='analytics_90'),'best seller ranking changes with the requested completion period');
select commerce_test.check_true((select jsonb_array_length(value->'best_selling_products')=2 and value::text not like '%Foreign private item%' and value::text not like '%34000000-0000-4000-8000-000000000004%' from commerce_test.state where key='analytics_7'),'completed best sellers omit placed/cancelled/future and foreign-tenant item records');
select commerce_test.check_true((select value->'captured_funds_paise'='null'::jsonb and value->'settled_funds_paise'='null'::jsonb and value->'funds_tracking_available'='false'::jsonb from commerce_test.state where key='analytics_7'),'analytics values do not claim captured or settled funds');
select commerce_test.check_true((select value->'low_stock_available'='true'::jsonb and value->>'low_stock_threshold'='5' and jsonb_array_length(value->'low_stock')=2 from commerce_test.state where key='analytics_7'),'authorized low-stock alerts expose only bounded active sellable stock sources');
select commerce_test.check_true((select value->'low_stock'->0->>'product_id'='34000000-0000-4000-8000-000000000002' and value->'low_stock'->0->'variant_id'='null'::jsonb and value->'low_stock'->1->>'variant_id'='34100000-0000-4000-8000-000000000001' and value->'low_stock'->1->>'sku'='AN-BLUE' from commerce_test.state where key='analytics_7'),'low-stock alerts separate base and variant inventory without unusable required-variant base alerts');
select commerce_test.check_true((public.commerce_growth_workspace('32000000-0000-4000-8000-000000000001')->'analytics')=(select value from commerce_test.state where key='analytics_30'),'existing growth workspace retains its signature and uses the thirty-day analytics contract');
set local time zone 'America/Los_Angeles';
select commerce_test.check_true(public.commerce_growth_analytics('32000000-0000-4000-8000-000000000001',7)=(select value from commerce_test.state where key='analytics_7'),'analytics UTC dates and boundaries are independent of session timezone');
set local time zone 'UTC';
select commerce_test.must_fail($q$select public.commerce_growth_analytics('32000000-0000-4000-8000-000000000001',null)$q$,'analytics rejects explicit NULL period',array['22023']);
select commerce_test.must_fail($q$select public.commerce_growth_analytics('32000000-0000-4000-8000-000000000001',0)$q$,'analytics rejects zero-day period',array['22023']);
select commerce_test.must_fail($q$select public.commerce_growth_analytics('32000000-0000-4000-8000-000000000001',8)$q$,'analytics rejects unsupported arbitrary date ranges',array['22023']);
select commerce_test.must_fail($q$select public.commerce_growth_analytics('32000000-0000-4000-8000-000000000001',91)$q$,'analytics rejects unbounded historical period',array['22023']);
select set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000002',true);
select commerce_test.must_fail($q$select public.commerce_growth_analytics('32000000-0000-4000-8000-000000000001',7)$q$,'foreign owner cannot query another tenant analytics',array['42501']);
select set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000003',true);
select commerce_test.must_fail($q$select public.commerce_growth_analytics('32000000-0000-4000-8000-000000000001',7)$q$,'ordinary buyer cannot query owner analytics',array['42501']);
reset role;
update public.commerce_websites set owner_permissions=jsonb_set(owner_permissions,'{inventory}','false') where id='32000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000001',true);
select commerce_test.check_true(public.commerce_growth_analytics('32000000-0000-4000-8000-000000000001',7)->'low_stock'='[]'::jsonb and public.commerce_growth_analytics('32000000-0000-4000-8000-000000000001',7)->'low_stock_available'='false'::jsonb,'revoked inventory permission suppresses every stock alert');
reset role;
update public.commerce_websites set owner_permissions=jsonb_set(owner_permissions,'{inventory}','true'),features=jsonb_set(features,'{inventory}','false') where id='32000000-0000-4000-8000-000000000001';
set local role authenticated;
select commerce_test.check_true(public.commerce_growth_analytics('32000000-0000-4000-8000-000000000001',7)->'low_stock'='[]'::jsonb and public.commerce_growth_analytics('32000000-0000-4000-8000-000000000001',7)->'low_stock_available'='false'::jsonb,'disabled inventory feature suppresses stock alerts even for an inventory owner');
reset role;
update public.commerce_websites set features=jsonb_set(features,'{inventory}','true'),owner_permissions=jsonb_set(owner_permissions,'{orders}','false') where id='32000000-0000-4000-8000-000000000001';
set local role authenticated;
select commerce_test.must_fail($q$select public.commerce_growth_analytics('32000000-0000-4000-8000-000000000001',7)$q$,'revoked orders permission prevents analytics read',array['42501']);
reset role;
update public.commerce_websites set owner_permissions=jsonb_set(owner_permissions,'{orders}','true') where id='32000000-0000-4000-8000-000000000001';
update auth.users set email_confirmed_at=null where id='31000000-0000-4000-8000-000000000001';
set local role authenticated;
select commerce_test.must_fail($q$select public.commerce_growth_analytics('32000000-0000-4000-8000-000000000001',7)$q$,'withdrawn Auth verification prevents analytics read',array['42501']);
reset role;
update auth.users set email_confirmed_at=now() where id='31000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select commerce_test.check_true(public.commerce_growth_analytics('20000000-0000-4000-8000-000000000001',30)->'completion_history_incomplete'='true'::jsonb and public.commerce_growth_analytics('20000000-0000-4000-8000-000000000001',30)->>'completed_orders_without_completion_event'='1','pre-expansion completed history is flagged without inventing a completion timestamp');
select commerce_test.check_true(jsonb_array_length(public.commerce_growth_analytics('20000000-0000-4000-8000-000000000001',30)->'best_selling_products')=0,'completed orders without truthful completion events never fabricate dated best seller activity');
reset role;
update public.commerce_orders set payment_status='paid' where id='35100000-0000-4000-8000-000000000001';
insert into public.commerce_store_settings(website_id,policies) values('20000000-0000-4000-8000-000000000001','{"returns_enabled":true,"return_days":7,"returns":"Synthetic seven-day return policy."}') on conflict(website_id) do update set policies=excluded.policies;
set local role authenticated;
select commerce_test.check_true(public.commerce_growth_analytics('20000000-0000-4000-8000-000000000001',30)->'completion_history_incomplete'='true'::jsonb and jsonb_array_length(public.commerce_growth_analytics('20000000-0000-4000-8000-000000000001',30)->'best_selling_products')=0,'a later payment-only event never invents completion truth for a pre-expansion order');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select commerce_test.check_true(not exists(select 1 from jsonb_array_elements(public.commerce_customer_experience('20000000-0000-4000-8000-000000000001')->'request_eligible') eligibility where eligibility->>'order_id'='35100000-0000-4000-8000-000000000001' and eligibility->>'type'='return'),'payment updates cannot reopen legacy return eligibility in the account snapshot');
select commerce_test.must_fail($q$select public.commerce_customer_experience('20000000-0000-4000-8000-000000000001','request_create','{"order_id":"35100000-0000-4000-8000-000000000001","type":"return","reason":"Synthetic expired legacy return request."}')$q$,'payment-only event cannot extend the legacy return-request window',array['22023']);
reset role;
-- Response bounds remain true when more eligible rows exist than the UI cap.
insert into public.commerce_products(website_id,name,slug,price_paise,stock_quantity)
select '32000000-0000-4000-8000-000000000001','Low-stock bound fixture '||n,'low-stock-bound-'||n,100,0 from generate_series(1,55) n;
set local role authenticated;
select set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000001',true);
select commerce_test.check_true(jsonb_array_length(public.commerce_growth_analytics('32000000-0000-4000-8000-000000000001',7)->'low_stock')=50,'low-stock response never exceeds fifty alerts');
reset role;
do $$declare product_value record; order_value uuid; quantity_value integer:=20;
begin
 for product_value in select id,name from public.commerce_products where website_id='32000000-0000-4000-8000-000000000001' and slug like 'low-stock-bound-%' order by slug limit 11 loop
  order_value:=gen_random_uuid(); quantity_value:=quantity_value+1;
  insert into public.commerce_orders(id,website_id,customer_user_id,idempotency_key,request_payload,customer_details,fulfillment_method,status,subtotal_paise,delivery_fee_paise,total_paise,inventory_tracked)
  values(order_value,'32000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000003',gen_random_uuid(),'{}','{"name":"Bounded analytics fixture"}','pickup','completed',quantity_value*100,0,quantity_value*100,false);
  insert into public.commerce_order_items(website_id,order_id,product_id,product_name,quantity,unit_price_paise,line_total_paise)
  values('32000000-0000-4000-8000-000000000001',order_value,product_value.id,product_value.name,quantity_value,100,quantity_value*100);
 end loop;
end$$;
set local role authenticated;
select commerce_test.check_true(jsonb_array_length(public.commerce_growth_analytics('32000000-0000-4000-8000-000000000001',7)->'best_selling_products')=10 and public.commerce_growth_analytics('32000000-0000-4000-8000-000000000001',7)->'best_selling_products'->0->>'units'='31','best sellers return the ten leading products when more completed products qualify');
reset role;
select commerce_test.check_true((select balance_paise=123456 from public.legacy_preservation_fixture) and (select count(*)=1 and bool_and(command='existing settlement fixture') from cron.job),'analytics introduces no wallet changes or scheduled jobs');
commit;
