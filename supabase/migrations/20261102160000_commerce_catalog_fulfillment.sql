-- Optional commerce catalog/fulfillment expansion; hosted installation is review-only.
begin;
create table public.commerce_store_settings (
 website_id uuid primary key references public.commerce_websites(id),template text not null default 'general' check(template in ('general','sarees','grocery','fashion','food')),
 policies jsonb not null default '{}',faq jsonb not null default '[]',sections jsonb not null default '[]',seo jsonb not null default '{}',delivery_zones_enabled boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.commerce_product_profiles (
 website_id uuid not null,product_id uuid not null,variants_required boolean not null default false,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(website_id,product_id),foreign key(website_id,product_id) references public.commerce_products(website_id,id)
);
create table public.commerce_product_images (
 id uuid primary key default gen_random_uuid(),website_id uuid not null,product_id uuid not null,url text not null check(char_length(url)<=2048 and (url ~ '^https://[^[:space:]<>]+$' or url ~ '^http://(127\.0\.0\.1|localhost)(:[0-9]{1,5})?/[^[:space:]<>]*$')),
 alt text not null default '' check(char_length(alt)<=300),sort_order integer not null check(sort_order between 0 and 11),foreign key(website_id,product_id) references public.commerce_products(website_id,id),unique(website_id,id),unique(website_id,product_id,sort_order)
);
create table public.commerce_product_variants (
 id uuid primary key default gen_random_uuid(),website_id uuid not null,product_id uuid not null,sku text not null check(char_length(sku) between 1 and 80),name text not null check(char_length(name) between 1 and 180),options jsonb not null default '{}' check(jsonb_typeof(options)='object'),
 price_paise bigint not null check(price_paise between 0 and 100000000),stock_quantity integer not null default 0 check(stock_quantity between 0 and 1000000000),active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(website_id,product_id) references public.commerce_products(website_id,id),unique(website_id,id),unique(website_id,product_id,id),unique(website_id,sku)
);
create index commerce_variants_catalog on public.commerce_product_variants(website_id,product_id,active);
create table public.commerce_delivery_zones (
 id uuid primary key default gen_random_uuid(),website_id uuid not null references public.commerce_websites(id),name text not null check(char_length(name) between 1 and 120),pincodes text[] not null check(cardinality(pincodes) between 1 and 500),
 delivery_fee_paise bigint not null check(delivery_fee_paise between 0 and 100000000),minimum_order_paise bigint not null default 0 check(minimum_order_paise between 0 and 100000000),active boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(website_id,id)
);
alter table public.commerce_order_items add column variant_id uuid,add column variant_name text,add column sku text,add column option_snapshot jsonb not null default '{}';
alter table public.commerce_order_items add constraint commerce_order_items_variant_tenant_fk foreign key(website_id,product_id,variant_id) references public.commerce_product_variants(website_id,product_id,id);
alter table public.commerce_order_items drop constraint commerce_order_items_order_id_product_id_key;
create unique index commerce_order_items_line on public.commerce_order_items(order_id,product_id,variant_id) nulls not distinct;
alter table public.commerce_orders add column discount_paise bigint not null default 0 check(discount_paise between 0 and 1000000000000),add column coupon_id uuid,add column coupon_code text not null default '',add column delivery_zone_id uuid;
alter table public.commerce_orders drop constraint commerce_orders_check;
alter table public.commerce_orders add constraint commerce_orders_total_check check(discount_paise<=subtotal_paise+delivery_fee_paise and total_paise=subtotal_paise+delivery_fee_paise-discount_paise);
alter table public.commerce_orders add constraint commerce_orders_zone_tenant_fk foreign key(website_id,delivery_zone_id) references public.commerce_delivery_zones(website_id,id);
alter table public.commerce_store_settings enable row level security;
alter table public.commerce_product_profiles enable row level security;
alter table public.commerce_product_images enable row level security;
alter table public.commerce_product_variants enable row level security;
alter table public.commerce_delivery_zones enable row level security;
create policy commerce_store_settings_owner_read on public.commerce_store_settings for select to authenticated using(commerce_private.is_member(website_id));
create policy commerce_product_profiles_owner_read on public.commerce_product_profiles for select to authenticated using(commerce_private.is_member(website_id,'products') or commerce_private.is_member(website_id,'inventory'));
create policy commerce_product_images_owner_read on public.commerce_product_images for select to authenticated using(commerce_private.is_member(website_id,'products'));
create policy commerce_product_variants_owner_read on public.commerce_product_variants for select to authenticated using(commerce_private.is_member(website_id,'products') or commerce_private.is_member(website_id,'inventory'));
create policy commerce_delivery_zones_owner_read on public.commerce_delivery_zones for select to authenticated using(commerce_private.is_member(website_id,'branding'));
revoke all on public.commerce_store_settings,public.commerce_product_profiles,public.commerce_product_images,public.commerce_product_variants,public.commerce_delivery_zones from public,anon,authenticated,service_role;
grant select on public.commerce_store_settings,public.commerce_product_profiles,public.commerce_product_images,public.commerce_product_variants,public.commerce_delivery_zones to authenticated;
grant select on public.commerce_store_settings to service_role;
create function commerce_private.valid_image_url(p_url text) returns boolean language sql immutable set search_path='' as $$
 select char_length(p_url)<=2048 and (p_url='' or p_url ~ '^https://[^[:space:]<>]+$' or p_url ~ '^http://(127\.0\.0\.1|localhost)(:[0-9]{1,5})?/[^[:space:]<>]*$');
$$;
create function commerce_private.validate_store_settings(p_value jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare k text;v jsonb;e jsonb;ids text[]:='{}';t text;
begin
 if p_value is null or jsonb_typeof(p_value)<>'object' or octet_length(p_value::text)>180000 then raise exception 'Invalid store settings.' using errcode='22023';end if;
 for k,v in select * from jsonb_each(p_value) loop
  if k='delivery_zones_enabled' then
   if jsonb_typeof(v)<>'boolean' then raise exception 'Invalid coverage setting.' using errcode='22023';end if;
  elsif k='policies' then
   if jsonb_typeof(v)<>'object' then raise exception 'Invalid policies.' using errcode='22023';end if;
   for t,e in select * from jsonb_each(v) loop
    if t in ('shipping','returns','privacy','terms') then
     if jsonb_typeof(e)<>'string' or char_length(e#>>'{}')>10000 or (e#>>'{}') ~ '<[^>]*>' then raise exception 'Policies require plain text up to 10000 characters.' using errcode='22023';end if;
    elsif t='returns_enabled' then
     if jsonb_typeof(e)<>'boolean' then raise exception 'Invalid returns flag.' using errcode='22023';end if;
    elsif t='return_days' then
     if e::text !~ '^[0-9]{1,3}$' or e::text::integer>365 then raise exception 'Invalid return window.' using errcode='22023';end if;
    else raise exception 'Unknown policy field.' using errcode='22023';end if;
   end loop;
   if v->'returns_enabled'='true'::jsonb and (coalesce(v->>'return_days','') !~ '^[0-9]{1,3}$' or coalesce((v->>'return_days')::integer,0) not between 1 and 365 or coalesce(btrim(v->>'returns'),'')='') then raise exception 'Enabled returns require written terms and 1 to 365 return days.' using errcode='22023';end if;
  elsif k='faq' then
   if jsonb_typeof(v)<>'array' or jsonb_array_length(v)>30 then raise exception 'Invalid FAQ.' using errcode='22023';end if;
   for e in select * from jsonb_array_elements(v) loop
    if jsonb_typeof(e)<>'object' or e-array['question','answer']<>'{}'::jsonb or jsonb_typeof(e->'question') is distinct from 'string' or jsonb_typeof(e->'answer') is distinct from 'string' or char_length(btrim(e->>'question')) not between 1 and 300 or char_length(btrim(e->>'answer')) not between 1 and 3000 then raise exception 'Invalid FAQ entry.' using errcode='22023';end if;
   end loop;
  elsif k='sections' then
   if jsonb_typeof(v)<>'array' or jsonb_array_length(v)>20 then raise exception 'Invalid sections.' using errcode='22023';end if;
   for e in select * from jsonb_array_elements(v) loop
    if jsonb_typeof(e)<>'object' or e-array['id','type','enabled','title','body','image_url','category_id','product_ids']<>'{}'::jsonb or jsonb_typeof(e->'id') is distinct from 'string' or coalesce(e->>'id','') !~ '^[a-zA-Z0-9_-]{1,80}$' or (e->>'id')=any(ids) or coalesce(e->>'type','') not in ('hero','categories','featured_products','banner','text','faq') or jsonb_typeof(e->'enabled') is distinct from 'boolean' then raise exception 'Invalid section identity/type.' using errcode='22023';end if;
    ids:=array_append(ids,e->>'id');
    if (e ? 'title' and (jsonb_typeof(e->'title')<>'string' or char_length(e->>'title')>180)) or (e ? 'body' and (jsonb_typeof(e->'body')<>'string' or char_length(e->>'body')>3000)) or (e ? 'image_url' and (jsonb_typeof(e->'image_url')<>'string' or not commerce_private.valid_image_url(e->>'image_url'))) or (e ? 'category_id' and e->>'category_id' is not null and (e->>'category_id') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') then raise exception 'Invalid section content.' using errcode='22023';end if;
    if e ? 'product_ids' then
     if jsonb_typeof(e->'product_ids')<>'array' or jsonb_array_length(e->'product_ids')>50 or exists(select 1 from jsonb_array_elements(e->'product_ids') x where jsonb_typeof(x)<>'string' or (x#>>'{}') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') then raise exception 'Invalid section products.' using errcode='22023';end if;
    end if;
   end loop;
  elsif k='seo' then
   if jsonb_typeof(v)<>'object' or v-array['title','description','image_url']<>'{}'::jsonb then raise exception 'Invalid SEO settings.' using errcode='22023';end if;
   for t,e in select * from jsonb_each(v) loop
    if jsonb_typeof(e)<>'string' or (t='title' and char_length(e#>>'{}')>180) or (t='description' and char_length(e#>>'{}')>500) or (t='image_url' and not commerce_private.valid_image_url(e#>>'{}')) then raise exception 'Invalid SEO value.' using errcode='22023';end if;
   end loop;
  else raise exception 'Unknown store setting.' using errcode='22023';end if;
 end loop;
 return p_value;
end;$$;
-- UPDATE serializes catalog/config edits against checkout's website SHARE lock.
-- Verified identity and membership are re-read after waiting for that lock.
create function commerce_private.catalog_owner(p_website_id uuid,p_permission text) returns public.commerce_websites language plpgsql security definer set search_path='' as $$
declare w public.commerce_websites;
begin
 select * into w from public.commerce_websites where id=p_website_id for update;
 if not found or w.status not in ('setup','active') then raise exception 'Website permission denied.' using errcode='42501';end if;
 perform 1 from auth.users where id=auth.uid() and email_confirmed_at is not null for share;
 if not found then raise exception 'Verified owner sign-in required.' using errcode='42501';end if;
 perform 1 from public.commerce_memberships where website_id=w.id and user_id=auth.uid() and active and role='owner' for share;
 if not found or w.owner_permissions->p_permission is distinct from 'true'::jsonb then raise exception 'Website permission denied.' using errcode='42501';end if;
 return w;
end;$$;
create function public.commerce_catalog_owner_action(p_website_id uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.commerce_websites;pid uuid;target uuid;result jsonb;before_value jsonb;v jsonb;k text;txt jsonb;idx integer:=0;delta integer;settings_value jsonb;permission text;
begin
 permission:=case when p_action in ('save_product_options','save_variant','archive_variant') then 'products' when p_action='adjust_variant_stock' then 'inventory' when p_action in ('save_delivery_zone','archive_delivery_zone','save_settings') then 'branding' end;
 if permission is null then raise exception 'Unknown catalog action.' using errcode='22023';end if;
 w:=commerce_private.catalog_owner(p_website_id,permission);
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid catalog payload.' using errcode='22023';end if;
 -- JSON text extraction also converts numbers and booleans. Check identifiers
 -- before any UUID cast so direct RPC calls obey the HTTP string contract.
 foreach k in array array['id','product_id','variant_id','zone_id'] loop
  if p_payload ? k and (jsonb_typeof(p_payload->k) is distinct from 'string' or (p_payload->>k) !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') then raise exception 'Invalid catalog identifier.' using errcode='22023';end if;
 end loop;
 if p_action in ('save_product_options','save_variant','archive_variant','adjust_variant_stock') then
  if w.features->'catalog' is distinct from 'true'::jsonb then raise exception 'Catalog management is disabled.' using errcode='42501';end if;
  if p_action in ('archive_variant','adjust_variant_stock') then
   target:=coalesce(p_payload->>'id',p_payload->>'variant_id')::uuid;
   select product_id into pid from public.commerce_product_variants where website_id=w.id and id=target;
  else pid:=(p_payload->>'product_id')::uuid;end if;
  perform 1 from public.commerce_products where website_id=w.id and id=pid for update;
  if not found then raise exception 'Product not found.' using errcode='42501';end if;
 end if;
 if p_action='save_product_options' then
  if p_payload-array['product_id','variants_required','images']<>'{}'::jsonb or jsonb_typeof(p_payload->'variants_required') is distinct from 'boolean' or jsonb_typeof(p_payload->'images') is distinct from 'array' or jsonb_array_length(p_payload->'images')>12 then raise exception 'Invalid product options.' using errcode='22023';end if;
  select to_jsonb(p) into before_value from public.commerce_product_profiles p where website_id=w.id and product_id=pid;
  for v in select * from jsonb_array_elements(p_payload->'images') loop
   if jsonb_typeof(v)<>'object' or v-array['url','alt','sort_order']<>'{}'::jsonb or jsonb_typeof(v->'url') is distinct from 'string' or coalesce(v->>'url','')='' or not commerce_private.valid_image_url(v->>'url') or (v ? 'alt' and (jsonb_typeof(v->'alt')<>'string' or char_length(v->>'alt')>300)) or (v ? 'sort_order' and (v->'sort_order')::text<>idx::text) then raise exception 'Invalid image; sort_order must match array position.' using errcode='22023';end if;
   idx:=idx+1;
  end loop;
  insert into public.commerce_product_profiles(website_id,product_id,variants_required) values(w.id,pid,(p_payload->>'variants_required')::boolean) on conflict(website_id,product_id) do update set variants_required=excluded.variants_required,updated_at=now();
  delete from public.commerce_product_images where website_id=w.id and product_id=pid;
  insert into public.commerce_product_images(website_id,product_id,url,alt,sort_order) select w.id,pid,x.value->>'url',coalesce(x.value->>'alt',''),(x.ordinality-1)::integer from jsonb_array_elements(p_payload->'images') with ordinality x;
  result:=jsonb_build_object('product_id',pid,'variants_required',(p_payload->>'variants_required')::boolean,'images',coalesce((select jsonb_agg(to_jsonb(i) order by sort_order) from public.commerce_product_images i where website_id=w.id and product_id=pid),'[]'));
  target:=pid;
 elsif p_action='save_variant' then
  if p_payload-array['id','product_id','sku','name','options','price_paise','active']<>'{}'::jsonb or jsonb_typeof(p_payload->'sku') is distinct from 'string' or char_length(btrim(p_payload->>'sku')) not between 1 and 80 or jsonb_typeof(p_payload->'name') is distinct from 'string' or char_length(btrim(p_payload->>'name')) not between 1 and 180 or coalesce((p_payload->'price_paise')::text,'') !~ '^[0-9]{1,9}$' or (p_payload->>'price_paise')::bigint>100000000 or (p_payload ? 'active' and jsonb_typeof(p_payload->'active')<>'boolean') then raise exception 'Invalid variant.' using errcode='22023';end if;
  v:=coalesce(p_payload->'options','{}'::jsonb);
  if jsonb_typeof(v)<>'object' or (select count(*) from jsonb_each(v))>8 then raise exception 'Invalid variant options.' using errcode='22023';end if;
  for k,txt in select * from jsonb_each(v) loop
   if char_length(btrim(k)) not between 1 and 40 or jsonb_typeof(txt)<>'string' or char_length(btrim(txt#>>'{}')) not between 1 and 100 then raise exception 'Invalid variant option.' using errcode='22023';end if;
  end loop;
  target:=nullif(p_payload->>'id','')::uuid;
  if target is null then
   insert into public.commerce_product_variants(website_id,product_id,sku,name,options,price_paise,active) values(w.id,pid,btrim(p_payload->>'sku'),btrim(p_payload->>'name'),v,(p_payload->>'price_paise')::bigint,coalesce((p_payload->>'active')::boolean,true)) returning to_jsonb(commerce_product_variants.*) into result;
  else
   select to_jsonb(x) into before_value from public.commerce_product_variants x where website_id=w.id and product_id=pid and id=target for update;
   if not found then raise exception 'Variant not found.' using errcode='42501';end if;
   update public.commerce_product_variants set sku=btrim(p_payload->>'sku'),name=btrim(p_payload->>'name'),options=v,price_paise=(p_payload->>'price_paise')::bigint,active=coalesce((p_payload->>'active')::boolean,true),updated_at=now() where website_id=w.id and id=target returning to_jsonb(commerce_product_variants.*) into result;
  end if;
  target:=(result->>'id')::uuid;
 elsif p_action in ('archive_variant','adjust_variant_stock') then
  select to_jsonb(x) into before_value from public.commerce_product_variants x where website_id=w.id and id=target for update;
  if not found then raise exception 'Variant not found.' using errcode='42501';end if;
  if p_action='archive_variant' then
   if p_payload-array['id','variant_id']<>'{}'::jsonb then raise exception 'Invalid variant payload.' using errcode='22023';end if;
   update public.commerce_product_variants set active=false,updated_at=now() where website_id=w.id and id=target returning to_jsonb(commerce_product_variants.*) into result;
  else
   if p_payload-array['id','variant_id','delta']<>'{}'::jsonb or w.features->'inventory' is distinct from 'true'::jsonb or coalesce((p_payload->'delta')::text,'') !~ '^-?[0-9]{1,7}$' then raise exception 'Invalid stock adjustment.' using errcode='22023';end if;
   delta:=(p_payload->>'delta')::integer;
   if delta=0 or delta not between -1000000 and 1000000 or (before_value->>'stock_quantity')::bigint+delta not between 0 and 1000000000 then raise exception 'Stock adjustment exceeds limits.' using errcode='22023';end if;
   update public.commerce_product_variants set stock_quantity=stock_quantity+delta,updated_at=now() where website_id=w.id and id=target returning to_jsonb(commerce_product_variants.*) into result;
  end if;
 elsif p_action='save_settings' then
  settings_value:=commerce_private.validate_store_settings(p_payload);
  if exists(select 1 from jsonb_array_elements(coalesce(settings_value->'sections','[]')) s where s->>'category_id' is not null and not exists(select 1 from public.commerce_categories c where c.website_id=w.id and c.id=(s->>'category_id')::uuid)) or exists(select 1 from jsonb_array_elements(coalesce(settings_value->'sections','[]')) s cross join lateral jsonb_array_elements_text(coalesce(s->'product_ids','[]')) x where not exists(select 1 from public.commerce_products p where p.website_id=w.id and p.id=x::uuid)) then raise exception 'Section references another website.' using errcode='42501';end if;
  insert into public.commerce_store_settings(website_id) values(w.id) on conflict do nothing;
  select to_jsonb(s) into before_value from public.commerce_store_settings s where website_id=w.id for update;
  update public.commerce_store_settings set policies=coalesce(settings_value->'policies',policies),faq=coalesce(settings_value->'faq',faq),sections=coalesce(settings_value->'sections',sections),seo=coalesce(settings_value->'seo',seo),delivery_zones_enabled=coalesce((settings_value->>'delivery_zones_enabled')::boolean,delivery_zones_enabled),updated_at=now() where website_id=w.id returning to_jsonb(commerce_store_settings.*) into result;
  target:=w.id;
 elsif p_action='save_delivery_zone' then
  if p_payload-array['id','name','pincodes','delivery_fee_paise','minimum_order_paise','active']<>'{}'::jsonb or jsonb_typeof(p_payload->'name') is distinct from 'string' or char_length(btrim(p_payload->>'name')) not between 1 and 120 or jsonb_typeof(p_payload->'pincodes') is distinct from 'array' or jsonb_array_length(p_payload->'pincodes') not between 1 and 500 or exists(select 1 from jsonb_array_elements(p_payload->'pincodes') x where jsonb_typeof(x)<>'string' or (x#>>'{}') !~ '^[0-9]{6}$') or coalesce((p_payload->'delivery_fee_paise')::text,'') !~ '^[0-9]{1,9}$' or (p_payload->>'delivery_fee_paise')::bigint>100000000 or coalesce((p_payload->'minimum_order_paise')::text,'0') !~ '^[0-9]{1,9}$' or coalesce((p_payload->>'minimum_order_paise')::bigint,0)>100000000 or (p_payload ? 'active' and jsonb_typeof(p_payload->'active')<>'boolean') then raise exception 'Invalid delivery zone.' using errcode='22023';end if;
  target:=nullif(p_payload->>'id','')::uuid;
  if exists(select 1 from public.commerce_delivery_zones z where z.website_id=w.id and z.active and z.id is distinct from target and coalesce((p_payload->>'active')::boolean,true) and z.pincodes && array(select jsonb_array_elements_text(p_payload->'pincodes'))) then raise exception 'PIN code already belongs to an active zone.' using errcode='22023';end if;
  if target is null then
   insert into public.commerce_delivery_zones(website_id,name,pincodes,delivery_fee_paise,minimum_order_paise,active) values(w.id,btrim(p_payload->>'name'),array(select distinct jsonb_array_elements_text(p_payload->'pincodes')),(p_payload->>'delivery_fee_paise')::bigint,coalesce((p_payload->>'minimum_order_paise')::bigint,0),coalesce((p_payload->>'active')::boolean,true)) returning to_jsonb(commerce_delivery_zones.*) into result;
  else
   select to_jsonb(z) into before_value from public.commerce_delivery_zones z where website_id=w.id and id=target for update;
   if not found then raise exception 'Delivery zone not found.' using errcode='42501';end if;
   update public.commerce_delivery_zones set name=btrim(p_payload->>'name'),pincodes=array(select distinct jsonb_array_elements_text(p_payload->'pincodes')),delivery_fee_paise=(p_payload->>'delivery_fee_paise')::bigint,minimum_order_paise=coalesce((p_payload->>'minimum_order_paise')::bigint,0),active=coalesce((p_payload->>'active')::boolean,true),updated_at=now() where website_id=w.id and id=target returning to_jsonb(commerce_delivery_zones.*) into result;
  end if;
  target:=(result->>'id')::uuid;
 elsif p_action='archive_delivery_zone' then
  if p_payload-array['id','zone_id']<>'{}'::jsonb then raise exception 'Invalid zone payload.' using errcode='22023';end if;
  target:=coalesce(p_payload->>'id',p_payload->>'zone_id')::uuid;
  select to_jsonb(z) into before_value from public.commerce_delivery_zones z where website_id=w.id and id=target for update;
  if not found then raise exception 'Delivery zone not found.' using errcode='42501';end if;
  update public.commerce_delivery_zones set active=false,updated_at=now() where website_id=w.id and id=target returning to_jsonb(commerce_delivery_zones.*) into result;
 end if;
 perform commerce_private.audit(w.id,p_action,target,before_value,result);
 return result;
end;$$;

create function commerce_private.catalog_settings(p_website_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select to_jsonb(s) from public.commerce_store_settings s where website_id=p_website_id),jsonb_build_object('website_id',p_website_id,'template','general','policies','{}'::jsonb,'faq','[]'::jsonb,'sections','[]'::jsonb,'seo','{}'::jsonb,'delivery_zones_enabled',false));
$$;
create function public.commerce_catalog_admin_action(p_website_id uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.commerce_websites;result jsonb;
begin
 select * into w from public.commerce_websites where id=p_website_id for update;
 if not found then raise exception 'Website not found.' using errcode='22023';end if;
 if p_action in ('get','get_settings') then return commerce_private.catalog_settings(w.id);end if;
 if p_action='get_workspace' then
  return jsonb_build_object('settings',commerce_private.catalog_settings(w.id),
   'product_profiles',coalesce((select jsonb_agg(to_jsonb(p)) from public.commerce_product_profiles p where website_id=w.id),'[]'),
   'images',coalesce((select jsonb_agg(to_jsonb(i) order by product_id,sort_order) from public.commerce_product_images i where website_id=w.id),'[]'),
   'variants',coalesce((select jsonb_agg(to_jsonb(v) order by product_id,name) from public.commerce_product_variants v where website_id=w.id),'[]'),
   'delivery_zones',coalesce((select jsonb_agg(to_jsonb(z) order by name) from public.commerce_delivery_zones z where website_id=w.id),'[]'));
 end if;
 if p_action is distinct from 'save_template' or p_payload is null or jsonb_typeof(p_payload)<>'object' or p_payload-array['template']<>'{}'::jsonb or coalesce(p_payload->>'template','') not in ('general','sarees','grocery','fashion','food') then raise exception 'Invalid template assignment.' using errcode='22023';end if;
 insert into public.commerce_store_settings(website_id,template) values(w.id,p_payload->>'template') on conflict(website_id) do update set template=excluded.template,updated_at=now() returning to_jsonb(commerce_store_settings.*) into result;
 perform commerce_private.audit(w.id,'save_template',w.id,null,result);
 return result;
end;$$;
create function public.commerce_catalog_workspace(p_website_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not commerce_private.is_member(p_website_id) or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Website permission denied.' using errcode='42501';end if;
 return jsonb_build_object('settings',commerce_private.catalog_settings(p_website_id),
 'product_profiles',case when commerce_private.is_member(p_website_id,'products') or commerce_private.is_member(p_website_id,'inventory') then coalesce((select jsonb_agg(to_jsonb(p)) from public.commerce_product_profiles p where website_id=p_website_id),'[]') else '[]'::jsonb end,
 'images',case when commerce_private.is_member(p_website_id,'products') then coalesce((select jsonb_agg(to_jsonb(i) order by product_id,sort_order) from public.commerce_product_images i where website_id=p_website_id),'[]') else '[]'::jsonb end,
 'variants',case when commerce_private.is_member(p_website_id,'products') or commerce_private.is_member(p_website_id,'inventory') then coalesce((select jsonb_agg(to_jsonb(v) order by product_id,name) from public.commerce_product_variants v where website_id=p_website_id),'[]') else '[]'::jsonb end,
 'delivery_zones',case when commerce_private.is_member(p_website_id,'branding') then coalesce((select jsonb_agg(to_jsonb(z) order by name) from public.commerce_delivery_zones z where website_id=p_website_id),'[]') else '[]'::jsonb end);
end;$$;
create function public.commerce_public_catalog_v2(p_slug text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;wid uuid;s jsonb;
begin
 result:=public.commerce_public_catalog(p_slug);if result is null then return null;end if;wid:=(result->'website'->>'id')::uuid;
 s:=commerce_private.catalog_settings(wid)-array['website_id','created_at','updated_at'];
 result:=jsonb_set(result,'{website,settings}',s);result:=jsonb_set(result,'{website,template}',s->'template');
 result:=jsonb_set(result,'{products}',coalesce((select jsonb_agg(p||jsonb_build_object('variants_required',coalesce((select variants_required from public.commerce_product_profiles x where x.website_id=wid and x.product_id=(p->>'id')::uuid),false),'images',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'url',i.url,'alt',i.alt,'sort_order',i.sort_order) order by sort_order) from public.commerce_product_images i where website_id=wid and product_id=(p->>'id')::uuid),'[]'::jsonb),'variants',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'product_id',v.product_id,'sku',v.sku,'name',v.name,'options',v.options,'price_paise',v.price_paise,'stock_quantity',v.stock_quantity,'active',v.active) order by name,id) from public.commerce_product_variants v where website_id=wid and product_id=(p->>'id')::uuid and active),'[]'::jsonb))) from jsonb_array_elements(result->'products') p),'[]'::jsonb));
 return result||jsonb_build_object('delivery_zones',coalesce((select jsonb_agg(jsonb_build_object('id',z.id,'name',z.name,'pincodes',z.pincodes,'delivery_fee_paise',z.delivery_fee_paise,'minimum_order_paise',z.minimum_order_paise) order by z.name) from public.commerce_delivery_zones z where website_id=wid and active and s->'delivery_zones_enabled'='true'::jsonb),'[]'::jsonb));
end;$$;
-- Normalize independently of catalog state so historical retries remain valid
-- after price changes, stock exhaustion or product archival.
create function commerce_private.checkout_request(p_website_id uuid,p_items jsonb,p_customer jsonb,p_fulfillment text,p_coupon_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare normalized jsonb;c jsonb;request_value jsonb;code text:=upper(btrim(coalesce(p_coupon_code,'')));saved_id uuid;
begin
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 50 or p_customer is null or jsonb_typeof(p_customer)<>'object' or p_fulfillment is null or p_fulfillment not in ('pickup','delivery') or char_length(code)>80 then raise exception 'Invalid checkout.' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p_items) i where jsonb_typeof(i)<>'object' or i-array['product_id','variant_id','quantity']<>'{}'::jsonb or jsonb_typeof(i->'product_id') is distinct from 'string' or coalesce(i->>'product_id','') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' or (i ? 'variant_id' and (jsonb_typeof(i->'variant_id') is distinct from 'string' or i->>'variant_id' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')) or jsonb_typeof(i->'quantity') is distinct from 'number' or coalesce(i->>'quantity','') !~ '^[0-9]{1,4}$' or (i->>'quantity')::integer not between 1 and 999) then raise exception 'Invalid cart item.' using errcode='22023';end if;
 select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('product_id',pid,'variant_id',vid,'quantity',qty)) order by pid,vid nulls first) into normalized from (select (i->>'product_id')::uuid pid,(i->>'variant_id')::uuid vid,sum((i->>'quantity')::integer)::integer qty from jsonb_array_elements(p_items)i group by 1,2) x;
 if exists(select 1 from jsonb_array_elements(normalized) i where (i->>'quantity')::integer>999) then raise exception 'Item quantity limit exceeded.' using errcode='22023';end if;
 c:=p_customer;
 if p_customer-array['name','phone','address','pincode','saved_address_id']<>'{}'::jsonb then raise exception 'Invalid customer fields.' using errcode='22023';end if;
 if jsonb_typeof(p_customer->'name') is distinct from 'string' or jsonb_typeof(p_customer->'phone') is distinct from 'string' or exists(select 1 from jsonb_each(p_customer) x where x.key in ('address','pincode') and jsonb_typeof(x.value)<>'string') or (p_customer ? 'address' and char_length(btrim(p_customer->>'address'))>1000) or (p_customer ? 'pincode' and p_customer->>'pincode'<>'' and p_customer->>'pincode' !~ '^[0-9]{6}$') then raise exception 'Invalid submitted customer details.' using errcode='22023';end if;
 if p_customer ? 'saved_address_id' then
  if jsonb_typeof(p_customer->'saved_address_id') is distinct from 'string' or coalesce(p_customer->>'saved_address_id','') !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then raise exception 'Invalid saved address.' using errcode='22023';end if;
  saved_id:=(p_customer->>'saved_address_id')::uuid;
  if to_regprocedure('commerce_private.saved_address(uuid,uuid,uuid)') is null then raise exception 'Saved addresses are unavailable.' using errcode='22023';end if;
  execute 'select commerce_private.saved_address($1,$2,$3)' into c using p_website_id,auth.uid(),saved_id;
  if p_customer ? 'name' then c:=jsonb_set(c,'{name}',p_customer->'name');end if;
  if p_customer ? 'phone' then c:=jsonb_set(c,'{phone}',p_customer->'phone');end if;
 end if;
 if jsonb_typeof(c->'name') is distinct from 'string' or char_length(btrim(c->>'name')) not between 2 and 180 or jsonb_typeof(c->'phone') is distinct from 'string' or char_length(btrim(c->>'phone')) not between 7 and 30 or coalesce(btrim(c->>'phone'),'') !~ '^\+?[0-9][0-9 ()-]+$' or (c ? 'address' and jsonb_typeof(c->'address')<>'string') or char_length(btrim(coalesce(c->>'address','')))>1000 or (p_fulfillment='delivery' and char_length(btrim(coalesce(c->>'address','')))<5) or (c ? 'pincode' and (jsonb_typeof(c->'pincode')<>'string' or (c->>'pincode'<>'' and c->>'pincode' !~ '^[0-9]{6}$'))) then raise exception 'Invalid customer details.' using errcode='22023';end if;
 c:=jsonb_build_object('name',btrim(c->>'name'),'phone',btrim(c->>'phone'),'address',btrim(coalesce(c->>'address','')))||case when coalesce(c->>'pincode','')<>'' then jsonb_build_object('pincode',c->>'pincode') else '{}'::jsonb end;
 if saved_id is not null then c:=c||jsonb_build_object('saved_address_id',saved_id);end if;
 request_value:=jsonb_build_object('items',normalized,'customer',c,'fulfillment',p_fulfillment);
 if code<>'' then request_value:=request_value||jsonb_build_object('coupon_code',code);end if;
 return request_value;
end;$$;

create function commerce_private.price_checkout(p_website_id uuid,p_request jsonb,p_lock boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.commerce_websites;z public.commerce_delivery_zones;r record;lines jsonb:='[]';line jsonb;subtotal bigint:=0;fee bigint:=0;minimum bigint:=0;discount bigint:=0;coupon jsonb:='{"coupon_id":null,"discount_paise":0,"code":""}';tracked boolean;qty integer;price bigint;required_variant boolean;
begin
 select * into w from public.commerce_websites where id=p_website_id;
 if not found or w.status<>'active' or w.business_type='pharmacy' or w.features->'catalog' is distinct from 'true'::jsonb or w.features->'cod' is distinct from 'true'::jsonb then raise exception 'This website cannot accept COD orders.' using errcode='42501';end if;
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
  execute 'select commerce_private.quote_coupon($1,$2,$3,$4,$5,$6)' into coupon using w.id,auth.uid(),p_request->>'coupon_code',subtotal,fee,p_lock;
  if coupon is null or coalesce(coupon->>'discount_paise','') !~ '^[0-9]{1,13}$' then raise exception 'Invalid coupon calculation.' using errcode='22023';end if;
  discount:=(coupon->>'discount_paise')::bigint;
 end if;
 if discount>subtotal+fee or subtotal+fee-discount>1000000000000 then raise exception 'Checkout total exceeds limits.' using errcode='22023';end if;
 return jsonb_build_object('items',lines,'subtotal_paise',subtotal,'delivery_fee_paise',fee,'discount_paise',discount,'total_paise',subtotal+fee-discount,'minimum_order_paise',minimum,'delivery_zone',case when z.id is null then null else jsonb_build_object('id',z.id,'name',z.name) end,'coupon',coupon,'inventory_tracked',tracked);
end;$$;
create function public.commerce_checkout_quote_v2(p_website_id uuid,p_items jsonb,p_customer jsonb,p_fulfillment text,p_coupon_code text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare request_value jsonb;quote jsonb;
begin
 if auth.uid() is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Verified customer sign-in required.' using errcode='42501';end if;
 request_value:=commerce_private.checkout_request(p_website_id,p_items,p_customer,p_fulfillment,p_coupon_code);
 quote:=commerce_private.price_checkout(p_website_id,request_value,false);
 return quote-array['inventory_tracked','coupon'];
end;$$;
create function public.commerce_create_cod_order_v2(p_website_id uuid,p_items jsonb,p_customer jsonb,p_fulfillment text,p_idempotency_key uuid,p_coupon_code text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare buyer uuid:=auth.uid();request_value jsonb;quote jsonb;ord public.commerce_orders;w public.commerce_websites;coupon uuid;replay_customer jsonb;online_attempt boolean;
begin
 if buyer is null or not exists(select 1 from auth.users where id=buyer and email_confirmed_at is not null) then raise exception 'Verified customer sign-in required.' using errcode='42501';end if;
 if p_idempotency_key is null then raise exception 'Invalid checkout.' using errcode='22023';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_website_id::text||buyer::text||p_idempotency_key::text,0));
 select * into w from public.commerce_websites where id=p_website_id for share;
 if not found then raise exception 'This website cannot accept COD orders.' using errcode='42501';end if;
 perform 1 from auth.users where id=buyer and email_confirmed_at is not null for share;
 if not found then raise exception 'Verified customer sign-in required.' using errcode='42501';end if;
 select * into ord from public.commerce_orders where website_id=p_website_id and customer_user_id=buyer and idempotency_key=p_idempotency_key;
 if found then
  -- A retry refers to the first immutable shipping snapshot, even if the buyer
  -- later edits or deletes that saved address. Preserve input validation and
  -- compare the saved-address identity plus all other checkout instructions.
  if ord.customer_details->>'saved_address_id' is not null and p_customer->'saved_address_id'=ord.customer_details->'saved_address_id' then
   if (p_customer ? 'address' and (jsonb_typeof(p_customer->'address')<>'string' or char_length(btrim(p_customer->>'address'))>1000)) or (p_customer ? 'pincode' and (jsonb_typeof(p_customer->'pincode')<>'string' or (p_customer->>'pincode'<>'' and p_customer->>'pincode' !~ '^[0-9]{6}$'))) then raise exception 'Invalid submitted customer details.' using errcode='22023';end if;
   replay_customer:=(p_customer-array['saved_address_id','address','pincode'])||jsonb_build_object('address',ord.customer_details->'address');
   if ord.customer_details ? 'pincode' then replay_customer:=replay_customer||jsonb_build_object('pincode',ord.customer_details->'pincode');end if;
   request_value:=commerce_private.checkout_request(p_website_id,p_items,replay_customer,p_fulfillment,p_coupon_code);
   request_value:=jsonb_set(request_value,'{customer,saved_address_id}',ord.customer_details->'saved_address_id');
  else request_value:=commerce_private.checkout_request(p_website_id,p_items,p_customer,p_fulfillment,p_coupon_code);end if;
  if ord.request_payload<>request_value then raise exception 'Idempotency key was used for a different checkout.' using errcode='22023';end if;
  return jsonb_build_object('order',to_jsonb(ord)-'request_payload','items',coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.commerce_order_items i where website_id=ord.website_id and order_id=ord.id),'[]'::jsonb));
 end if;
 -- Both payment methods share the cart advisory lock. An established online
 -- attempt must be recovered, never followed by a second COD checkout for the
 -- same key. Optional payment support is absent before its reviewed migration.
 if to_regclass('commerce_private.payment_intents') is not null then
  execute 'select exists(select 1 from commerce_private.payment_intents where website_id=$1 and buyer_id=$2 and cart_key=$3)' into online_attempt using w.id,buyer,p_idempotency_key;
  if online_attempt then raise exception 'Cart already has an online payment attempt.' using errcode='23505';end if;
 end if;
 request_value:=commerce_private.checkout_request(p_website_id,p_items,p_customer,p_fulfillment,p_coupon_code);
 quote:=commerce_private.price_checkout(w.id,request_value,true);coupon:=(quote->'coupon'->>'coupon_id')::uuid;
 insert into public.commerce_customers(website_id,user_id,name,phone,address) values(w.id,buyer,request_value->'customer'->>'name',request_value->'customer'->>'phone',request_value->'customer'->>'address') on conflict(website_id,user_id) do update set name=excluded.name,phone=excluded.phone,address=excluded.address,updated_at=now();
 insert into public.commerce_orders(website_id,customer_user_id,idempotency_key,request_payload,customer_details,fulfillment_method,subtotal_paise,delivery_fee_paise,total_paise,inventory_tracked,discount_paise,coupon_id,coupon_code,delivery_zone_id)
 values(w.id,buyer,p_idempotency_key,request_value,request_value->'customer',p_fulfillment,(quote->>'subtotal_paise')::bigint,(quote->>'delivery_fee_paise')::bigint,(quote->>'total_paise')::bigint,(quote->>'inventory_tracked')::boolean,(quote->>'discount_paise')::bigint,coupon,coalesce(quote->'coupon'->>'code',''),(quote->'delivery_zone'->>'id')::uuid) returning * into ord;
 insert into public.commerce_order_items(website_id,order_id,product_id,product_name,variant_id,variant_name,sku,option_snapshot,quantity,unit_price_paise,line_total_paise)
 select w.id,ord.id,(i->>'product_id')::uuid,i->>'product_name',(i->>'variant_id')::uuid,i->>'variant_name',i->>'sku',i->'option_snapshot',(i->>'quantity')::integer,(i->>'unit_price_paise')::bigint,(i->>'line_total_paise')::bigint from jsonb_array_elements(quote->'items') i;
 if ord.inventory_tracked then
  update public.commerce_products p set stock_quantity=p.stock_quantity-(i->>'quantity')::integer,updated_at=now() from jsonb_array_elements(request_value->'items')i where p.website_id=w.id and p.id=(i->>'product_id')::uuid and i->>'variant_id' is null;
  update public.commerce_product_variants v set stock_quantity=v.stock_quantity-(i->>'quantity')::integer,updated_at=now() from jsonb_array_elements(request_value->'items')i where v.website_id=w.id and v.id=(i->>'variant_id')::uuid;
 end if;
 if coupon is not null then
  if to_regclass('public.commerce_coupon_redemptions') is null then raise exception 'Coupon recording is unavailable.' using errcode='22023';end if;
  execute 'insert into public.commerce_coupon_redemptions(website_id,coupon_id,order_id,user_id,discount_paise) values($1,$2,$3,$4,$5)' using w.id,coupon,ord.id,buyer,ord.discount_paise;
 end if;
 return jsonb_build_object('order',to_jsonb(ord)-'request_payload','items',(select jsonb_agg(to_jsonb(i) order by i.id) from public.commerce_order_items i where website_id=w.id and order_id=ord.id));
end;$$;
-- Original implementations are retained privately for inspection/compatibility.
-- The old public checkout name must enforce variants and delivery coverage too.
alter function public.commerce_create_cod_order(uuid,jsonb,jsonb,text,uuid) set schema commerce_private;
alter function commerce_private.commerce_create_cod_order(uuid,jsonb,jsonb,text,uuid) rename to legacy_create_cod_order;
alter function public.commerce_owner_action(uuid,text,jsonb) set schema commerce_private;
alter function commerce_private.commerce_owner_action(uuid,text,jsonb) rename to legacy_owner_action;
create function public.commerce_create_cod_order(p_website_id uuid,p_items jsonb,p_customer jsonb,p_fulfillment text,p_idempotency_key uuid) returns jsonb language sql security definer set search_path='' as $$
 select public.commerce_create_cod_order_v2(p_website_id,p_items,p_customer,p_fulfillment,p_idempotency_key,'');
$$;
create function commerce_private.release_order_inventory(p_website_id uuid,p_order_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare ord public.commerce_orders;
begin
 select * into ord from public.commerce_orders where website_id=p_website_id and id=p_order_id for update;
 if not found then raise exception 'Order not found.' using errcode='42501';end if;
 if ord.inventory_released_at is not null then return;end if;
 if ord.inventory_tracked then
  -- Same product-then-variant lock order as checkout. Archived records remain
  -- present under immutable tenant FKs, so their stock can still be restored.
  perform 1 from public.commerce_products p where p.website_id=p_website_id and p.id in (select product_id from public.commerce_order_items where website_id=p_website_id and order_id=p_order_id) order by p.id for update;
  perform 1 from public.commerce_product_variants v where v.website_id=p_website_id and v.id in (select variant_id from public.commerce_order_items where website_id=p_website_id and order_id=p_order_id and variant_id is not null) order by v.id for update;
  if exists(select 1 from public.commerce_products p join (select product_id,sum(quantity)::bigint qty from public.commerce_order_items where website_id=p_website_id and order_id=p_order_id and variant_id is null group by product_id) i on i.product_id=p.id where p.website_id=p_website_id and p.stock_quantity::bigint+i.qty>1000000000) or exists(select 1 from public.commerce_product_variants v join (select variant_id,sum(quantity)::bigint qty from public.commerce_order_items where website_id=p_website_id and order_id=p_order_id and variant_id is not null group by variant_id) i on i.variant_id=v.id where v.website_id=p_website_id and v.stock_quantity::bigint+i.qty>1000000000) then raise exception 'Restock would exceed stock capacity; adjust inventory first.' using errcode='22023';end if;
  update public.commerce_products p set stock_quantity=p.stock_quantity+i.qty,updated_at=now() from (select product_id,sum(quantity)::integer qty from public.commerce_order_items where website_id=p_website_id and order_id=p_order_id and variant_id is null group by product_id)i where p.website_id=p_website_id and p.id=i.product_id;
  update public.commerce_product_variants v set stock_quantity=v.stock_quantity+i.qty,updated_at=now() from (select variant_id,sum(quantity)::integer qty from public.commerce_order_items where website_id=p_website_id and order_id=p_order_id and variant_id is not null group by variant_id)i where v.website_id=p_website_id and v.id=i.variant_id;
 end if;
 update public.commerce_orders set inventory_released_at=now(),updated_at=now() where website_id=p_website_id and id=p_order_id;
end;$$;
create function public.commerce_owner_action(p_website_id uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.commerce_websites;ord public.commerce_orders;desired text;result jsonb;permission text;
begin
 permission:=case when p_action in ('save_product','archive_product') then 'products' when p_action in ('save_category','archive_category') then 'categories' when p_action='adjust_stock' then 'inventory' when p_action='update_branding' then 'branding' when p_action='update_order_status' then 'orders' end;
 if permission is null then raise exception 'Unknown owner action.' using errcode='22023';end if;
 w:=commerce_private.catalog_owner(p_website_id,permission);
 if p_action<>'update_order_status' then return commerce_private.legacy_owner_action(p_website_id,p_action,p_payload);end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid action payload.' using errcode='22023';end if;
 desired:=p_payload->>'status';
 select * into ord from public.commerce_orders where website_id=w.id and id=(p_payload->>'order_id')::uuid for update;
 if not found then raise exception 'Order not found.' using errcode='42501';end if;
 if desired=ord.status then return to_jsonb(ord);end if;
 if desired is null or not ((ord.status='placed' and desired in ('confirmed','cancelled')) or (ord.status='confirmed' and desired in ('preparing','cancelled')) or (ord.status='preparing' and desired in ('ready','cancelled')) or (ord.status='ready' and desired in ('completed','cancelled'))) then raise exception 'Invalid order status transition.' using errcode='22023';end if;
 if desired='cancelled' then perform commerce_private.release_order_inventory(w.id,ord.id);end if;
 update public.commerce_orders set status=desired,updated_at=now() where website_id=w.id and id=ord.id returning to_jsonb(commerce_orders.*) into result;
 perform commerce_private.audit(w.id,p_action,ord.id,to_jsonb(ord),result);
 return result;
end;$$;

-- Explicitly clear all inherited default grants, including direct role ACLs.
revoke all on function commerce_private.valid_image_url(text),commerce_private.validate_store_settings(jsonb),commerce_private.catalog_owner(uuid,text),commerce_private.catalog_settings(uuid),commerce_private.checkout_request(uuid,jsonb,jsonb,text,text),commerce_private.price_checkout(uuid,jsonb,boolean),commerce_private.release_order_inventory(uuid,uuid),commerce_private.legacy_create_cod_order(uuid,jsonb,jsonb,text,uuid),commerce_private.legacy_owner_action(uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.commerce_catalog_owner_action(uuid,text,jsonb),public.commerce_catalog_workspace(uuid),public.commerce_catalog_admin_action(uuid,text,jsonb),public.commerce_public_catalog_v2(text),public.commerce_checkout_quote_v2(uuid,jsonb,jsonb,text,text),public.commerce_create_cod_order_v2(uuid,jsonb,jsonb,text,uuid,text),public.commerce_create_cod_order(uuid,jsonb,jsonb,text,uuid),public.commerce_owner_action(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.commerce_catalog_owner_action(uuid,text,jsonb),public.commerce_catalog_workspace(uuid),public.commerce_checkout_quote_v2(uuid,jsonb,jsonb,text,text),public.commerce_create_cod_order_v2(uuid,jsonb,jsonb,text,uuid,text),public.commerce_create_cod_order(uuid,jsonb,jsonb,text,uuid),public.commerce_owner_action(uuid,text,jsonb) to authenticated;
grant execute on function public.commerce_catalog_admin_action(uuid,text,jsonb) to service_role;
grant execute on function public.commerce_public_catalog_v2(text) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
