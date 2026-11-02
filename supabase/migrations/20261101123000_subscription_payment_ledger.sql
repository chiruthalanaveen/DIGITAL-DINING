-- Phase 0: durable, service-only subscription checkout and activation receipts.
-- REVIEW ONLY until separately approved for a verified hosted target.
-- Do not reapply the commerce foundation or use supabase db push to install this.
-- One-time migration: an existing schema/object causes a transactional failure;
-- existing business rows, policies, functions, triggers and cron jobs are not edited.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $preflight$
DECLARE
  v_missing text;
  v_relation regclass := to_regclass('public.restaurants');
BEGIN
  IF v_relation IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class WHERE oid = v_relation AND relkind IN ('r', 'p')
  ) THEN
    RAISE EXCEPTION 'Subscription ledger requires the existing restaurants table';
  END IF;
  SELECT string_agg(expected.name, ', ' ORDER BY expected.name) INTO v_missing
  FROM (VALUES
    ('id', 'uuid'::regtype), ('owner_id', 'uuid'::regtype),
    ('name', 'text'::regtype), ('approval_status', 'text'::regtype),
    ('plan', 'text'::regtype), ('plan_code', 'text'::regtype),
    ('billing_cycle', 'text'::regtype), ('subscription_status', 'text'::regtype),
    ('subscription_expires_at', 'timestamptz'::regtype),
    ('business_type', 'text'::regtype), ('resort_enabled', 'bool'::regtype),
    ('delivery_enabled', 'bool'::regtype)
  ) AS expected(name, type_oid)
  LEFT JOIN pg_catalog.pg_attribute AS attribute
    ON attribute.attrelid = v_relation AND attribute.attname = expected.name
      AND attribute.attnum > 0 AND NOT attribute.attisdropped
  WHERE attribute.atttypid IS DISTINCT FROM expected.type_oid;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Subscription ledger restaurant column contract mismatch: %', v_missing;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index AS idx
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = idx.indrelid AND attribute.attname = 'id'
    WHERE idx.indrelid = v_relation AND idx.indisunique AND idx.indisvalid
      AND idx.indpred IS NULL AND idx.indnkeyatts = 1
      AND idx.indkey[0] = attribute.attnum
  ) THEN
    RAISE EXCEPTION 'Subscription ledger requires a unique restaurants.id';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'Subscription ledger requires the existing service_role role';
  END IF;
END
$preflight$;

CREATE SCHEMA subscription_private;
REVOKE ALL ON SCHEMA subscription_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE subscription_private.checkout_intents (
  id uuid PRIMARY KEY,
  -- Immutable identity snapshots intentionally have no FK to legacy/Auth tables:
  -- this must not block existing account deletion or cascade-delete financial proof.
  restaurant_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  plan_code text NOT NULL,
  billing_cycle text NOT NULL,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  currency text NOT NULL CHECK (currency = 'INR'),
  provider_key_id text NOT NULL CHECK (provider_key_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  provider_order_id text UNIQUE CHECK (provider_order_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  created_at timestamptz NOT NULL,
  bound_at timestamptz,
  CHECK ((provider_order_id IS NULL) = (bound_at IS NULL))
);

CREATE TABLE subscription_private.activation_receipts (
  checkout_id uuid PRIMARY KEY REFERENCES subscription_private.checkout_intents(id),
  restaurant_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  provider_order_id text NOT NULL UNIQUE CHECK (provider_order_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  provider_payment_id text NOT NULL UNIQUE CHECK (provider_payment_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  provider_key_id text NOT NULL CHECK (provider_key_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  plan_code text NOT NULL,
  billing_cycle text NOT NULL,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  currency text NOT NULL CHECK (currency = 'INR'),
  activated_at timestamptz NOT NULL,
  subscription_expires_at timestamptz NOT NULL,
  restaurant_snapshot jsonb NOT NULL CHECK (jsonb_typeof(restaurant_snapshot) = 'object'),
  CHECK (subscription_expires_at > activated_at)
);

-- No client policies or direct service-role privileges. SECURITY DEFINER RPCs
-- are owned by the installer/table owner. ENABLE-only deliberately retains owner
-- bypass: FORCE would add an undocumented BYPASSRLS requirement for that owner.
ALTER TABLE subscription_private.checkout_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_private.activation_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE subscription_private.checkout_intents,
  subscription_private.activation_receipts FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION subscription_private.plan_terms(p_plan_code text, p_billing_cycle text)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $function$
  SELECT jsonb_build_object(
    'plan', plans.legacy_plan, 'business_type', plans.business_type,
    'resort_enabled', plans.resort_enabled, 'delivery_enabled', plans.delivery_enabled,
    'amount_paise', CASE p_billing_cycle
      WHEN '1month' THEN plans.one_month
      WHEN '6months' THEN plans.six_months
      WHEN '12months' THEN plans.twelve_months
    END
  )
  FROM (VALUES
    ('restaurant_pro', 'Pro', 'restaurant', false, false, 149900::bigint, 809500::bigint, 1439000::bigint),
    ('delivery', 'Pro', 'delivery', false, true, 149900::bigint, 809500::bigint, 1439000::bigint),
    ('restaurant_resort_pro', 'Pro+', 'restaurant_resort', true, false, 299900::bigint, 1619500::bigint, 2879000::bigint),
    ('restaurant_delivery', 'Pro', 'restaurant_delivery', false, true, 299900::bigint, 1619500::bigint, 2879000::bigint),
    ('restaurant_resort_delivery', 'Pro+', 'restaurant_resort_delivery', true, true, 399900::bigint, 2159500::bigint, 3839000::bigint)
  ) AS plans(code, legacy_plan, business_type, resort_enabled, delivery_enabled,
    one_month, six_months, twelve_months)
  WHERE plans.code = p_plan_code AND p_billing_cycle IN ('1month', '6months', '12months')
$function$;

CREATE FUNCTION subscription_private.term_expiry(p_activated_at timestamptz, p_billing_cycle text)
RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog
AS $function$
DECLARE
  v_months integer;
  v_utc timestamp := p_activated_at AT TIME ZONE 'UTC';
BEGIN
  v_months := CASE p_billing_cycle WHEN '1month' THEN 1 WHEN '6months' THEN 6 WHEN '12months' THEN 12 END;
  IF p_activated_at IS NULL OR v_months IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid subscription term';
  END IF;
  -- Match existing JavaScript UTC Date.setMonth / Date.setFullYear overflow,
  -- including Jan 31 and leap-day rollover; do not silently clamp to month end.
  RETURN (date_trunc('month', v_utc) + make_interval(months => v_months)
    + make_interval(days => extract(day FROM v_utc)::integer - 1)
    + (v_utc - date_trunc('day', v_utc))) AT TIME ZONE 'UTC';
END
$function$;

CREATE FUNCTION subscription_private.reject_receipt_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Subscription activation receipts are immutable';
END
$function$;

CREATE TRIGGER reject_receipt_change
BEFORE UPDATE OR DELETE ON subscription_private.activation_receipts
FOR EACH ROW EXECUTE FUNCTION subscription_private.reject_receipt_mutation();
CREATE TRIGGER reject_receipt_truncate
BEFORE TRUNCATE ON subscription_private.activation_receipts
FOR EACH STATEMENT EXECUTE FUNCTION subscription_private.reject_receipt_mutation();

REVOKE ALL ON FUNCTION subscription_private.plan_terms(text, text),
  subscription_private.term_expiry(timestamptz, text),
  subscription_private.reject_receipt_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.subscription_open_checkout(
  p_checkout_id uuid, p_restaurant_id uuid, p_owner_id uuid,
  p_plan_code text, p_billing_cycle text, p_amount_paise bigint,
  p_currency text, p_provider_key_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
SET lock_timeout = '5s'
AS $function$
DECLARE
  v_restaurant record;
  v_checkout subscription_private.checkout_intents%ROWTYPE;
  v_terms jsonb;
BEGIN
  -- PostgREST sets the database role before invoking the function. Do not trust
  -- a caller-editable JWT claim as the sole privilege test inside a definer.
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Service role required';
  END IF;
  v_terms := subscription_private.plan_terms(p_plan_code, p_billing_cycle);
  IF p_checkout_id IS NULL OR p_restaurant_id IS NULL OR p_owner_id IS NULL
    OR v_terms IS NULL OR p_amount_paise IS DISTINCT FROM (v_terms->>'amount_paise')::bigint
    OR p_currency IS DISTINCT FROM 'INR'
    OR p_provider_key_id IS NULL OR p_provider_key_id !~ '^[A-Za-z0-9_-]{1,200}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid subscription checkout terms';
  END IF;
  -- All runtime functions take locks in restaurant -> checkout order.
  SELECT id, owner_id, approval_status INTO v_restaurant
    FROM public.restaurants WHERE id = p_restaurant_id FOR UPDATE;
  IF NOT FOUND OR v_restaurant.owner_id IS DISTINCT FROM p_owner_id
    OR v_restaurant.approval_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Approved restaurant owner required';
  END IF;
  SELECT * INTO v_checkout FROM subscription_private.checkout_intents
    WHERE id = p_checkout_id FOR UPDATE;
  IF FOUND THEN
    IF v_checkout.restaurant_id IS DISTINCT FROM p_restaurant_id
      OR v_checkout.owner_id IS DISTINCT FROM p_owner_id
      OR v_checkout.plan_code IS DISTINCT FROM p_plan_code
      OR v_checkout.billing_cycle IS DISTINCT FROM p_billing_cycle
      OR v_checkout.amount_paise IS DISTINCT FROM p_amount_paise
      OR v_checkout.currency IS DISTINCT FROM p_currency
      OR v_checkout.provider_key_id IS DISTINCT FROM p_provider_key_id THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Checkout terms conflict with existing intent';
    END IF;
  ELSE
    INSERT INTO subscription_private.checkout_intents (
      id, restaurant_id, owner_id, plan_code, billing_cycle, amount_paise,
      currency, provider_key_id, created_at
    ) VALUES (
      p_checkout_id, p_restaurant_id, p_owner_id, p_plan_code, p_billing_cycle,
      p_amount_paise, p_currency, p_provider_key_id, date_trunc('milliseconds', clock_timestamp())
    ) RETURNING * INTO v_checkout;
  END IF;
  RETURN jsonb_build_object('success', true, 'checkout', jsonb_build_object(
    'id', v_checkout.id, 'restaurant_id', v_checkout.restaurant_id,
    'owner_id', v_checkout.owner_id, 'plan_code', v_checkout.plan_code,
    'billing_cycle', v_checkout.billing_cycle, 'amount_paise', v_checkout.amount_paise,
    'currency', v_checkout.currency, 'provider_key_id', v_checkout.provider_key_id,
    'provider_order_id', v_checkout.provider_order_id,
    'created_at', to_char(v_checkout.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ));
END
$function$;

CREATE FUNCTION public.subscription_bind_checkout(
  p_checkout_id uuid, p_restaurant_id uuid, p_owner_id uuid, p_provider_order_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
SET lock_timeout = '5s'
AS $function$
DECLARE
  v_restaurant record;
  v_checkout subscription_private.checkout_intents%ROWTYPE;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Service role required';
  END IF;
  IF p_checkout_id IS NULL OR p_restaurant_id IS NULL OR p_owner_id IS NULL
    OR p_provider_order_id IS NULL OR p_provider_order_id !~ '^[A-Za-z0-9_-]{1,200}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid subscription order binding';
  END IF;
  SELECT id, owner_id, approval_status INTO v_restaurant
    FROM public.restaurants WHERE id = p_restaurant_id FOR UPDATE;
  IF NOT FOUND OR v_restaurant.owner_id IS DISTINCT FROM p_owner_id
    OR v_restaurant.approval_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Approved restaurant owner required';
  END IF;
  SELECT * INTO v_checkout FROM subscription_private.checkout_intents
    WHERE id = p_checkout_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Registered checkout required';
  END IF;
  IF v_checkout.restaurant_id IS DISTINCT FROM p_restaurant_id OR v_checkout.owner_id IS DISTINCT FROM p_owner_id THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Checkout identity conflict';
  END IF;
  IF v_checkout.provider_order_id IS NULL THEN
    UPDATE subscription_private.checkout_intents
      SET provider_order_id = p_provider_order_id,
        bound_at = date_trunc('milliseconds', clock_timestamp())
      WHERE id = p_checkout_id RETURNING * INTO v_checkout;
  ELSIF v_checkout.provider_order_id IS DISTINCT FROM p_provider_order_id THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Checkout already bound to a different order';
  END IF;
  RETURN jsonb_build_object('success', true, 'checkout', jsonb_build_object(
    'id', v_checkout.id, 'restaurant_id', v_checkout.restaurant_id,
    'owner_id', v_checkout.owner_id, 'plan_code', v_checkout.plan_code,
    'billing_cycle', v_checkout.billing_cycle, 'amount_paise', v_checkout.amount_paise,
    'currency', v_checkout.currency, 'provider_key_id', v_checkout.provider_key_id,
    'provider_order_id', v_checkout.provider_order_id,
    'created_at', to_char(v_checkout.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ));
END
$function$;

CREATE FUNCTION public.subscription_activate_payment(
  p_checkout_id uuid, p_restaurant_id uuid, p_owner_id uuid,
  p_provider_order_id text, p_provider_payment_id text, p_amount_paise bigint,
  p_currency text, p_plan_code text, p_billing_cycle text, p_provider_key_id text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
SET lock_timeout = '5s'
AS $function$
DECLARE
  v_restaurant record;
  v_checkout subscription_private.checkout_intents%ROWTYPE;
  v_receipt subscription_private.activation_receipts%ROWTYPE;
  v_terms jsonb;
  v_activated_at timestamptz;
  v_expiry timestamptz;
  v_snapshot jsonb;
  v_actual_snapshot jsonb;
  v_confirmed_owner_id uuid;
  v_confirmed_approval_status text;
  v_updated_rows integer;
  v_replayed boolean := false;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Service role required';
  END IF;
  v_terms := subscription_private.plan_terms(p_plan_code, p_billing_cycle);
  IF p_checkout_id IS NULL OR p_restaurant_id IS NULL OR p_owner_id IS NULL
    OR v_terms IS NULL OR p_amount_paise IS DISTINCT FROM (v_terms->>'amount_paise')::bigint
    OR p_currency IS DISTINCT FROM 'INR'
    OR p_provider_key_id IS NULL OR p_provider_key_id !~ '^[A-Za-z0-9_-]{1,200}$'
    OR p_provider_order_id IS NULL OR p_provider_order_id !~ '^[A-Za-z0-9_-]{1,200}$'
    OR p_provider_payment_id IS NULL OR p_provider_payment_id !~ '^[A-Za-z0-9_-]{1,200}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid subscription payment terms';
  END IF;
  SELECT id, owner_id, approval_status, name INTO v_restaurant
    FROM public.restaurants WHERE id = p_restaurant_id FOR UPDATE;
  IF NOT FOUND OR v_restaurant.owner_id IS DISTINCT FROM p_owner_id
    OR v_restaurant.approval_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Approved restaurant owner required';
  END IF;
  SELECT * INTO v_checkout FROM subscription_private.checkout_intents
    WHERE id = p_checkout_id FOR UPDATE;
  IF NOT FOUND OR v_checkout.provider_order_id IS NULL THEN
    -- Historical/unknown orders need separate reconciliation, never an implicit
    -- import into an empty receipt ledger or a second payment from the owner.
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Registered and bound checkout required';
  END IF;
  IF v_checkout.restaurant_id IS DISTINCT FROM p_restaurant_id
    OR v_checkout.owner_id IS DISTINCT FROM p_owner_id
    OR v_checkout.provider_order_id IS DISTINCT FROM p_provider_order_id
    OR v_checkout.plan_code IS DISTINCT FROM p_plan_code
    OR v_checkout.billing_cycle IS DISTINCT FROM p_billing_cycle
    OR v_checkout.amount_paise IS DISTINCT FROM p_amount_paise
    OR v_checkout.currency IS DISTINCT FROM p_currency
    OR v_checkout.provider_key_id IS DISTINCT FROM p_provider_key_id THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Payment conflicts with checkout terms';
  END IF;
  SELECT * INTO v_receipt FROM subscription_private.activation_receipts WHERE checkout_id = p_checkout_id;
  IF FOUND THEN
    IF v_receipt.provider_payment_id IS DISTINCT FROM p_provider_payment_id
      OR v_receipt.provider_order_id IS DISTINCT FROM p_provider_order_id
      OR v_receipt.restaurant_id IS DISTINCT FROM p_restaurant_id
      OR v_receipt.owner_id IS DISTINCT FROM p_owner_id
      OR v_receipt.provider_key_id IS DISTINCT FROM p_provider_key_id
      OR v_receipt.plan_code IS DISTINCT FROM p_plan_code
      OR v_receipt.billing_cycle IS DISTINCT FROM p_billing_cycle
      OR v_receipt.amount_paise IS DISTINCT FROM p_amount_paise
      OR v_receipt.currency IS DISTINCT FROM p_currency THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Payment conflicts with existing activation receipt';
    END IF;
    v_replayed := true;
  ELSE
    v_activated_at := date_trunc('milliseconds', clock_timestamp());
    v_expiry := subscription_private.term_expiry(v_activated_at, p_billing_cycle);
    v_snapshot := jsonb_build_object(
      'id', v_restaurant.id, 'name', v_restaurant.name,
      'plan', v_terms->>'plan', 'plan_code', p_plan_code,
      'billing_cycle', p_billing_cycle, 'subscription_status', 'active',
      'subscription_expires_at', to_char(v_expiry AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'business_type', v_terms->>'business_type',
      'resort_enabled', (v_terms->>'resort_enabled')::boolean,
      'delivery_enabled', (v_terms->>'delivery_enabled')::boolean
    );
    -- Claim unique checkout/order/payment first. Any conflict fails before the
    -- legacy row update. A later failure rolls back both receipt and activation.
    INSERT INTO subscription_private.activation_receipts (
      checkout_id, restaurant_id, owner_id, provider_order_id, provider_payment_id,
      provider_key_id, plan_code, billing_cycle, amount_paise, currency,
      activated_at, subscription_expires_at, restaurant_snapshot
    ) VALUES (
      p_checkout_id, p_restaurant_id, p_owner_id, p_provider_order_id, p_provider_payment_id,
      p_provider_key_id, p_plan_code, p_billing_cycle, p_amount_paise, p_currency,
      v_activated_at, v_expiry, v_snapshot
    ) RETURNING * INTO v_receipt;
    UPDATE public.restaurants SET
      plan = v_terms->>'plan', plan_code = p_plan_code, billing_cycle = p_billing_cycle,
      subscription_status = 'active', subscription_expires_at = v_expiry,
      business_type = v_terms->>'business_type',
      resort_enabled = (v_terms->>'resort_enabled')::boolean,
      delivery_enabled = (v_terms->>'delivery_enabled')::boolean
    WHERE id = p_restaurant_id AND owner_id = p_owner_id AND approval_status = 'approved';
    GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
    IF v_updated_rows <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Subscription activation could not be confirmed';
    END IF;
    -- RETURNING sees the outer UPDATE's tuple, not a later UPDATE issued by an
    -- AFTER trigger. Re-read after all statement triggers finish, under the
    -- restaurant lock retained above, and reject any unexpected final result.
    SELECT owner_id, approval_status, jsonb_build_object(
      'id', id, 'name', name, 'plan', plan, 'plan_code', plan_code,
      'billing_cycle', billing_cycle, 'subscription_status', subscription_status,
      'subscription_expires_at', to_char(subscription_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'business_type', business_type, 'resort_enabled', resort_enabled, 'delivery_enabled', delivery_enabled
    ) INTO v_confirmed_owner_id, v_confirmed_approval_status, v_actual_snapshot
    FROM public.restaurants WHERE id = p_restaurant_id;
    IF NOT FOUND OR v_confirmed_owner_id IS DISTINCT FROM p_owner_id
      OR v_confirmed_approval_status IS DISTINCT FROM 'approved'
      OR v_actual_snapshot IS DISTINCT FROM v_snapshot THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'Subscription activation could not be confirmed';
    END IF;
  END IF;
  -- A replay returns the original, frozen activation result, not a new expiry
  -- or a claim that this historical plan overrides any later subscription.
  RETURN jsonb_build_object(
    'success', true, 'replayed', v_replayed, 'receipt', jsonb_build_object(
      'checkout_id', v_receipt.checkout_id, 'provider_order_id', v_receipt.provider_order_id,
      'provider_payment_id', v_receipt.provider_payment_id,
      'amount_paise', v_receipt.amount_paise, 'currency', v_receipt.currency,
      'activated_at', to_char(v_receipt.activated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'subscription_expires_at', to_char(v_receipt.subscription_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ), 'restaurant', v_receipt.restaurant_snapshot
  );
END
$function$;

REVOKE ALL ON FUNCTION public.subscription_open_checkout(uuid, uuid, uuid, text, text, bigint, text, text),
  public.subscription_bind_checkout(uuid, uuid, uuid, text),
  public.subscription_activate_payment(uuid, uuid, uuid, text, text, bigint, text, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subscription_open_checkout(uuid, uuid, uuid, text, text, bigint, text, text),
  public.subscription_bind_checkout(uuid, uuid, uuid, text),
  public.subscription_activate_payment(uuid, uuid, uuid, text, text, bigint, text, text, text, text)
  TO service_role;

-- Existing installer default privileges can grant NEW objects to roles unknown
-- to this migration. Do not silently rewrite those existing/default ACLs. Abort
-- the whole installation if our known-role REVOKEs left any unexpected grant.
-- Scope every assertion to this migration's new namespace/tables/functions only.
DO $new_object_acl_guard$
DECLARE
  v_private_namespace oid := 'subscription_private'::regnamespace;
  v_service_role oid := (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'service_role');
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace AS namespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(
      namespace.nspacl, pg_catalog.acldefault('n', namespace.nspowner)
    )) AS acl_entry
    WHERE namespace.oid = v_private_namespace
      AND acl_entry.grantee <> namespace.nspowner
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(
      relation.relacl, pg_catalog.acldefault('r', relation.relowner)
    )) AS acl_entry
    WHERE relation.oid IN (
      'subscription_private.checkout_intents'::regclass,
      'subscription_private.activation_receipts'::regclass
    ) AND acl_entry.grantee <> relation.relowner
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS routine
    CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(
      routine.proacl, pg_catalog.acldefault('f', routine.proowner)
    )) AS acl_entry
    WHERE routine.oid IN (
      'subscription_private.plan_terms(text,text)'::regprocedure,
      'subscription_private.term_expiry(timestamptz,text)'::regprocedure,
      'subscription_private.reject_receipt_mutation()'::regprocedure,
      'public.subscription_open_checkout(uuid,uuid,uuid,text,text,bigint,text,text)'::regprocedure,
      'public.subscription_bind_checkout(uuid,uuid,uuid,text)'::regprocedure,
      'public.subscription_activate_payment(uuid,uuid,uuid,text,text,bigint,text,text,text,text)'::regprocedure
    ) AND acl_entry.grantee <> routine.proowner
      AND NOT (
        routine.pronamespace = 'public'::regnamespace
        AND acl_entry.grantee = v_service_role
        AND acl_entry.privilege_type = 'EXECUTE'
        AND NOT acl_entry.is_grantable
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'Unexpected default privileges on new subscription ledger objects; review installer default privileges before applying this migration';
  END IF;
END
$new_object_acl_guard$;

COMMIT;
