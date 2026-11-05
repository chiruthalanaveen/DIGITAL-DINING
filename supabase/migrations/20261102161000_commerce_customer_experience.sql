-- Customer experience is additive. Existing table policies, order/payment rows,
-- wallets, Storage and cron definitions are preserved. Review-only for hosted DBs.
begin;

create table public.commerce_saved_addresses (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references public.commerce_websites(id),
  user_id uuid not null references auth.users(id),
  label text not null check (char_length(label) between 1 and 60),
  name text not null check (char_length(name) between 2 and 180),
  phone text not null check (char_length(phone) between 7 and 30 and phone ~ '^\+?[0-9][0-9 ()-]+$'),
  address text not null check (char_length(address) between 5 and 1000),
  pincode text not null check (pincode ~ '^[0-9]{6}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (website_id,id)
);
create index commerce_saved_addresses_customer on public.commerce_saved_addresses(website_id,user_id,created_at);
create unique index commerce_saved_addresses_one_default on public.commerce_saved_addresses(website_id,user_id) where is_default;

create table public.commerce_wishlist_items (
  website_id uuid not null references public.commerce_websites(id),
  user_id uuid not null references auth.users(id), product_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (website_id,user_id,product_id),
  foreign key (website_id,product_id) references public.commerce_products(website_id,id)
);

create table public.commerce_reviews (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references public.commerce_websites(id),
  customer_user_id uuid not null references auth.users(id), order_id uuid not null, product_id uuid not null,
  rating integer not null check (rating between 1 and 5),
  title text not null default '' check (char_length(title) <= 120),
  body text not null check (char_length(body) between 1 and 3000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  moderated_at timestamptz, moderated_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (website_id,id), constraint commerce_reviews_customer_product unique (website_id,customer_user_id,product_id),
  foreign key (website_id,order_id) references public.commerce_orders(website_id,id),
  foreign key (website_id,product_id) references public.commerce_products(website_id,id)
);
create index commerce_reviews_moderation on public.commerce_reviews(website_id,status,created_at desc);
create index commerce_reviews_public on public.commerce_reviews(website_id,product_id,created_at desc) where status='approved';

create table public.commerce_order_requests (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references public.commerce_websites(id),
  customer_user_id uuid not null references auth.users(id), order_id uuid not null,
  type text not null check (type in ('cancellation','return')),
  reason text not null check (char_length(reason) between 5 and 2000),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decision_note text not null default '' check (char_length(decision_note) <= 2000),
  decided_at timestamptz, decided_by uuid references auth.users(id),
  policy_snapshot jsonb not null default '{}' check (jsonb_typeof(policy_snapshot)='object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (website_id,id), unique (website_id,order_id,type),
  foreign key (website_id,order_id) references public.commerce_orders(website_id,id)
);
create index commerce_order_requests_queue on public.commerce_order_requests(website_id,status,created_at desc);

create table public.commerce_order_status_events (
  id uuid primary key default gen_random_uuid(),
  event_sequence bigint generated always as identity unique,
  website_id uuid not null references public.commerce_websites(id),
  order_id uuid not null, customer_user_id uuid not null references auth.users(id),
  status text not null check (status in ('placed','confirmed','preparing','ready','completed','cancelled')),
  payment_status text not null check (payment_status in ('unpaid','paid','refunded')),
  event_type text not null check (event_type in ('created','status_changed','payment_changed')),
  created_at timestamptz not null default clock_timestamp(),
  unique (website_id,id),
  foreign key (website_id,order_id) references public.commerce_orders(website_id,id)
);
create index commerce_order_status_events_timeline on public.commerce_order_status_events(website_id,order_id,event_sequence);
revoke all on sequence public.commerce_order_status_events_event_sequence_seq from public,anon,authenticated,service_role;

alter table public.commerce_saved_addresses enable row level security;
alter table public.commerce_wishlist_items enable row level security;
alter table public.commerce_reviews enable row level security;
alter table public.commerce_order_requests enable row level security;
alter table public.commerce_order_status_events enable row level security;
create policy commerce_saved_addresses_self_read on public.commerce_saved_addresses for select to authenticated using(user_id=auth.uid());
create policy commerce_wishlist_items_self_read on public.commerce_wishlist_items for select to authenticated using(user_id=auth.uid());
-- Products permission permits moderation through a sanitized RPC, not disclosure
-- of customer/order identifiers through direct review reads.
create policy commerce_reviews_self_read on public.commerce_reviews for select to authenticated using(customer_user_id=auth.uid());
create policy commerce_order_requests_scoped_read on public.commerce_order_requests for select to authenticated using(customer_user_id=auth.uid() or commerce_private.is_member(website_id,'orders'));
create policy commerce_order_status_events_scoped_read on public.commerce_order_status_events for select to authenticated using(customer_user_id=auth.uid() or commerce_private.is_member(website_id,'orders'));
revoke all on public.commerce_saved_addresses,public.commerce_wishlist_items,public.commerce_reviews,public.commerce_order_requests,public.commerce_order_status_events from public,anon,authenticated,service_role;
grant select on public.commerce_saved_addresses,public.commerce_wishlist_items,public.commerce_reviews,public.commerce_order_requests,public.commerce_order_status_events to authenticated,service_role;

create function commerce_private.customer_payload(p_value jsonb,p_allowed text[]) returns void language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(p_value) is distinct from 'object' or octet_length(p_value::text)>16000 then raise exception 'Invalid customer action payload.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(p_value) k where not(k=any(p_allowed))) then raise exception 'Unknown customer action field.' using errcode='22023'; end if;
end;
$$;
revoke all on function commerce_private.customer_payload(jsonb,text[]) from public,anon,authenticated,service_role;

create function commerce_private.customer_identifier(p_value jsonb) returns uuid language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(p_value) is distinct from 'string' or coalesce(p_value#>>'{}','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'A UUID identifier is required.' using errcode='22023'; end if;
  return (p_value#>>'{}')::uuid;
end;
$$;
revoke all on function commerce_private.customer_identifier(jsonb) from public,anon,authenticated,service_role;

-- Called only by the server-authoritative checkout implementation; never accepts
-- an address belonging to another customer or website. No public execution grant.
create function commerce_private.saved_address(p_website_id uuid,p_user_id uuid,p_address_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if p_user_id is distinct from auth.uid() or not exists(select 1 from auth.users where id=p_user_id and email_confirmed_at is not null) then raise exception 'Verified customer sign-in required.' using errcode='42501'; end if;
  select jsonb_build_object('name',a.name,'phone',a.phone,'address',a.address,'pincode',a.pincode) into result
    from public.commerce_saved_addresses a where a.website_id=p_website_id and a.user_id=p_user_id and a.id=p_address_id;
  if result is null then raise exception 'Saved address not found.' using errcode='42501'; end if;
  return result;
end;
$$;
revoke all on function commerce_private.saved_address(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function commerce_private.customer_snapshot(p_website_id uuid,p_user_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'wishlist',coalesce((select jsonb_agg(x.product_id order by x.created_at,x.product_id) from public.commerce_wishlist_items x where x.website_id=p_website_id and x.user_id=p_user_id),'[]'::jsonb),
    'wishlist_products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by x.created_at,p.id) from public.commerce_wishlist_items x join public.commerce_products p on p.website_id=x.website_id and p.id=x.product_id join public.commerce_websites w on w.id=x.website_id where x.website_id=p_website_id and x.user_id=p_user_id and p.active and w.status='active' and w.features->'catalog'='true'::jsonb and (p.category_id is null or exists(select 1 from public.commerce_categories c where c.website_id=p.website_id and c.id=p.category_id and c.active))),'[]'::jsonb),
    'addresses',coalesce((select jsonb_agg(to_jsonb(x) order by x.is_default desc,x.created_at,x.id) from public.commerce_saved_addresses x where x.website_id=p_website_id and x.user_id=p_user_id),'[]'::jsonb),
    'reviews',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id) from public.commerce_reviews x where x.website_id=p_website_id and x.customer_user_id=p_user_id),'[]'::jsonb),
    'requests',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id) from public.commerce_order_requests x where x.website_id=p_website_id and x.customer_user_id=p_user_id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(x) order by x.event_sequence) from public.commerce_order_status_events x join (select o.id from public.commerce_orders o where o.website_id=p_website_id and o.customer_user_id=p_user_id order by o.created_at desc,o.id limit 200) recent on recent.id=x.order_id where x.website_id=p_website_id and x.customer_user_id=p_user_id),'[]'::jsonb),
    'request_eligible',coalesce((select jsonb_agg(jsonb_build_object('order_id',o.id,'type','cancellation') order by o.created_at,o.id) from public.commerce_orders o where o.website_id=p_website_id and o.customer_user_id=p_user_id and o.status in ('placed','confirmed','preparing','ready') and not exists(select 1 from public.commerce_order_requests r where r.website_id=o.website_id and r.order_id=o.id and r.type='cancellation')),'[]'::jsonb) || coalesce((select jsonb_agg(jsonb_build_object('order_id',o.id,'type','return') order by o.created_at,o.id) from public.commerce_orders o join public.commerce_store_settings s on s.website_id=o.website_id where o.website_id=p_website_id and o.customer_user_id=p_user_id and o.status='completed' and s.policies->'returns_enabled'='true'::jsonb and (s.policies->>'return_days') ~ '^[0-9]{1,3}$' and case when (s.policies->>'return_days') ~ '^[0-9]{1,3}$' then (s.policies->>'return_days')::integer between 1 and 365 else false end and nullif(btrim(s.policies->>'returns'),'') is not null and now()<=coalesce((select min(e.created_at) from public.commerce_order_status_events e where e.website_id=o.website_id and e.order_id=o.id and e.status='completed' and e.event_type in ('created','status_changed')),o.created_at)+pg_catalog.make_interval(days=>case when (s.policies->>'return_days') ~ '^[0-9]{1,3}$' then (s.policies->>'return_days')::integer else 0 end) and not exists(select 1 from public.commerce_order_requests r where r.website_id=o.website_id and r.order_id=o.id and r.type='return')),'[]'::jsonb),
    'review_eligible',coalesce((select jsonb_agg(jsonb_build_object('order_id',q.order_id,'product_id',q.product_id) order by q.order_id,q.product_id) from
      (select distinct on (i.product_id) o.id order_id,i.product_id from public.commerce_orders o join public.commerce_order_items i on i.website_id=o.website_id and i.order_id=o.id left join public.commerce_reviews r on r.website_id=o.website_id and r.customer_user_id=o.customer_user_id and r.product_id=i.product_id where o.website_id=p_website_id and o.customer_user_id=p_user_id and o.status='completed' order by i.product_id,(r.order_id=o.id) desc nulls last,o.created_at desc,o.id) q),'[]'::jsonb));
$$;
revoke all on function commerce_private.customer_snapshot(uuid,uuid) from public,anon,authenticated,service_role;

-- Timeline facts come only from stored order state. Existing orders are not
-- backfilled with invented transition dates; unchanged updates emit no event.
create function commerce_private.record_order_status_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    insert into public.commerce_order_status_events(website_id,order_id,customer_user_id,status,payment_status,event_type,created_at)
      values(new.website_id,new.id,new.customer_user_id,new.status,new.payment_status,'created',new.created_at);
  elsif old.status is distinct from new.status or old.payment_status is distinct from new.payment_status then
    insert into public.commerce_order_status_events(website_id,order_id,customer_user_id,status,payment_status,event_type)
      values(new.website_id,new.id,new.customer_user_id,new.status,new.payment_status,case when old.status is distinct from new.status then 'status_changed' else 'payment_changed' end);
  end if;
  return new;
end;
$$;
create function commerce_private.reject_event_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Order timeline events are immutable.' using errcode='42501'; end;
$$;
revoke all on function commerce_private.record_order_status_event(),commerce_private.reject_event_mutation() from public,anon,authenticated,service_role;
create trigger commerce_order_status_event_record after insert or update of status,payment_status on public.commerce_orders for each row execute function commerce_private.record_order_status_event();
create trigger commerce_order_status_event_immutable before update or delete on public.commerce_order_status_events for each row execute function commerce_private.reject_event_mutation();

create function public.commerce_customer_experience(p_website_id uuid,p_action text default 'get',p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare buyer uuid:=auth.uid(); w public.commerce_websites; target_id uuid; chosen_product_id uuid; ord public.commerce_orders;
  policy jsonb; completed_at timestamptz; request_type text; address_default boolean;
begin
  if buyer is null or not exists(select 1 from auth.users where id=buyer and email_confirmed_at is not null) then raise exception 'Verified customer sign-in required.' using errcode='42501'; end if;
  -- Website locking also serializes Admin state changes with every mutation.
  select * into w from public.commerce_websites where id=p_website_id for share;
  if not found then raise exception 'Website not found.' using errcode='42501'; end if;
  -- Identity may have been withdrawn while the website lock was pending.
  -- Hold the verified Auth row through the mutation and any later row waits.
  perform 1 from auth.users where id=buyer and email_confirmed_at is not null for share;
  if not found then raise exception 'Verified customer sign-in required.' using errcode='42501'; end if;
  if p_action is null or p_action not in ('get','wishlist_add','wishlist_remove','address_save','address_delete','review_save','request_create') then raise exception 'Unknown customer action.' using errcode='22023'; end if;
  if p_action<>'get' and (w.status<>'active' or w.business_type='pharmacy') then raise exception 'This website is read-only.' using errcode='42501'; end if;
  if p_action='get' then
    perform commerce_private.customer_payload(p_payload,array[]::text[]);
  elsif p_action in ('wishlist_add','wishlist_remove') then
    perform commerce_private.customer_payload(p_payload,array['product_id']);
    chosen_product_id:=commerce_private.customer_identifier(p_payload->'product_id');
    if chosen_product_id is null then raise exception 'Product is required.' using errcode='22023'; end if;
    if p_action='wishlist_add' then
      if w.features->'catalog' is distinct from 'true'::jsonb or not exists(select 1 from public.commerce_products p where p.website_id=w.id and p.id=chosen_product_id and p.active and (p.category_id is null or exists(select 1 from public.commerce_categories c where c.website_id=w.id and c.id=p.category_id and c.active))) then raise exception 'Product not available.' using errcode='42501'; end if;
      insert into public.commerce_wishlist_items(website_id,user_id,product_id) values(w.id,buyer,chosen_product_id) on conflict do nothing;
    else delete from public.commerce_wishlist_items x where x.website_id=w.id and x.user_id=buyer and x.product_id=chosen_product_id;
    end if;
  elsif p_action='address_save' then
    perform commerce_private.customer_payload(p_payload,array['id','label','name','phone','address','pincode','is_default']);
    if exists(select 1 from jsonb_each(p_payload) x where x.key<>'is_default' and jsonb_typeof(x.value)<>'string') or (p_payload ? 'is_default' and jsonb_typeof(p_payload->'is_default')<>'boolean') then raise exception 'Invalid saved address field.' using errcode='22023'; end if;
    if char_length(btrim(coalesce(p_payload->>'name',''))) not between 2 and 180 or char_length(btrim(coalesce(p_payload->>'phone',''))) not between 7 and 30 or btrim(coalesce(p_payload->>'phone','')) !~ '^\+?[0-9][0-9 ()-]+$' or char_length(btrim(coalesce(p_payload->>'address',''))) not between 5 and 1000 or char_length(btrim(coalesce(p_payload->>'label',''))) not between 1 and 60 or coalesce(p_payload->>'pincode','') !~ '^[0-9]{6}$' then raise exception 'Invalid saved address.' using errcode='22023'; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(w.id::text||':'||buyer::text||':address',0));
    target_id:=case when p_payload ? 'id' then commerce_private.customer_identifier(p_payload->'id') else null end; address_default:=coalesce((p_payload->>'is_default')::boolean,false);
    if target_id is not null and not exists(select 1 from public.commerce_saved_addresses a where a.website_id=w.id and a.user_id=buyer and a.id=target_id) then raise exception 'Saved address not found.' using errcode='42501'; end if;
    if target_id is null and (select count(*) from public.commerce_saved_addresses a where a.website_id=w.id and a.user_id=buyer)>=20 then raise exception 'At most 20 saved addresses are allowed.' using errcode='22023'; end if;
    if address_default then update public.commerce_saved_addresses a set is_default=false,updated_at=now() where a.website_id=w.id and a.user_id=buyer and a.is_default; end if;
    if target_id is null then
      insert into public.commerce_saved_addresses(website_id,user_id,label,name,phone,address,pincode,is_default) values(w.id,buyer,btrim(p_payload->>'label'),btrim(p_payload->>'name'),btrim(p_payload->>'phone'),btrim(p_payload->>'address'),coalesce(p_payload->>'pincode',''),address_default);
    else
      update public.commerce_saved_addresses a set label=btrim(p_payload->>'label'),name=btrim(p_payload->>'name'),phone=btrim(p_payload->>'phone'),address=btrim(p_payload->>'address'),pincode=coalesce(p_payload->>'pincode',''),is_default=address_default,updated_at=now() where a.website_id=w.id and a.user_id=buyer and a.id=target_id;
    end if;
  elsif p_action='address_delete' then
    perform commerce_private.customer_payload(p_payload,array['address_id']); target_id:=commerce_private.customer_identifier(p_payload->'address_id');
    delete from public.commerce_saved_addresses a where a.website_id=w.id and a.user_id=buyer and a.id=target_id;
    if not found then raise exception 'Saved address not found.' using errcode='42501'; end if;
  elsif p_action='review_save' then
    perform commerce_private.customer_payload(p_payload,array['order_id','product_id','rating','title','body']);
    if jsonb_typeof(p_payload->'rating') is distinct from 'number' or coalesce(p_payload->>'rating','') !~ '^[1-5]$' or jsonb_typeof(p_payload->'body') is distinct from 'string' or char_length(btrim(p_payload->>'body')) not between 1 and 3000 or (p_payload ? 'title' and jsonb_typeof(p_payload->'title')<>'string') or char_length(btrim(coalesce(p_payload->>'title','')))>120 then raise exception 'Invalid review.' using errcode='22023'; end if;
    target_id:=commerce_private.customer_identifier(p_payload->'order_id'); chosen_product_id:=commerce_private.customer_identifier(p_payload->'product_id');
    select * into ord from public.commerce_orders o where o.website_id=w.id and o.id=target_id and o.customer_user_id=buyer and o.status='completed' for share;
    if not found or not exists(select 1 from public.commerce_order_items i where i.website_id=w.id and i.order_id=ord.id and i.product_id=chosen_product_id) then raise exception 'A completed purchase of this product is required.' using errcode='42501'; end if;
    insert into public.commerce_reviews(website_id,customer_user_id,order_id,product_id,rating,title,body)
      values(w.id,buyer,ord.id,chosen_product_id,(p_payload->>'rating')::integer,btrim(coalesce(p_payload->>'title','')),btrim(p_payload->>'body'))
      on conflict on constraint commerce_reviews_customer_product do update set order_id=excluded.order_id,rating=excluded.rating,title=excluded.title,body=excluded.body,status='pending',moderated_at=null,moderated_by=null,updated_at=now();
  elsif p_action='request_create' then
    perform commerce_private.customer_payload(p_payload,array['order_id','type','reason']);
    if jsonb_typeof(p_payload->'type') is distinct from 'string' or coalesce(p_payload->>'type','') not in ('cancellation','return') or jsonb_typeof(p_payload->'reason') is distinct from 'string' or char_length(btrim(p_payload->>'reason')) not between 5 and 2000 then raise exception 'Invalid order request.' using errcode='22023'; end if;
    target_id:=commerce_private.customer_identifier(p_payload->'order_id'); request_type:=p_payload->>'type';
    select * into ord from public.commerce_orders o where o.website_id=w.id and o.id=target_id and o.customer_user_id=buyer for update;
    if not found then raise exception 'Order not found.' using errcode='42501'; end if;
    if request_type='cancellation' and ord.status not in ('placed','confirmed','preparing','ready') then raise exception 'This order cannot be cancelled.' using errcode='22023'; end if;
    policy:='{}'::jsonb;
    if request_type='return' then
      if ord.status<>'completed' then raise exception 'Returns require a completed order.' using errcode='22023'; end if;
      select s.policies into policy from public.commerce_store_settings s where s.website_id=w.id for share;
      if policy is null or policy->'returns_enabled' is distinct from 'true'::jsonb or coalesce(policy->>'return_days','') !~ '^[0-9]{1,3}$' or (policy->>'return_days')::integer not between 1 and 365 or nullif(btrim(policy->>'returns'),'') is null then raise exception 'The store has no configured return policy.' using errcode='22023'; end if;
      -- For orders predating timeline installation, creation is a conservative
      -- lower bound; later payment updates must never extend the return window.
      select min(e.created_at) into completed_at from public.commerce_order_status_events e where e.website_id=w.id and e.order_id=ord.id and e.status='completed' and e.event_type in ('created','status_changed');
      completed_at:=coalesce(completed_at,ord.created_at);
      if now()>completed_at+pg_catalog.make_interval(days=>(policy->>'return_days')::integer) then raise exception 'The return window has ended.' using errcode='22023'; end if;
    end if;
    insert into public.commerce_order_requests(website_id,customer_user_id,order_id,type,reason,policy_snapshot) values(w.id,buyer,ord.id,request_type,btrim(p_payload->>'reason'),policy);
  end if;
  return commerce_private.customer_snapshot(w.id,buyer);
end;
$$;
revoke all on function public.commerce_customer_experience(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.commerce_customer_experience(uuid,text,jsonb) to authenticated;

create function commerce_private.owner_engagement_snapshot(p_website_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'reviews',case when commerce_private.is_member(p_website_id,'products') then coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'website_id',r.website_id,'product_id',r.product_id,'product_name',p.name,'rating',r.rating,'title',r.title,'body',r.body,'status',r.status,'created_at',r.created_at,'updated_at',r.updated_at,'moderated_at',r.moderated_at) order by r.created_at desc,r.id) from (select * from public.commerce_reviews where website_id=p_website_id order by created_at desc,id limit 200) r join public.commerce_products p on p.website_id=r.website_id and p.id=r.product_id where r.website_id=p_website_id),'[]'::jsonb) else '[]'::jsonb end,
    'requests',case when commerce_private.is_member(p_website_id,'orders') then coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from (select * from public.commerce_order_requests where website_id=p_website_id order by created_at desc,id limit 200) r),'[]'::jsonb) else '[]'::jsonb end,
    'events',case when commerce_private.is_member(p_website_id,'orders') then coalesce((select jsonb_agg(to_jsonb(e) order by e.event_sequence) from (select * from public.commerce_order_status_events where website_id=p_website_id order by event_sequence desc limit 1000) e),'[]'::jsonb) else '[]'::jsonb end);
$$;
revoke all on function commerce_private.owner_engagement_snapshot(uuid) from public,anon,authenticated,service_role;

create function public.commerce_owner_engagement(p_website_id uuid,p_action text default 'get',p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.commerce_websites; permission text; req public.commerce_order_requests; ord public.commerce_orders; target_id uuid; before_value jsonb;
begin
  permission:=case when p_action='review_moderate' then 'products' when p_action='request_decide' then 'orders' when p_action='get' then null else '' end;
  if permission='' then raise exception 'Unknown engagement action.' using errcode='22023'; end if;
  if p_action='get' then select * into w from public.commerce_websites where id=p_website_id for share;
  else select * into w from public.commerce_websites where id=p_website_id for update; end if;
  if w.id is null or auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) or not commerce_private.is_member(p_website_id,permission) then raise exception 'Website permission denied.' using errcode='42501'; end if;
  perform 1 from auth.users where id=auth.uid() and email_confirmed_at is not null for share;
  if not found then raise exception 'Verified owner sign-in required.' using errcode='42501'; end if;
  perform 1 from public.commerce_memberships where website_id=w.id and user_id=auth.uid() and active and role='owner' for share;
  if not found then raise exception 'Website permission denied.' using errcode='42501'; end if;
  if p_action<>'get' and w.status not in ('setup','active') then raise exception 'This website is read-only.' using errcode='42501'; end if;
  if p_action='get' then
    if not (commerce_private.is_member(w.id,'products') or commerce_private.is_member(w.id,'orders')) then raise exception 'Website permission denied.' using errcode='42501'; end if;
    perform commerce_private.customer_payload(p_payload,array[]::text[]);
  elsif p_action='review_moderate' then
    perform commerce_private.customer_payload(p_payload,array['review_id','status']);
    if jsonb_typeof(p_payload->'status') is distinct from 'string' or coalesce(p_payload->>'status','') not in ('approved','rejected') then raise exception 'Invalid moderation status.' using errcode='22023'; end if;
    target_id:=commerce_private.customer_identifier(p_payload->'review_id');
    select to_jsonb(r) into before_value from public.commerce_reviews r where r.website_id=w.id and r.id=target_id for update;
    if not found then raise exception 'Review not found.' using errcode='42501'; end if;
    update public.commerce_reviews r set status=p_payload->>'status',moderated_by=auth.uid(),moderated_at=now(),updated_at=now() where r.website_id=w.id and r.id=target_id;
    perform commerce_private.audit(w.id,'review_moderate',target_id,before_value,jsonb_build_object('status',p_payload->>'status'));
  elsif p_action='request_decide' then
    perform commerce_private.customer_payload(p_payload,array['request_id','decision','note']);
    if jsonb_typeof(p_payload->'decision') is distinct from 'string' or coalesce(p_payload->>'decision','') not in ('approved','rejected') or (p_payload ? 'note' and jsonb_typeof(p_payload->'note')<>'string') or char_length(btrim(coalesce(p_payload->>'note','')))>2000 then raise exception 'Invalid request decision.' using errcode='22023'; end if;
    target_id:=commerce_private.customer_identifier(p_payload->'request_id');
    select * into req from public.commerce_order_requests r where r.website_id=w.id and r.id=target_id for update;
    if not found then raise exception 'Request not found.' using errcode='42501'; end if;
    if req.status<>'pending' then
      if req.status=p_payload->>'decision' then return commerce_private.owner_engagement_snapshot(w.id); end if;
      raise exception 'This request has already been decided.' using errcode='22023';
    end if;
    select * into ord from public.commerce_orders o where o.website_id=w.id and o.id=req.order_id for update;
    if p_payload->>'decision'='approved' and req.type='return' and ord.status<>'completed' then raise exception 'This order is no longer eligible for a return.' using errcode='22023'; end if;
    if p_payload->>'decision'='approved' and req.type='cancellation' then
      if ord.status not in ('placed','confirmed','preparing','ready','cancelled') then raise exception 'This order can no longer be cancelled.' using errcode='22023'; end if;
      perform public.commerce_owner_action(w.id,'update_order_status',jsonb_build_object('order_id',ord.id,'status','cancelled'));
    end if;
    -- A return approval records the merchant decision only. It does not imply a
    -- refund, payment collection, automatic restock or rewritten order history.
    update public.commerce_order_requests r set status=p_payload->>'decision',decision_note=btrim(coalesce(p_payload->>'note','')),decided_at=now(),decided_by=auth.uid(),updated_at=now() where r.website_id=w.id and r.id=req.id;
    perform commerce_private.audit(w.id,'request_decide',req.id,to_jsonb(req),jsonb_build_object('status',p_payload->>'decision','decision_note',coalesce(p_payload->>'note','')));
  end if;
  return commerce_private.owner_engagement_snapshot(w.id);
end;
$$;
revoke all on function public.commerce_owner_engagement(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.commerce_owner_engagement(uuid,text,jsonb) to authenticated;

create function public.commerce_public_product_reviews(p_website_id uuid,p_product_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select case when exists(select 1 from public.commerce_websites w join public.commerce_products p on p.website_id=w.id where w.id=p_website_id and p.id=p_product_id and w.status='active' and w.business_type<>'pharmacy' and w.features->'catalog'='true'::jsonb and p.active and (p.category_id is null or exists(select 1 from public.commerce_categories c where c.website_id=w.id and c.id=p.category_id and c.active))) then
    jsonb_build_object('reviews',coalesce((select jsonb_agg(x.value order by x.created_at desc,x.id) from (select r.id,r.created_at,jsonb_build_object('id',r.id,'rating',r.rating,'title',r.title,'body',r.body,'created_at',r.created_at) value from public.commerce_reviews r where r.website_id=p_website_id and r.product_id=p_product_id and r.status='approved' order by r.created_at desc,r.id limit 50) x),'[]'::jsonb),
      'rating_count',(select count(*) from public.commerce_reviews r where r.website_id=p_website_id and r.product_id=p_product_id and r.status='approved'),
      'average_rating',(select round(avg(r.rating),2) from public.commerce_reviews r where r.website_id=p_website_id and r.product_id=p_product_id and r.status='approved'))
    else null end;
$$;
revoke all on function public.commerce_public_product_reviews(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.commerce_public_product_reviews(uuid,uuid) to anon,authenticated,service_role;

commit;
