-- REVIEW ONLY. A verified buyer may stop only an existing payment intent whose
-- provider creation has never been claimed. No provider lookup/expiry inference.
begin;

create table commerce_private.payment_unstarted_cancellations (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null,
  intent_id uuid not null unique,
  buyer_id uuid not null references auth.users(id),
  cart_key uuid not null,
  reason text not null default 'never_dispatched' check(reason='never_dispatched'),
  cancelled_at timestamptz not null default now(),
  unique(website_id,buyer_id,cart_key),
  foreign key(website_id,intent_id) references commerce_private.payment_intents(website_id,id)
);
alter table commerce_private.payment_unstarted_cancellations enable row level security;
revoke all on commerce_private.payment_unstarted_cancellations from public,anon,authenticated,service_role;

alter table commerce_private.payment_intents drop constraint payment_intents_state_check;
alter table commerce_private.payment_intents add constraint payment_intents_state_check
  check(state in ('new','creating','provider_unknown','ready','captured_unfulfilled','fulfilled','cancelled_unstarted'));
alter table commerce_private.payment_intents add constraint commerce_unstarted_terminal_shape
  check(state<>'cancelled_unstarted' or (provider_order_id is null and create_lease is null));

create function commerce_private.payment_unstarted_proof_guard()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'Unstarted payment cancellation history is immutable.' using errcode='42501';
end;
$$;
create trigger commerce_payment_unstarted_proof_immutable
before update or delete on commerce_private.payment_unstarted_cancellations
for each row execute function commerce_private.payment_unstarted_proof_guard();

create function commerce_private.payment_cancelled_intent_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    if new.state='cancelled_unstarted' then
      raise exception 'Cancellation requires its original unstarted intent and proof.' using errcode='42501';
    end if;
    return new;
  end if;
  if old.state='cancelled_unstarted' then
    raise exception 'Stopped payment intent history is immutable.' using errcode='42501';
  end if;
  if new.state='cancelled_unstarted' then
    if old.state<>'new' or old.provider_order_id is not null or old.create_lease is not null
      or new.provider_order_id is not null or new.create_lease is not null
      or (to_jsonb(new)-array['state','updated_at']) is distinct from (to_jsonb(old)-array['state','updated_at'])
      or exists(select 1 from commerce_private.payment_receipts where website_id=old.website_id and intent_id=old.id)
      or not exists(select 1 from commerce_private.payment_unstarted_cancellations proof
        where proof.website_id=old.website_id and proof.intent_id=old.id
          and proof.buyer_id=old.buyer_id and proof.cart_key=old.cart_key and proof.reason='never_dispatched') then
      raise exception 'Only a proven unstarted payment intent may be stopped.' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger commerce_payment_cancelled_intent_guard
before insert or update on commerce_private.payment_intents
for each row execute function commerce_private.payment_cancelled_intent_guard();

-- STABLE keeps the intent, receipt, proof and eligibility in one statement
-- snapshot. Inspection does not lock the intent or change its original state.
create function commerce_private.payment_attempt_view(p_website_id uuid,p_buyer_id uuid,p_cart_key uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'website_id',p_website_id,'cart_key',p_cart_key,'intent_id',intent.id,'found',intent.id is not null,
    'payment',case when intent.id is null then null else commerce_private.payment_view(intent.id) end,
    'cancellation',case when proof.id is null then null else jsonb_build_object(
      'id',proof.id,'intent_id',proof.intent_id,'cancelled_at',proof.cancelled_at,'reason',proof.reason) end,
    'can_cancel_unstarted',coalesce(intent.state='new' and intent.provider_order_id is null
      and intent.create_lease is null and proof.id is null
      and not exists(select 1 from commerce_private.payment_receipts receipt
        where receipt.website_id=intent.website_id and receipt.intent_id=intent.id),false)
  )
  from (select 1) seed
  left join commerce_private.payment_intents intent
    on intent.website_id=p_website_id and intent.buyer_id=p_buyer_id and intent.cart_key=p_cart_key
  left join commerce_private.payment_unstarted_cancellations proof
    on proof.website_id=intent.website_id and proof.intent_id=intent.id
      and proof.buyer_id=intent.buyer_id and proof.cart_key=intent.cart_key;
$$;

create function public.commerce_payment_attempt_control(
  p_website_id uuid,p_cart_key uuid,p_action text default 'inspect',p_expected_intent_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare buyer uuid:=auth.uid();intent commerce_private.payment_intents;result jsonb;
begin
  if buyer is null then raise exception 'Verified buyer required.' using errcode='42501';end if;
  if p_website_id is null or p_cart_key is null or p_action is null or p_action not in ('inspect','cancel_unstarted') then
    raise exception 'Invalid payment attempt request.' using errcode='22023';
  end if;
  -- Recheck verification after a concurrent Auth update, and retain that truth
  -- until this transaction finishes. Store/gateway disablement is not activation.
  perform 1 from auth.users where id=buyer and email_confirmed_at is not null for share;
  if not found then raise exception 'Verified buyer required.' using errcode='42501';end if;
  if p_action='inspect' then
    result:=commerce_private.payment_attempt_view(p_website_id,buyer,p_cart_key);
    if p_expected_intent_id is not null and result->>'intent_id' is not null
      and (result->>'intent_id')::uuid<>p_expected_intent_id then
      raise exception 'Payment intent access denied.' using errcode='42501';
    end if;
    return result;
  end if;

  -- The same row lock serializes against claim_create. Never add the cart
  -- advisory lock here: fulfillment acquires intent then cart, and no new cart
  -- is inserted or reused by cancellation. The old key stays reserved.
  select * into intent from commerce_private.payment_intents
    where website_id=p_website_id and buyer_id=buyer and cart_key=p_cart_key for update;
  if not found then
    -- Absence is not proof: the original create request may still arrive.
    raise exception 'The original payment attempt is not confirmed; keep the same checkout.' using errcode='23505';
  end if;
  if p_expected_intent_id is not null and intent.id<>p_expected_intent_id then
    raise exception 'Payment intent access denied.' using errcode='42501';
  end if;
  if intent.state='cancelled_unstarted' then
    if not exists(select 1 from commerce_private.payment_unstarted_cancellations proof
      where proof.website_id=intent.website_id and proof.intent_id=intent.id
        and proof.buyer_id=buyer and proof.cart_key=intent.cart_key) then
      raise exception 'Cancellation history requires reconciliation.' using errcode='23505';
    end if;
    return commerce_private.payment_attempt_view(p_website_id,buyer,p_cart_key);
  end if;
  if intent.state<>'new' or intent.provider_order_id is not null or intent.create_lease is not null
    or exists(select 1 from commerce_private.payment_receipts where website_id=intent.website_id and intent_id=intent.id) then
    raise exception 'Provider creation may have started; keep this attempt for reconciliation.' using errcode='23505';
  end if;
  insert into commerce_private.payment_unstarted_cancellations(website_id,intent_id,buyer_id,cart_key)
    values(intent.website_id,intent.id,buyer,intent.cart_key);
  update commerce_private.payment_intents set state='cancelled_unstarted',updated_at=now() where id=intent.id;
  return commerce_private.payment_attempt_view(p_website_id,buyer,p_cart_key);
end;
$$;

revoke all on function commerce_private.payment_unstarted_proof_guard(),
  commerce_private.payment_cancelled_intent_guard(),commerce_private.payment_attempt_view(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.commerce_payment_attempt_control(uuid,uuid,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.commerce_payment_attempt_control(uuid,uuid,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
