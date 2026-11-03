# Verified commerce domain review

Source implementation on `feature/commerce-expansion`; no hosted SQL,
deployment, domain registration, DNS change, certificate issuance or provider
mutation was performed. Custom-host routing defaults off. Provider tests use
stubbed responses; local PostgreSQL is not hosted Supabase/provider acceptance.

## Migration and preservation

`supabase/migrations/20261103090000_commerce_verified_domains.sql` adds one
table, `commerce_domains`, two private helpers, four public RPCs, one SELECT
RLS policy and four explicit indexes (plus primary/composite unique indexes).
The earlier contract's `20261102163000` name is superseded by this unique
timestamp; apply only the actual file once. It replaces no existing function,
policy or trigger, performs no existing-row DML or legacy-table ALTER, and
installs no cron. Existing Auth, commerce, wallet/payment/order history and
restaurant/delivery/resort modules remain unchanged by this migration.

Claims have a website FK, a `(website_id,id)` unique key and a partial unique
hostname index for unreleased claims. Every mutation locks and rechecks the
website/claim. A previously verified hostname stays protected against another
tenant even after release or a later failed verification: the durable
`ownership_verified_at` marker is never cleared. Previously unverified released
claims may be claimed again. There is no cross-tenant transfer shortcut; any
future transfer needs a separately reviewed ownership protocol.

All functions have a fixed empty search path and qualified references. Owners
need verified email, current membership, the existing branding permission and
an editable website for mutations. Direct DML is revoked from PUBLIC, anon,
authenticated and service_role. Authenticated SELECT uses RLS; service_role
changes use the dedicated Admin RPC. Its service guard checks the actual
PostgreSQL role/session privilege, rather than accepting a forged JWT role
claim. Audit snapshots omit private proof, provider identifiers and claimant
identity. Public resolution returns only an active website's slug, never
domain rows, proof, customer data or provider configuration.

Owner RPCs: `commerce_domain_workspace(uuid)` and
`commerce_domain_owner_action(uuid,text,jsonb)` (`claim`, `remove`). Admin RPC:
`commerce_domain_admin_action(uuid,text,jsonb)` (`status`,
`record_verification`, `activate`, `deactivate`). Resolver:
`commerce_resolve_domain(text) returns text` (slug or null). Removal releases
and disables the claim while retaining its history. Activation requires an
active website and ownership, deployment and TLS checks saved within 15 minutes.
A failed check disables an existing active claim and clears its current
verification state while retaining historical ownership protection.

## Server configuration and provider contracts

All keys below are server-only; do not prefix them with NEXT_PUBLIC or send
them in browser/catalog responses. Both flags default off and require exactly
`true`. Setting flags or calling provider mutation routes requires separate
operator approval; this implementation did neither.

| Environment key | Purpose |
| --- | --- |
| `COMMERCE_CUSTOM_DOMAINS_ENABLED` | Enables claims, checks and host routing; otherwise existing platform routing continues. Release/deactivation remain available. |
| `COMMERCE_DOMAIN_PROVISIONING_ENABLED` | Separately allows Admin registration/verification POSTs; does not activate a claim. |
| `COMMERCE_VERCEL_PROJECT_ID` | Explicit approved `prj_…` project; no embedded project ID. |
| `COMMERCE_VERCEL_TEAM_ID` | Explicit approved `team_…` scope for every request. |
| `COMMERCE_VERCEL_API_TOKEN` | Least-privilege server token with the required approved project/domain/certificate capabilities. Never logged or returned. |
| `COMMERCE_DOMAIN_BASE_HOSTNAME` | Optional external base for generated single-label names; configuration alone establishes no readiness. |

The implementation follows the offline official Vercel SDK contracts inspected
under `/workspace/.digital-dining-deployment-tools/sdk-inspect/package/src/`:
`models/{addprojectdomainop,getprojectdomainop,verifyprojectdomainop,getdomainconfigop,getaliasop,getdeploymentresponsebody,getcertsop}.ts`
and corresponding `funcs` files. No user-supplied provider URL is accepted.
Every URL uses `https://api.vercel.com`, configured team scope, bounded timeout,
no cache, and redirects rejected. No outbound request targets a tenant hostname,
so a public hostname resolving to a private address cannot create SSRF here.

| Operation | Official endpoint | Guard/result |
| --- | --- | --- |
| Admin `provision` | POST `/v10/projects/{project}/domains`, body `{name}` | Signed Admin, same origin, saved tenant claim and both flags/config required. No submitted hostname/project/redirect is accepted. Registration does not prove activation. |
| Admin `verify` | POST `/v9/projects/{project}/domains/{hostname}/verify` | Same guards; no certificate/DNS/alias mutation endpoint is called. Followed by independent GET checks. |
| Project ownership | GET `/v9/projects/{project}/domains/{hostname}` | Exact name/project, `verified=true`, no redirect/branch/custom environment. |
| DNS configuration | GET `/v6/domains/{hostname}/config?projectIdOrName={project}` | `misconfigured=false` plus A/CNAME/http configuration. `dns-01` alone is insufficient to establish serving traffic. |
| Alias/deployment | GET `/v4/aliases/{hostname}?projectId={project}` then GET `/v13/deployments/{id}` | Exact alias/project, READY Production deployment, assigned alias, no alias error, deletion or redirect. |
| TLS | GET `/v8/certs` | Current certificate matching exact hostname or precisely one wildcard label. Missing metadata stays pending. |

Admin `check` and `activate` run fresh read-only provider checks. Only a passing
`activate` calls the SQL activation action. Provider errors return a bounded
application error without raw provider bodies and persist failed verification
to disable stale routing when the database is available. An ambiguous POST must
be followed by `check` before retrying; a successful remote response alone does
not claim local activation. No automatic retry or background provider worker is
installed. Certificate listing follows the SDK's supported response; unavailable
or absent certificate metadata fails closed even when an operator believes TLS
is ready. Continued DNS/alias/certificate drift needs explicit operational
rechecks; there is no new cron claiming perpetual online verification.

Generated claims accept only a single validated label. The server first reads
the configured `*.base` project domain and DNS configuration and requires a
current certificate explicitly covering `*.base`; an exact certificate for a
sample child is insufficient. Only then does it reserve `label.base` through
the normal SQL claim action. A generated claim still requires its own provider,
deployment, TLS checks and Admin activation. Missing wildcard metadata/DNS is
reported unavailable, never fabricated as a connected subdomain.

## API, UI and host routing

Owner GET/POST `/api/commerce/workspace/[websiteId]/domains` reuses the verified
owner context, same-origin mutation guard, explicit Zod schemas and branding
permission. It uses the owner's anon-key/Bearer client. Admin GET/POST
`/api/commerce/admin/domains` uses the existing signed Admin session and
same-origin guard. Admin payloads contain only website ID, action and claim ID;
verification booleans and provider/project/host overrides are rejected.

`CommerceDomainsPanel` accepts `{website,client,readOnly}`. A read-only panel
without a browser commerce client uses the signed-cookie Admin GET endpoint;
it never constructs or impersonates an owner JWT. It shows honest
disabled/loading/error/pending/verified/active/released states, authorized TXT
instructions, custom claims and verified-base generated names. Read-only owners
cannot submit mutations. Browser responses project out provider project ID and
claimant identity. Proof is private and appears only in authorized owner/Admin
workspace responses with `private, no-store` caching.

`CommerceAdminDomainsPanel` provides signed-cookie Admin registration,
ownership verification, connection checks, activation and deactivation for a
selected website. Safe API readiness flags disable unavailable actions; active
domains can still be deactivated with the feature off. It displays each check,
private DNS instructions, loading/errors and actual returned status. Activation
requires a verified claim and active website, then rechecks everything server-side.

Routing consults only the Host authority, never X-Forwarded-Host or Forwarded.
It rejects invalid names, IP literals, reserved/local names, `.vercel.app`,
platform domain descendants and every published primary alias:

- `www.digitaldine-in.online`
- `digitaldine-in.online`
- `www.digitaldine-in.store`
- `digitaldine-in.store`
- `digital-dining-alpha.vercel.app`
- `digital-dining-digital-dining.vercel.app`

Primary aliases keep their existing routing and redirects. With the flag on,
verified custom-host `/` and `/account` rewrite to that slug's existing store
pages; same-host `/shops/<own-slug>` links redirect to the corresponding
canonical root/account URL while keeping query parameters. Other tenant shop
paths return 404 on a resolved custom host. Maintenance runs before commerce
routing; Admin/auth/asset exceptions and the API/_next matcher remain intact.
Resolver failures never select a tenant or fall back to private table reads.

## Development verification and exact installation

Actual isolated PostgreSQL 18.4 loopback checks on port 55454 passed:
73 committed domain assertions, 72 baseline assertions and two separate
connection claim-concurrency checks (147 total). Tested chain: foundation,
catalog, customer, growth, then this migration, in a synthetic `commerce_test`
database. The fixture server was stopped after verification. This does not
establish PostgreSQL 17 hosted Supabase Auth/RLS or real Vercel/DNS/TLS behavior.
Root's shared database runner independently covers the integration chain.

Focused source checks pass: 27 domain/API/provider/proxy tests via
`node tests/commerce-domains.test.mjs`, and ESLint with zero errors/warnings
for the new domain JS/JSX/routes/tests and proxy. `node --test
tests/commerce-domains.test.mjs` also passes (this environment reports the file
as one wrapper test). Full build/test/lint/browser results are recorded by the
parent implementation report; this file does not substitute a source test for
hosted acceptance.

Only on an identified, independently verified development database, use a
dedicated commerce fixture and the migration chain in order. The installed
foundation must never be replayed on the hosted project. Do not use `db push`,
repair hosted migration history, point a destructive fixture at main, or apply
the separate subscription/payment migration as part of this domain step.

```sh
# Set DOMAIN_DEV_DATABASE_URL securely to an isolated loopback development DB.
# Refuse a hosted target; inspect host/port/name before any fixture reset.
psql "$DOMAIN_DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/commerce_bootstrap.sql
psql "$DOMAIN_DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261022160000_commerce_foundation.sql
psql "$DOMAIN_DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261102160000_commerce_catalog_fulfillment.sql
psql "$DOMAIN_DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261102161000_commerce_customer_experience.sql
psql "$DOMAIN_DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261102162000_commerce_growth_notifications.sql
psql "$DOMAIN_DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261103090000_commerce_verified_domains.sql
psql "$DOMAIN_DEV_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/commerce_verified_domains.sql
```

The bootstrap and tests are synthetic-fixture tools, never hosted installation
steps. A future approved hosted application must first reconcile the documented
installed foundation and absent migration ledger, inspect prerequisite metadata,
apply only approved new files once using the reviewed SQL Editor workflow, then
run the following read-only checks against the explicitly approved target.
No hosted target is currently approved for this migration.

```sql
select to_regclass('public.commerce_domains');
select relrowsecurity from pg_class where oid='public.commerce_domains'::regclass;
select policyname,roles,cmd,qual from pg_policies
  where schemaname='public' and tablename='commerce_domains';
select grantee,privilege_type from information_schema.role_table_grants
  where table_schema='public' and table_name='commerce_domains';
select p.proname,p.prosecdef,p.proconfig,p.proacl from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','commerce_private') and p.proname in
  ('valid_domain_hostname','domain_owner_access','commerce_domain_workspace',
   'commerce_domain_owner_action','commerce_domain_admin_action','commerce_resolve_domain');
select indexname,indexdef from pg_indexes
  where schemaname='public' and tablename='commerce_domains';
-- Counts and flags only; do not include private TXT proof in public artifacts.
select active,ownership_verified,deployment_verified,tls_verified,count(*)
  from public.commerce_domains group by 1,2,3,4;
```

## Approved activation and rollback considerations

Future operator acceptance must use a domain the tenant controls, approved
server project/team credentials, and explicit provider activation approval.
Review the saved tenant claim before enabling provisioning; do not create DNS,
alias or certificate records merely to test this source. After approved
registration, show only the official private TXT proof and provider-recommended
DNS configuration to the tenant. The tenant must preserve existing mail and
other DNS records. Verify wildcard DNS separately for generated names. Recheck
project ownership, correct Production deployment/alias and current certificate,
then activate through signed Admin. Use the public custom hostname with valid
TLS to check store/account/canonical redirects, other-tenant rejection,
maintenance/auth/API behavior and all six unchanged primary aliases. Real hosted
Auth ownership/RLS, DNS propagation, provider limits and certificate acceptance
remain pending; no local result claims these passed.

Rollback first sets both flags off through the separately approved configuration
workflow and deactivates affected claims through signed Admin if available.
Retain the table, claim/proof history and durable verified-ownership markers.
Application rollback can leave these additive objects in place; do not drop
them, delete verified claims, clear ownership history, revoke unrelated grants
or restore legacy data snapshots. A previously registered provider domain/DNS
record may outlive application rollback; removal is a distinct reviewed
provider/DNS operation requiring the tenant/operator's approval and preservation
of other sites/mail. There is deliberately no destructive SQL rollback shortcut.
