-- TEST-ONLY Supabase primitives for a disposable local PostgreSQL database.
-- Never apply this file to a hosted Supabase project.
DO $$ BEGIN
  IF current_database() <> 'commerce_test' OR inet_server_addr() NOT IN ('127.0.0.1'::inet, '::1'::inet) THEN
    RAISE EXCEPTION 'Commerce bootstrap requires an isolated loopback commerce_test database';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text UNIQUE,
  email_confirmed_at timestamptz,
  phone text,
  phone_confirmed_at timestamptz,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')
  )::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO anon, authenticated, service_role;
GRANT ALL ON auth.users TO service_role;

CREATE SCHEMA storage;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY, name text NOT NULL, public boolean DEFAULT false,
  file_size_limit bigint, allowed_mime_types text[]
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL REFERENCES storage.buckets(id), name text NOT NULL,
  owner uuid, owner_id text, metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  UNIQUE(bucket_id, name)
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)]
$$;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT SELECT ON storage.buckets TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon;
GRANT ALL ON storage.buckets, storage.objects TO service_role;

-- An intentionally permissive pre-existing policy proves commerce guards cannot
-- rely on merely adding another permissive policy. It must remain intact.
CREATE POLICY fixture_existing_storage_access ON storage.objects FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY fixture_existing_anon_storage_access ON storage.objects FOR ALL TO anon USING (true) WITH CHECK (true);
INSERT INTO storage.buckets(id, name) VALUES ('legacy-fixture', 'legacy-fixture');
INSERT INTO storage.objects(bucket_id, name) VALUES ('legacy-fixture', 'preserved.txt');

CREATE TABLE public.legacy_preservation_fixture(id integer PRIMARY KEY, balance_paise bigint, order_history jsonb);
INSERT INTO public.legacy_preservation_fixture VALUES (1, 123456, '[{"order":"existing","payment":"preserved"}]');
ALTER TABLE public.legacy_preservation_fixture ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.legacy_preservation_fixture TO authenticated;
CREATE POLICY fixture_existing_legacy_policy ON public.legacy_preservation_fixture FOR SELECT TO authenticated USING (id = 1);

CREATE SCHEMA commerce_test_bootstrap;
CREATE SCHEMA cron;
CREATE TABLE cron.job (jobid bigint PRIMARY KEY, schedule text, command text, active boolean);
INSERT INTO cron.job VALUES (1, '0 0 * * *', 'existing settlement fixture', true);
CREATE TABLE commerce_test_bootstrap.guard_snapshot AS
SELECT relacl::text AS acl, relrowsecurity AS rls,
  (SELECT jsonb_agg(to_jsonb(p) ORDER BY policyname) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = 'legacy_preservation_fixture') AS policies
FROM pg_class WHERE oid = 'public.legacy_preservation_fixture'::regclass;

-- Hosted Supabase can grant EXECUTE through default ACLs as well as PUBLIC.
-- Every new function must explicitly remove inherited roles before granting its
-- intended callers; merely REVOKE FROM PUBLIC is insufficient.
ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
