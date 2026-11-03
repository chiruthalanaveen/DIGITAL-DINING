-- Fictional fixtures only. Run after foundation, baseline tests and the catalog /
-- customer migrations, exclusively on isolated loopback commerce_test.
begin;
do $$ begin
 if current_database()<>'commerce_test' or inet_server_addr() not in ('127.0.0.1'::inet,'::1'::inet) then raise exception 'Customer fixtures require loopback commerce_test'; end if;
end $$;
insert into auth.users(id,email,email_confirmed_at) values
 ('a1000000-0000-4000-8000-000000000001','customer-owner-a@example.test',now()),
 ('a1000000-0000-4000-8000-000000000002','customer-owner-b@example.test',now()),
 ('a1000000-0000-4000-8000-000000000003','customer-buyer-a@example.test',now()),
 ('a1000000-0000-4000-8000-000000000004','customer-buyer-b@example.test',now()),
 ('a1000000-0000-4000-8000-000000000005','customer-unverified@example.test',null);
insert into public.commerce_websites(id,slug,name,status) values
 ('b1000000-0000-4000-8000-000000000001','customer-alpha','Customer Alpha','active'),
 ('b1000000-0000-4000-8000-000000000002','customer-beta','Customer Beta','active');
insert into public.commerce_memberships(website_id,user_id) values
 ('b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001'),
 ('b1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000002');
insert into public.commerce_products(id,website_id,name,slug,price_paise,stock_quantity) values
 ('c1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Customer Product','customer-product',100,9),
 ('c1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000002','Foreign Product','customer-foreign',100,10),
 ('c1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000001','Unpurchased Product','customer-unpurchased',100,10);
insert into public.commerce_customers(website_id,user_id,name,phone,address) values
 ('b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003','Buyer A','9000000000','Local test address'),
 ('b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000004','Buyer B','9000000001','Other test address');
insert into public.commerce_orders(id,website_id,customer_user_id,idempotency_key,request_payload,customer_details,fulfillment_method,status,subtotal_paise,delivery_fee_paise,total_paise,inventory_tracked) values
 ('d1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000001','{}','{"name":"Buyer A"}','pickup','placed',100,0,100,true),
 ('d1000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000002','{}','{"name":"Buyer A"}','pickup','completed',100,0,100,false),
 ('d1000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000003','{}','{"name":"Buyer B"}','pickup','completed',100,0,100,false);
insert into public.commerce_order_items(website_id,order_id,product_id,product_name,quantity,unit_price_paise,line_total_paise) values
 ('b1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','Customer Product',1,100,100),
 ('b1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001','Customer Product',1,100,100),
 ('b1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000001','Customer Product',1,100,100);

select commerce_test.check_true((select count(*)=3 from public.commerce_order_status_events where website_id='b1000000-0000-4000-8000-000000000001'),'customer timeline captures actual inserted order states');
select commerce_test.check_true(not has_table_privilege('service_role','public.commerce_order_status_events','INSERT,UPDATE,DELETE'),'service role cannot forge timeline by direct DML');
select commerce_test.check_true(not has_table_privilege('authenticated','public.commerce_reviews','INSERT,UPDATE,DELETE'),'review table rejects implicit default DML grants');
select commerce_test.check_true(not has_function_privilege('service_role','commerce_private.customer_snapshot(uuid,uuid)','EXECUTE'),'private customer helper removes default service execution');
select commerce_test.check_true(not has_function_privilege('anon','public.commerce_customer_experience(uuid,text,jsonb)','EXECUTE'),'anonymous customer RPC execution is denied');
select commerce_test.must_fail($q$update public.commerce_order_status_events set status='cancelled' where website_id='b1000000-0000-4000-8000-000000000001'$q$,'timeline immutability rejects even privileged rewrites',array['42501']);

set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000005',true);
select commerce_test.must_fail($q$select public.commerce_customer_experience('b1000000-0000-4000-8000-000000000001')$q$,'unverified customers cannot use experience RPC',array['42501']);
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000003',true);
select commerce_test.record('customer_experience',public.commerce_customer_experience('b1000000-0000-4000-8000-000000000001','wishlist_add','{"product_id":"c1000000-0000-4000-8000-000000000001"}'));
select public.commerce_customer_experience('b1000000-0000-4000-8000-000000000001','wishlist_add','{"product_id":"c1000000-0000-4000-8000-000000000001"}');
select commerce_test.check_true((select count(*)=1 from public.commerce_wishlist_items),'wishlist duplicates are idempotent and self-scoped');
select commerce_test.must_fail($q$select public.commerce_customer_experience('b1000000-0000-4000-8000-000000000001','wishlist_add','{"product_id":"c1000000-0000-4000-8000-000000000002"}')$q$,'wishlist cannot attach another tenant product',array['42501']);
select commerce_test.must_fail($q$select public.commerce_customer_experience('b1000000-0000-4000-8000-000000000001','wishlist_add','{"product_id":"c1000000-0000-4000-8000-000000000001","user_id":"a1000000-0000-4000-8000-000000000004"}')$q$,'wishlist cannot forge customer identity',array['22023']);
select public.commerce_customer_experience('b1000000-0000-4000-8000-000000000001','address_save','{"label":"Home","name":"Buyer A","phone":"9000000000","address":"First local address","pincode":"560001","is_default":true}');
select commerce_test.record('customer_address',(select to_jsonb(a) from public.commerce_saved_addresses a limit 1));
select public.commerce_customer_experience('b1000000-0000-4000-8000-000000000001','address_save','{"label":"Work","name":"Buyer A","phone":"9000000000","address":"Second local address","pincode":"560002","is_default":true}');
select commerce_test.check_true((select count(*)=2 and count(*) filter(where is_default)=1 from public.commerce_saved_addresses),'saving a default address clears only the current customer previous default');
select commerce_test.must_fail($q$select public.commerce_customer_experience('b1000000-0000-4000-8000-000000000001','address_save','{"label":"Home","name":"Buyer A","phone":"9000000000","address":"First local address","pincode":"560001","is_default":"true"}')$q$,'saved address rejects coerced boolean',array['22023']);
select commerce_test.must_fail($q$update public.commerce_saved_addresses set name='Forged'$q$,'saved address direct writes denied',array['42501']);
select commerce_test.must_fail($q$select public.commerce_customer_experience('b1000000-0000-4000-8000-000000000001','address_delete','{"address_id":12345678901234567890123456789012}')$q$,'address identifier rejects JSON number coercion',array['22023']);
select commerce_test.must_fail($q$select public.commerce_customer_experience('b1000000-0000-4000-8000-000000000001','wishlist_remove','{}')$q$,'wishlist removal requires product identifier',array['22023']);
select commerce_test.must_fail($q$select public.commerce_customer_experience('b1000000-0000-4000-8000-000000000001','wishlist_remove','{"product_id":null}')$q$,'wishlist product identifier rejects null',array['22023']);
select commerce_test.must_fail($q$select commerce_private.saved_address('b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003',(select (value->>'id')::uuid from commerce_test.state where key='customer_address'))$q$,'saved address checkout lookup is not exposed as an RPC',array['42501']);
select commerce_test.must_fail($q$select public.commerce_customer_experience('b1000000-0000-4000-8000-000000000001','review_save','{"order_id":"d1000000-0000-4000-8000-000000000001","product_id":"c1000000-0000-4000-8000-000000000001","rating":5,"body":"Not yet completed"}')$q$,'reviews require completed order',array['42501']);
select commerce_test.must_fail($q$select public.commerce_customer_experience('b1000000-0000-4000-8000-000000000001','review_save','{"order_id":"d1000000-0000-4000-8000-000000000003","product_id":"c1000000-0000-4000-8000-000000000001","rating":5,"body":"Another buyer order"}')$q$,'reviews require own completed order',array['42501']);
select commerce_test.must_fail($q$select public.commerce_customer_experience('b1000000-0000-4000-8000-000000000001','review_save','{"order_id":"d1000000-0000-4000-8000-000000000002","product_id":"c1000000-0000-4000-8000-000000000003","rating":5,"body":"Not purchased"}')$q$,'reviews require order item eligibility',array['42501']);
select commerce_test.must_fail($q$select public.commerce_customer_experience('b1000000-0000-4000-8000-000000000001','review_save','{"order_id":"d1000000-0000-4000-8000-000000000002","product_id":"c1000000-0000-4000-8000-000000000001","rating":"5","body":"Coerced rating"}')$q$,'review ratings require JSON integer',array['22023']);
select public.commerce_customer_experience('b1000000-0000-4000-8000-000000000001','review_save','{"order_id":"d1000000-0000-4000-8000-000000000002","product_id":"c1000000-0000-4000-8000-000000000001","rating":5,"title":"Good product","body":"A verified local fixture review"}');
select commerce_test.record('customer_review',(select to_jsonb(r) from public.commerce_reviews r limit 1));
select commerce_test.check_true((select status='pending' from public.commerce_reviews limit 1),'new eligible review waits for moderation');
select commerce_test.check_true((public.commerce_public_product_reviews('b1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001')->>'rating_count')::integer=0,'pending review excluded from public aggregates');
select commerce_test.must_fail($q$select public.commerce_customer_experience('b1000000-0000-4000-8000-000000000001','request_create','{"order_id":"d1000000-0000-4000-8000-000000000003","type":"cancellation","reason":"Foreign order request"}')$q$,'order request cannot use another customer order',array['42501']);
select commerce_test.must_fail($q$select public.commerce_customer_experience('b1000000-0000-4000-8000-000000000001','request_create','{"order_id":"d1000000-0000-4000-8000-000000000002","type":"return","reason":"Return without policy"}')$q$,'return requests require explicit configured policy',array['22023']);
select public.commerce_customer_experience('b1000000-0000-4000-8000-000000000001','request_create','{"order_id":"d1000000-0000-4000-8000-000000000001","type":"cancellation","reason":"Please cancel this order"}');
select commerce_test.record('customer_cancel',(select to_jsonb(r) from public.commerce_order_requests r where type='cancellation'));
select commerce_test.must_fail($q$select public.commerce_customer_experience('b1000000-0000-4000-8000-000000000001','request_create','{"order_id":"d1000000-0000-4000-8000-000000000001","type":"cancellation","reason":"Repeated cancellation"}')$q$,'only one cancellation request per order is accepted',array['23505']);
select commerce_test.check_true((select status='placed' and payment_status='unpaid' from public.commerce_orders where id='d1000000-0000-4000-8000-000000000001'),'customer request cannot directly cancel or refund order');
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000004',true);
select commerce_test.check_true((select count(*)=0 from public.commerce_saved_addresses),'saved address SELECT isolates another customer');
select commerce_test.check_true((select count(*)=0 from public.commerce_wishlist_items),'wishlist SELECT isolates another customer');
select commerce_test.check_true((select count(*)=0 from public.commerce_reviews),'review SELECT isolates another customer');
select commerce_test.check_true((select count(*)=0 from public.commerce_order_requests),'request SELECT isolates another customer');
select commerce_test.check_true((select count(*)=1 and bool_and(order_id='d1000000-0000-4000-8000-000000000003') from public.commerce_order_status_events),'timeline SELECT returns only own order events');
select commerce_test.must_fail($q$select public.commerce_customer_experience('b1000000-0000-4000-8000-000000000001','address_delete',jsonb_build_object('address_id',(select value->>'id' from commerce_test.state where key='customer_address')))$q$,'customer cannot delete another customer saved address',array['42501']);
select commerce_test.must_fail($q$select public.commerce_owner_engagement('b1000000-0000-4000-8000-000000000001')$q$,'customer cannot become owner through engagement RPC',array['42501']);
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);
select commerce_test.must_fail($q$select public.commerce_owner_engagement('b1000000-0000-4000-8000-000000000001','review_moderate',jsonb_build_object('review_id',(select value->>'id' from commerce_test.state where key='customer_review'),'status','approved'))$q$,'foreign owner cannot moderate another tenant review',array['42501']);
select commerce_test.check_true((select count(*)=0 from public.commerce_order_requests),'foreign owner cannot read customer requests');
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
select public.commerce_owner_engagement('b1000000-0000-4000-8000-000000000001','review_moderate',jsonb_build_object('review_id',(select value->>'id' from commerce_test.state where key='customer_review'),'status','approved'));
select commerce_test.check_true((select count(*)=0 from public.commerce_reviews),'product-only moderation does not disclose customer/order identifiers through direct SELECT');
select commerce_test.record('customer_owner_engagement',public.commerce_owner_engagement('b1000000-0000-4000-8000-000000000001'));
select commerce_test.check_true((select not(value->'reviews'->0 ?| array['customer_user_id','order_id']) from commerce_test.state where key='customer_owner_engagement'),'moderation RPC excludes customer/order identity');
select public.commerce_owner_engagement('b1000000-0000-4000-8000-000000000001','request_decide',jsonb_build_object('request_id',(select value->>'id' from commerce_test.state where key='customer_cancel'),'decision','approved','note','Cancelled before fulfillment'));
select public.commerce_owner_engagement('b1000000-0000-4000-8000-000000000001','request_decide',jsonb_build_object('request_id',(select value->>'id' from commerce_test.state where key='customer_cancel'),'decision','approved'));
select commerce_test.check_true((select status='cancelled' and payment_status='unpaid' and inventory_released_at is not null from public.commerce_orders where id='d1000000-0000-4000-8000-000000000001'),'cancellation approval uses stored status and preserves payment status');
reset role;
select commerce_test.check_true((select stock_quantity=10 from public.commerce_products where id='c1000000-0000-4000-8000-000000000001'),'replayed cancellation decision restores inventory once');
select commerce_test.check_true((select count(*)=2 and count(*) filter(where status='cancelled')=1 from public.commerce_order_status_events where order_id='d1000000-0000-4000-8000-000000000001'),'cancellation produces one immutable status event from order truth');
select commerce_test.check_true((select array_agg(status order by event_sequence)=array['placed','cancelled'] from public.commerce_order_status_events where order_id='d1000000-0000-4000-8000-000000000001'),'timeline sequence preserves transitions within one transaction');
update public.commerce_orders set status=status where id='d1000000-0000-4000-8000-000000000001';
select commerce_test.check_true((select count(*)=2 from public.commerce_order_status_events where order_id='d1000000-0000-4000-8000-000000000001'),'unchanged status updates do not invent timeline events');
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000003',true);
select commerce_test.check_true(commerce_private.saved_address('b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003',(select (value->>'id')::uuid from commerce_test.state where key='customer_address'))->>'pincode'='560001','private checkout helper loads customer address from stored truth');
select commerce_test.must_fail($q$select commerce_private.saved_address('b1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000003',(select (value->>'id')::uuid from commerce_test.state where key='customer_address'))$q$,'private checkout address lookup rejects foreign website',array['42501']);
select commerce_test.must_fail($q$select commerce_private.saved_address('b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000004',(select (value->>'id')::uuid from commerce_test.state where key='customer_address'))$q$,'private checkout address lookup rejects foreign identity',array['42501']);
insert into public.commerce_store_settings(website_id,policies) values('b1000000-0000-4000-8000-000000000001','{"returns_enabled":true,"return_days":7,"returns":"Contact the store within seven days."}') on conflict(website_id) do update set policies=excluded.policies;
set local role anon;
select commerce_test.check_true((public.commerce_public_product_reviews('b1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001')->>'rating_count')::integer=1,'approved review enters public aggregate');
select commerce_test.check_true((public.commerce_public_product_reviews('b1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001')->>'average_rating')::numeric=5,'public average uses only approved eligible reviews');
select commerce_test.check_true(not(public.commerce_public_product_reviews('b1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001')->'reviews'->0 ?| array['customer_user_id','order_id','moderated_by','website_id']),'public review RPC excludes private identities');
select commerce_test.must_fail('select * from public.commerce_reviews','anonymous users cannot directly read private review table',array['42501']);
select commerce_test.must_fail('select * from public.commerce_saved_addresses','anonymous users cannot read saved addresses',array['42501']);
select commerce_test.check_true(public.commerce_public_product_reviews('b1000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001') is null,'public review RPC rejects mismatched website/product');
reset role;
update public.commerce_websites set status='suspended' where id='b1000000-0000-4000-8000-000000000001';
set local role anon;
select commerce_test.check_true(public.commerce_public_product_reviews('b1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001') is null,'suspended store reviews and aggregate are hidden');
reset role;
update public.commerce_websites set status='active' where id='b1000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000003',true);
select commerce_test.record('customer_experience',public.commerce_customer_experience('b1000000-0000-4000-8000-000000000001'));
select commerce_test.check_true((select value->'request_eligible' @> '[{"order_id":"d1000000-0000-4000-8000-000000000002","type":"return"}]'::jsonb from commerce_test.state where key='customer_experience'),'request eligibility is derived server-side from explicit policy and order truth');
select public.commerce_customer_experience('b1000000-0000-4000-8000-000000000001','request_create','{"order_id":"d1000000-0000-4000-8000-000000000002","type":"return","reason":"Request return under configured policy"}');
select commerce_test.record('customer_return',(select to_jsonb(r) from public.commerce_order_requests r where type='return'));
select commerce_test.check_true((select policy_snapshot->>'returns'='Contact the store within seven days.' from public.commerce_order_requests where type='return'),'return request retains the policy accepted at creation');
select public.commerce_customer_experience('b1000000-0000-4000-8000-000000000001','review_save','{"order_id":"d1000000-0000-4000-8000-000000000002","product_id":"c1000000-0000-4000-8000-000000000001","rating":4,"title":"Edited review","body":"Edited eligible review returns to moderation"}');
select commerce_test.check_true((select status='pending' and moderated_by is null and moderated_at is null from public.commerce_reviews limit 1),'editing customer review clears prior owner approval');
select commerce_test.check_true((public.commerce_public_product_reviews('b1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001')->>'rating_count')::integer=0,'edited review immediately leaves public aggregate');
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
select commerce_test.must_fail($q$select public.commerce_owner_engagement('b1000000-0000-4000-8000-000000000001','review_moderate',jsonb_build_object('review_id',(select value->>'id' from commerce_test.state where key='customer_review'),'status','approved','rating',1))$q$,'owner cannot fabricate or edit customer review rating',array['22023']);
select public.commerce_owner_engagement('b1000000-0000-4000-8000-000000000001','request_decide',jsonb_build_object('request_id',(select value->>'id' from commerce_test.state where key='customer_return'),'decision','approved','note','Contact store to arrange handover. Refund requires separate reconciliation.'));
select commerce_test.check_true((select status='completed' and payment_status='unpaid' from public.commerce_orders where id='d1000000-0000-4000-8000-000000000002'),'return approval does not manufacture refund or rewrite completed order');
reset role;
select commerce_test.check_true((select stock_quantity=10 from public.commerce_products where id='c1000000-0000-4000-8000-000000000001'),'return approval does not automatically restock merchandise');
update public.commerce_websites set owner_permissions=jsonb_set(owner_permissions,'{products}','false') where id='b1000000-0000-4000-8000-000000000001';
set local role authenticated;
select commerce_test.must_fail($q$select public.commerce_owner_engagement('b1000000-0000-4000-8000-000000000001','review_moderate',jsonb_build_object('review_id',(select value->>'id' from commerce_test.state where key='customer_review'),'status','approved'))$q$,'revoked products permission prevents moderation',array['42501']);
select commerce_test.check_true(jsonb_array_length(public.commerce_owner_engagement('b1000000-0000-4000-8000-000000000001')->'reviews')=0,'owner engagement omits module without assigned permission');
reset role;
-- Insert a truthful old completed fixture with a recent updated_at: later
-- administrative/payment updates must not extend the recorded return window.
insert into public.commerce_orders(id,website_id,customer_user_id,idempotency_key,request_payload,customer_details,fulfillment_method,status,subtotal_paise,delivery_fee_paise,total_paise,inventory_tracked,created_at,updated_at) values
 ('d1000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000004','{}','{"name":"Buyer A"}','pickup','completed',100,0,100,false,now()-interval '30 days',now());
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000003',true);
select commerce_test.must_fail($q$select public.commerce_customer_experience('b1000000-0000-4000-8000-000000000001','request_create','{"order_id":"d1000000-0000-4000-8000-000000000004","type":"return","reason":"Return outside configured window"}')$q$,'return window uses stored completion truth and rejects expired request',array['22023']);
reset role;
set local role service_role;
select commerce_test.must_fail('update public.commerce_saved_addresses set is_default=false','admin service cannot directly mutate saved addresses',array['42501']);
select commerce_test.must_fail('delete from public.commerce_wishlist_items','admin service cannot directly mutate customer wishlist',array['42501']);
select commerce_test.must_fail('update public.commerce_reviews set rating=1','admin service cannot fabricate ratings by direct DML',array['42501']);
select commerce_test.must_fail('update public.commerce_order_requests set status=''approved''','admin service cannot decide requests through direct DML',array['42501']);
select commerce_test.must_fail('delete from public.commerce_order_status_events','admin service cannot delete immutable timeline history',array['42501']);
select commerce_test.must_fail($q$select public.commerce_owner_engagement('b1000000-0000-4000-8000-000000000001')$q$,'admin service has no unscoped owner engagement RPC grant',array['42501']);
reset role;
select commerce_test.check_true((select balance_paise=123456 from public.legacy_preservation_fixture),'customer workflow preserves legacy wallet fixture');
select commerce_test.check_true((select count(*)=1 and bool_and(active) from cron.job),'customer workflow preserves existing cron fixture');
commit;
