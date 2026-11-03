-- Commerce growth only. Apply after catalog/fulfillment and customer experience.
-- No legacy rows, financial ledgers, existing policies or scheduled jobs are changed.
begin;

create table public.commerce_coupons (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references public.commerce_websites(id),
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  kind text not null check (kind in ('fixed','percentage')),
  discount_value bigint not null,
  maximum_discount_paise bigint check (maximum_discount_paise between 1 and 100000000),
  minimum_subtotal_paise bigint not null default 0 check (minimum_subtotal_paise between 0 and 1000000000000),
  starts_at timestamptz, ends_at timestamptz,
  usage_limit integer check (usage_limit between 1 and 1000000),
  per_customer_limit integer not null default 1 check (per_customer_limit between 1 and 1000000),
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (website_id,id), unique (website_id,code),
  check ((kind='fixed' and discount_value between 1 and 100000000) or (kind='percentage' and discount_value between 1 and 10000)),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);
alter table public.commerce_orders add constraint commerce_orders_coupon_tenant_fk foreign key(website_id,coupon_id) references public.commerce_coupons(website_id,id);

create table public.commerce_coupon_redemptions (
  id uuid primary key default gen_random_uuid(), website_id uuid not null,
  coupon_id uuid not null, order_id uuid not null, user_id uuid not null,
  discount_paise bigint not null check (discount_paise between 1 and 100000000),
  created_at timestamptz not null default now(),
  unique (website_id,order_id),
  foreign key (website_id,coupon_id) references public.commerce_coupons(website_id,id),
  foreign key (website_id,order_id) references public.commerce_orders(website_id,id),
  foreign key (website_id,user_id) references public.commerce_customers(website_id,user_id)
);
create index commerce_coupon_usage on public.commerce_coupon_redemptions(website_id,coupon_id,user_id);

alter table public.commerce_coupons enable row level security;
alter table public.commerce_coupon_redemptions enable row level security;
create policy commerce_coupons_owner_read on public.commerce_coupons for select to authenticated using(commerce_private.is_member(website_id,'orders'));
create policy commerce_coupon_redemptions_owner_read on public.commerce_coupon_redemptions for select to authenticated using(commerce_private.is_member(website_id,'orders'));
revoke all on public.commerce_coupons,public.commerce_coupon_redemptions from public,anon,authenticated,service_role;
grant select on public.commerce_coupons,public.commerce_coupon_redemptions to authenticated,service_role;

-- The final checkout takes this row lock before writing its redemption. All
-- users of a limited coupon serialize on the same row, across different carts.
create function commerce_private.quote_coupon(p_website_id uuid,p_user_id uuid,p_code text,p_subtotal bigint,p_delivery bigint,p_lock_coupon boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.commerce_coupons; discount bigint; used bigint; used_by_customer bigint; normalized text;
begin
  normalized:=upper(btrim(coalesce(p_code,'')));
  if normalized='' then return jsonb_build_object('coupon_id',null,'discount_paise',0,'code',''); end if;
  if normalized !~ '^[A-Z0-9][A-Z0-9_-]{2,31}$' or p_user_id is null or p_subtotal is null or p_delivery is null or p_subtotal not between 0 and 1000000000000 or p_delivery not between 0 and 100000000 then
    raise exception 'Invalid coupon quote.' using errcode='22023';
  end if;
  if p_lock_coupon then
    select * into c from public.commerce_coupons where website_id=p_website_id and code=normalized for update;
  else
    select * into c from public.commerce_coupons where website_id=p_website_id and code=normalized;
  end if;
  if not found or not c.active or (c.starts_at is not null and c.starts_at>now()) or (c.ends_at is not null and c.ends_at<=now()) or p_subtotal<c.minimum_subtotal_paise then
    raise exception 'Coupon unavailable for this order.' using errcode='22023';
  end if;
  select count(*),count(*) filter(where user_id=p_user_id) into used,used_by_customer
    from public.commerce_coupon_redemptions where website_id=p_website_id and coupon_id=c.id;
  if (c.usage_limit is not null and used>=c.usage_limit) or used_by_customer>=c.per_customer_limit then
    raise exception 'Coupon usage limit reached.' using errcode='22023';
  end if;
  -- bigint arithmetic, round down once to an exact integer paise; never float.
  discount:=case when c.kind='fixed' then c.discount_value else (p_subtotal*c.discount_value)/10000 end;
  discount:=least(discount,p_subtotal,coalesce(c.maximum_discount_paise,100000000));
  if discount<=0 then raise exception 'Coupon unavailable for this order.' using errcode='22023'; end if;
  return jsonb_build_object('coupon_id',c.id,'discount_paise',discount,'code',c.code);
end;
$$;
revoke all on function commerce_private.quote_coupon(uuid,uuid,text,bigint,bigint,boolean) from public,anon,authenticated,service_role;

-- Validate the tenant/customer/amount again even for service-side inserts. No
-- cancellation deletes a redemption: limits measure placed orders, not payouts.
create function commerce_private.guard_coupon_redemption() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.commerce_coupons; o public.commerce_orders; q jsonb;
begin
  if tg_op<>'INSERT' then raise exception 'Coupon redemption history is immutable.' using errcode='42501'; end if;
  select * into c from public.commerce_coupons where website_id=new.website_id and id=new.coupon_id for update;
  if not found then raise exception 'Invalid coupon tenant.' using errcode='23503'; end if;
  select * into o from public.commerce_orders where website_id=new.website_id and id=new.order_id;
  if not found or o.customer_user_id<>new.user_id or o.coupon_id is distinct from new.coupon_id then raise exception 'Invalid redemption order customer.' using errcode='23503'; end if;
  q:=commerce_private.quote_coupon(new.website_id,new.user_id,c.code,o.subtotal_paise,o.delivery_fee_paise,true);
  if (q->>'discount_paise')::bigint<>new.discount_paise or coalesce((to_jsonb(o)->>'discount_paise')::bigint,0)<>new.discount_paise then
    raise exception 'Invalid redemption amount.' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function commerce_private.guard_coupon_redemption() from public,anon,authenticated,service_role;
create trigger commerce_coupon_redemption_guard before insert or update or delete on public.commerce_coupon_redemptions for each row execute function commerce_private.guard_coupon_redemption();

create table public.commerce_notification_outbox (
  id uuid primary key default gen_random_uuid(), website_id uuid not null,
  order_id uuid not null, recipient_user_id uuid not null,
  event_type text not null check (event_type in ('order_placed','order_confirmed','order_preparing','order_ready','order_completed','order_cancelled')),
  dedup_key text not null check(char_length(dedup_key) between 1 and 150),
  payload jsonb not null default '{}' check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=4000),
  status text not null default 'pending' check(status in ('pending','processing','sent','failed')),
  attempts integer not null default 0 check(attempts between 0 and 5),
  available_at timestamptz not null default now(), lease_token uuid, lease_expires_at timestamptz,
  last_error_code text not null default '' check(last_error_code in ('','provider_unavailable','provider_rejected','recipient_unverified')),
  provider_message_id text check(char_length(provider_message_id)<=200),
  created_at timestamptz not null default now(), sent_at timestamptz,
  unique(website_id,dedup_key),
  foreign key(website_id,order_id) references public.commerce_orders(website_id,id),
  foreign key(website_id,recipient_user_id) references public.commerce_customers(website_id,user_id),
  check ((status='processing')=(lease_token is not null and lease_expires_at is not null))
);
create index commerce_notification_ready on public.commerce_notification_outbox(status,available_at,lease_expires_at) where status in ('pending','processing');
alter table public.commerce_notification_outbox enable row level security;
-- There is deliberately no authenticated SELECT policy: even private delivery
-- metadata must not become a second customer-data API. Owners receive counts.
revoke all on public.commerce_notification_outbox from public,anon,authenticated,service_role;

create function commerce_private.enqueue_order_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare event_name text;
begin
  if tg_op='UPDATE' and new.status is not distinct from old.status then return new; end if;
  event_name:='order_'||case when tg_op='INSERT' then 'placed' else new.status end;
  insert into public.commerce_notification_outbox(website_id,order_id,recipient_user_id,event_type,dedup_key,payload)
    values(new.website_id,new.id,new.customer_user_id,event_name,new.id::text||':'||event_name,
      jsonb_build_object('order_id',new.id,'status',new.status,'total_paise',new.total_paise))
    on conflict(website_id,dedup_key) do nothing;
  return new;
end;
$$;
revoke all on function commerce_private.enqueue_order_notification() from public,anon,authenticated,service_role;
create trigger commerce_order_notification_events after insert or update of status on public.commerce_orders for each row execute function commerce_private.enqueue_order_notification();

create function public.commerce_growth_analytics(p_website_id uuid,p_days integer default 30) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w public.commerce_websites; start_day date; end_day date; start_at timestamptz; end_at timestamptz; inventory_allowed boolean; result jsonb;
begin
  select * into w from public.commerce_websites where id=p_website_id;
  if w.id is null or auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) or not commerce_private.is_member(w.id,'orders') then raise exception 'Website permission denied.' using errcode='42501'; end if;
  if p_days is null or p_days not in (7,30,90) then raise exception 'Analytics period must be 7, 30 or 90 days.' using errcode='22023'; end if;
  end_day:=(now() at time zone 'UTC')::date;
  start_day:=end_day-(p_days-1);
  start_at:=start_day::timestamp at time zone 'UTC';
  end_at:=(end_day+1)::timestamp at time zone 'UTC';
  inventory_allowed:=commerce_private.is_member(w.id,'inventory') and w.features->'inventory'='true'::jsonb;
  with completed as materialized (
    -- Payment changes while an order remains completed also produce timeline
    -- facts. Use its first recorded completion exactly once, never updated_at.
    select o.id,o.total_paise,o.payment_method,e.completed_at
    from public.commerce_orders o
    cross join lateral (select min(s.created_at) as completed_at from public.commerce_order_status_events s where s.website_id=o.website_id and s.order_id=o.id and s.status='completed' and s.event_type in ('created','status_changed')) e
    where o.website_id=w.id and o.status='completed' and e.completed_at>=start_at and e.completed_at<end_at
  ), best_products as (
    select i.product_id,(array_agg(i.product_name order by c.completed_at desc,c.id desc,i.id))[1] as product_name,
      sum(i.quantity) as units,sum(i.line_total_paise) as gross_item_value_paise
    from completed c join public.commerce_order_items i on i.website_id=w.id and i.order_id=c.id
    group by i.product_id order by units desc,gross_item_value_paise desc,i.product_id limit 10
  ), stock_sources as (
    select p.id as product_id,p.name as product_name,null::uuid as variant_id,null::text as variant_name,null::text as sku,p.stock_quantity
    from public.commerce_products p
    left join public.commerce_product_profiles profile on profile.website_id=p.website_id and profile.product_id=p.id
    where inventory_allowed and p.website_id=w.id and p.active and not coalesce(profile.variants_required,false) and p.stock_quantity<=5
      and (p.category_id is null or exists(select 1 from public.commerce_categories category where category.website_id=w.id and category.id=p.category_id and category.active))
    union all
    select p.id,p.name,v.id,v.name,v.sku,v.stock_quantity
    from public.commerce_product_variants v join public.commerce_products p on p.website_id=v.website_id and p.id=v.product_id
    where inventory_allowed and p.website_id=w.id and p.active and v.active and v.stock_quantity<=5
      and (p.category_id is null or exists(select 1 from public.commerce_categories category where category.website_id=w.id and category.id=p.category_id and category.active))
  )
  select (select jsonb_build_object('period_days',p_days,'placed_orders',count(*),'placed_order_value_paise',coalesce(sum(total_paise),0),'cancelled_orders',count(*) filter(where status='cancelled'),'customers',count(distinct customer_user_id)) from public.commerce_orders where website_id=w.id and created_at>=start_at and created_at<end_at)
    ||jsonb_build_object('period_start_date',start_day,'period_end_date',end_day,'timezone','UTC',
      'completed_cod_orders',(select count(*) from completed where payment_method='cod'),
      'completed_cod_value_paise',(select coalesce(sum(total_paise),0) from completed where payment_method='cod'),
      'captured_funds_paise',null,'settled_funds_paise',null,'funds_tracking_available',false,
      'completion_history_incomplete',exists(select 1 from public.commerce_orders o where o.website_id=w.id and o.status='completed' and not exists(select 1 from public.commerce_order_status_events s where s.website_id=w.id and s.order_id=o.id and s.status='completed' and s.event_type in ('created','status_changed'))),
      'completed_orders_without_completion_event',(select count(*) from public.commerce_orders o where o.website_id=w.id and o.status='completed' and not exists(select 1 from public.commerce_order_status_events s where s.website_id=w.id and s.order_id=o.id and s.status='completed' and s.event_type in ('created','status_changed'))),
      'daily_trend',coalesce((select jsonb_agg(to_jsonb(day_value) order by day_value.date) from (
        select start_day+day_number as date,count(c.id) as completed_orders,coalesce(sum(c.total_paise),0) as completed_order_value_paise
        from pg_catalog.generate_series(0,p_days-1) day_number
        left join completed c on (c.completed_at at time zone 'UTC')::date=start_day+day_number
        group by day_number
      ) day_value),'[]'::jsonb),
      'best_selling_products',coalesce((select jsonb_agg(to_jsonb(product_value) order by product_value.units desc,product_value.gross_item_value_paise desc,product_value.product_id) from best_products product_value),'[]'::jsonb),
      'low_stock_available',coalesce(inventory_allowed,false),'low_stock_threshold',5,
      'low_stock',coalesce((select jsonb_agg(to_jsonb(stock_value) order by stock_value.stock_quantity,stock_value.product_name,stock_value.product_id,stock_value.variant_id nulls first) from (
        select * from stock_sources order by stock_quantity,product_name,product_id,variant_id nulls first limit 50
      ) stock_value),'[]'::jsonb)) into result;
  return result;
end;
$$;
revoke all on function public.commerce_growth_analytics(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.commerce_growth_analytics(uuid,integer) to authenticated;

create function public.commerce_growth_workspace(p_website_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w public.commerce_websites; result jsonb;
begin
  select * into w from public.commerce_websites where id=p_website_id;
  if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) or not commerce_private.is_member(p_website_id,'orders') then raise exception 'Website permission denied.' using errcode='42501'; end if;
  if not found then raise exception 'Website permission denied.' using errcode='42501'; end if;
  select jsonb_build_object(
    'coupons',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('redemption_count',(select count(*) from public.commerce_coupon_redemptions r where r.website_id=w.id and r.coupon_id=c.id)) order by c.created_at desc) from public.commerce_coupons c where c.website_id=w.id),'[]'::jsonb),
    'analytics',public.commerce_growth_analytics(w.id,30),
    'notification_status',jsonb_build_object('activation_required',true,'pending',(select count(*) from public.commerce_notification_outbox where website_id=w.id and status in ('pending','processing')),'sent',(select count(*) from public.commerce_notification_outbox where website_id=w.id and status='sent'),'failed',(select count(*) from public.commerce_notification_outbox where website_id=w.id and status='failed'))
  ) into result;
  return result;
end;
$$;
revoke all on function public.commerce_growth_workspace(uuid) from public,anon,authenticated,service_role;
grant execute on function public.commerce_growth_workspace(uuid) to authenticated;

create function public.commerce_growth_owner_action(p_website_id uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.commerce_websites; c public.commerce_coupons; target uuid; k text;
begin
  select * into w from public.commerce_websites where id=p_website_id for share;
  if not found or auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) or not commerce_private.is_member(p_website_id,'orders') then raise exception 'Website permission denied.' using errcode='42501'; end if;
  perform 1 from auth.users where id=auth.uid() and email_confirmed_at is not null for share;
  if not found then raise exception 'Verified owner sign-in required.' using errcode='42501'; end if;
  perform 1 from public.commerce_memberships where website_id=w.id and user_id=auth.uid() and active and role='owner' for share;
  if not found then raise exception 'Website permission denied.' using errcode='42501'; end if;
  if w.status not in ('setup','active') then raise exception 'Website is read-only.' using errcode='42501'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or p_action is null or p_action not in ('save_coupon','archive_coupon') then raise exception 'Invalid coupon action.' using errcode='22023'; end if;
  if p_payload ? 'id' then target:=commerce_private.customer_identifier(p_payload->'id'); end if;
  if target is not null then
    select * into c from public.commerce_coupons where website_id=w.id and id=target for update;
    if not found then raise exception 'Coupon permission denied.' using errcode='42501'; end if;
  end if;
  if p_action='archive_coupon' then
    if target is null or exists(select 1 from jsonb_object_keys(p_payload) key where key<>'id') then raise exception 'Invalid coupon id.' using errcode='22023'; end if;
    update public.commerce_coupons set active=false,updated_at=now() where website_id=w.id and id=target returning * into c;
  else
    for k in select jsonb_object_keys(p_payload) loop
      if k not in ('id','code','kind','discount_value','maximum_discount_paise','minimum_subtotal_paise','starts_at','ends_at','usage_limit','per_customer_limit','active') then raise exception 'Invalid coupon field.' using errcode='22023'; end if;
    end loop;
    if jsonb_typeof(p_payload->'code') is distinct from 'string' or jsonb_typeof(p_payload->'kind') is distinct from 'string' then raise exception 'Invalid coupon code or kind.' using errcode='22023'; end if;
    foreach k in array array['discount_value','minimum_subtotal_paise','per_customer_limit'] loop
      if jsonb_typeof(p_payload->k) is distinct from 'number' or (p_payload->>k) !~ '^[0-9]{1,13}$' then raise exception 'Invalid coupon integer.' using errcode='22023'; end if;
    end loop;
    foreach k in array array['maximum_discount_paise','usage_limit'] loop
      if p_payload ? k and p_payload->k<>'null'::jsonb and (jsonb_typeof(p_payload->k)<>'number' or (p_payload->>k) !~ '^[0-9]{1,13}$') then raise exception 'Invalid coupon limit.' using errcode='22023'; end if;
    end loop;
    if p_payload ? 'active' and jsonb_typeof(p_payload->'active')<>'boolean' then raise exception 'Invalid coupon state.' using errcode='22023'; end if;
    foreach k in array array['starts_at','ends_at'] loop
      if p_payload ? k and p_payload->k<>'null'::jsonb and (jsonb_typeof(p_payload->k)<>'string' or (p_payload->>k) !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$') then raise exception 'Invalid coupon date.' using errcode='22023'; end if;
    end loop;
    insert into public.commerce_coupons(id,website_id,code,kind,discount_value,maximum_discount_paise,minimum_subtotal_paise,starts_at,ends_at,usage_limit,per_customer_limit,active)
      values(coalesce(target,gen_random_uuid()),w.id,upper(btrim(p_payload->>'code')),p_payload->>'kind',(p_payload->>'discount_value')::bigint,(p_payload->>'maximum_discount_paise')::bigint,(p_payload->>'minimum_subtotal_paise')::bigint,(p_payload->>'starts_at')::timestamptz,(p_payload->>'ends_at')::timestamptz,(p_payload->>'usage_limit')::integer,(p_payload->>'per_customer_limit')::integer,coalesce((p_payload->>'active')::boolean,true))
      on conflict(id) do update set code=excluded.code,kind=excluded.kind,discount_value=excluded.discount_value,maximum_discount_paise=excluded.maximum_discount_paise,minimum_subtotal_paise=excluded.minimum_subtotal_paise,starts_at=excluded.starts_at,ends_at=excluded.ends_at,usage_limit=excluded.usage_limit,per_customer_limit=excluded.per_customer_limit,active=excluded.active,updated_at=now() returning * into c;
  end if;
  perform commerce_private.audit(w.id,p_action,c.id,null,to_jsonb(c));
  return to_jsonb(c);
end;
$$;
revoke all on function public.commerce_growth_owner_action(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.commerce_growth_owner_action(uuid,text,jsonb) to authenticated;

create function public.commerce_notification_claim(p_limit integer default 10,p_lease_seconds integer default 120) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service worker required.' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 25 or p_lease_seconds is null or p_lease_seconds not between 30 and 600 then raise exception 'Invalid worker batch.' using errcode='22023'; end if;
  -- A crashed fifth attempt becomes terminal instead of remaining leased forever.
  update public.commerce_notification_outbox set status='failed',lease_token=null,lease_expires_at=null,last_error_code='provider_unavailable'
    where status='processing' and lease_expires_at<=now() and attempts>=5;
  with candidates as (
    select n.id from public.commerce_notification_outbox n
    join public.commerce_websites w on w.id=n.website_id and w.status='active'
    join auth.users u on u.id=n.recipient_user_id and u.email_confirmed_at is not null and u.email is not null
    where n.attempts<5 and ((n.status='pending' and n.available_at<=now()) or (n.status='processing' and n.lease_expires_at<=now()))
    order by n.created_at,n.id for update of n skip locked limit p_limit
  ), claimed as (
    update public.commerce_notification_outbox n set status='processing',attempts=n.attempts+1,lease_token=gen_random_uuid(),lease_expires_at=now()+make_interval(secs=>p_lease_seconds)
      from candidates c where n.id=c.id returning n.*
  ) select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('recipient_email',u.email,'website_name',w.name)),'[]'::jsonb) into result
    from claimed c join auth.users u on u.id=c.recipient_user_id join public.commerce_websites w on w.id=c.website_id;
  return result;
end;
$$;
create function public.commerce_notification_ack(p_id uuid,p_lease_token uuid,p_sent boolean,p_error_code text default '',p_provider_message_id text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare n public.commerce_notification_outbox;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service worker required.' using errcode='42501'; end if;
  if p_sent is null or p_error_code is null or p_error_code not in ('','provider_unavailable','provider_rejected','recipient_unverified') or char_length(coalesce(p_provider_message_id,''))>200 then raise exception 'Invalid worker result.' using errcode='22023'; end if;
  select * into n from public.commerce_notification_outbox where id=p_id for update;
  if not found or n.status<>'processing' or n.lease_token is distinct from p_lease_token or n.lease_expires_at<=now() then raise exception 'Notification lease conflict.' using errcode='23505'; end if;
  update public.commerce_notification_outbox set status=case when p_sent then 'sent' when attempts>=5 then 'failed' else 'pending' end,
    available_at=case when p_sent then available_at else now()+make_interval(secs=>least(3600,30*power(2,attempts-1)::integer)) end,
    sent_at=case when p_sent then now() else null end,provider_message_id=case when p_sent then p_provider_message_id else null end,
    last_error_code=case when p_sent then '' else coalesce(nullif(p_error_code,''),'provider_unavailable') end,lease_token=null,lease_expires_at=null
    where id=n.id returning * into n;
  return jsonb_build_object('id',n.id,'status',n.status,'attempts',n.attempts);
end;
$$;
create function public.commerce_notification_admin(p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare affected integer; target uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service worker required.' using errcode='42501'; end if;
  if p_action='retry' then
    if jsonb_typeof(p_payload) is distinct from 'object' or not(p_payload ? 'id') or exists(select 1 from jsonb_object_keys(p_payload) key where key<>'id') then raise exception 'Invalid retry payload.' using errcode='22023'; end if;
    target:=commerce_private.customer_identifier(p_payload->'id');
    update public.commerce_notification_outbox set status='pending',attempts=0,available_at=now(),last_error_code='',lease_token=null,lease_expires_at=null where id=target and status='failed';
    get diagnostics affected=row_count;
    return jsonb_build_object('retried',affected);
  elsif p_action is distinct from 'status' or p_payload is distinct from '{}'::jsonb then raise exception 'Invalid worker action.' using errcode='22023'; end if;
  return jsonb_build_object('pending',(select count(*) from public.commerce_notification_outbox where status='pending'),'processing',(select count(*) from public.commerce_notification_outbox where status='processing'),'sent',(select count(*) from public.commerce_notification_outbox where status='sent'),'failed',(select count(*) from public.commerce_notification_outbox where status='failed'));
end;
$$;
revoke all on function public.commerce_notification_claim(integer,integer),public.commerce_notification_ack(uuid,uuid,boolean,text,text),public.commerce_notification_admin(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.commerce_notification_claim(integer,integer),public.commerce_notification_ack(uuid,uuid,boolean,text,text),public.commerce_notification_admin(text,jsonb) to service_role;
commit;
