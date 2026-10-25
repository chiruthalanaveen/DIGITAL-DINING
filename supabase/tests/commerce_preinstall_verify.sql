-- READ-ONLY pre-install inventory. No objects, roles or data are changed.
-- Verify staging gylicwwrmpqomregevqe in the dashboard or guarded connection
-- before running. Database name postgres alone does not identify a project.
-- Keep output private: definitions and cron commands may contain credentials.
begin transaction read only;
set local statement_timeout = '15s';
set local lock_timeout = '3s';

select current_database() as database_name, current_user as database_role,
       current_setting('server_version_num')::integer as server_version_num,
       version() as server_version, host(inet_server_addr()) as server_address;
select rolname, rolsuper, rolbypassrls, rolinherit
from pg_roles where rolname in (current_user,'anon','authenticated','service_role')
order by rolname;
select has_database_privilege(current_user,current_database(),'CREATE') as can_create_private_schema,
       has_schema_privilege(current_user,'public','CREATE') as can_create_public_objects,
       has_schema_privilege(current_user,'auth','USAGE') as auth_schema_usage,
       has_schema_privilege(current_user,'storage','USAGE') as storage_schema_usage,
       has_table_privilege(current_user,'auth.users','SELECT') as can_read_auth_identities,
       has_table_privilege(current_user,'auth.users','REFERENCES') as can_reference_auth_identities,
       has_table_privilege(current_user,'storage.buckets','SELECT') as can_inspect_buckets,
       has_table_privilege(current_user,'storage.buckets','INSERT') as can_create_bucket;
select c.oid::regclass as table_name, pg_get_userbyid(c.relowner) as owner,
       pg_has_role(current_user,c.relowner,'USAGE') as inherits_owner_role,
       (select rolsuper from pg_roles where rolname=current_user) as current_user_superuser,
       c.relrowsecurity,c.relforcerowsecurity
from pg_class c where c.oid='storage.objects'::regclass;
select to_regprocedure('pg_catalog.gen_random_uuid()') as uuid_function,
       to_regprocedure('auth.uid()') as auth_uid_function;
select table_schema, table_name, column_name, data_type, udt_name, is_nullable
from information_schema.columns
where (table_schema='auth' and table_name='users' and column_name in ('id','email','email_confirmed_at'))
   or (table_schema='storage' and table_name='buckets' and column_name in ('id','name','public','file_size_limit','allowed_mime_types'))
   or (table_schema='storage' and table_name='objects' and column_name in ('id','bucket_id','name'))
order by table_schema,table_name,ordinal_position;

-- Every following collision query must be empty before first installation.
select nspname as conflicting_schema from pg_namespace where nspname='commerce_private';
select n.nspname,c.relname,c.relkind
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname like 'commerce\_%' escape '\'
order by c.relname;
select p.oid::regprocedure as conflicting_function
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('commerce_public_catalog','commerce_submit_application','commerce_owner_action','commerce_create_cod_order','commerce_admin_action')
order by 1;
select policyname from pg_policies
where schemaname='storage' and tablename='objects' and policyname like 'commerce\_%' escape '\'
order by policyname;
select id,name from storage.buckets where id='commerce-media' or name='commerce-media';

-- Inspect pre-existing shared behavior before installing new restrictive guards.
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname in ('public','auth','storage') order by 1,2,3;
select n.nspname,c.relname,t.tgname,t.tgisinternal,pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('public','auth','storage') order by 1,2,3;
select evtname,evtevent,evtenabled,evttags,evtfoid::regprocedure as event_function
from pg_event_trigger order by evtname;
select to_regclass('cron.job') as cron_job_relation;
select to_regnamespace('supabase_migrations') as migration_history_schema;
commit;
