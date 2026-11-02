-- REPRESENTATIVE LOCAL FIXTURE ONLY. This is not the installed legacy schema,
-- hosted Supabase Auth or proof of production RLS compatibility.
DO $$ BEGIN
  IF current_database() <> 'subscription_test'
     OR inet_server_addr() NOT IN ('127.0.0.1'::inet, '::1'::inet) THEN
    RAISE EXCEPTION 'Subscription fixtures require loopback subscription_test';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='subscription_fixture_extra_acl') THEN
    CREATE ROLE subscription_fixture_extra_acl NOLOGIN BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='subscription_fixture_extra_acl' AND NOT rolcanlogin AND rolbypassrls) THEN
    RAISE EXCEPTION 'Unexpected attributes on local extra-ACL fixture role';
  END IF;
END $$;

CREATE SCHEMA subscription_test;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
INSERT INTO auth.users VALUES
 ('22222222-2222-4222-8222-222222222222','owner-a@subscription.example.test'),
 ('44444444-4444-4444-8444-444444444444','owner-b@subscription.example.test');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.role',true),'')
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO anon, authenticated, service_role;

CREATE TABLE public.restaurants(
 id uuid PRIMARY KEY, owner_id uuid, name text, phone text, approval_status text,
 plan text, plan_code text, billing_cycle text, subscription_status text,
 subscription_expires_at timestamptz, business_type text,
 resort_enabled boolean, delivery_enabled boolean
);
INSERT INTO public.restaurants VALUES
 ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  'Synthetic Restaurant A','9000000000','approved','Pro','restaurant_pro','1month',
  'active','2026-12-01T00:00:00Z','restaurant',false,false),
 ('33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444',
  'Synthetic Restaurant B','9000000001','approved','Pro','restaurant_pro','1month',
  'active','2026-12-01T00:00:00Z','restaurant',false,false);
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.restaurants TO authenticated;
CREATE POLICY fixture_restaurant_owner ON public.restaurants FOR SELECT TO authenticated
 USING (coalesce(owner_id,id)=auth.uid());

CREATE TABLE subscription_test.activation_audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 restaurant_id uuid, before_row jsonb, after_row jsonb
);
CREATE FUNCTION subscription_test.audit_subscription() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO subscription_test.activation_audit(restaurant_id,before_row,after_row)
 VALUES(NEW.id,to_jsonb(OLD),to_jsonb(NEW));
 IF current_setting('subscription_test.fail_audit',true)='on' THEN
   RAISE EXCEPTION 'Synthetic existing AFTER UPDATE failure' USING ERRCODE='P0001';
 END IF;
 IF pg_trigger_depth()=1 THEN
   IF current_setting('subscription_test.override_after',true)='plan' THEN
     UPDATE public.restaurants SET plan_code='fixture_overridden' WHERE id=NEW.id;
   ELSIF current_setting('subscription_test.override_after',true)='approval' THEN
     UPDATE public.restaurants SET approval_status='suspended' WHERE id=NEW.id;
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fixture_existing_subscription_audit AFTER UPDATE ON public.restaurants
 FOR EACH ROW WHEN (
   OLD.subscription_expires_at IS DISTINCT FROM NEW.subscription_expires_at OR
   OLD.plan_code IS DISTINCT FROM NEW.plan_code OR
   OLD.subscription_status IS DISTINCT FROM NEW.subscription_status
 ) EXECUTE FUNCTION subscription_test.audit_subscription();
CREATE FUNCTION subscription_test.fail_receipt() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN
 IF current_setting('subscription_test.fail_receipt',true)='on' THEN
   RAISE EXCEPTION 'Synthetic receipt failure' USING ERRCODE='P0001';
 END IF;
 RETURN NEW;
END $$;

-- Unrelated legacy financial/customer/booking/delivery data must not be changed.
CREATE TABLE public.delivery_store_wallets(restaurant_id uuid PRIMARY KEY,balance_paise bigint,pending_fees_paise bigint);
CREATE TABLE public.orders(id uuid PRIMARY KEY,restaurant_id uuid,amount_paise bigint,history jsonb);
CREATE TABLE public.payment_transactions(id uuid PRIMARY KEY,restaurant_id uuid,provider_reference text,amount_paise bigint);
CREATE TABLE public.customers(id uuid PRIMARY KEY,restaurant_id uuid,profile jsonb);
CREATE TABLE public.delivery_orders(id uuid PRIMARY KEY,restaurant_id uuid,state text);
CREATE TABLE public.room_bookings(id uuid PRIMARY KEY,restaurant_id uuid,state text);
INSERT INTO public.delivery_store_wallets VALUES('11111111-1111-4111-8111-111111111111',234567,500);
INSERT INTO public.orders VALUES('50000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',15900,'[{"status":"completed"}]');
INSERT INTO public.payment_transactions VALUES('50000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','preserved-synthetic-reference',15900);
INSERT INTO public.customers VALUES('50000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','{"name":"Synthetic customer"}');
INSERT INTO public.delivery_orders VALUES('50000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','delivered');
INSERT INTO public.room_bookings VALUES('50000000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','checked_out');
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.orders TO authenticated;
CREATE POLICY fixture_existing_order_policy ON public.orders FOR SELECT TO authenticated
 USING (restaurant_id='11111111-1111-4111-8111-111111111111');
CREATE SCHEMA cron;
CREATE TABLE cron.job(jobid bigint PRIMARY KEY,schedule text,command text,active boolean);
INSERT INTO cron.job VALUES(1,'30 17 * * *','synthetic existing settlement',true);

-- Conservative inherited ACLs must be removed on new private objects.
ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
