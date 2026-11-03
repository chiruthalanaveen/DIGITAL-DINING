-- REVIEW ONLY. Separate commerce merchant payments; no hosted application authorized.
-- No existing-row DML, legacy policy/job changes, wallet or subscription access.
begin;

create table commerce_private.payment_credential_versions (
  id uuid primary key, website_id uuid not null references public.commerce_websites(id),
  mode text not null check(mode in ('test','live')), ciphertext text not null check(char_length(ciphertext) between 80 and 16000),
  created_at timestamptz not null default now(), created_by text not null check(char_length(created_by) between 3 and 254),
  unique(website_id,id)
);
create table commerce_private.payment_merchants (
  website_id uuid primary key references public.commerce_websites(id),
  enabled boolean not null default false, credential_version uuid not null,
  updated_at timestamptz not null default now(),
  foreign key(website_id,credential_version) references commerce_private.payment_credential_versions(website_id,id)
);
create table commerce_private.payment_intents (
  id uuid primary key default gen_random_uuid(), website_id uuid not null references public.commerce_websites(id),
  buyer_id uuid not null references auth.users(id), cart_key uuid not null,
  credential_version uuid not null, request_payload jsonb not null, quote jsonb not null,
  amount_paise bigint not null check(amount_paise between 1 and 1000000000000), currency text not null default 'INR' check(currency='INR'),
  state text not null default 'new' check(state in ('new','creating','provider_unknown','ready','captured_unfulfilled','fulfilled')),
  provider_order_id text check(provider_order_id ~ '^order_[A-Za-z0-9]{4,100}$'),
  create_lease uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(website_id,id), unique(website_id,buyer_id,cart_key), unique(website_id,credential_version,provider_order_id),
  foreign key(website_id,credential_version) references commerce_private.payment_credential_versions(website_id,id)
);
create table commerce_private.payment_receipts (
  id uuid primary key default gen_random_uuid(), website_id uuid not null, intent_id uuid not null,
  credential_version uuid not null, provider_order_id text not null, provider_payment_id text not null check(provider_payment_id ~ '^pay_[A-Za-z0-9]{4,100}$'),
  amount_paise bigint not null check(amount_paise between 1 and 1000000000000), currency text not null check(currency='INR'),
  captured_at timestamptz not null default now(), state text not null default 'captured_unfulfilled' check(state in ('captured_unfulfilled','fulfilled')),
  order_id uuid, reconciliation_code text not null default '',
  unique(website_id,intent_id), unique(website_id,credential_version,provider_payment_id), unique(website_id,credential_version,provider_order_id),
  foreign key(website_id,intent_id) references commerce_private.payment_intents(website_id,id),
  foreign key(website_id,credential_version) references commerce_private.payment_credential_versions(website_id,id),
  foreign key(website_id,order_id) references public.commerce_orders(website_id,id),
  check((state='fulfilled')=(order_id is not null))
);
create table commerce_private.payment_webhooks (
  id uuid primary key default gen_random_uuid(), website_id uuid not null, credential_version uuid not null,
  event_id text not null check(char_length(event_id) between 1 and 200), body_hash text not null check(body_hash ~ '^[a-f0-9]{64}$'),
  provider_order_id text not null, provider_payment_id text not null,
  state text not null default 'pending' check(state in ('pending','processing','processed','failed')),
  attempts integer not null default 0 check(attempts between 0 and 100), lease_token uuid, lease_expires_at timestamptz,
  last_error_code text not null default '', created_at timestamptz not null default now(), processed_at timestamptz,
  unique(website_id,credential_version,event_id),
  foreign key(website_id,credential_version) references commerce_private.payment_credential_versions(website_id,id),
  check((state='processing')=(lease_token is not null and lease_expires_at is not null))
);
create index commerce_payment_webhook_recovery on commerce_private.payment_webhooks(state,lease_expires_at) where state in ('pending','processing','failed');
alter table commerce_private.payment_credential_versions enable row level security;
alter table commerce_private.payment_merchants enable row level security;
alter table commerce_private.payment_intents enable row level security;
alter table commerce_private.payment_receipts enable row level security;
alter table commerce_private.payment_webhooks enable row level security;
revoke all on commerce_private.payment_credential_versions,commerce_private.payment_merchants,commerce_private.payment_intents,commerce_private.payment_receipts,commerce_private.payment_webhooks from public,anon,authenticated,service_role;

-- The sole existing-table change widens the COD method constraint; existing rows
-- still satisfy it. Payment status remains the installed unpaid/paid/refunded set.
alter table public.commerce_orders drop constraint commerce_orders_payment_method_check;
alter table public.commerce_orders add constraint commerce_orders_payment_method_check check(payment_method in ('cod','razorpay'));

create function commerce_private.payment_history_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='payment_credential_versions' or tg_op='DELETE' then raise exception 'Payment history is immutable.' using errcode='42501';end if;
 if (to_jsonb(new)-array['state','order_id','reconciliation_code']) is distinct from (to_jsonb(old)-array['state','order_id','reconciliation_code']) then raise exception 'Captured payment evidence is immutable.' using errcode='42501';end if;
 return new;
end;$$;
create trigger commerce_payment_credentials_immutable before update or delete on commerce_private.payment_credential_versions for each row execute function commerce_private.payment_history_guard();
create trigger commerce_payment_receipts_immutable before update or delete on commerce_private.payment_receipts for each row execute function commerce_private.payment_history_guard();

create function commerce_private.payment_assert_service() returns void language plpgsql set search_path='' as $$
begin
 -- Actual SET ROLE, never auth.role()/request claims supplied by a user.
 if current_setting('role',true) is distinct from 'service_role' then raise exception 'Payment service role required.' using errcode='42501';end if;
end;$$;
create function commerce_private.payment_view(p_intent_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',i.id,'website_id',i.website_id,'state',i.state,'amount_paise',i.amount_paise,'currency',i.currency,'provider_order_id',i.provider_order_id,
  'receipt',(select jsonb_build_object('id',r.id,'state',r.state,'amount_paise',r.amount_paise,'currency',r.currency,'provider_payment_id',r.provider_payment_id,'captured_at',r.captured_at,'order_id',r.order_id,'reconciliation_required',r.state='captured_unfulfilled') from commerce_private.payment_receipts r where r.website_id=i.website_id and r.intent_id=i.id),
  'order',(select to_jsonb(o)-'request_payload' from commerce_private.payment_receipts r join public.commerce_orders o on o.website_id=r.website_id and o.id=r.order_id where r.website_id=i.website_id and r.intent_id=i.id),
  'items',coalesce((select jsonb_agg(to_jsonb(oi) order by oi.id) from commerce_private.payment_receipts r join public.commerce_order_items oi on oi.website_id=r.website_id and oi.order_id=r.order_id where r.website_id=i.website_id and r.intent_id=i.id),'[]'::jsonb))
 from commerce_private.payment_intents i where i.id=p_intent_id;
$$;

create function public.commerce_payment_availability(p_website_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('available',true,'provider','razorpay','mode',v.mode) from commerce_private.payment_merchants m join commerce_private.payment_credential_versions v on v.website_id=m.website_id and v.id=m.credential_version join public.commerce_websites w on w.id=m.website_id where m.website_id=p_website_id and m.enabled and w.status='active' and w.business_type<>'pharmacy' and w.features->'catalog'='true'::jsonb),'{"available":false}'::jsonb);
$$;
create function public.commerce_payment_readiness(p_website_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not commerce_private.is_member(p_website_id,'orders') then raise exception 'Website permission denied.' using errcode='42501';end if;
 return coalesce((select jsonb_build_object('configured',true,'merchant_enabled',m.enabled,'mode',v.mode,'credential_created_at',v.created_at) from commerce_private.payment_merchants m join commerce_private.payment_credential_versions v on v.website_id=m.website_id and v.id=m.credential_version where m.website_id=p_website_id),'{"configured":false,"merchant_enabled":false}'::jsonb);
end;$$;
create function public.commerce_payment_status(p_intent_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from commerce_private.payment_intents where id=p_intent_id and buyer_id=auth.uid()) then raise exception 'Payment intent access denied.' using errcode='42501';end if;
 return commerce_private.payment_view(p_intent_id);
end;$$;

-- Private copy of catalog pricing with explicit bound buyer; no forged Auth context.
create function commerce_private.payment_price_checkout(p_website_id uuid,p_request jsonb,p_lock boolean,p_buyer_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.commerce_websites;z public.commerce_delivery_zones;r record;lines jsonb:='[]';line jsonb;subtotal bigint:=0;fee bigint:=0;minimum bigint:=0;discount bigint:=0;coupon jsonb:='{"coupon_id":null,"discount_paise":0,"code":""}';tracked boolean;qty integer;price bigint;required_variant boolean;
begin
 select * into w from public.commerce_websites where id=p_website_id;
 if not found or w.status<>'active' or w.business_type='pharmacy' or w.features->'catalog' is distinct from 'true'::jsonb then raise exception 'This website cannot accept online orders.' using errcode='42501';end if;
 if w.fulfillment->(p_request->>'fulfillment') is distinct from 'true'::jsonb then raise exception 'This fulfillment method is unavailable.' using errcode='22023';end if;
 tracked:=w.features->'inventory'='true'::jsonb;
 if p_lock then
  perform 1 from public.commerce_products p where p.website_id=w.id and p.id in (select (i->>'product_id')::uuid from jsonb_array_elements(p_request->'items') i) order by p.id for update;
  perform 1 from public.commerce_product_variants v where v.website_id=w.id and v.id in (select (i->>'variant_id')::uuid from jsonb_array_elements(p_request->'items') i where i->>'variant_id' is not null) order by v.id for update;
 end if;
 for r in select i as cart_item,p.id pid,p.name,p.price_paise,p.stock_quantity,p.active,p.category_id,v.id vid,v.product_id variant_product,v.name variant_name,v.sku,v.options,v.price_paise variant_price,v.stock_quantity variant_stock,v.active variant_active from jsonb_array_elements(p_request->'items') i left join public.commerce_products p on p.website_id=w.id and p.id=(i->>'product_id')::uuid left join public.commerce_product_variants v on v.website_id=w.id and v.id=(i->>'variant_id')::uuid order by (i->>'product_id'),(i->>'variant_id') nulls first loop
  if r.pid is null then raise exception 'Cart contains a product from another website or a missing product.' using errcode='42501';end if;
  if not r.active or (r.category_id is not null and not exists(select 1 from public.commerce_categories where website_id=w.id and id=r.category_id and active)) then raise exception 'A product is unavailable.' using errcode='22023';end if;
  select coalesce((select variants_required from public.commerce_product_profiles where website_id=w.id and product_id=r.pid),false) into required_variant;
  if r.cart_item->>'variant_id' is null then
   if required_variant then raise exception 'Choose a product variant.' using errcode='22023';end if;
   price:=r.price_paise;
  else
   if r.vid is null or r.variant_product<>r.pid then raise exception 'Variant does not belong to this product/website.' using errcode='42501';end if;
   if not r.variant_active then raise exception 'A variant is unavailable.' using errcode='22023';end if;
   price:=r.variant_price;
  end if;
  qty:=(r.cart_item->>'quantity')::integer;
  if tracked and (case when r.vid is null then r.stock_quantity else r.variant_stock end)<qty then raise exception 'Insufficient stock for %.',r.name using errcode='22023';end if;
  subtotal:=subtotal+price*qty;
  line:=jsonb_build_object('product_id',r.pid,'product_name',r.name,'variant_id',r.vid,'variant_name',r.variant_name,'sku',r.sku,'option_snapshot',coalesce(r.options,'{}'::jsonb),'quantity',qty,'unit_price_paise',price,'line_total_paise',price*qty);
  lines:=lines||jsonb_build_array(line);
 end loop;
 minimum:=coalesce((w.fulfillment->>'minimum_order_paise')::bigint,0);
 if p_request->>'fulfillment'='delivery' then
  fee:=coalesce((w.fulfillment->>'delivery_fee_paise')::bigint,0);
  if exists(select 1 from public.commerce_store_settings where website_id=w.id and delivery_zones_enabled) then
   if coalesce(p_request->'customer'->>'pincode','') !~ '^[0-9]{6}$' then raise exception 'A six-digit delivery PIN code is required.' using errcode='22023';end if;
   select * into z from public.commerce_delivery_zones where website_id=w.id and active and p_request->'customer'->>'pincode'=any(pincodes) order by id limit 1;
   if not found then raise exception 'Delivery is unavailable for this PIN code.' using errcode='22023';end if;
   fee:=z.delivery_fee_paise;minimum:=greatest(minimum,z.minimum_order_paise);
  end if;
 end if;
 if subtotal<minimum then raise exception 'Minimum order value was not met.' using errcode='22023';end if;
 if coalesce(p_request->>'coupon_code','')<>'' then
  if to_regprocedure('commerce_private.quote_coupon(uuid,uuid,text,bigint,bigint,boolean)') is null then raise exception 'Coupons are unavailable.' using errcode='22023';end if;
  execute 'select commerce_private.quote_coupon($1,$2,$3,$4,$5,$6)' into coupon using w.id,p_buyer_id,p_request->>'coupon_code',subtotal,fee,p_lock;
  if coupon is null or coalesce(coupon->>'discount_paise','') !~ '^[0-9]{1,13}$' then raise exception 'Invalid coupon calculation.' using errcode='22023';end if;
  discount:=(coupon->>'discount_paise')::bigint;
 end if;
 if discount>subtotal+fee or subtotal+fee-discount>1000000000000 then raise exception 'Checkout total exceeds limits.' using errcode='22023';end if;
 return jsonb_build_object('items',lines,'subtotal_paise',subtotal,'delivery_fee_paise',fee,'discount_paise',discount,'total_paise',subtotal+fee-discount,'minimum_order_paise',minimum,'delivery_zone',case when z.id is null then null else jsonb_build_object('id',z.id,'name',z.name) end,'coupon',coupon,'inventory_tracked',tracked);
end;$$;

create function public.commerce_payment_quote(p_website_id uuid,p_items jsonb,p_customer jsonb,p_fulfillment text,p_coupon_code text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare buyer uuid:=auth.uid();req jsonb;q jsonb;
begin
 if buyer is null or not exists(select 1 from auth.users where id=buyer and email_confirmed_at is not null) then raise exception 'Verified buyer required.' using errcode='42501';end if;
 if public.commerce_payment_availability(p_website_id)->'available' is distinct from 'true'::jsonb then raise exception 'Store online payments are disabled.' using errcode='42501';end if;
 req:=commerce_private.checkout_request(p_website_id,p_items,p_customer,p_fulfillment,p_coupon_code);
 q:=commerce_private.payment_price_checkout(p_website_id,req,false,buyer);
 return q-array['coupon','inventory_tracked'];
end;$$;

create function public.commerce_payment_start(p_website_id uuid,p_items jsonb,p_customer jsonb,p_fulfillment text,p_cart_key uuid,p_coupon_code text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare buyer uuid:=auth.uid();req jsonb;q jsonb;i commerce_private.payment_intents;m commerce_private.payment_merchants;replay_customer jsonb;
begin
 if buyer is null or not exists(select 1 from auth.users where id=buyer and email_confirmed_at is not null) then raise exception 'Verified buyer required.' using errcode='42501';end if;
 if p_cart_key is null then raise exception 'A cart attempt key is required.' using errcode='22023';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_website_id::text||buyer::text||p_cart_key::text,0));
 perform 1 from public.commerce_websites where id=p_website_id for share;
 if not found then raise exception 'Website not found.' using errcode='42501';end if;
 perform 1 from auth.users where id=buyer and email_confirmed_at is not null for share;
 if not found then raise exception 'Verified buyer required.' using errcode='42501';end if;
 select * into i from commerce_private.payment_intents where website_id=p_website_id and buyer_id=buyer and cart_key=p_cart_key;
 if found then
  -- Replay retains the first shipping snapshot after saved-address edits/deletion.
  if i.request_payload->'customer'->>'saved_address_id' is not null and p_customer->'saved_address_id'=i.request_payload->'customer'->'saved_address_id' then
   if (p_customer ? 'address' and (jsonb_typeof(p_customer->'address')<>'string' or char_length(btrim(p_customer->>'address'))>1000)) or (p_customer ? 'pincode' and (jsonb_typeof(p_customer->'pincode')<>'string' or (p_customer->>'pincode'<>'' and p_customer->>'pincode' !~ '^[0-9]{6}$'))) then raise exception 'Invalid submitted customer details.' using errcode='22023';end if;
   replay_customer:=(p_customer-array['saved_address_id','address','pincode'])||jsonb_build_object('address',i.request_payload->'customer'->'address');
   if i.request_payload->'customer' ? 'pincode' then replay_customer:=replay_customer||jsonb_build_object('pincode',i.request_payload->'customer'->'pincode');end if;
   req:=commerce_private.checkout_request(p_website_id,p_items,replay_customer,p_fulfillment,p_coupon_code);
   req:=jsonb_set(req,'{customer,saved_address_id}',i.request_payload->'customer'->'saved_address_id');
  else req:=commerce_private.checkout_request(p_website_id,p_items,p_customer,p_fulfillment,p_coupon_code);end if;
  if i.request_payload<>req then raise exception 'Cart key belongs to a different checkout.' using errcode='22023';end if;
  return commerce_private.payment_view(i.id);
 end if;
 req:=commerce_private.checkout_request(p_website_id,p_items,p_customer,p_fulfillment,p_coupon_code);
 -- A cart key already used for COD cannot become an online charge.
 if exists(select 1 from public.commerce_orders where website_id=p_website_id and customer_user_id=buyer and idempotency_key=p_cart_key) then raise exception 'Cart was already ordered.' using errcode='23505';end if;
 select * into m from commerce_private.payment_merchants where website_id=p_website_id and enabled for share;
 if not found then raise exception 'Online payments are disabled for this website.' using errcode='42501';end if;
 q:=commerce_private.payment_price_checkout(p_website_id,req,false,buyer);
 if (q->>'total_paise')::bigint<1 then raise exception 'Online amount must be positive.' using errcode='22023';end if;
 insert into commerce_private.payment_intents(website_id,buyer_id,cart_key,credential_version,request_payload,quote,amount_paise)
 values(p_website_id,buyer,p_cart_key,m.credential_version,req,q,(q->>'total_paise')::bigint) returning * into i;
 return commerce_private.payment_view(i.id);
end;$$;

create function commerce_private.payment_fulfill(p_intent_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare i commerce_private.payment_intents;r commerce_private.payment_receipts;q jsonb;ord public.commerce_orders;coupon uuid;
begin
 select * into i from commerce_private.payment_intents where id=p_intent_id for update;
 select * into r from commerce_private.payment_receipts where website_id=i.website_id and intent_id=i.id for update;
 if r.id is null then raise exception 'Captured receipt required.' using errcode='42501';end if;
 if r.order_id is not null then return r.order_id;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(i.website_id::text||i.buyer_id::text||i.cart_key::text,0));
 perform 1 from public.commerce_websites where id=i.website_id for share;
 -- Saved normalized request and bound buyer, independent of worker Auth claims.
 q:=commerce_private.payment_price_checkout(i.website_id,i.request_payload,true,i.buyer_id);
 if q<>i.quote or (q->>'total_paise')::bigint<>r.amount_paise then raise exception 'Captured quote requires reconciliation.' using errcode='22023';end if;
 if exists(select 1 from public.commerce_orders where website_id=i.website_id and customer_user_id=i.buyer_id and idempotency_key=i.cart_key) then raise exception 'Cart already has an order requiring reconciliation.' using errcode='23505';end if;
 coupon:=(q->'coupon'->>'coupon_id')::uuid;
 insert into public.commerce_customers(website_id,user_id,name,phone,address) values(i.website_id,i.buyer_id,i.request_payload->'customer'->>'name',i.request_payload->'customer'->>'phone',i.request_payload->'customer'->>'address') on conflict(website_id,user_id) do update set name=excluded.name,phone=excluded.phone,address=excluded.address,updated_at=now();
 insert into public.commerce_orders(website_id,customer_user_id,idempotency_key,request_payload,customer_details,fulfillment_method,payment_method,payment_status,subtotal_paise,delivery_fee_paise,total_paise,inventory_tracked,discount_paise,coupon_id,coupon_code,delivery_zone_id)
 values(i.website_id,i.buyer_id,i.cart_key,i.request_payload,i.request_payload->'customer',i.request_payload->>'fulfillment','razorpay','paid',(q->>'subtotal_paise')::bigint,(q->>'delivery_fee_paise')::bigint,i.amount_paise,(q->>'inventory_tracked')::boolean,(q->>'discount_paise')::bigint,coupon,coalesce(q->'coupon'->>'code',''),(q->'delivery_zone'->>'id')::uuid) returning * into ord;
 insert into public.commerce_order_items(website_id,order_id,product_id,product_name,variant_id,variant_name,sku,option_snapshot,quantity,unit_price_paise,line_total_paise)
 select i.website_id,ord.id,(line->>'product_id')::uuid,line->>'product_name',(line->>'variant_id')::uuid,line->>'variant_name',line->>'sku',line->'option_snapshot',(line->>'quantity')::integer,(line->>'unit_price_paise')::bigint,(line->>'line_total_paise')::bigint from jsonb_array_elements(q->'items') line;
 if ord.inventory_tracked then
  update public.commerce_products p set stock_quantity=p.stock_quantity-(line->>'quantity')::integer,updated_at=now() from jsonb_array_elements(i.request_payload->'items') line where p.website_id=i.website_id and p.id=(line->>'product_id')::uuid and line->>'variant_id' is null;
  update public.commerce_product_variants v set stock_quantity=v.stock_quantity-(line->>'quantity')::integer,updated_at=now() from jsonb_array_elements(i.request_payload->'items') line where v.website_id=i.website_id and v.id=(line->>'variant_id')::uuid;
 end if;
 if coupon is not null then insert into public.commerce_coupon_redemptions(website_id,coupon_id,order_id,user_id,discount_paise) values(i.website_id,coupon,ord.id,i.buyer_id,ord.discount_paise);end if;
 update commerce_private.payment_receipts set order_id=ord.id,state='fulfilled',reconciliation_code='' where id=r.id;
 update commerce_private.payment_intents set state='fulfilled',updated_at=now() where id=i.id;
 return ord.id;
end;$$;

create function public.commerce_payment_admin(p_website_id uuid,p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare version_id uuid;v commerce_private.payment_credential_versions;
begin
 perform commerce_private.payment_assert_service();
 if not exists(select 1 from public.commerce_websites where id=p_website_id) then raise exception 'Website not found.' using errcode='22023';end if;
 if p_action='configure' then
  if jsonb_typeof(p_payload) is distinct from 'object' or p_payload-array['version_id','mode','ciphertext','enabled','actor_email']<>'{}'::jsonb or jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' then raise exception 'Invalid merchant configuration.' using errcode='22023';end if;
  version_id:=(p_payload->>'version_id')::uuid;
  insert into commerce_private.payment_credential_versions(id,website_id,mode,ciphertext,created_by) values(version_id,p_website_id,p_payload->>'mode',p_payload->>'ciphertext',p_payload->>'actor_email');
  insert into commerce_private.payment_merchants(website_id,credential_version,enabled) values(p_website_id,version_id,(p_payload->>'enabled')::boolean) on conflict(website_id) do update set credential_version=excluded.credential_version,enabled=excluded.enabled,updated_at=now();
 elsif p_action='disable' then
  if p_payload<>'{}'::jsonb then raise exception 'Invalid merchant disable request.' using errcode='22023';end if;
  update commerce_private.payment_merchants set enabled=false,updated_at=now() where website_id=p_website_id;
 elsif p_action<>'readiness' then raise exception 'Unknown merchant action.' using errcode='22023';end if;
 select v0.* into v from commerce_private.payment_merchants m join commerce_private.payment_credential_versions v0 on v0.website_id=m.website_id and v0.id=m.credential_version where m.website_id=p_website_id;
 return jsonb_build_object('configured',v.id is not null,'merchant_enabled',coalesce((select enabled from commerce_private.payment_merchants where website_id=p_website_id),false),'mode',v.mode,'credential_version',v.id,'credential_created_at',v.created_at,
  'captured_unfulfilled_count',(select count(*) from commerce_private.payment_receipts where website_id=p_website_id and state='captured_unfulfilled'),
  'provider_unknown_count',(select count(*) from commerce_private.payment_intents where website_id=p_website_id and state in ('creating','provider_unknown')));
end;$$;

create function public.commerce_payment_service(p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare i commerce_private.payment_intents;r commerce_private.payment_receipts;v commerce_private.payment_credential_versions;e commerce_private.payment_webhooks;token uuid;err text;
begin
 perform commerce_private.payment_assert_service();
 if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Invalid payment service request.' using errcode='22023';end if;
 if p_action='credentials' then
  select * into v from commerce_private.payment_credential_versions where website_id=(p_payload->>'website_id')::uuid and id=(p_payload->>'credential_version')::uuid;
  if not found then raise exception 'Merchant version not found.' using errcode='42501';end if;
  return jsonb_build_object('website_id',v.website_id,'credential_version',v.id,'mode',v.mode,'ciphertext',v.ciphertext);
 elsif p_action in ('webhook_claim','webhook_ack') then
  if p_action='webhook_claim' then
   insert into commerce_private.payment_webhooks(website_id,credential_version,event_id,body_hash,provider_order_id,provider_payment_id)
   values((p_payload->>'website_id')::uuid,(p_payload->>'credential_version')::uuid,p_payload->>'event_id',p_payload->>'body_hash',p_payload->>'provider_order_id',p_payload->>'provider_payment_id') on conflict(website_id,credential_version,event_id) do nothing;
   select * into e from commerce_private.payment_webhooks where website_id=(p_payload->>'website_id')::uuid and credential_version=(p_payload->>'credential_version')::uuid and event_id=p_payload->>'event_id' for update;
   if e.body_hash<>p_payload->>'body_hash' then raise exception 'Webhook event id body mismatch.' using errcode='22023';end if;
   if e.state='processed' or (e.state='processing' and e.lease_expires_at>now()) then return jsonb_build_object('id',e.id,'claimed',false,'state',e.state);end if;
   if e.attempts>=100 then return jsonb_build_object('id',e.id,'claimed',false,'state','reconciliation_required');end if;
   token:=gen_random_uuid();
   update commerce_private.payment_webhooks set state='processing',attempts=attempts+1,lease_token=token,lease_expires_at=now()+interval '120 seconds',last_error_code='' where id=e.id;
   select * into i from commerce_private.payment_intents where website_id=e.website_id and credential_version=e.credential_version and provider_order_id=e.provider_order_id;
   return jsonb_build_object('id',e.id,'claimed',true,'lease_token',token,'intent_id',i.id);
  else
   select * into e from commerce_private.payment_webhooks where id=(p_payload->>'event_id')::uuid for update;
   if not found or e.state<>'processing' or e.lease_token is distinct from (p_payload->>'lease_token')::uuid or e.lease_expires_at<=now() then raise exception 'Webhook lease is invalid or expired.' using errcode='22023';end if;
   if jsonb_typeof(p_payload->'processed') is distinct from 'boolean' then raise exception 'Invalid webhook acknowledgement.' using errcode='22023';end if;
   update commerce_private.payment_webhooks set state=case when (p_payload->>'processed')::boolean then 'processed' else 'failed' end,processed_at=case when (p_payload->>'processed')::boolean then now() else null end,lease_token=null,lease_expires_at=null,last_error_code=case when (p_payload->>'processed')::boolean then '' else 'verification_or_reconciliation_required' end where id=e.id;
   return jsonb_build_object('acknowledged',true);
  end if;
 end if;
 select * into i from commerce_private.payment_intents where id=(p_payload->>'intent_id')::uuid for update;
 if not found or (p_payload ? 'buyer_id' and i.buyer_id is distinct from (p_payload->>'buyer_id')::uuid) then raise exception 'Payment intent access denied.' using errcode='42501';end if;
 if p_action='context' then
  select * into v from commerce_private.payment_credential_versions where website_id=i.website_id and id=i.credential_version;
  return to_jsonb(i)||jsonb_build_object('ciphertext',v.ciphertext,'mode',v.mode,'merchant_enabled',coalesce((select enabled from commerce_private.payment_merchants where website_id=i.website_id),false));
 elsif p_action='claim_create' then
  if i.state='new' then
   -- Disable/rotate blocks new provider-order creation, never captured recovery.
   if not exists(select 1 from commerce_private.payment_merchants where website_id=i.website_id and enabled and credential_version=i.credential_version) then raise exception 'Merchant payments are disabled or rotated.' using errcode='42501';end if;
   token:=gen_random_uuid();update commerce_private.payment_intents set state='creating',create_lease=token,updated_at=now() where id=i.id;
   return jsonb_build_object('claimed',true,'lease_token',token);
  end if;
  return jsonb_build_object('claimed',false,'state',i.state);
 elsif p_action in ('attach_create','attach_reconciled') then
  if i.provider_order_id is not null then
   if i.provider_order_id is distinct from p_payload->>'provider_order_id' then raise exception 'Provider order conflict.' using errcode='23505';end if;
   return commerce_private.payment_view(i.id);
  end if;
  if (p_action='attach_create' and (i.state<>'creating' or i.create_lease is distinct from (p_payload->>'lease_token')::uuid)) or (p_action='attach_reconciled' and i.state not in ('creating','provider_unknown')) or i.amount_paise is distinct from (p_payload->>'amount_paise')::bigint or i.currency is distinct from p_payload->>'currency' then raise exception 'Provider order binding mismatch.' using errcode='22023';end if;
  update commerce_private.payment_intents set provider_order_id=p_payload->>'provider_order_id',state='ready',create_lease=null,updated_at=now() where id=i.id;
 elsif p_action='create_unknown' then
  if i.state='creating' and i.create_lease=(p_payload->>'lease_token')::uuid then update commerce_private.payment_intents set state='provider_unknown',create_lease=null,updated_at=now() where id=i.id;end if;
 elsif p_action='capture' then
  if i.provider_order_id is null or i.provider_order_id is distinct from p_payload->>'provider_order_id' or i.credential_version is distinct from (p_payload->>'credential_version')::uuid or i.amount_paise is distinct from (p_payload->>'amount_paise')::bigint or i.currency is distinct from p_payload->>'currency' then raise exception 'Captured payment binding mismatch.' using errcode='22023';end if;
  select * into r from commerce_private.payment_receipts where website_id=i.website_id and intent_id=i.id;
  if found then
   if r.provider_payment_id is distinct from p_payload->>'provider_payment_id' then raise exception 'Intent already has a different captured payment.' using errcode='23505';end if;
   if r.state='fulfilled' then return commerce_private.payment_view(i.id);end if;
  else
   insert into commerce_private.payment_receipts(website_id,intent_id,credential_version,provider_order_id,provider_payment_id,amount_paise,currency)
   values(i.website_id,i.id,i.credential_version,i.provider_order_id,p_payload->>'provider_payment_id',i.amount_paise,i.currency) returning * into r;
   update commerce_private.payment_intents set state='captured_unfulfilled',updated_at=now() where id=i.id;
  end if;
  -- Capture survives fulfillment failure: only order/stock/redemption work rolls back.
  begin
   perform commerce_private.payment_fulfill(i.id);
  exception when others then
   get stacked diagnostics err=returned_sqlstate;
   update commerce_private.payment_receipts set reconciliation_code=case when err in ('22023','23505','42501','23503','23514') then err else 'fulfillment_unavailable' end where id=r.id;
  end;
 else raise exception 'Unknown payment service action.' using errcode='22023';end if;
 return commerce_private.payment_view(i.id);
end;$$;

-- Remove provider functions from Supabase inherited default ACLs explicitly.
revoke all on function commerce_private.payment_history_guard(),commerce_private.payment_assert_service(),commerce_private.payment_view(uuid),commerce_private.payment_price_checkout(uuid,jsonb,boolean,uuid),commerce_private.payment_fulfill(uuid) from public,anon,authenticated,service_role;
revoke all on function public.commerce_payment_availability(uuid),public.commerce_payment_readiness(uuid),public.commerce_payment_status(uuid),public.commerce_payment_start(uuid,jsonb,jsonb,text,uuid,text),public.commerce_payment_admin(uuid,text,jsonb),public.commerce_payment_service(text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.commerce_payment_quote(uuid,jsonb,jsonb,text,text) from public,anon,authenticated,service_role;
grant execute on function public.commerce_payment_quote(uuid,jsonb,jsonb,text,text) to authenticated;
grant execute on function public.commerce_payment_availability(uuid) to anon,authenticated,service_role;
grant execute on function public.commerce_payment_readiness(uuid),public.commerce_payment_status(uuid),public.commerce_payment_start(uuid,jsonb,jsonb,text,uuid,text) to authenticated;
grant execute on function public.commerce_payment_admin(uuid,text,jsonb),public.commerce_payment_service(text,jsonb) to service_role;
commit;
