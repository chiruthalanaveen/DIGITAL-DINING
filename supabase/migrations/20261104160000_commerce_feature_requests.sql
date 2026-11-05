-- REVIEW ONLY for hosted targets. Business requirements and review history only.
-- No feature/security/payment activation or existing business-record mutation.
begin;

create table public.commerce_feature_requests (
 id uuid primary key default gen_random_uuid(),
 website_id uuid not null references public.commerce_websites(id),
 submitted_by uuid not null references auth.users(id),
 submission_key uuid not null,
 title text not null check(char_length(title) between 5 and 180 and title ~ '[^[:space:]]'),
 description text not null check(char_length(description) between 10 and 6000 and description ~ '[^[:space:]]'),
 status text not null default 'submitted' check(status in ('submitted','under_review','approved','rejected','assigned')),
 revision integer not null default 1 check(revision between 1 and 4),
 review_note text not null default '' check(char_length(review_note)<=2000),
 assignment_reference text not null default '' check(char_length(assignment_reference)<=160),
 last_action_key uuid not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(website_id,id), unique(website_id,submitted_by,submission_key),
 check(updated_at>=created_at),
 check((status='submitted' and revision=1 and review_note='' and assignment_reference='') or
       (status<>'submitted' and revision>=2 and char_length(review_note)>=1 and review_note ~ '[^[:space:]]')),
 check((status='assigned' and char_length(assignment_reference)>=1 and assignment_reference ~ '[^[:space:]]') or
       (status<>'assigned' and assignment_reference=''))
);
create index commerce_feature_requests_tenant_latest on public.commerce_feature_requests(website_id,created_at desc,id desc);
create index commerce_feature_requests_global_latest on public.commerce_feature_requests(created_at desc,id desc);

create table commerce_private.feature_request_events (
 id uuid primary key default gen_random_uuid(),
 website_id uuid not null, request_id uuid not null,
 revision integer not null check(revision between 1 and 4),
 operation_key uuid not null,
 from_status text check(from_status in ('submitted','under_review','approved','rejected','assigned')),
 to_status text not null check(to_status in ('submitted','under_review','approved','rejected','assigned')),
 note text not null check(char_length(note)<=2000),
 assignment_reference text not null check(char_length(assignment_reference)<=160),
 actor_kind text not null check(actor_kind in ('owner','admin')),
 actor_email text check(char_length(actor_email)<=320),
 created_at timestamptz not null,
 unique(request_id,revision), unique(request_id,operation_key),
 foreign key(website_id,request_id) references public.commerce_feature_requests(website_id,id),
 check((revision=1 and from_status is null and to_status='submitted' and actor_kind='owner' and actor_email is null and note='' and assignment_reference='') or
       (revision>1 and from_status is not null and actor_kind='admin' and actor_email is not null and actor_email ~ '^[^[:space:]@]+@[^[:space:]@]+$' and char_length(note)>=1)),
 check((to_status='assigned' and char_length(assignment_reference)>=1) or (to_status<>'assigned' and assignment_reference=''))
);
alter table public.commerce_feature_requests enable row level security;
alter table commerce_private.feature_request_events enable row level security;
revoke all on public.commerce_feature_requests,commerce_private.feature_request_events from public,anon,authenticated,service_role;

create function commerce_private.feature_request_can_read(p_website_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null)
  and commerce_private.is_member(p_website_id);
$$;
revoke all on function commerce_private.feature_request_can_read(uuid) from public,anon,authenticated,service_role;
grant execute on function commerce_private.feature_request_can_read(uuid) to authenticated;
create policy commerce_feature_requests_owner_read on public.commerce_feature_requests for select to authenticated using(commerce_private.feature_request_can_read(website_id));
grant select(id,website_id,title,description,status,revision,review_note,assignment_reference,created_at,updated_at) on public.commerce_feature_requests to authenticated;

create function commerce_private.feature_request_payload(p_value jsonb,p_allowed text[]) returns void
language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(p_value) is distinct from 'object' or octet_length(p_value::text)>65536 or exists(select 1 from jsonb_object_keys(p_value) k where not(k=any(p_allowed))) then
  raise exception 'Invalid feature request payload.' using errcode='22023';
 end if;
end;$$;

create function commerce_private.feature_request_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Feature request history cannot be deleted.' using errcode='42501';end if;
 if tg_op='INSERT' then
  if current_setting('role',true) is distinct from 'authenticated' or new.submitted_by is distinct from auth.uid() or new.status<>'submitted' or new.revision<>1 or new.review_note<>'' or new.assignment_reference<>'' or new.last_action_key<>new.submission_key then
   raise exception 'A verified owner must submit the original request.' using errcode='42501';
  end if;
  new.created_at:=clock_timestamp();new.updated_at:=new.created_at;
 else
  if current_setting('role',true) is distinct from 'service_role' or
    (to_jsonb(new)-array['status','revision','review_note','assignment_reference','last_action_key','updated_at']) is distinct from (to_jsonb(old)-array['status','revision','review_note','assignment_reference','last_action_key','updated_at']) or
    new.revision<>old.revision+1 or new.last_action_key=old.last_action_key or
    not ((old.status='submitted' and new.status in ('under_review','approved','rejected')) or (old.status='under_review' and new.status in ('approved','rejected')) or (old.status='approved' and new.status='assigned')) then
   raise exception 'Only an authorized next review may change request state.' using errcode='42501';
  end if;
  new.updated_at:=greatest(clock_timestamp(),old.updated_at);
 end if;
 return new;
end;$$;
create trigger commerce_feature_request_guard before insert or update or delete on public.commerce_feature_requests for each row execute function commerce_private.feature_request_guard();

create function commerce_private.record_feature_request_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor text;
begin
 actor:=case when tg_op='INSERT' then null else nullif(current_setting('commerce.feature_request_admin_actor',true),'') end;
 if tg_op='UPDATE' and (actor is null or char_length(actor)>320 or actor !~ '^[^[:space:]@]+@[^[:space:]@]+$') then raise exception 'A signed administrative actor is required.' using errcode='42501';end if;
 insert into commerce_private.feature_request_events(website_id,request_id,revision,operation_key,from_status,to_status,note,assignment_reference,actor_kind,actor_email,created_at)
 values(new.website_id,new.id,new.revision,new.last_action_key,case when tg_op='INSERT' then null else old.status end,new.status,new.review_note,new.assignment_reference,case when tg_op='INSERT' then 'owner' else 'admin' end,actor,new.updated_at);
 return new;
end;$$;
create trigger commerce_feature_request_event_record after insert or update on public.commerce_feature_requests for each row execute function commerce_private.record_feature_request_event();

create function commerce_private.feature_request_event_immutable() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'Feature request events are immutable.' using errcode='42501';end;$$;
create trigger commerce_feature_request_event_immutable before update or delete on commerce_private.feature_request_events for each row execute function commerce_private.feature_request_event_immutable();

create function commerce_private.feature_request_detail(p_website_id uuid,p_request_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('website_id',r.website_id,'request',jsonb_build_object(
  'id',r.id,'website_id',r.website_id,'title',r.title,'description',r.description,'status',r.status,'revision',r.revision,'review_note',r.review_note,'assignment_reference',r.assignment_reference,'created_at',r.created_at,'updated_at',r.updated_at),
  'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'request_id',e.request_id,'revision',e.revision,'from_status',e.from_status,'to_status',e.to_status,'note',e.note,'assignment_reference',e.assignment_reference,'actor_kind',e.actor_kind,'created_at',e.created_at) order by e.revision) from commerce_private.feature_request_events e where e.website_id=r.website_id and e.request_id=r.id),'[]'::jsonb))
 from public.commerce_feature_requests r where r.website_id=p_website_id and r.id=p_request_id;
$$;
create function commerce_private.feature_request_page(p_website_id uuid,p_payload jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare before_date timestamptz;before_uuid uuid;result jsonb;
begin
 perform commerce_private.feature_request_payload(p_payload,array['before_created_at','before_id']);
 if (p_payload ? 'before_created_at')<>(p_payload ? 'before_id') then raise exception 'A complete cursor is required.' using errcode='22023';end if;
 if p_payload ? 'before_id' then
  before_uuid:=commerce_private.customer_identifier(p_payload->'before_id');
  if jsonb_typeof(p_payload->'before_created_at') is distinct from 'string' or (p_payload->>'before_created_at') !~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$' then raise exception 'Invalid request cursor.' using errcode='22023';end if;
  begin before_date:=(p_payload->>'before_created_at')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Invalid request cursor date.' using errcode='22023';end;
 end if;
 with candidates as (
  select r.* from public.commerce_feature_requests r where (p_website_id is null or r.website_id=p_website_id) and (before_date is null or (r.created_at,r.id)<(before_date,before_uuid)) order by r.created_at desc,r.id desc limit 51
 ), page_rows as (select * from candidates order by created_at desc,id desc limit 50), edge as (select * from page_rows order by created_at,id limit 1)
 select jsonb_build_object('website_id',p_website_id,'requests',coalesce((select jsonb_agg(jsonb_build_object(
  'id',r.id,'website_id',r.website_id,'title',r.title,'description',r.description,'status',r.status,'revision',r.revision,'review_note',r.review_note,'assignment_reference',r.assignment_reference,'created_at',r.created_at,'updated_at',r.updated_at) order by r.created_at desc,r.id desc) from page_rows r),'[]'::jsonb),
  'has_more',(select count(*)>50 from candidates),'next_cursor',case when (select count(*)>50 from candidates) then (select jsonb_build_object('created_at',created_at,'id',id) from edge) else null end) into result;
 return result;
end;$$;

create function public.commerce_feature_requests_owner(p_website_id uuid,p_action text default 'list',p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.commerce_websites;u uuid:=auth.uid();saved public.commerce_feature_requests;request_uuid uuid;key_uuid uuid;title_value text;description_value text;replayed boolean:=false;
begin
 if u is null then raise exception 'Verified owner required.' using errcode='42501';end if;
 select * into w from public.commerce_websites where id=p_website_id for share;
 if not found then raise exception 'Website permission denied.' using errcode='42501';end if;
 perform 1 from auth.users where id=u and email_confirmed_at is not null for share;
 if not found then raise exception 'Verified owner required.' using errcode='42501';end if;
 perform 1 from public.commerce_memberships where website_id=w.id and user_id=u and role='owner' and active for share;
 if not found then raise exception 'Website permission denied.' using errcode='42501';end if;
 if p_action='list' then return commerce_private.feature_request_page(w.id,p_payload);
 elsif p_action='get' then
  perform commerce_private.feature_request_payload(p_payload,array['request_id']);
  request_uuid:=commerce_private.customer_identifier(p_payload->'request_id');
  if not exists(select 1 from public.commerce_feature_requests where website_id=w.id and id=request_uuid) then raise exception 'Request not found.' using errcode='42501';end if;
  return commerce_private.feature_request_detail(w.id,request_uuid);
 elsif p_action is distinct from 'submit' then raise exception 'Unknown owner request action.' using errcode='22023';end if;
 perform commerce_private.feature_request_payload(p_payload,array['submission_key','title','description']);
 key_uuid:=commerce_private.customer_identifier(p_payload->'submission_key');
 if jsonb_typeof(p_payload->'title') is distinct from 'string' or jsonb_typeof(p_payload->'description') is distinct from 'string' then raise exception 'Request text is required.' using errcode='22023';end if;
 title_value:=regexp_replace(p_payload->>'title','^[[:space:]]+|[[:space:]]+$','','g');
 description_value:=regexp_replace(p_payload->>'description','^[[:space:]]+|[[:space:]]+$','','g');
 if char_length(title_value) not between 5 and 180 or char_length(description_value) not between 10 and 6000 then raise exception 'Invalid feature request text.' using errcode='22023';end if;
 -- A known immutable retry remains inspectable if this website later becomes read-only.
 select * into saved from public.commerce_feature_requests where website_id=w.id and submitted_by=u and submission_key=key_uuid;
 if found then
  if saved.title<>title_value or saved.description<>description_value then raise exception 'Submission replay changed its original request.' using errcode='23505';end if;
  return commerce_private.feature_request_detail(w.id,saved.id)||jsonb_build_object('replayed',true);
 end if;
 if w.status not in ('setup','active') then raise exception 'This website is read-only.' using errcode='42501';end if;
 insert into public.commerce_feature_requests(website_id,submitted_by,submission_key,title,description,last_action_key)
 values(w.id,u,key_uuid,title_value,description_value,key_uuid) on conflict(website_id,submitted_by,submission_key) do nothing returning * into saved;
 if not found then
  select * into saved from public.commerce_feature_requests where website_id=w.id and submitted_by=u and submission_key=key_uuid;
  if saved.title<>title_value or saved.description<>description_value then raise exception 'Submission replay changed its original request.' using errcode='23505';end if;
  replayed:=true;
 end if;
 return commerce_private.feature_request_detail(w.id,saved.id)||jsonb_build_object('replayed',replayed);
end;$$;

create function public.commerce_feature_requests_admin(p_website_id uuid,p_action text,p_payload jsonb,p_actor_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved public.commerce_feature_requests;prior commerce_private.feature_request_events;request_uuid uuid;action_uuid uuid;desired text;expected text;expected_revision integer;note_value text;assignment_value text;previous_actor text;result jsonb;event_value jsonb;
begin
 if current_setting('role',true) is distinct from 'service_role' then raise exception 'Administrative service role required.' using errcode='42501';end if;
 if p_actor_email is null or char_length(p_actor_email)>320 or btrim(p_actor_email) !~ '^[^[:space:]@]+@[^[:space:]@]+$' then raise exception 'A signed administrative actor is required.' using errcode='22023';end if;
 if p_action='list' then
  if p_website_id is not null and not exists(select 1 from public.commerce_websites where id=p_website_id) then raise exception 'Website not found.' using errcode='22023';end if;
  return commerce_private.feature_request_page(p_website_id,p_payload);
 end if;
 if p_website_id is null then raise exception 'A bound website is required.' using errcode='22023';end if;
 perform 1 from public.commerce_websites where id=p_website_id for share;
 if not found then raise exception 'Website not found.' using errcode='22023';end if;
 if p_action='get' then
  perform commerce_private.feature_request_payload(p_payload,array['request_id']);
  request_uuid:=commerce_private.customer_identifier(p_payload->'request_id');
  if not exists(select 1 from public.commerce_feature_requests where website_id=p_website_id and id=request_uuid) then raise exception 'Request not found.' using errcode='42501';end if;
  return commerce_private.feature_request_detail(p_website_id,request_uuid);
 elsif p_action is distinct from 'review' then raise exception 'Unknown administrative request action.' using errcode='22023';end if;
 perform commerce_private.feature_request_payload(p_payload,array['request_id','expected_status','expected_revision','status','note','assignment_reference','action_key']);
 request_uuid:=commerce_private.customer_identifier(p_payload->'request_id');action_uuid:=commerce_private.customer_identifier(p_payload->'action_key');
 if jsonb_typeof(p_payload->'expected_status') is distinct from 'string' or jsonb_typeof(p_payload->'status') is distinct from 'string' or jsonb_typeof(p_payload->'note') is distinct from 'string' or jsonb_typeof(p_payload->'assignment_reference') is distinct from 'string' or jsonb_typeof(p_payload->'expected_revision') is distinct from 'number' or (p_payload->>'expected_revision') !~ '^[1-4]$' then raise exception 'Invalid review fields.' using errcode='22023';end if;
 desired:=p_payload->>'status';expected:=p_payload->>'expected_status';expected_revision:=(p_payload->>'expected_revision')::integer;
 if desired not in ('under_review','approved','rejected','assigned') or expected not in ('submitted','under_review','approved','rejected','assigned') then raise exception 'Invalid review status.' using errcode='22023';end if;
 note_value:=regexp_replace(p_payload->>'note','^[[:space:]]+|[[:space:]]+$','','g');assignment_value:=regexp_replace(p_payload->>'assignment_reference','^[[:space:]]+|[[:space:]]+$','','g');
 if char_length(note_value) not between 1 and 2000 or char_length(assignment_value)>160 or (desired='assigned' and char_length(assignment_value)<1) or (desired<>'assigned' and assignment_value<>'') then raise exception 'Invalid review note or assignment.' using errcode='22023';end if;
 select * into saved from public.commerce_feature_requests where website_id=p_website_id and id=request_uuid for update;
 if not found then raise exception 'Request not found.' using errcode='42501';end if;
 select * into prior from commerce_private.feature_request_events where website_id=saved.website_id and request_id=saved.id and operation_key=action_uuid;
 if found then
  if prior.revision<>expected_revision+1 or prior.from_status is distinct from expected or prior.to_status<>desired or prior.note<>note_value or prior.assignment_reference<>assignment_value or prior.actor_kind<>'admin' then raise exception 'Review replay changed its original action.' using errcode='23505';end if;
  result:=commerce_private.feature_request_detail(saved.website_id,saved.id);
  select value into event_value from jsonb_array_elements(result->'events') where value->>'id'=prior.id::text;
  return result||jsonb_build_object('replayed',true,'action_event',event_value);
 end if;
 if saved.status<>expected or saved.revision<>expected_revision or not ((saved.status='submitted' and desired in ('under_review','approved','rejected')) or (saved.status='under_review' and desired in ('approved','rejected')) or (saved.status='approved' and desired='assigned')) then raise exception 'Request review conflicts with the current revision or transition.' using errcode='23505';end if;
 previous_actor:=current_setting('commerce.feature_request_admin_actor',true);
 perform set_config('commerce.feature_request_admin_actor',btrim(p_actor_email),true);
 update public.commerce_feature_requests set status=desired,revision=revision+1,review_note=note_value,assignment_reference=assignment_value,last_action_key=action_uuid where website_id=saved.website_id and id=saved.id returning * into saved;
 perform set_config('commerce.feature_request_admin_actor',coalesce(previous_actor,''),true);
 perform commerce_private.audit(saved.website_id,'review_feature_request',saved.id,null,jsonb_build_object('request_id',saved.id,'status',saved.status,'revision',saved.revision),btrim(p_actor_email));
 result:=commerce_private.feature_request_detail(saved.website_id,saved.id);
 select value into event_value from jsonb_array_elements(result->'events') where (value->>'revision')::integer=saved.revision;
 return result||jsonb_build_object('replayed',false,'action_event',event_value);
end;$$;

revoke all on function commerce_private.feature_request_payload(jsonb,text[]),commerce_private.feature_request_guard(),commerce_private.record_feature_request_event(),commerce_private.feature_request_event_immutable(),commerce_private.feature_request_detail(uuid,uuid),commerce_private.feature_request_page(uuid,jsonb),public.commerce_feature_requests_owner(uuid,text,jsonb),public.commerce_feature_requests_admin(uuid,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.commerce_feature_requests_owner(uuid,text,jsonb) to authenticated;
grant execute on function public.commerce_feature_requests_admin(uuid,text,jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;
