-- Optional verified commerce host claims. Review-only for hosted targets.
-- This adds no DNS, provider, certificate, cron or legacy-table mutation.
begin;

create function commerce_private.valid_domain_hostname(p_hostname text)
returns boolean language sql immutable set search_path='' as $$
  select coalesce(
    char_length(p_hostname) between 4 and 253
    and p_hostname=lower(p_hostname)
    and p_hostname ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    -- An alphabetic TLD excludes all IPv4 spellings; IPv6/ports/URLs fail above.
    and split_part(p_hostname,'.',array_length(string_to_array(p_hostname,'.'),1)) ~ '^[a-z][a-z0-9-]*[a-z0-9]$'
    and p_hostname !~ '(^|\.)(localhost|local|internal|lan|home|test|example|invalid|onion|arpa)$'
    and p_hostname !~ '(^|\.)vercel\.app$'
    and p_hostname !~ '(^|\.)digitaldine-in\.(online|store)$'
    and split_part(p_hostname,'.',1) not in ('admin','api','auth','login','signup','owner','workspace','dashboard','www-admin','system','mail','smtp','ftp','ns1','ns2','metadata','vercel','local','internal')
  ,false);
$$;
revoke all on function commerce_private.valid_domain_hostname(text) from public,anon,authenticated,service_role;

create table public.commerce_domains (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references public.commerce_websites(id),
  hostname text not null check(commerce_private.valid_domain_hostname(hostname)),
  claimed_by uuid not null references auth.users(id),
  ownership_verified boolean not null default false,
  -- Never cleared by rechecks/releases: a previously verified tenant claim
  -- requires a separately reviewed transfer before another tenant may claim it.
  ownership_verified_at timestamptz,
  deployment_verified boolean not null default false,
  tls_verified boolean not null default false,
  provider_project_id text check(provider_project_id is null or char_length(provider_project_id) between 1 and 200),
  -- Official provider DNS instructions are private to authorized owners/Admin.
  verification jsonb not null default '[]' check(jsonb_typeof(verification)='array' and octet_length(verification::text)<=16000),
  verification_checked_at timestamptz,
  verified_at timestamptz,
  active boolean not null default false,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(website_id,id),
  check(not ownership_verified or ownership_verified_at is not null),
  check(not active or (ownership_verified and deployment_verified and tls_verified and verified_at is not null and provider_project_id is not null and released_at is null)),
  check(verified_at is null or (ownership_verified and deployment_verified and tls_verified and verification_checked_at is not null))
);
-- Released rows retain evidence. A later claim receives fresh, unverified state.
create unique index commerce_domains_live_hostname on public.commerce_domains(hostname) where released_at is null;
create index commerce_domains_website on public.commerce_domains(website_id,created_at desc);
create index commerce_domains_public_lookup on public.commerce_domains(hostname) where active and released_at is null;
create index commerce_domains_verified_history on public.commerce_domains(hostname) where ownership_verified_at is not null;

create function commerce_private.domain_owner_access(p_website_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select commerce_private.is_member(p_website_id,'branding')
    and exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null);
$$;
revoke all on function commerce_private.domain_owner_access(uuid) from public,anon,authenticated,service_role;
grant execute on function commerce_private.domain_owner_access(uuid) to authenticated;

alter table public.commerce_domains enable row level security;
create policy commerce_domains_owner_read on public.commerce_domains for select to authenticated
  using(commerce_private.domain_owner_access(website_id));
-- Mutations go through locked RPCs, including service-role mutations.
revoke all on public.commerce_domains from public,anon,authenticated,service_role;
grant select on public.commerce_domains to authenticated;

create function public.commerce_domain_workspace(p_website_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.commerce_websites where id=p_website_id for share;
  if not found or not commerce_private.domain_owner_access(p_website_id) then
    raise exception 'Website permission denied.' using errcode='42501';
  end if;
  return jsonb_build_object('domains',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc,d.id) from public.commerce_domains d where d.website_id=p_website_id),'[]'::jsonb));
end;
$$;
revoke all on function public.commerce_domain_workspace(uuid) from public,anon,authenticated,service_role;
grant execute on function public.commerce_domain_workspace(uuid) to authenticated;

create function public.commerce_domain_owner_action(p_website_id uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.commerce_websites; d public.commerce_domains; before_value jsonb;
begin
  select * into w from public.commerce_websites where id=p_website_id for update;
  -- Recheck current verified identity, permission and membership after the lock.
  if not found or not commerce_private.domain_owner_access(p_website_id) then raise exception 'Website permission denied.' using errcode='42501'; end if;
  if w.status not in ('setup','active') then raise exception 'This website is read-only.' using errcode='42501'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Invalid domain payload.' using errcode='22023'; end if;
  if p_action='claim' then
    if p_payload-array['hostname']<>'{}'::jsonb or jsonb_typeof(p_payload->'hostname') is distinct from 'string' or not commerce_private.valid_domain_hostname(p_payload->>'hostname') then raise exception 'Invalid or reserved hostname.' using errcode='22023'; end if;
    if exists(select 1 from public.commerce_domains where hostname=p_payload->>'hostname' and website_id<>w.id and ownership_verified_at is not null) then raise exception 'Hostname is protected by a verified tenant claim.' using errcode='23505'; end if;
    select * into d from public.commerce_domains where hostname=p_payload->>'hostname' and released_at is null for update;
    if found then
      if d.website_id<>w.id then raise exception 'Hostname is already claimed.' using errcode='23505'; end if;
      return to_jsonb(d);
    end if;
    if (select count(*) from public.commerce_domains where website_id=w.id and released_at is null)>=20 then raise exception 'Domain claim limit reached.' using errcode='22023'; end if;
    begin
      insert into public.commerce_domains(website_id,hostname,claimed_by) values(w.id,p_payload->>'hostname',auth.uid()) returning * into d;
    exception when unique_violation then raise exception 'Hostname is already claimed.' using errcode='23505'; end;
  elsif p_action='remove' then
    if p_payload-array['id']<>'{}'::jsonb or jsonb_typeof(p_payload->'id') is distinct from 'string' then raise exception 'Invalid domain payload.' using errcode='22023'; end if;
    select * into d from public.commerce_domains where website_id=w.id and id=(p_payload->>'id')::uuid for update;
    if not found then raise exception 'Domain not found.' using errcode='42501'; end if;
    before_value:=jsonb_build_object('hostname',d.hostname,'active',d.active,'ownership_verified',d.ownership_verified,'deployment_verified',d.deployment_verified,'tls_verified',d.tls_verified,'released_at',d.released_at);
    update public.commerce_domains set active=false,released_at=coalesce(released_at,clock_timestamp()),updated_at=clock_timestamp() where website_id=w.id and id=d.id returning * into d;
  else raise exception 'Unknown domain action.' using errcode='22023'; end if;
  perform commerce_private.audit(w.id,'domain_'||p_action,d.id,before_value,jsonb_build_object('hostname',d.hostname,'active',d.active,'ownership_verified',d.ownership_verified,'deployment_verified',d.deployment_verified,'tls_verified',d.tls_verified,'released_at',d.released_at));
  return to_jsonb(d);
end;
$$;
revoke all on function public.commerce_domain_owner_action(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.commerce_domain_owner_action(uuid,text,jsonb) to authenticated;

create function public.commerce_domain_admin_action(p_website_id uuid,p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.commerce_websites; d public.commerce_domains; instruction jsonb; before_value jsonb; complete boolean;
begin
  -- SECURITY DEFINER changes current_user. The PostgreSQL role setting retains
  -- the actual invoker role and cannot be changed to service_role by a caller
  -- lacking SET ROLE privilege. A forged JWT role claim is insufficient.
  if not (current_setting('role',true)='service_role' or (coalesce(current_setting('role',true),'none')='none' and session_user='service_role')) then raise exception 'Service role required.' using errcode='42501'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Invalid domain payload.' using errcode='22023'; end if;
  if p_action='status' then
    if p_payload<>'{}'::jsonb then raise exception 'Invalid domain payload.' using errcode='22023'; end if;
    return jsonb_build_object('domains',coalesce((select jsonb_agg(to_jsonb(dom) order by dom.created_at desc,dom.id) from public.commerce_domains dom where p_website_id is null or dom.website_id=p_website_id),'[]'::jsonb));
  end if;
  select * into w from public.commerce_websites where id=p_website_id for update;
  if not found then raise exception 'Website not found.' using errcode='22023'; end if;
  if jsonb_typeof(p_payload->'id') is distinct from 'string' then raise exception 'Domain ID required.' using errcode='22023'; end if;
  select * into d from public.commerce_domains where website_id=w.id and id=(p_payload->>'id')::uuid for update;
  if not found or d.released_at is not null then raise exception 'Domain claim not found.' using errcode='22023'; end if;
  before_value:=jsonb_build_object('hostname',d.hostname,'active',d.active,'ownership_verified',d.ownership_verified,'deployment_verified',d.deployment_verified,'tls_verified',d.tls_verified,'released_at',d.released_at);
  if p_action='record_verification' then
    if p_payload-array['id','ownership_verified','deployment_verified','tls_verified','verification','provider_project_id']<>'{}'::jsonb
      or jsonb_typeof(p_payload->'ownership_verified') is distinct from 'boolean'
      or jsonb_typeof(p_payload->'deployment_verified') is distinct from 'boolean'
      or jsonb_typeof(p_payload->'tls_verified') is distinct from 'boolean'
      or jsonb_typeof(p_payload->'provider_project_id') is distinct from 'string'
      or char_length(p_payload->>'provider_project_id') not between 1 and 200
      or jsonb_typeof(p_payload->'verification') is distinct from 'array'
      or octet_length((p_payload->'verification')::text)>16000
      or jsonb_array_length(p_payload->'verification')>20 then raise exception 'Invalid domain verification.' using errcode='22023'; end if;
    for instruction in select value from jsonb_array_elements(p_payload->'verification') loop
      if jsonb_typeof(instruction) is distinct from 'object' or instruction-array['type','domain','value']<>'{}'::jsonb
        or jsonb_typeof(instruction->'type') is distinct from 'string' or char_length(instruction->>'type') not between 1 and 20
        or jsonb_typeof(instruction->'domain') is distinct from 'string' or char_length(instruction->>'domain') not between 1 and 253
        or jsonb_typeof(instruction->'value') is distinct from 'string' or char_length(instruction->>'value') not between 1 and 2048 then raise exception 'Invalid verification instruction.' using errcode='22023'; end if;
    end loop;
    complete:=(p_payload->>'ownership_verified')::boolean and (p_payload->>'deployment_verified')::boolean and (p_payload->>'tls_verified')::boolean;
    update public.commerce_domains set ownership_verified=(p_payload->>'ownership_verified')::boolean,
      ownership_verified_at=case when (p_payload->>'ownership_verified')::boolean then coalesce(ownership_verified_at,clock_timestamp()) else ownership_verified_at end,
      deployment_verified=(p_payload->>'deployment_verified')::boolean,tls_verified=(p_payload->>'tls_verified')::boolean,
      provider_project_id=p_payload->>'provider_project_id',verification=p_payload->'verification',verification_checked_at=clock_timestamp(),
      verified_at=case when complete then clock_timestamp() else null end,active=active and complete,updated_at=clock_timestamp()
      where website_id=w.id and id=d.id returning * into d;
  elsif p_action='activate' then
    if p_payload-array['id']<>'{}'::jsonb then raise exception 'Invalid domain payload.' using errcode='22023'; end if;
    if w.status<>'active' or not(d.ownership_verified and d.deployment_verified and d.tls_verified) or d.verified_at is null or d.verified_at<clock_timestamp()-interval '15 minutes' or d.provider_project_id is null then raise exception 'Fresh provider ownership, deployment and TLS verification required.' using errcode='22023'; end if;
    update public.commerce_domains set active=true,updated_at=clock_timestamp() where website_id=w.id and id=d.id returning * into d;
  elsif p_action='deactivate' then
    if p_payload-array['id']<>'{}'::jsonb then raise exception 'Invalid domain payload.' using errcode='22023'; end if;
    update public.commerce_domains set active=false,updated_at=clock_timestamp() where website_id=w.id and id=d.id returning * into d;
  else raise exception 'Unknown domain action.' using errcode='22023'; end if;
  perform commerce_private.audit(w.id,'domain_'||p_action,d.id,before_value,jsonb_build_object('hostname',d.hostname,'active',d.active,'ownership_verified',d.ownership_verified,'deployment_verified',d.deployment_verified,'tls_verified',d.tls_verified,'released_at',d.released_at));
  return to_jsonb(d);
end;
$$;
revoke all on function public.commerce_domain_admin_action(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.commerce_domain_admin_action(uuid,text,jsonb) to service_role;

create function public.commerce_resolve_domain(p_hostname text)
returns text language sql stable security definer set search_path='' as $$
  select w.slug from public.commerce_domains d join public.commerce_websites w on w.id=d.website_id
  where commerce_private.valid_domain_hostname(p_hostname) and d.hostname=p_hostname
    and d.active and d.ownership_verified and d.deployment_verified and d.tls_verified
    and d.verified_at is not null and d.released_at is null and w.status='active'
  limit 1;
$$;
revoke all on function public.commerce_resolve_domain(text) from public,anon,authenticated,service_role;
grant execute on function public.commerce_resolve_domain(text) to anon,authenticated,service_role;
commit;
