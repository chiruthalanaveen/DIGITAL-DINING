-- Fictional loopback fixtures only. Requires commerce_rls_checkout.sql helpers.
begin;
select commerce_test.check_true(current_database()='commerce_test' and inet_server_addr() in ('127.0.0.1'::inet,'::1'::inet),'domain fixtures require isolated loopback commerce_test');
insert into auth.users(id,email,email_confirmed_at) values
 ('12000000-0000-4000-8000-000000000001','domain-owner-a@example.test',now()),
 ('12000000-0000-4000-8000-000000000002','domain-owner-b@example.test',now()),
 ('12000000-0000-4000-8000-000000000003','domain-unverified@example.test',null);
insert into public.commerce_websites(id,slug,name,status,owner_permissions) values
 ('22000000-0000-4000-8000-000000000001','domain-fixture-a','Domain Fixture A','active','{"branding":true}'),
 ('22000000-0000-4000-8000-000000000002','domain-fixture-b','Domain Fixture B','active','{"branding":true}'),
 ('22000000-0000-4000-8000-000000000003','domain-fixture-unverified','Domain Fixture Unverified','active','{"branding":true}');
insert into public.commerce_memberships(website_id,user_id,role) values
 ('22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','owner'),
 ('22000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000002','owner'),
 ('22000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000003','owner');

select commerce_test.check_true(not has_function_privilege('anon','public.commerce_domain_workspace(uuid)','EXECUTE') and not has_function_privilege('anon','public.commerce_domain_owner_action(uuid,text,jsonb)','EXECUTE'),'private domain RPCs remove inherited anon grants');
select commerce_test.check_true(not has_function_privilege('authenticated','public.commerce_domain_admin_action(uuid,text,jsonb)','EXECUTE') and has_function_privilege('service_role','public.commerce_domain_admin_action(uuid,text,jsonb)','EXECUTE'),'domain Admin RPC is service-only');
select commerce_test.check_true(not has_function_privilege('authenticated','commerce_private.valid_domain_hostname(text)','EXECUTE') and not has_function_privilege('service_role','commerce_private.valid_domain_hostname(text)','EXECUTE'),'hostname validation helper stays private');
select commerce_test.check_true(not has_table_privilege('anon','public.commerce_domains','SELECT') and not has_table_privilege('authenticated','public.commerce_domains','INSERT') and not has_table_privilege('service_role','public.commerce_domains','UPDATE'),'domain direct reads/writes do not bypass authorized RPCs');
select commerce_test.check_true((select prosecdef and proconfig=array['search_path=""'] from pg_proc where oid='public.commerce_resolve_domain(text)'::regprocedure),'public host resolver has fixed empty search path');

set local role authenticated;
select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000001',true);
select commerce_test.record('domain_a',public.commerce_domain_owner_action('22000000-0000-4000-8000-000000000001','claim','{"hostname":"shop.customer-domain.org"}'));
select commerce_test.check_true((public.commerce_domain_owner_action('22000000-0000-4000-8000-000000000001','claim','{"hostname":"shop.customer-domain.org"}')->>'id')=(select value->>'id' from commerce_test.state where key='domain_a'),'same tenant claim is idempotent');
select commerce_test.check_true((public.commerce_domain_workspace('22000000-0000-4000-8000-000000000001')->'domains'->0->>'active')='false','owner claim starts inactive and unverified');
select commerce_test.must_fail($q$select public.commerce_domain_owner_action('22000000-0000-4000-8000-000000000001','claim','{"hostname":"tampered.customer-domain.org","ownership_verified":true}')$q$,'owner cannot submit provider verification flags',array['22023']);
select commerce_test.must_fail($q$select public.commerce_domain_owner_action('22000000-0000-4000-8000-000000000001','activate','{}')$q$,'owner cannot activate domains',array['22023']);
select commerce_test.must_fail($q$insert into public.commerce_domains(website_id,hostname,claimed_by) values('22000000-0000-4000-8000-000000000001','direct.customer-domain.org','12000000-0000-4000-8000-000000000001')$q$,'owner cannot directly insert domain rows',array['42501']);
do $$ declare hostname text; begin
  foreach hostname in array array[
    'www.digitaldine-in.online','digitaldine-in.online','www.digitaldine-in.store','digitaldine-in.store',
    'digital-dining-alpha.vercel.app','digital-dining-digital-dining.vercel.app','anything.vercel.app',
    'tenant.digitaldine-in.online','localhost','shop.localhost','127.0.0.1','10.1.2.3','192.168.0.1','172.16.0.1',
    '169.254.169.254','[::1]','foo.internal','shop.local','admin.customer-domain.org','api.customer-domain.org',
    'UPPER.customer-domain.org','shop.customer-domain.org.','-bad.customer-domain.org','bad_.customer-domain.org',
    'https://shop.customer-domain.org','shop.customer-domain.org:443','shop.customer-domain.org/path','a..org',
    'customer-domain.x','host.arpa','metadata.customer-domain.org','vercel.customer-domain.org','local.customer-domain.org','internal.customer-domain.org'
  ] loop
    perform commerce_test.must_fail(format('select public.commerce_domain_owner_action(%L,%L,jsonb_build_object(%L,%L))','22000000-0000-4000-8000-000000000001','claim','hostname',hostname),'reserved/invalid domain rejected: '||hostname,array['22023']);
  end loop;
end $$;
select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000002',true);
select commerce_test.check_true((select count(*)=0 from public.commerce_domains),'cross-owner RLS hides domain proofs');
select commerce_test.must_fail($q$select public.commerce_domain_workspace('22000000-0000-4000-8000-000000000001')$q$,'cross-owner cannot view domain workspace',array['42501']);
select commerce_test.must_fail($q$select public.commerce_domain_owner_action('22000000-0000-4000-8000-000000000002','claim','{"hostname":"shop.customer-domain.org"}')$q$,'unique hostname claim protects other tenants',array['23505']);
select commerce_test.must_fail($q$select public.commerce_domain_owner_action('22000000-0000-4000-8000-000000000002','remove',jsonb_build_object('id',(select value->>'id' from commerce_test.state where key='domain_a')))$q$,'cross-owner cannot release another domain by ID',array['42501']);
select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000003',true);
select commerce_test.must_fail($q$select public.commerce_domain_owner_action('22000000-0000-4000-8000-000000000003','claim','{"hostname":"unverified.customer-domain.org"}')$q$,'unverified owner cannot claim a domain',array['42501']);
select commerce_test.must_fail($q$select public.commerce_domain_workspace('22000000-0000-4000-8000-000000000003')$q$,'unverified owner cannot view DNS proofs',array['42501']);
select set_config('request.jwt.claim.role','service_role',true);
select commerce_test.must_fail($q$select public.commerce_domain_admin_action('22000000-0000-4000-8000-000000000001','status','{}')$q$,'forged JWT role cannot execute domain Admin RPC',array['42501']);
reset role;
-- SET LOCAL ROLE from a superuser test connection retains the superuser's
-- session privileges. Change session authorization for this privilege check.
set session authorization authenticated;
select commerce_test.must_fail($q$select set_config('role','service_role',true)$q$,'authenticated role cannot SET ROLE to service_role',array['42501']);
reset session authorization;

-- Defense in depth: deliberately grant EXECUTE within this disposable fixture
-- to prove the function body rejects the forged claim independently of its ACL.
grant execute on function public.commerce_domain_admin_action(uuid,text,jsonb) to authenticated;
set local role authenticated;
select commerce_test.must_fail($q$select public.commerce_domain_admin_action(null,'status','{}')$q$,'actual PostgreSQL role guard rejects forged JWT even with accidental execute grant',array['42501']);
reset role;
revoke execute on function public.commerce_domain_admin_action(uuid,text,jsonb) from authenticated;

set local role service_role;
select commerce_test.must_fail($q$select public.commerce_domain_admin_action('22000000-0000-4000-8000-000000000001','activate',jsonb_build_object('id',(select value->>'id' from commerce_test.state where key='domain_a')))$q$,'Admin activation rejects unverified claim',array['22023']);
select commerce_test.must_fail($q$select public.commerce_domain_admin_action('22000000-0000-4000-8000-000000000002','record_verification',jsonb_build_object('id',(select value->>'id' from commerce_test.state where key='domain_a'),'ownership_verified',true,'deployment_verified',true,'tls_verified',true,'verification','[]'::jsonb,'provider_project_id','stub-project'))$q$,'Admin verification is scoped by website and domain composite identity',array['22023']);
select public.commerce_domain_admin_action('22000000-0000-4000-8000-000000000001','record_verification',jsonb_build_object('id',(select value->>'id' from commerce_test.state where key='domain_a'),'ownership_verified',true,'deployment_verified',true,'tls_verified',false,'verification','[{"type":"TXT","domain":"_vercel.shop.customer-domain.org","value":"private-proof-fixture"}]'::jsonb,'provider_project_id','stub-project'));
select commerce_test.must_fail($q$select public.commerce_domain_admin_action('22000000-0000-4000-8000-000000000001','activate',jsonb_build_object('id',(select value->>'id' from commerce_test.state where key='domain_a')))$q$,'Admin activation also requires TLS verification',array['22023']);
select public.commerce_domain_admin_action('22000000-0000-4000-8000-000000000001','record_verification',jsonb_build_object('id',(select value->>'id' from commerce_test.state where key='domain_a'),'ownership_verified',true,'deployment_verified',true,'tls_verified',true,'verification','[{"type":"TXT","domain":"_vercel.shop.customer-domain.org","value":"private-proof-fixture"}]'::jsonb,'provider_project_id','stub-project'));
reset role;
update public.commerce_domains set verified_at=clock_timestamp()-interval '16 minutes' where hostname='shop.customer-domain.org';
set local role service_role;
select commerce_test.must_fail($q$select public.commerce_domain_admin_action('22000000-0000-4000-8000-000000000001','activate',jsonb_build_object('id',(select value->>'id' from commerce_test.state where key='domain_a')))$q$,'Admin activation rejects stale provider verification',array['22023']);
select public.commerce_domain_admin_action('22000000-0000-4000-8000-000000000001','record_verification',jsonb_build_object('id',(select value->>'id' from commerce_test.state where key='domain_a'),'ownership_verified',true,'deployment_verified',true,'tls_verified',true,'verification','[{"type":"TXT","domain":"_vercel.shop.customer-domain.org","value":"private-proof-fixture"}]'::jsonb,'provider_project_id','stub-project'));
select public.commerce_domain_admin_action('22000000-0000-4000-8000-000000000001','activate',jsonb_build_object('id',(select value->>'id' from commerce_test.state where key='domain_a')));
reset role;
set local role anon;
select commerce_test.check_true(public.commerce_resolve_domain('shop.customer-domain.org')='domain-fixture-a','public resolver returns verified active store slug');
select commerce_test.check_true(public.commerce_resolve_domain('unknown.customer-domain.org') is null and public.commerce_resolve_domain('www.digitaldine-in.online') is null and public.commerce_resolve_domain('SHOP.customer-domain.org') is null,'public resolver rejects unknown, reserved and noncanonical hosts');
select commerce_test.must_fail('select verification from public.commerce_domains','public cannot read private DNS proof',array['42501']);
reset role;
update public.commerce_websites set status='suspended' where id='22000000-0000-4000-8000-000000000001';
select commerce_test.check_true(public.commerce_resolve_domain('shop.customer-domain.org') is null,'suspended website never resolves through active domain');
set local role authenticated;
select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000001',true);
select commerce_test.must_fail($q$select public.commerce_domain_owner_action('22000000-0000-4000-8000-000000000001','claim','{"hostname":"suspended.customer-domain.org"}')$q$,'suspended website domain mutations are read-only',array['42501']);
reset role;
update public.commerce_websites set status='active',owner_permissions='{"branding":false}' where id='22000000-0000-4000-8000-000000000001';
set local role authenticated;
select commerce_test.check_true((select count(*)=0 from public.commerce_domains),'revoked branding permission immediately hides DNS proofs');
select commerce_test.must_fail($q$select public.commerce_domain_owner_action('22000000-0000-4000-8000-000000000001','remove',jsonb_build_object('id',(select value->>'id' from commerce_test.state where key='domain_a')))$q$,'revoked branding permission prevents releasing domains',array['42501']);
reset role;
update public.commerce_websites set owner_permissions='{"branding":true}' where id='22000000-0000-4000-8000-000000000001';
set local role authenticated;
select commerce_test.check_true((public.commerce_domain_workspace('22000000-0000-4000-8000-000000000001')->'domains'->0->'verification'->0->>'value')='private-proof-fixture','authorized verified owner can view DNS instructions');
reset role;
set local role service_role;
select public.commerce_domain_admin_action('22000000-0000-4000-8000-000000000001','record_verification',jsonb_build_object('id',(select value->>'id' from commerce_test.state where key='domain_a'),'ownership_verified',false,'deployment_verified',false,'tls_verified',false,'verification','[]'::jsonb,'provider_project_id','stub-project'));
reset role;
select commerce_test.check_true(public.commerce_resolve_domain('shop.customer-domain.org') is null and (select not active and verified_at is null from public.commerce_domains where hostname='shop.customer-domain.org'),'failed fresh provider verification clears active routing and verification');
set local role authenticated;
select public.commerce_domain_owner_action('22000000-0000-4000-8000-000000000001','remove',jsonb_build_object('id',(select value->>'id' from commerce_test.state where key='domain_a')));
select commerce_test.record('domain_unverified',public.commerce_domain_owner_action('22000000-0000-4000-8000-000000000001','claim','{"hostname":"released.customer-domain.org"}'));
select public.commerce_domain_owner_action('22000000-0000-4000-8000-000000000001','remove',jsonb_build_object('id',(select value->>'id' from commerce_test.state where key='domain_unverified')));
select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000002',true);
select commerce_test.must_fail($q$select public.commerce_domain_owner_action('22000000-0000-4000-8000-000000000002','claim','{"hostname":"shop.customer-domain.org"}')$q$,'released verified tenant history prevents reuse of provider project proof by another tenant',array['23505']);
select commerce_test.record('domain_b',public.commerce_domain_owner_action('22000000-0000-4000-8000-000000000002','claim','{"hostname":"released.customer-domain.org"}'));
select commerce_test.check_true((select value->>'ownership_verified'='false' and value->>'active'='false' and value->'verification'='[]'::jsonb and value->>'id'<>(select value->>'id' from commerce_test.state where key='domain_a') from commerce_test.state where key='domain_b'),'released hostname can be freshly claimed without inheriting prior provider proof');
reset role;
select commerce_test.check_true((select count(*)=2 and count(*) filter(where released_at is not null)=1 from public.commerce_domains where hostname='released.customer-domain.org'),'domain release preserves prior claim history');
select commerce_test.check_true(not exists(select 1 from public.commerce_audit_logs where action like 'domain_%' and (coalesce(before_data,'{}'::jsonb) ?| array['verification','provider_project_id','claimed_by'] or coalesce(after_data,'{}'::jsonb) ?| array['verification','provider_project_id','claimed_by'])),'domain audit snapshots exclude private provider proof and credentials');
select commerce_test.check_true((select balance_paise=123456 and order_history='[{"order":"existing","payment":"preserved"}]'::jsonb from public.legacy_preservation_fixture where id=1),'domains preserve legacy wallet and order history fixture');
select commerce_test.check_true((select count(*)=1 and bool_and(schedule='0 0 * * *' and command='existing settlement fixture' and active) from cron.job),'domains preserve existing cron and create no jobs');
commit;
