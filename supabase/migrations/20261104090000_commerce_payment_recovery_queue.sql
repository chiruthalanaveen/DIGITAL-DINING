-- REVIEW ONLY for hosted targets. Read-only Admin discovery of open merchant
-- payment attempts; no changes to payment state, history, policies or providers.
begin;

create function public.commerce_payment_reconciliation_queue(p_website_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  -- Check the actual SET ROLE context through the existing private guard.
  -- SECURITY DEFINER and a caller-supplied JWT role claim are not authority.
  perform commerce_private.payment_assert_service();
  if p_website_id is null or not exists(select 1 from public.commerce_websites where id=p_website_id) then
    raise exception 'Website not found.' using errcode='22023';
  end if;
  with queue_rows as (
    select i.id,i.website_id,i.cart_key,i.state,i.amount_paise,i.currency,
      credential.mode,i.provider_order_id,i.created_at,
      case when receipt.id is null then null else jsonb_build_object(
        'id',receipt.id,'state',receipt.state,'order_id',receipt.order_id,
        'reconciliation_code',receipt.reconciliation_code
      ) end as receipt,
      case when i.state='captured_unfulfilled' then 0
        when i.state in ('provider_unknown','creating') then 1 else 2 end as priority
    from commerce_private.payment_intents i
    join commerce_private.payment_credential_versions credential
      on credential.website_id=i.website_id and credential.id=i.credential_version
    left join commerce_private.payment_receipts receipt
      on receipt.website_id=i.website_id and receipt.intent_id=i.id
    where i.website_id=p_website_id
      and i.state in ('new','creating','provider_unknown','ready','captured_unfulfilled')
    order by priority,i.created_at,i.id
    limit 100
  ), queue_count as (
    select count(*) as total_count from commerce_private.payment_intents
    where website_id=p_website_id
      and state in ('new','creating','provider_unknown','ready','captured_unfulfilled')
  )
  select jsonb_build_object('website_id',p_website_id,
    'intents',coalesce((select jsonb_agg(jsonb_build_object(
      'id',item.id,'website_id',item.website_id,'cart_key',item.cart_key,
      'state',item.state,'amount_paise',item.amount_paise,'currency',item.currency,
      'mode',item.mode,'provider_order_id',item.provider_order_id,
      'created_at',item.created_at,'receipt',item.receipt
    ) order by item.priority,item.created_at,item.id) from queue_rows item),'[]'::jsonb),
    'total_count',queue_count.total_count,'has_more',queue_count.total_count>100
  ) into result from queue_count;
  return result;
end;
$$;
revoke all on function public.commerce_payment_reconciliation_queue(uuid) from public,anon,authenticated,service_role;
grant execute on function public.commerce_payment_reconciliation_queue(uuid) to service_role;
notify pgrst,'reload schema';
commit;
