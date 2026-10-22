# Existing-feature and data preservation review

Reviewed source: [`20261022160000_commerce_foundation.sql`](../../supabase/migrations/20261022160000_commerce_foundation.sql).
SHA-256: `dd2882f6329808783b1d4d97c4264f59989b7e834753aa06efe46d63855db1ca`.

This is a static source review plus an explanation of the existing local
PostgreSQL tests. It is **not** certification of the deployed Supabase database.
No production SQL, row inspection, backup, migration or recovery was performed
for this document. A separate hosted development/staging project and its
credentials are still required for the requested hosted verification.

## Exact database effects

The migration opens one transaction and adds one private schema, nine
`public.commerce_*` tables, twelve functions (five public RPCs and seven private
helpers), six explicitly named indexes, primary-key/unique/check/foreign-key
constraints, eight SELECT policies on new commerce tables, seven Storage policies
and one new `commerce-media` bucket metadata row. It enables RLS on the nine new
tables and sets grants only on the new commerce objects. It sends a PostgREST
schema-reload notification before commit.

| Existing area | What the migration does | Preservation conclusion and limit |
| --- | --- | --- |
| Restaurant, manager/staff, delivery and resort tables | No `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `DROP`, schema rewrite or privilege changes target these tables. | Their rows and definitions are not mutation targets in this SQL. Full running workflows still require staging regression tests. |
| Existing wallets, payments, settlements and order histories | No existing payment/wallet/order function is replaced or invoked. Commerce COD order creation writes only new commerce customers/orders/items/products. | It does not debit a wallet, contact a payment provider, create a payment transaction or alter existing order history. |
| Existing customer tables | No mutation statement targets a pre-existing customer table. | `commerce_customers` is a separate tenant/customer relation; its snapshots do not overwrite a restaurant/delivery customer profile. |
| `auth.users` | Five new foreign keys reference existing verified Auth identities; RPCs read Auth identity/verification. | No Auth row is inserted, rewritten or deleted by the migration. The foreign keys add a future account-deletion constraint, explained below. |
| `storage.buckets` | Checks that `commerce-media` does not already exist, then inserts that new bucket only. | Existing bucket rows are not updated or deleted. A name conflict fails and rolls back; it is not silently overwritten. |
| `storage.objects` | Adds seven policies to this existing shared table. No object rows or bytes are changed at installation. | Existing policy definitions remain, but this is an intentional change to the table's policy set. Hosted coexistence must be tested. |
| Existing functions and user-defined triggers | Uses `CREATE FUNCTION` under new names, not `CREATE OR REPLACE`; no existing user-defined trigger is replaced/disabled. | Existing function/trigger bodies are not rewritten. New foreign keys do install PostgreSQL internal referential-integrity triggers. |
| Cron/scheduled jobs | No `cron` table mutation, `cron.schedule`, `cron.unschedule`, extension installation or job-function replacement. | Existing job definitions are not migration targets. The local cron fixture is not a running `pg_cron` integration test. |

There is no `DELETE`, `TRUNCATE`, `DROP`, or explicit `CREATE TRIGGER` statement in
the migration. The only `ALTER TABLE` statements enable RLS on newly created
commerce tables. There is no `ALTER DEFAULT PRIVILEGES` in the migration; the
local bootstrap deliberately adds permissive defaults to test that new function
grants are hardened against them.

These observations establish the SQL's intended mutation boundary. They cannot
prove that unknown hosted event triggers, Auth hooks, extensions or custom
policies will have no interaction with new DDL. Existing hosted definitions and
runtime behavior must be compared on staging before release.

## Shared Storage policy behavior

The new permissive `commerce_media_owner_access` policy applies only when
`bucket_id = 'commerce-media'`. A permitted owner can insert fresh objects into
their own website UUID prefix. The bucket is public and accepts JPEG/PNG/WebP
images up to 5 MiB, so it must never contain private documents or prescriptions.

Six restrictive INSERT/UPDATE/DELETE guards supplement existing permissive
policies for the `authenticated` and `anon` roles. For every other non-null
bucket ID, their expression `bucket_id <> 'commerce-media'` evaluates to true;
therefore they do not add a denial condition for existing buckets. Existing
permissive policies continue deciding access to those other buckets. For the new
bucket, anonymous writes are denied and authenticated updates/deletes are denied
even for an owner's own images. Each upload uses a fresh UUID; the owner changes
the permitted product or branding URL instead of overwriting another feature's
image bytes.

Existing broad permissive policies cannot bypass those new restrictive write
guards. Existing restrictive policies, table grants and helper-schema privileges
can still deny legitimate commerce uploads. The local tests include broad legacy
policies and a legacy bucket, but only the real staging Storage API can establish
compatibility with the hosted installation. Service-role/owner superuser access
is trusted and can bypass RLS; service keys must remain server-only.

## Auth deletion and retention compatibility

The sixteen new foreign keys use PostgreSQL's default non-deferrable
`ON DELETE NO ACTION` behavior. Five reference `auth.users(id)`:

- `commerce_memberships.user_id`
- `commerce_applications.applicant_user_id`
- `commerce_customers.user_id`
- `commerce_orders.customer_user_id`
- `commerce_audit_logs.actor_user_id`

These five constraints install ten internal referenced-side constraint triggers
on the existing Auth table. They do not rewrite an Auth row, but a subsequent
hard deletion/update of a referenced Auth identity can fail with a foreign-key
violation. This protects commerce history from accidental orphaning and is a
material future behavior change that must be reviewed.

The existing [`privacy-deletion-preflight` route](../../app/api/admin/privacy-deletion-preflight/route.js)
checks restaurant ownership, verifies an Auth account and checks delivery wallet
balances. It deliberately always returns blocked/manual review, includes a
general finding about other roles/businesses, and never executes deletion. It
does not explicitly inventory the five commerce dependencies. The existing
[`privacy-deletions` route](../../app/api/admin/privacy-deletions/route.js) records
review decisions through the existing RPC, not account deletion. The
[`register` rollback](../../app/api/register/route.js) can call Auth hard deletion
after a failed new restaurant record insertion; this needs a staging failure-path
check. The body of the hosted privacy-review RPC and any external Auth deletion
automation have not been verified from this repository.

Before release, test account-deletion/retention scenarios in staging for an
identity used by both legacy and commerce flows, including membership,
applications, completed orders and audit history. Any actual erasure/anonymization
or ownership succession needs an explicit reviewed retention workflow. Do not
change these foreign keys to `CASCADE`, delete historical records or detach Auth
references merely to make a deletion test pass. No SQL or privacy-flow change was
made by this documentation review.

## What the local preservation tests prove

[`commerce_bootstrap.sql`](../../supabase/tests/commerce_bootstrap.sql) installs
fictional objects only in the disposable loopback `commerce_test` database.
[`commerce_rls_checkout.sql`](../../supabase/tests/commerce_rls_checkout.sql)
checks the following before and after commerce operations:

- A sentinel balance remains exactly `123456` paise and its JSON order/payment
  history remains equal to the original value.
- That sentinel table's ACL, RLS-enabled flag and exact policy definitions remain
  equal to a pre-migration snapshot.
- A pre-existing Storage policy remains present; authenticated and anonymous
  write access to a separate legacy bucket retains its previous behavior while
  cross-tenant commerce writes are denied.
- A synthetic scheduled-job row retains its schedule, command and active flag.
- New private RPC/helper grants reject anonymous/authenticated callers even when
  the database has permissive default function grants.

The latest local review run reported 76 PostgreSQL assertions, including tenant
isolation, stock/idempotency concurrency and permission-revocation races. Those
are real PostgreSQL/RLS/transaction checks against test Auth/Storage scaffolding.
They are not copies of production data, full restaurant/delivery/resort/payment
workflow tests, a test of `pg_cron`, or a hosted Supabase compatibility result.
The account-deletion implications above still require explicit staging coverage.

## Application source boundary

Compared with feature baseline `4d036fb`, Phase 1 changes existing application
source only in `app/admin/dashboard/page.jsx`, adding the commerce navigation and
panel. New routes/helpers/components are separate; runtime dependencies are not
replaced. Test scripts/development packages, documentation and a branch-specific
Vercel Git-deployment guard are also added.

Compared with GitHub main `7385253`, the PR additionally contains prerequisite
maintenance-mode commit `4d036fb`. That earlier commit changes its own listed
maintenance/admin files and is part of the review diff; it must not be described
as new commerce-only source. See the [exact changed-file list](changes.md).

## Before/after hosted comparison

Use the read-only inventory in [backup-recovery.md](backup-recovery.md) on the
verified staging project before and after installation. Compare existing policy,
grant, function, trigger and cron definitions, including the expected new
Auth constraint triggers and Storage policies. Run legacy workflows with
development fixtures, then validate all tenant and customer boundaries using
actual Auth sessions and Storage/PostgREST HTTP calls. Unexpected changes or
unverified results keep the release blocked. Production execution, backup,
restore, merge and promotion require the user's separate explicit approval.
