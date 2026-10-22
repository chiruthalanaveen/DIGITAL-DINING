-- Additive Phase 1 commerce module. No existing business tables, policies or jobs are changed.
begin;

create schema commerce_private;
revoke all on schema commerce_private from public,anon,authenticated,service_role;
grant usage on schema commerce_private to authenticated;

create table public.commerce_websites (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$'),
  name text not null check (char_length(name) between 1 and 180),
  business_type text not null default 'general' check (business_type in ('general','sarees','fashion','grocery','food','toys','electronics','beauty','pharmacy','footwear')),
  template text not null default 'general' check (template = 'general'),
  status text not null default 'setup' check (status in ('setup','active','suspended','archived')),
  branding jsonb not null default '{}' check (jsonb_typeof(branding) = 'object'),
  features jsonb not null default '{"catalog":true,"inventory":true,"cod":true}' check (jsonb_typeof(features) = 'object'),
  fulfillment jsonb not null default '{"pickup":true,"delivery":false,"delivery_fee_paise":0,"minimum_order_paise":0,"pickup_address":""}' check (jsonb_typeof(fulfillment) = 'object'),
  owner_permissions jsonb not null default '{"products":true,"categories":true,"inventory":true,"orders":true,"branding":false,"customers":false}' check (jsonb_typeof(owner_permissions) = 'object'),
  subscription_plan text not null default 'basic' check (char_length(subscription_plan) between 1 and 80),
  subscription_status text not null default 'trial' check (subscription_status in ('trial','active','past_due','cancelled')),
  monthly_price_paise bigint not null default 0 check (monthly_price_paise between 0 and 1000000000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (business_type <> 'pharmacy' or status <> 'active')
);

create table public.commerce_memberships (
  website_id uuid not null references public.commerce_websites(id),
  user_id uuid not null references auth.users(id),
  role text not null default 'owner' check (role in ('owner','staff')),
  active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (website_id,user_id)
);
create unique index commerce_one_active_owner on public.commerce_memberships(website_id) where active and role = 'owner';
create index commerce_memberships_user on public.commerce_memberships(user_id,website_id) where active;

create table public.commerce_applications (
  id uuid primary key default gen_random_uuid(), applicant_user_id uuid not null references auth.users(id),
  owner_name text not null check (char_length(owner_name) between 1 and 180),
  business_name text not null check (char_length(business_name) between 1 and 180),
  business_type text not null check (business_type in ('general','sarees','fashion','grocery','food','toys','electronics','beauty','pharmacy','footwear')),
  phone text not null check (char_length(phone) between 7 and 30),
  email text not null, address text not null check (char_length(address) between 1 and 1500),
  preferred_slug text not null check (preferred_slug ~ '^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$'),
  description text not null default '' check (char_length(description) <= 3000),
  required_features text[] not null default '{}', product_categories text[] not null default '{}',
  fulfillment jsonb not null default '{}' check (jsonb_typeof(fulfillment) = 'object'),
  branding_preferences text not null default '' check (char_length(branding_preferences) <= 3000),
  payment_requirements text not null default '' check (char_length(payment_requirements) <= 1500),
  status text not null default 'submitted' check (status in ('submitted','under_review','approved','rejected')),
  review_note text not null default '' check (char_length(review_note) <= 3000),
  website_id uuid references public.commerce_websites(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index commerce_applications_applicant on public.commerce_applications(applicant_user_id,created_at desc);

create table public.commerce_categories (
  id uuid primary key default gen_random_uuid(), website_id uuid not null references public.commerce_websites(id),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$'), active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (website_id,id), unique (website_id,slug)
);
create table public.commerce_products (
  id uuid primary key default gen_random_uuid(), website_id uuid not null references public.commerce_websites(id), category_id uuid,
  name text not null check (char_length(name) between 1 and 180),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$'),
  description text not null default '' check (char_length(description) <= 3000),
  price_paise bigint not null check (price_paise between 0 and 100000000),
  stock_quantity integer not null default 0 check (stock_quantity between 0 and 1000000000),
  image_url text not null default '' check (image_url = '' or image_url ~ '^https://[^[:space:]<>]+$' or image_url ~ '^http://(127\.0\.0\.1|localhost)(:[0-9]{1,5})?/[^[:space:]<>]*$'),
  attributes jsonb not null default '{}' check (jsonb_typeof(attributes) = 'object'), active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (website_id,id), unique (website_id,slug),
  foreign key (website_id,category_id) references public.commerce_categories(website_id,id)
);
create index commerce_products_catalog on public.commerce_products(website_id,active,category_id);

create table public.commerce_customers (
  id uuid primary key default gen_random_uuid(), website_id uuid not null references public.commerce_websites(id), user_id uuid not null references auth.users(id),
  name text not null, phone text not null, address text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (website_id,user_id), unique (website_id,id)
);
create table public.commerce_orders (
  id uuid primary key default gen_random_uuid(), website_id uuid not null references public.commerce_websites(id), customer_user_id uuid not null references auth.users(id),
  idempotency_key uuid not null, request_payload jsonb not null, customer_details jsonb not null,
  fulfillment_method text not null check (fulfillment_method in ('pickup','delivery')),
  payment_method text not null default 'cod' check (payment_method = 'cod'),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','refunded')),
  status text not null default 'placed' check (status in ('placed','confirmed','preparing','ready','completed','cancelled')),
  subtotal_paise bigint not null check (subtotal_paise >= 0), delivery_fee_paise bigint not null check (delivery_fee_paise >= 0),
  total_paise bigint not null check (total_paise between 0 and 1000000000000),
  inventory_tracked boolean not null default true, inventory_released_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (website_id,id), unique (website_id,customer_user_id,idempotency_key),
  foreign key (website_id,customer_user_id) references public.commerce_customers(website_id,user_id),
  check (total_paise = subtotal_paise + delivery_fee_paise)
);
create index commerce_orders_customer on public.commerce_orders(website_id,customer_user_id,created_at desc);
create table public.commerce_order_items (
  id uuid primary key default gen_random_uuid(), website_id uuid not null, order_id uuid not null, product_id uuid not null,
  product_name text not null, quantity integer not null check (quantity between 1 and 1000000),
  unit_price_paise bigint not null check (unit_price_paise between 0 and 100000000),
  line_total_paise bigint not null check (line_total_paise = quantity::bigint * unit_price_paise),
  foreign key (website_id,order_id) references public.commerce_orders(website_id,id),
  foreign key (website_id,product_id) references public.commerce_products(website_id,id),
  unique (order_id,product_id)
);
create table public.commerce_audit_logs (
  id uuid primary key default gen_random_uuid(), website_id uuid references public.commerce_websites(id),
  actor_user_id uuid references auth.users(id), actor_email text, action text not null,
  entity_id uuid, before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);
create index commerce_audit_site on public.commerce_audit_logs(website_id,created_at desc);

create function commerce_private.is_member(p_website_id uuid,p_permission text default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.commerce_memberships m join public.commerce_websites w on w.id=m.website_id
    where m.website_id=p_website_id and m.user_id=auth.uid() and m.active and m.role='owner'
      and (p_permission is null or w.owner_permissions->p_permission = 'true'::jsonb));
$$;
revoke all on function commerce_private.is_member(uuid,text) from public,anon,authenticated,service_role;
grant execute on function commerce_private.is_member(uuid,text) to authenticated;

alter table public.commerce_websites enable row level security;
alter table public.commerce_memberships enable row level security;
alter table public.commerce_applications enable row level security;
alter table public.commerce_categories enable row level security;
alter table public.commerce_products enable row level security;
alter table public.commerce_customers enable row level security;
alter table public.commerce_orders enable row level security;
alter table public.commerce_order_items enable row level security;
alter table public.commerce_audit_logs enable row level security;

create policy commerce_websites_owner_read on public.commerce_websites for select to authenticated using(commerce_private.is_member(id));
create policy commerce_memberships_owner_read on public.commerce_memberships for select to authenticated using(user_id=auth.uid() or commerce_private.is_member(website_id));
create policy commerce_applications_self_read on public.commerce_applications for select to authenticated using(applicant_user_id=auth.uid());
create policy commerce_categories_owner_read on public.commerce_categories for select to authenticated using(commerce_private.is_member(website_id,'categories') or commerce_private.is_member(website_id,'products'));
create policy commerce_products_owner_read on public.commerce_products for select to authenticated using(commerce_private.is_member(website_id,'products') or commerce_private.is_member(website_id,'inventory'));
create policy commerce_customers_scoped_read on public.commerce_customers for select to authenticated using(user_id=auth.uid() or commerce_private.is_member(website_id,'customers'));
create policy commerce_orders_scoped_read on public.commerce_orders for select to authenticated using(customer_user_id=auth.uid() or commerce_private.is_member(website_id,'orders'));
create policy commerce_order_items_scoped_read on public.commerce_order_items for select to authenticated using(exists(select 1 from public.commerce_orders o where o.website_id=commerce_order_items.website_id and o.id=commerce_order_items.order_id and (o.customer_user_id=auth.uid() or commerce_private.is_member(o.website_id,'orders'))));
-- Audit snapshots can include customer/order details. They are administrative
-- records, not an alternate way around owner orders/customers permissions.

revoke all on public.commerce_websites,public.commerce_memberships,public.commerce_applications,public.commerce_categories,public.commerce_products,public.commerce_customers,public.commerce_orders,public.commerce_order_items,public.commerce_audit_logs from public,anon,authenticated;
grant select on public.commerce_websites,public.commerce_memberships,public.commerce_applications,public.commerce_categories,public.commerce_products,public.commerce_customers,public.commerce_orders,public.commerce_order_items,public.commerce_audit_logs to authenticated;
revoke select on public.commerce_audit_logs from authenticated;
grant all on public.commerce_websites,public.commerce_memberships,public.commerce_applications,public.commerce_categories,public.commerce_products,public.commerce_customers,public.commerce_orders,public.commerce_order_items,public.commerce_audit_logs to service_role;

-- Configuration validators are intentionally not callable through the public API.
create function commerce_private.valid_slug(p_value text) returns boolean language sql immutable set search_path='' as $$
  select p_value ~ '^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$' and p_value not in ('admin','api','commerce','shops','www','app','delivery','auth','login','support');
$$;
create function commerce_private.validate_branding(p_value jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare k text; v jsonb;
begin
  if jsonb_typeof(p_value) <> 'object' or octet_length(p_value::text)>12000 then raise exception 'Invalid branding.' using errcode='22023'; end if;
  for k,v in select * from jsonb_each(p_value) loop
    if k not in ('primary_color','background_color','text_color','logo_url','banner_url','headline','description','contact_email','contact_phone') or jsonb_typeof(v)<>'string' then raise exception 'Invalid branding field.' using errcode='22023'; end if;
    if k in ('primary_color','background_color','text_color') and (v#>>'{}') !~ '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$' then raise exception 'Use a hex color.' using errcode='22023'; end if;
    if k in ('logo_url','banner_url') and (v#>>'{}')<>'' and (v#>>'{}') !~ '^https://[^[:space:]<>]+$' and (v#>>'{}') !~ '^http://(127\.0\.0\.1|localhost)(:[0-9]{1,5})?/[^[:space:]<>]*$' then raise exception 'Use an HTTPS image URL.' using errcode='22023'; end if;
    if char_length(v#>>'{}')>3000 then raise exception 'Branding text is too long.' using errcode='22023'; end if;
  end loop;
  return p_value;
end;
$$;
create function commerce_private.validate_flags(p_value jsonb,p_allowed text[]) returns jsonb language plpgsql immutable set search_path='' as $$
declare k text; v jsonb;
begin
  if jsonb_typeof(p_value)<>'object' then raise exception 'Invalid feature configuration.' using errcode='22023'; end if;
  for k,v in select * from jsonb_each(p_value) loop
    if not(k=any(p_allowed)) or jsonb_typeof(v)<>'boolean' then raise exception 'Unknown feature or invalid permission.' using errcode='22023'; end if;
  end loop;
  return p_value;
end;
$$;
create function commerce_private.validate_fulfillment(p_value jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare k text; v jsonb;
begin
  if jsonb_typeof(p_value)<>'object' then raise exception 'Invalid fulfillment configuration.' using errcode='22023'; end if;
  for k,v in select * from jsonb_each(p_value) loop
    if k in ('pickup','delivery') then
      if jsonb_typeof(v)<>'boolean' then raise exception 'Invalid fulfillment flag.' using errcode='22023'; end if;
    elsif k in ('delivery_fee_paise','minimum_order_paise') then
      if v::text !~ '^[0-9]{1,10}$' or (v::text)::bigint>100000000 then raise exception 'Invalid fulfillment amount.' using errcode='22023'; end if;
    elsif k='pickup_address' then
      if jsonb_typeof(v)<>'string' or char_length(v#>>'{}')>1500 then raise exception 'Invalid pickup address.' using errcode='22023'; end if;
    else raise exception 'Unknown fulfillment setting.' using errcode='22023';
    end if;
  end loop;
  return p_value;
end;
$$;
create function commerce_private.audit(p_website uuid,p_action text,p_entity uuid,p_before jsonb,p_after jsonb,p_actor_email text default null) returns void language sql security definer set search_path='' as $$
  insert into public.commerce_audit_logs(website_id,actor_user_id,actor_email,action,entity_id,before_data,after_data)
  values(p_website,auth.uid(),p_actor_email,p_action,p_entity,p_before,p_after);
$$;
revoke all on function commerce_private.valid_slug(text),commerce_private.validate_branding(jsonb),commerce_private.validate_flags(jsonb,text[]),commerce_private.validate_fulfillment(jsonb),commerce_private.audit(uuid,text,uuid,jsonb,jsonb,text) from public,anon,authenticated,service_role;

create function public.commerce_public_catalog(p_slug text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w public.commerce_websites; result jsonb;
begin
  select * into w from public.commerce_websites where slug=p_slug and status='active' and business_type<>'pharmacy' and features->'catalog'='true'::jsonb;
  if not found then return null; end if;
  select jsonb_build_object(
    'website',jsonb_build_object('id',w.id,'slug',w.slug,'name',w.name,'business_type',w.business_type,'template',w.template,'status',w.status,'branding',w.branding,'features',w.features,'fulfillment',w.fulfillment),
    'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'slug',c.slug) order by c.name) from public.commerce_categories c where c.website_id=w.id and c.active),'[]'::jsonb),
    'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'category_id',p.category_id,'name',p.name,'slug',p.slug,'description',p.description,'price_paise',p.price_paise,'stock_quantity',p.stock_quantity,'image_url',p.image_url,'attributes',p.attributes) order by p.name) from public.commerce_products p where p.website_id=w.id and p.active and (p.category_id is null or exists(select 1 from public.commerce_categories c where c.website_id=w.id and c.id=p.category_id and c.active))),'[]'::jsonb)) into result;
  return result;
end;
$$;
revoke all on function public.commerce_public_catalog(text) from public,anon,authenticated,service_role;
grant execute on function public.commerce_public_catalog(text) to anon,authenticated,service_role;

create function public.commerce_submit_application(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u auth.users; a public.commerce_applications;
begin
  select * into u from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if not found then raise exception 'Verify your email before applying.' using errcode='42501'; end if;
  if jsonb_typeof(p_payload)<>'object' or not commerce_private.valid_slug(p_payload->>'preferred_slug') then raise exception 'Invalid application.' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_payload->'required_features','[]'::jsonb))<>'array' or jsonb_typeof(coalesce(p_payload->'product_categories','[]'::jsonb))<>'array' then raise exception 'Requirements must be lists.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(p_payload->'required_features','[]'::jsonb)) v where jsonb_typeof(v)<>'string' or char_length(v#>>'{}')>100) or exists(select 1 from jsonb_array_elements(coalesce(p_payload->'product_categories','[]'::jsonb)) v where jsonb_typeof(v)<>'string' or char_length(v#>>'{}')>100) then raise exception 'Invalid requirement.' using errcode='22023'; end if;
  if jsonb_array_length(coalesce(p_payload->'required_features','[]'::jsonb))>40 or jsonb_array_length(coalesce(p_payload->'product_categories','[]'::jsonb))>40 then raise exception 'Too many requirements.' using errcode='22023'; end if;
  insert into public.commerce_applications(applicant_user_id,owner_name,business_name,business_type,phone,email,address,preferred_slug,description,required_features,product_categories,fulfillment,branding_preferences,payment_requirements)
  values(u.id,btrim(p_payload->>'owner_name'),btrim(p_payload->>'business_name'),coalesce(p_payload->>'business_type','general'),btrim(p_payload->>'phone'),u.email,btrim(p_payload->>'address'),p_payload->>'preferred_slug',coalesce(p_payload->>'description',''),array(select jsonb_array_elements_text(coalesce(p_payload->'required_features','[]'::jsonb))),array(select jsonb_array_elements_text(coalesce(p_payload->'product_categories','[]'::jsonb))),commerce_private.validate_fulfillment(coalesce(p_payload->'fulfillment','{}'::jsonb)),coalesce(p_payload->>'branding_preferences',''),coalesce(p_payload->>'payment_requirements','')) returning * into a;
  return to_jsonb(a);
end;
$$;
revoke all on function public.commerce_submit_application(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.commerce_submit_application(jsonb) to authenticated;

create function public.commerce_owner_action(p_website_id uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.commerce_websites; product public.commerce_products; category public.commerce_categories; ord public.commerce_orders;
  result jsonb; before_value jsonb; target_id uuid; permission text; delta integer; item record; desired text; attrs jsonb; k text; v jsonb;
begin
  permission:=case when p_action in ('save_product','archive_product') then 'products' when p_action in ('save_category','archive_category') then 'categories' when p_action='adjust_stock' then 'inventory' when p_action='update_branding' then 'branding' when p_action='update_order_status' then 'orders' else null end;
  if permission is null then raise exception 'Unknown owner action.' using errcode='22023'; end if;
  if auth.uid() is null then raise exception 'Website permission denied.' using errcode='42501'; end if;
  select * into w from public.commerce_websites where id=p_website_id for share;
  -- Authorization follows the website lock: an Admin may revoke membership or
  -- permissions while this action waits for that same row. Re-read membership
  -- after the wait, so a former owner cannot continue with stale authorization.
  if not found or not commerce_private.is_member(p_website_id,permission) then raise exception 'Website permission denied.' using errcode='42501'; end if;
  if w.status not in ('setup','active') then raise exception 'This website is read-only.' using errcode='42501'; end if;
  if p_action in ('save_product','archive_product','save_category','archive_category') and w.features->'catalog' is distinct from 'true'::jsonb then raise exception 'Catalog management is disabled.' using errcode='42501'; end if;
  if jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid action payload.' using errcode='22023'; end if;
  if p_action='save_product' then
    target_id:=nullif(p_payload->>'id','')::uuid;
    if target_id is not null then
      select * into product from public.commerce_products where website_id=w.id and id=target_id for update;
      if not found then raise exception 'Product not found.' using errcode='42501'; end if;
      before_value:=to_jsonb(product);
    end if;
    if not commerce_private.valid_slug(p_payload->>'slug') or coalesce(p_payload->>'price_paise','') !~ '^[0-9]{1,9}$' or (p_payload->>'price_paise')::bigint>100000000 then raise exception 'Invalid product slug or price.' using errcode='22023'; end if;
    if nullif(p_payload->>'category_id','') is not null and not exists(select 1 from public.commerce_categories where website_id=w.id and id=(p_payload->>'category_id')::uuid and active) then raise exception 'Category does not belong to this website.' using errcode='42501'; end if;
    attrs:=coalesce(p_payload->'attributes','{}'::jsonb);
    if jsonb_typeof(attrs)<>'object' or octet_length(attrs::text)>12000 then raise exception 'Invalid product attributes.' using errcode='22023'; end if;
    for k,v in select * from jsonb_each(attrs) loop
      if char_length(k)>80 or jsonb_typeof(v) not in ('string','number','boolean','array') or (jsonb_typeof(v)='array' and exists(select 1 from jsonb_array_elements(v) entry where jsonb_typeof(entry)<>'string')) then raise exception 'Attributes must be simple values or text lists.' using errcode='22023'; end if;
    end loop;
    if target_id is null then
      insert into public.commerce_products(website_id,category_id,name,slug,description,price_paise,image_url,attributes,active)
      values(w.id,nullif(p_payload->>'category_id','')::uuid,btrim(p_payload->>'name'),p_payload->>'slug',coalesce(p_payload->>'description',''),(p_payload->>'price_paise')::bigint,coalesce(p_payload->>'image_url',''),attrs,coalesce((p_payload->>'active')::boolean,true)) returning * into product;
    else
      update public.commerce_products set category_id=nullif(p_payload->>'category_id','')::uuid,name=btrim(p_payload->>'name'),slug=p_payload->>'slug',description=coalesce(p_payload->>'description',''),price_paise=(p_payload->>'price_paise')::bigint,image_url=coalesce(p_payload->>'image_url',''),attributes=attrs,active=coalesce((p_payload->>'active')::boolean,true),updated_at=now() where id=target_id and website_id=w.id returning * into product;
    end if;
    result:=to_jsonb(product); target_id:=product.id;
  elsif p_action='archive_product' then
    target_id:=coalesce(p_payload->>'id',p_payload->>'product_id')::uuid;
    select to_jsonb(p) into before_value from public.commerce_products p where p.website_id=w.id and p.id=target_id for update;
    if not found then raise exception 'Product not found.' using errcode='42501'; end if;
    update public.commerce_products set active=false,updated_at=now() where website_id=w.id and id=target_id returning to_jsonb(commerce_products.*) into result;
  elsif p_action='save_category' then
    if not commerce_private.valid_slug(p_payload->>'slug') then raise exception 'Invalid category slug.' using errcode='22023'; end if;
    target_id:=nullif(p_payload->>'id','')::uuid;
    if target_id is null then
      insert into public.commerce_categories(website_id,name,slug,active) values(w.id,btrim(p_payload->>'name'),p_payload->>'slug',coalesce((p_payload->>'active')::boolean,true)) returning * into category;
    else
      select to_jsonb(c) into before_value from public.commerce_categories c where c.website_id=w.id and c.id=target_id for update;
      if not found then raise exception 'Category not found.' using errcode='42501'; end if;
      update public.commerce_categories set name=btrim(p_payload->>'name'),slug=p_payload->>'slug',active=coalesce((p_payload->>'active')::boolean,true),updated_at=now() where website_id=w.id and id=target_id returning * into category;
    end if;
    result:=to_jsonb(category); target_id:=category.id;
  elsif p_action='archive_category' then
    target_id:=coalesce(p_payload->>'id',p_payload->>'category_id')::uuid;
    select to_jsonb(c) into before_value from public.commerce_categories c where c.website_id=w.id and c.id=target_id for update;
    if not found then raise exception 'Category not found.' using errcode='42501'; end if;
    update public.commerce_categories set active=false,updated_at=now() where website_id=w.id and id=target_id returning to_jsonb(commerce_categories.*) into result;
  elsif p_action='adjust_stock' then
    if w.features->'inventory'<>'true'::jsonb or coalesce(p_payload->>'delta','') !~ '^-?[0-9]{1,7}$' then raise exception 'Inventory is unavailable or quantity invalid.' using errcode='22023'; end if;
    delta:=(p_payload->>'delta')::integer;
    if delta=0 or delta not between -1000000 and 1000000 then raise exception 'Invalid stock adjustment.' using errcode='22023'; end if;
    target_id:=(p_payload->>'product_id')::uuid;
    select * into product from public.commerce_products where website_id=w.id and id=target_id for update;
    if not found then raise exception 'Product not found.' using errcode='42501'; end if;
    if product.stock_quantity::bigint+delta not between 0 and 1000000000 then raise exception 'Stock cannot be negative or exceed the limit.' using errcode='22023'; end if;
    before_value:=to_jsonb(product);
    update public.commerce_products set stock_quantity=stock_quantity+delta,updated_at=now() where website_id=w.id and id=target_id returning to_jsonb(commerce_products.*) into result;
  elsif p_action='update_branding' then
    before_value:=to_jsonb(w); target_id:=w.id;
    update public.commerce_websites set branding=branding||commerce_private.validate_branding(coalesce(p_payload->'branding','{}'::jsonb)),updated_at=now() where id=w.id returning to_jsonb(commerce_websites.*) into result;
  elsif p_action='update_order_status' then
    target_id:=(p_payload->>'order_id')::uuid; desired:=p_payload->>'status';
    select * into ord from public.commerce_orders where website_id=w.id and id=target_id for update;
    if not found then raise exception 'Order not found.' using errcode='42501'; end if;
    if desired=ord.status then return to_jsonb(ord); end if;
    if not ((ord.status='placed' and desired in ('confirmed','cancelled')) or (ord.status='confirmed' and desired in ('preparing','cancelled')) or (ord.status='preparing' and desired in ('ready','cancelled')) or (ord.status='ready' and desired in ('completed','cancelled'))) then raise exception 'Invalid order status transition.' using errcode='22023'; end if;
    before_value:=to_jsonb(ord);
    if desired='cancelled' and ord.inventory_tracked and ord.inventory_released_at is null then
      perform 1 from public.commerce_products p join public.commerce_order_items i on i.website_id=p.website_id and i.product_id=p.id where i.website_id=w.id and i.order_id=ord.id order by p.id for update of p;
      update public.commerce_products p set stock_quantity=p.stock_quantity+i.quantity,updated_at=now() from public.commerce_order_items i where i.website_id=w.id and i.order_id=ord.id and p.website_id=w.id and p.id=i.product_id;
    end if;
    update public.commerce_orders set status=desired,inventory_released_at=case when desired='cancelled' then now() else inventory_released_at end,updated_at=now() where website_id=w.id and id=target_id returning to_jsonb(commerce_orders.*) into result;
  end if;
  perform commerce_private.audit(w.id,p_action,target_id,before_value,result);
  return result;
end;
$$;
revoke all on function public.commerce_owner_action(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.commerce_owner_action(uuid,text,jsonb) to authenticated;

create function public.commerce_create_cod_order(p_website_id uuid,p_items jsonb,p_customer jsonb,p_fulfillment text,p_idempotency_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.commerce_websites; ord public.commerce_orders; product public.commerce_products; buyer uuid:=auth.uid(); normalized jsonb; request_data jsonb;
  item record; subtotal bigint:=0; delivery_fee bigint:=0; line_count integer:=0; tracked boolean;
begin
  if buyer is null or not exists(select 1 from auth.users where id=buyer and email_confirmed_at is not null) then raise exception 'Verified customer sign-in required.' using errcode='42501'; end if;
  if p_idempotency_key is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 50 or jsonb_typeof(p_customer)<>'object' or p_fulfillment not in ('pickup','delivery') then raise exception 'Invalid checkout.' using errcode='22023'; end if;
  if coalesce(btrim(p_customer->>'name'),'')='' or char_length(p_customer->>'name')>180 or coalesce(p_customer->>'phone','') !~ '^\+?[0-9 ()-]{7,30}$' or char_length(coalesce(p_customer->>'address',''))>1500 or (p_fulfillment='delivery' and coalesce(btrim(p_customer->>'address'),'')='') then raise exception 'Invalid customer details.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) i where jsonb_typeof(i)<>'object' or coalesce(i->>'product_id','') !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' or coalesce(i->>'quantity','') !~ '^[0-9]{1,4}$' or (i->>'quantity')::integer not between 1 and 999) then raise exception 'Invalid cart item.' using errcode='22023'; end if;
  select jsonb_agg(jsonb_build_object('product_id',id,'quantity',qty) order by id) into normalized from (select (i->>'product_id')::uuid id,sum((i->>'quantity')::integer)::integer qty from jsonb_array_elements(p_items)i group by 1) grouped;
  if exists(select 1 from jsonb_array_elements(normalized)i where (i->>'quantity')::integer>999) then raise exception 'Item quantity limit exceeded.' using errcode='22023'; end if;
  request_data:=jsonb_build_object('items',normalized,'customer',jsonb_build_object('name',btrim(p_customer->>'name'),'phone',btrim(p_customer->>'phone'),'address',btrim(coalesce(p_customer->>'address',''))),'fulfillment',p_fulfillment);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_website_id::text||buyer::text||p_idempotency_key::text,0));
  select * into ord from public.commerce_orders where website_id=p_website_id and customer_user_id=buyer and idempotency_key=p_idempotency_key;
  if found then
    if ord.request_payload<>request_data then raise exception 'Idempotency key was used for a different checkout.' using errcode='22023'; end if;
    return jsonb_build_object('order',to_jsonb(ord)-'request_payload','items',coalesce((select jsonb_agg(to_jsonb(i)) from public.commerce_order_items i where i.website_id=ord.website_id and i.order_id=ord.id),'[]'::jsonb));
  end if;
  select * into w from public.commerce_websites where id=p_website_id for share;
  if not found or w.status<>'active' or w.business_type='pharmacy' or w.features->'catalog'<>'true'::jsonb or w.features->'cod'<>'true'::jsonb then raise exception 'This website cannot accept COD orders.' using errcode='42501'; end if;
  if w.fulfillment->p_fulfillment<>'true'::jsonb then raise exception 'This fulfillment method is unavailable.' using errcode='22023'; end if;
  tracked:=w.features->'inventory'='true'::jsonb;
  for product in select p.* from public.commerce_products p join jsonb_array_elements(normalized)i on p.id=(i->>'product_id')::uuid where p.website_id=w.id order by p.id for update of p loop
    select (i->>'quantity')::integer into line_count from jsonb_array_elements(normalized)i where (i->>'product_id')::uuid=product.id;
    if not product.active or (product.category_id is not null and not exists(select 1 from public.commerce_categories where website_id=w.id and id=product.category_id and active)) then raise exception 'A product is unavailable.' using errcode='22023'; end if;
    if tracked and product.stock_quantity<line_count then raise exception 'Insufficient stock for %.',product.name using errcode='22023'; end if;
    subtotal:=subtotal+product.price_paise*line_count;
  end loop;
  if (select count(*) from public.commerce_products p join jsonb_array_elements(normalized)i on p.id=(i->>'product_id')::uuid where p.website_id=w.id)<>jsonb_array_length(normalized) then raise exception 'Cart contains a product from another website or a missing product.' using errcode='42501'; end if;
  if subtotal<coalesce((w.fulfillment->>'minimum_order_paise')::bigint,0) then raise exception 'Minimum order value was not met.' using errcode='22023'; end if;
  if p_fulfillment='delivery' then delivery_fee:=coalesce((w.fulfillment->>'delivery_fee_paise')::bigint,0); end if;
  insert into public.commerce_customers(website_id,user_id,name,phone,address) values(w.id,buyer,request_data->'customer'->>'name',request_data->'customer'->>'phone',request_data->'customer'->>'address') on conflict(website_id,user_id) do update set name=excluded.name,phone=excluded.phone,address=excluded.address,updated_at=now();
  insert into public.commerce_orders(website_id,customer_user_id,idempotency_key,request_payload,customer_details,fulfillment_method,subtotal_paise,delivery_fee_paise,total_paise,inventory_tracked) values(w.id,buyer,p_idempotency_key,request_data,request_data->'customer',p_fulfillment,subtotal,delivery_fee,subtotal+delivery_fee,tracked) returning * into ord;
  insert into public.commerce_order_items(website_id,order_id,product_id,product_name,quantity,unit_price_paise,line_total_paise)
  select w.id,ord.id,p.id,p.name,(i->>'quantity')::integer,p.price_paise,p.price_paise*(i->>'quantity')::integer from jsonb_array_elements(normalized)i join public.commerce_products p on p.id=(i->>'product_id')::uuid and p.website_id=w.id;
  if tracked then update public.commerce_products p set stock_quantity=p.stock_quantity-(i->>'quantity')::integer,updated_at=now() from jsonb_array_elements(normalized)i where p.website_id=w.id and p.id=(i->>'product_id')::uuid; end if;
  return jsonb_build_object('order',to_jsonb(ord)-'request_payload','items',(select jsonb_agg(to_jsonb(i)) from public.commerce_order_items i where i.website_id=w.id and i.order_id=ord.id));
end;
$$;
revoke all on function public.commerce_create_cod_order(uuid,jsonb,jsonb,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.commerce_create_cod_order(uuid,jsonb,jsonb,text,uuid) to authenticated;

-- Only trusted server-side Super Admin APIs may call this entry point.
create function public.commerce_admin_action(p_action text,p_payload jsonb,p_actor_email text) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.commerce_websites; a public.commerce_applications; membership public.commerce_memberships; before_value jsonb; result jsonb; target_id uuid; owner_id uuid; app_id uuid;
  brand jsonb; flags jsonb; fulfillment_value jsonb; permissions jsonb; report jsonb;
begin
  if coalesce(btrim(p_actor_email),'')='' or char_length(p_actor_email)>320 or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid administrative request.' using errcode='22023'; end if;
  if p_action in ('create_website','save_website') then
    if p_action='save_website' then
      target_id:=coalesce(p_payload->>'id',p_payload->>'website_id')::uuid;
      select * into w from public.commerce_websites where id=target_id for update;
      if not found then raise exception 'Website not found.' using errcode='22023'; end if;
      before_value:=to_jsonb(w);
    end if;
    if not commerce_private.valid_slug(coalesce(p_payload->>'slug',w.slug)) then raise exception 'Invalid or reserved website slug.' using errcode='22023'; end if;
    brand:=commerce_private.validate_branding(coalesce(p_payload->'branding',case when p_action='save_website' then w.branding else '{}'::jsonb end));
    flags:='{"catalog":true,"inventory":true,"cod":true}'::jsonb||commerce_private.validate_flags(coalesce(p_payload->'features',case when p_action='save_website' then w.features else '{}'::jsonb end),array['catalog','inventory','cod']);
    fulfillment_value:='{"pickup":true,"delivery":false,"delivery_fee_paise":0,"minimum_order_paise":0,"pickup_address":""}'::jsonb||commerce_private.validate_fulfillment(coalesce(p_payload->'fulfillment',case when p_action='save_website' then w.fulfillment else '{}'::jsonb end));
    permissions:='{"products":true,"categories":true,"inventory":true,"orders":true,"branding":false,"customers":false}'::jsonb||commerce_private.validate_flags(coalesce(p_payload->'owner_permissions',case when p_action='save_website' then w.owner_permissions else '{}'::jsonb end),array['products','categories','inventory','orders','branding','customers']);
    if p_action='create_website' then
      insert into public.commerce_websites(slug,name,business_type,template,status,branding,features,fulfillment,owner_permissions,subscription_plan,subscription_status,monthly_price_paise)
      values(p_payload->>'slug',btrim(p_payload->>'name'),coalesce(p_payload->>'business_type','general'),coalesce(p_payload->>'template','general'),coalesce(p_payload->>'status','setup'),brand,flags,fulfillment_value,permissions,coalesce(p_payload->>'subscription_plan','basic'),coalesce(p_payload->>'subscription_status','trial'),coalesce((p_payload->>'monthly_price_paise')::bigint,0)) returning * into w;
    else
      update public.commerce_websites set slug=coalesce(p_payload->>'slug',w.slug),name=coalesce(btrim(p_payload->>'name'),w.name),business_type=coalesce(p_payload->>'business_type',w.business_type),template=coalesce(p_payload->>'template',w.template),status=coalesce(p_payload->>'status',w.status),branding=brand,features=flags,fulfillment=fulfillment_value,owner_permissions=permissions,subscription_plan=coalesce(p_payload->>'subscription_plan',w.subscription_plan),subscription_status=coalesce(p_payload->>'subscription_status',w.subscription_status),monthly_price_paise=coalesce((p_payload->>'monthly_price_paise')::bigint,w.monthly_price_paise),updated_at=now() where id=w.id returning * into w;
    end if;
    owner_id:=nullif(p_payload->>'owner_user_id','')::uuid; app_id:=nullif(p_payload->>'application_id','')::uuid;
    if app_id is not null then
      select * into a from public.commerce_applications where id=app_id for update;
      if not found or a.status<>'approved' or (a.website_id is not null and a.website_id<>w.id) or (owner_id is not null and owner_id<>a.applicant_user_id) then raise exception 'An approved application is required for website setup.' using errcode='22023'; end if;
      owner_id:=a.applicant_user_id;
      update public.commerce_applications set website_id=w.id,status='approved',updated_at=now() where id=a.id;
    end if;
    if owner_id is not null then
      if not exists(select 1 from auth.users where id=owner_id and email_confirmed_at is not null) then raise exception 'Owner must have a verified Auth account.' using errcode='22023'; end if;
      update public.commerce_memberships set active=false,updated_at=now() where website_id=w.id and active and role='owner';
      insert into public.commerce_memberships(website_id,user_id,role,active) values(w.id,owner_id,'owner',true) on conflict(website_id,user_id) do update set role='owner',active=true,updated_at=now();
    end if;
    if w.status='active' and not exists(select 1 from public.commerce_memberships where website_id=w.id and role='owner' and active) then raise exception 'Assign a verified owner before activation.' using errcode='22023'; end if;
    target_id:=w.id; result:=to_jsonb(w);
  elsif p_action='assign_owner' then
    target_id:=(p_payload->>'website_id')::uuid; owner_id:=(p_payload->>'user_id')::uuid;
    select * into w from public.commerce_websites where id=target_id for update;
    if not found or not exists(select 1 from auth.users where id=owner_id and email_confirmed_at is not null) then raise exception 'Website and verified owner are required.' using errcode='22023'; end if;
    select to_jsonb(m) into before_value from public.commerce_memberships m where website_id=w.id and active and role='owner';
    update public.commerce_memberships set active=false,updated_at=now() where website_id=w.id and active and role='owner';
    insert into public.commerce_memberships(website_id,user_id,role,active) values(w.id,owner_id,'owner',true) on conflict(website_id,user_id) do update set role='owner',active=true,updated_at=now() returning * into membership;
    result:=to_jsonb(membership);
  elsif p_action='review_application' then
    app_id:=coalesce(p_payload->>'application_id',p_payload->>'id')::uuid;
    select * into a from public.commerce_applications where id=app_id for update;
    if not found or p_payload->>'status' not in ('under_review','approved','rejected') then raise exception 'Invalid application review.' using errcode='22023'; end if;
    if a.status in ('approved','rejected') and p_payload->>'status'<>a.status then raise exception 'This application has already been decided.' using errcode='22023'; end if;
    before_value:=to_jsonb(a); target_id:=a.id;
    if nullif(p_payload->>'website_id','') is not null then
      if p_payload->>'status'<>'approved' then raise exception 'Only approved applications can be linked.' using errcode='22023'; end if;
      select * into w from public.commerce_websites where id=(p_payload->>'website_id')::uuid for update;
      if not found or (a.website_id is not null and a.website_id<>w.id) then raise exception 'Invalid website assignment.' using errcode='22023'; end if;
      if not exists(select 1 from auth.users where id=a.applicant_user_id and email_confirmed_at is not null) then raise exception 'Owner email is not verified.' using errcode='22023'; end if;
      update public.commerce_memberships set active=false,updated_at=now() where website_id=w.id and active and role='owner';
      insert into public.commerce_memberships(website_id,user_id,role,active) values(w.id,a.applicant_user_id,'owner',true) on conflict(website_id,user_id) do update set role='owner',active=true,updated_at=now();
    end if;
    update public.commerce_applications set status=p_payload->>'status',review_note=coalesce(p_payload->>'review_note',''),website_id=coalesce(w.id,website_id),updated_at=now() where id=a.id returning * into a;
    result:=to_jsonb(a); w.id:=a.website_id;
  elsif p_action='open_management_view' then
    select * into w from public.commerce_websites where id=(p_payload->>'website_id')::uuid;
    if not found then raise exception 'Website not found.' using errcode='22023'; end if;
    target_id:=w.id;
    select jsonb_build_object('order_count',(select count(*) from public.commerce_orders where website_id=w.id),'sales_paise',(select coalesce(sum(total_paise),0) from public.commerce_orders where website_id=w.id and status='completed'),'customer_count',(select count(*) from public.commerce_customers where website_id=w.id),'product_count',(select count(*) from public.commerce_products where website_id=w.id)) into report;
    result:=jsonb_build_object('website',to_jsonb(w),'categories',coalesce((select jsonb_agg(to_jsonb(c)) from public.commerce_categories c where website_id=w.id),'[]'::jsonb),'products',coalesce((select jsonb_agg(to_jsonb(p)) from public.commerce_products p where website_id=w.id),'[]'::jsonb),'orders',coalesce((select jsonb_agg(to_jsonb(o)-'request_payload') from public.commerce_orders o where website_id=w.id),'[]'::jsonb),'order_items',coalesce((select jsonb_agg(to_jsonb(i)) from public.commerce_order_items i where website_id=w.id),'[]'::jsonb),'customers',coalesce((select jsonb_agg(to_jsonb(c)) from public.commerce_customers c where website_id=w.id),'[]'::jsonb),'report',report);
    -- Audit metadata only: do not duplicate all customer/order details in the audit log.
    perform commerce_private.audit(w.id,p_action,target_id,null,jsonb_build_object('website_id',w.id),p_actor_email);
    return result;
  else raise exception 'Unknown administrative action.' using errcode='22023';
  end if;
  perform commerce_private.audit(w.id,p_action,target_id,before_value,result,p_actor_email);
  return result;
end;
$$;
revoke all on function public.commerce_admin_action(text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.commerce_admin_action(text,jsonb,text) to service_role;

create function commerce_private.media_access(p_name text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare prefix text:=split_part(p_name,'/',1); site uuid;
begin
  if prefix !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' or position('/' in p_name)=0 or p_name ~ '(^|/)\.\.(/|$)' then return false; end if;
  site:=prefix::uuid;
  return exists(select 1 from public.commerce_websites where id=site and status in ('setup','active'))
    and (commerce_private.is_member(site,'branding') or commerce_private.is_member(site,'products'));
end;
$$;
revoke all on function commerce_private.media_access(text) from public,anon,authenticated,service_role;
grant execute on function commerce_private.media_access(text) to authenticated;
-- Never replace or reconfigure a pre-existing bucket silently.
do $$begin if exists(select 1 from storage.buckets where id='commerce-media') then raise exception 'commerce-media already exists; inspect its configuration before this migration.'; end if; end$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('commerce-media','commerce-media',true,5242880,array['image/jpeg','image/png','image/webp']);
create policy commerce_media_owner_access on storage.objects for all to authenticated using(bucket_id='commerce-media' and commerce_private.media_access(name)) with check(bucket_id='commerce-media' and commerce_private.media_access(name));
-- Restrictive guards prevent broad pre-existing permissive policies from granting cross-tenant access,
-- but evaluate TRUE for every other bucket, preserving existing storage behavior.
create policy commerce_media_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'commerce-media' or commerce_private.media_access(name));
-- Each upload is an immutable new object. Shared product/branding upload rights
-- must not let one permission overwrite bytes referenced by the other feature.
create policy commerce_media_update_guard on storage.objects as restrictive for update to authenticated using(bucket_id<>'commerce-media') with check(bucket_id<>'commerce-media');
create policy commerce_media_delete_guard on storage.objects as restrictive for delete to authenticated using(bucket_id<>'commerce-media');
create policy commerce_media_anon_insert_guard on storage.objects as restrictive for insert to anon with check(bucket_id<>'commerce-media');
create policy commerce_media_anon_update_guard on storage.objects as restrictive for update to anon using(bucket_id<>'commerce-media') with check(bucket_id<>'commerce-media');
create policy commerce_media_anon_delete_guard on storage.objects as restrictive for delete to anon using(bucket_id<>'commerce-media');

notify pgrst,'reload schema';
commit;
