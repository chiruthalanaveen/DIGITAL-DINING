-- Synthetic history created BEFORE expansion installation. This is not a
-- migration and must run only inside the guarded disposable fixture runner.
begin;
do $$begin
 if current_database()<>'commerce_test' or inet_server_addr() not in ('127.0.0.1'::inet,'::1'::inet) then raise exception 'Isolated loopback commerce_test required';end if;
end$$;
insert into public.commerce_orders(id,website_id,customer_user_id,idempotency_key,request_payload,customer_details,fulfillment_method,status,subtotal_paise,delivery_fee_paise,total_paise,inventory_tracked,created_at)
values('35100000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','36100000-0000-4000-8000-000000000001','{}','{"name":"Legacy completed fixture"}','pickup','completed',123,0,123,false,now()-interval '32 days');
insert into public.commerce_order_items(website_id,order_id,product_id,product_name,quantity,unit_price_paise,line_total_paise)
values('20000000-0000-4000-8000-000000000001','35100000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','Legacy fixture item',1,123,123);
commit;
