# Phase 1 database installation and verification

This feature requires a SQL migration:
[`supabase/migrations/20261022160000_commerce_foundation.sql`](../../supabase/migrations/20261022160000_commerce_foundation.sql).
It was applied and tested on an isolated local PostgreSQL 18.4 database. No
production database, hosted Supabase project, existing customer record, payment,
wallet, order, or scheduled job was modified.

There is no separate development/staging Supabase project available. The local
tests verify actual PostgreSQL constraints, functions, RLS, transactions and
concurrency using small Auth/Storage fixtures. They do **not** establish hosted
Supabase compatibility. Real Auth hooks, signup/email flows, Storage HTTP uploads
and public delivery, PostgREST schema exposure and deployed policy compatibility
remain pending verification against a dedicated Supabase development project.

## What the migration changes

The transaction creates nine new `public.commerce_*` tables, a private helper
schema, tenant-scoped RLS policies, five public RPCs and a dedicated public
`commerce-media` image bucket. It never alters existing business tables, functions,
payment/wallet procedures, RLS policies, grants or cron definitions. The public
catalog RPC returns explicit public fields; private tables are not anonymous APIs.
Only the trusted server's service role can execute the administrative RPC or read
administrative audit snapshots. Authenticated owners/customers cannot directly
write settings, inventory, memberships or orders.

New Storage policies apply to `commerce-media`. Restrictive INSERT, UPDATE and
DELETE guards prevent pre-existing broad permissive policies from bypassing
website ownership. For other buckets the guards evaluate true, preserving
existing policy behavior. Within `commerce-media`, inserts require a website UUID
path prefix, an active owner membership, products or branding permission, and a
website in setup/active state. Uploaded objects are immutable to owners: use a new
UUID for each upload, then update the permitted product/branding URL. Owner
updates and deletes are denied even for their own objects, preventing product
permission from replacing an existing branding image's bytes and vice versa.
Unused images require a separately reviewed administrative retention process;
this module does not delete them. Media is intentionally public; upload only images
intended for the storefront. The bucket allows JPEG/PNG/WebP and at most 5 MB.
HTTPS image URLs are accepted, with HTTP permitted only for explicit loopback
development hosts (`localhost` or `127.0.0.1`).

Checkout is COD only. Prices and totals come from database product rows, product
locks prevent overselling, and identical idempotency-key retries return the same
order. Inventory is consumed only while the inventory feature is enabled; each
order snapshots whether inventory was tracked. Cancellation releases tracked
inventory once, including when website settings later change. Existing payment
processing, wallet settlement and cron jobs are not invoked.

The migration is atomic and intentionally fails on existing names, including an
existing `commerce-media` bucket, rather than overwriting them. It is a one-time
migration, not an idempotent seed. A failure rolls back its transaction; inspect
and resolve the cause before retrying. Do not bypass a conflict by deleting data.

## Run the isolated database tests

From the repository root, install dependencies with `npm ci`. Use a disposable
local PostgreSQL server reachable through TCP. The database role must be able to
create databases and roles for the test-only bootstrap. For the server used in
this workspace, run exactly:

```sh
COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55438/commerce_test node scripts/test-commerce-db.mjs
```

The equivalent npm command is:

```sh
COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55438/commerce_test npm run test:commerce:db
```

The runner accepts only an explicitly supplied loopback URL whose database name is
`commerce_test`, checks the server's actual address, rejects host overrides, and
resets **only that disposable database**. It does not infer `DATABASE_URL`, read
production credentials or apply anything to the application's configured
Supabase project. It connects to the local `postgres` management database only to
drop/recreate `commerce_test`.

On another development machine with PostgreSQL command-line tools installed,
start a separate disposable cluster before running the same command:

```sh
initdb -D /tmp/digital-dining-commerce-dev -U postgres -A trust --no-locale --encoding=UTF8
pg_ctl -D /tmp/digital-dining-commerce-dev -l /tmp/digital-dining-commerce-dev.log -o '-h 127.0.0.1 -p 55438' start
COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55438/commerce_test npm run test:commerce:db
pg_ctl -D /tmp/digital-dining-commerce-dev stop
```

Use a fresh directory and an available port. These example trust credentials are
for an isolated loopback fixture only. `initdb` must run as a non-root OS user.
Never point the test runner, bootstrap or fixture SQL at a shared development or
hosted Supabase database.

The completed security run used a second isolated loopback cluster on port
`55439` while browser tests retained port `55438`. Its exact command was:

```sh
COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/commerce_test node scripts/test-commerce-db.mjs
```

It passed **64 PostgreSQL assertions**. The tests cover tenant
reads and mutations, composite foreign keys, private RPC/table grants, safe public
catalog fields, verified owner/application approval, feature and permission
checks, suspension, image path isolation, anonymous image-write denial, legacy
bucket access, database price calculation, failed checkout rollback, duplicate
cart lines, idempotent replay, once-only cancellation/restocking, simultaneous
last-unit purchases and simultaneous identical retries. Separate connections also
verify that owner mutations recheck membership and permissions after waiting for
an administrative revocation lock. Default function EXECUTE grants are deliberately
installed before the migration to verify its explicit role revocations. Legacy balance/order
fixtures, exact RLS/grant definitions, storage policies and a scheduled-job fixture
remain unchanged. The scheduled-job fixture does not exercise the `pg_cron`
extension itself.

## Apply to a dedicated Supabase development project

Do this only after creating and positively identifying a separate development
project. No hosted application of this migration was performed in this workspace.
Never use production as a substitute for the missing development project. A
future production migration requires the user's explicit approval for this exact
migration and independently verified target; development approval is insufficient.

1. Add the development project's database URL securely as
   `DEVELOPMENT_DATABASE_URL`. Use that project's development-only API URL, anon
   key and server-only service-role key in the application environment. Do not
   print credentials, commit environment files, or expose the service key through
   any `NEXT_PUBLIC_*` setting.
2. Verify the connection hostname/project reference against the development
   dashboard. Inspect the target, existing policy definitions, Auth triggers and
   scheduled jobs before applying. Capture their definitions securely for an
   after-application comparison. This read-only identity check does not prove that
   the environment is development; the project reference must be checked too.

```sh
psql "$DEVELOPMENT_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c 'select current_database(), current_user, host(inet_server_addr()), version();'
psql "$DEVELOPMENT_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "select nspname from pg_namespace where nspname = 'commerce_private'; select tablename from pg_tables where schemaname = 'public' and tablename like 'commerce\\_%' escape '\\'; select id from storage.buckets where id = 'commerce-media';"
psql "$DEVELOPMENT_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check from pg_policies order by schemaname, tablename, policyname;"
psql "$DEVELOPMENT_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "select n.nspname, c.relname, t.tgname, pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where not t.tgisinternal and n.nspname in ('auth','public','storage') order by 1,2,3;"
psql "$DEVELOPMENT_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "select to_regclass('cron.job') as cron_job_table;"
```

If `cron.job` exists and the development role can read it, inspect
`SELECT jobid, schedule, command, active FROM cron.job ORDER BY jobid;` through a
secure development SQL session. Job commands may contain secrets; keep results
private. Existing RLS policies, triggers, grants and jobs must retain their
definitions after installation. The migration requires standard Supabase `auth`,
`storage`, `anon`, `authenticated` and `service_role` objects. Stop if those
prerequisites or the proposed names differ; do not install the local bootstrap.

3. Take a normal development database backup using the project's supported
   backup process. Apply only the versioned migration, then run the read-only
   inspection file:

```sh
psql "$DEVELOPMENT_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/migrations/20261022160000_commerce_foundation.sql
psql "$DEVELOPMENT_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/commerce_verify.sql
```

The migration includes `BEGIN`/`COMMIT` and requests a PostgREST schema reload.
It does not edit Supabase's migration-history table when applied with `psql`.
Record the filename and successful application in the project's normal release
log. If that project manages schema exclusively through the Supabase CLI, import
this versioned file into its existing migration history and apply it through that
established workflow instead; do not blindly run `supabase db push` alongside
unreviewed or out-of-sync migrations.

4. Recompare the existing policy, grant, trigger and cron definitions captured
   before installation. In the development app, create verified test owner and
   buyer accounts. Verify approval/setup/activation, owner isolation, customer
   order isolation, a COD test order and cancellation, and image uploads/downloads
   through the real Supabase HTTP services. In a second tenant verify that the
   first owner cannot read private rows, mutate catalog/order/settings or write
   that tenant's image prefix. Confirm existing restaurant, delivery, wallet and
   order workflows still work using development fixtures. Do not process a real
   payment as a test.

## Read-only verification queries

[`supabase/tests/commerce_verify.sql`](../../supabase/tests/commerce_verify.sql)
runs inside a read-only transaction. Expected results:

- Nine new tables all have RLS enabled. Anonymous SELECT and authenticated direct
  writes are false; authenticated SELECT is true except on audit logs.
- Five public commerce functions have fixed empty search paths and are security
  definers. Only catalog grants anonymous EXECUTE. Only service_role grants Admin
  EXECUTE. Application/owner/checkout RPCs grant authenticated EXECUTE.
- The bucket is public, has a 5,242,880-byte limit, and exactly the three image MIME
  types. Six restrictive storage write guards supplement the owner policy.
- Product/category and order/customer/item foreign keys carry `website_id`.
- Activation/negative stock/invalid total queries return zero rows. Catalog
  visibility matches active, non-pharmacy, catalog-enabled websites.

Inspect policy definitions as well as grants; grants alone do not establish tenant
isolation. Never emulate Auth JWT claims or use the destructive fixture scripts
against a deployed project. Test hosted RLS using real development user sessions.

## Rollback while preserving data

If the migration fails before commit, PostgreSQL rolls back its new objects and
bucket metadata together. Review the error and database state; do not delete an
existing bucket or suppress validation to force a retry.

After a successful migration, the safest rollback is to roll back the application
feature while leaving the additive database objects and all new customer/order
history intact. Use the administrative interface to suspend affected commerce
websites when stopping sales is authorized. Suspension hides the public catalog,
rejects new checkouts and owner mutations, and preserves readable history.
Existing non-commerce tables, policies, wallet/payment procedures and cron jobs
require no rollback because the migration does not change them.

There is no automatic destructive down migration. Dropping the commerce tables,
bucket or storage objects would destroy or orphan tenant orders, customers, audit
history and images. If database access itself must be disabled, prepare a separate
reviewed forward migration revoking the new commerce RPC grants and restricting
only this module's policies. Retain data and verify the remaining application
before release. Any later permanent removal needs a backup, data-retention/export
decision, dependency review and explicit approval for its target environment.
