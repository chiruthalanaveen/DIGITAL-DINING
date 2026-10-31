# Hosted Supabase staging verification — partial, migration blocked

Updated 25 October 2026 (Asia/Kolkata). Separate staging project
`gylicwwrmpqomregevqe` now has correctly shaped API/database settings. The strict
`validateStagingConfig` check passes: the API, database host and key references
identify staging, and database TLS verification is enabled. **The earlier two
incorrect-URL findings are resolved. Do not re-enter working keys or restore the
old values.** Production `wispidcdmunqzahjacws` remains forbidden and was not
contacted.

Actual hosted Auth testing completed **19 checks, zero failures**. Four uniquely
marked synthetic staging users were created: Saree owner, Grocery owner, customer
and an unverified owner. Real password sign-in and matching access-token identity
checks passed for the three confirmed fixtures; unverified and wrong-password
sign-in failed as expected. Missing/forged access tokens were denied, customer
refresh succeeded, local logout succeeded and the logged-out refresh token was
rejected. Fixture creation used staging Auth administrative confirmation; actual
signup email delivery, verification-link completion and recovery UI remain
untested. These are 19 bounded checks, not 19 full owner/customer journeys. The
four new fixtures were retained; no existing Auth user was deleted or modified.

**Hosted commerce migration and real tenant RLS/workflows remain blocked.** Direct
DNS lookup and `pg.Client.connect` both fail `EAI_AGAIN`/`getaddrinfo` on
`db.gylicwwrmpqomregevqe.supabase.co`. No direct TCP, TLS handshake, database
password validation or SQL followed. A standard CONNECT handshake through the
configured HTTP proxy to this host on port 5432 returned **HTTP 403**, before
sending PostgreSQL bytes or credentials. The response supplied no reason; it does
not establish a specific port policy, invalid password or IPv6 defect. Both the
exact API and direct database hosts already appear in the saved restricted
network configuration. A hostname allowlist alone does not prove that the
runtime has a supported PostgreSQL route.

HTTPS remains reachable. Auth settings and service-role REST metadata return
200. A read-only service-role query for `commerce_products` returns **404 /
`PGRST205`** and `commerce_public_catalog` RPC lookup returns **404 / `PGRST202`**.
These indicate missing commerce schema exposure, not successful tenant denial or
an RLS-isolation pass. Direct catalog state remains unverified. No commerce rows,
Storage objects or hosted SQL were written, and no staging-backed Vercel Preview
was created. See the current [PR #3 follow-up report](pr3-followup-report.md).

The earlier deployment
`https://digital-dining-6kfz79na2-digital-dining.vercel.app` targets production and
uses production configuration. It is not a staging Preview and must not receive
test writes. See [preview-and-environment.md](preview-and-environment.md).

## Strict guard, evidence and remaining access requirement

The [read-only preflight](../../scripts/test-commerce-staging.mjs) uses only:

| Variable | Required target |
| --- | --- |
| `COMMERCE_STAGING_PROJECT_REF` | `gylicwwrmpqomregevqe` |
| `COMMERCE_STAGING_SUPABASE_URL` | `https://gylicwwrmpqomregevqe.supabase.co` |
| `COMMERCE_STAGING_SUPABASE_ANON_KEY` | Matching staging anon/publishable key |
| `COMMERCE_STAGING_SUPABASE_SERVICE_ROLE_KEY` | Matching staging server-only service-role/secret key |
| `COMMERCE_STAGING_DATABASE_URL` | Verified staging direct or Session pooler PostgreSQL URI on port 5432, with staging database password and TLS |

It never falls back to production application variables. It rejects known
production, mismatched identities, URL overrides, transaction pooler port 6543 and
insecure TLS. Current validation passes, but the complete command still exits 1
because its database connection fails during name resolution:

```sh
node --test tests/commerce-staging-guard.test.mjs
node scripts/test-commerce-staging.mjs
```

The eight target-guard tests pass. A successful configuration check and key claims
alone do not authenticate a database or prove functional RLS. The complete
preflight opens only a read-only transaction, checks identity/table/RLS metadata,
rolls back, then checks Auth/REST. It never installs the migration or creates
fixtures, and always reports `hostedWorkflowTestsCompleted: false`.

Sanitized evidence is outside Git at
`/workspace/commerce-validation-artifacts/staging-current/`:

- `network-diagnosis.json`, `postgres-proxy-connect.json` and
  `postgres-proxy-response.json`: direct DNS/connection and proxy observations.
- `https-read-only.json`: authenticated staging Auth/REST reachability.
- `real-auth-results.json`: exact 19 Auth checks and retained synthetic fixture
  IDs. Passwords, access/refresh tokens and service keys are not included.
- `hosted-commerce-presence.json`: the two missing-schema exposure observations;
  no functional commerce pass is claimed.
- `staging-preinstall-review.sql`: original prepared inventory, now also available
  as checked-in [commerce_preinstall_verify.sql](../../supabase/tests/commerce_preinstall_verify.sql);
  **not executed** against hosted PostgreSQL.

### Supported ways to reach staging PostgreSQL

Use one of these supported routes without weakening TLS or network controls:

1. In staging **Connect → Connection String → URI**, obtain the exact **Session
   pooler URI on port 5432**. Securely set `COMMERCE_STAGING_DATABASE_URL` to that
   URI, with the database password URL-encoded and username
   `postgres.gylicwwrmpqomregevqe`. Add its actual hostname to the cloud network
   allowlist if needed, then rerun the guard/preflight. Do not guess its regional
   hostname or grant a wildcard to all poolers. This option has not been tested;
   the proxy may still reject the route.
2. Run the reviewed staging-only commands below on a trusted machine or staging
   CI runner with PostgreSQL access. Keep keys/database credentials in its secure
   settings and verify the staging identity before any migration.
3. An authorized operator can use this project's Supabase SQL Editor from an
   allowed browser/network after the backup and inventory prerequisites below.
   This is an alternative installation route, not a way for the cloud runtime to
   bypass its failed network path. Retain its output and rerun actual hosted
   Auth/RLS/Storage/workflow checks afterward.

Do not change the production application credentials, disable certificate
verification, substitute IP addresses or create an unreviewed SQL-over-HTTP RPC.
No supported PostgreSQL connection route has been demonstrated in this runtime.

## Pending migration identity and effects

The unchanged installation source is
[`20261022160000_commerce_foundation.sql`](../../supabase/migrations/20261022160000_commerce_foundation.sql),
SHA-256 `dd2882f6329808783b1d4d97c4264f59989b7e834753aa06efe46d63855db1ca`.
[migration-review.md](migration-review.md) explains all nine tables/103 columns,
twelve functions, six explicit plus nineteen constraint-backed indexes, sixteen
foreign keys and fifteen policies. There is no custom `CREATE TRIGGER`; FK
internal triggers include additions on `auth.users`. The only top-level insert
creates the public `commerce-media` bucket. No existing restaurant, delivery,
resort, wallet, payment, customer or order row is rewritten or cron/settlement
procedure called.

Seven policies affect shared `storage.objects`; five Auth foreign keys can
restrict later account hard deletion while commerce history references it. These
coexistence/lifecycle effects require hosted verification. Local synthetic
preservation is not certification of hosted policy/hooks or real legacy data.
The latest isolated PostgreSQL run passes **88 assertions**, including regression
coverage for a read-only verification-query correction: `service_access` now
requires SELECT **and** INSERT **and** UPDATE **and** DELETE, rather than treating
a comma-separated privilege list as proof of all grants. The installation
migration itself is unchanged. Fresh unit tests (82) and build pass; the prior
64 screenshots were not recaptured for this SQL-verification-only change.

For this diagnosis/documentation/verification-query repair: **No SQL migration
required.** The existing commerce migration remains uninstalled on hosted
staging by this work. No hosted backup or restore rehearsal is claimed. See
[preservation-review.md](preservation-review.md) and
[backup-recovery.md](backup-recovery.md).

## Staging installation from a trusted machine

These steps remain **unexecuted**. A verified target, working route, backup and
read-only inventory are prerequisites. Production execution is not authorized.

1. Select `gylicwwrmpqomregevqe` in the staging Supabase dashboard and confirm the
   project reference independently. Supply only staging credentials securely.
   Preserve verified TLS; if the project requires its own CA, install the
   documented CA in the trusted client's trust store rather than disabling checks.
2. From the trusted checkout of this PR, run the read-only preflight. Review its
   database identity/version and staging reference. Before installation, complete
   [backup-recovery.md](backup-recovery.md), including plan/backup availability,
   separate Storage bytes and a restore rehearsal where required. No backup
   artifact currently exists from this task. Do not copy raw production data.
3. Inventory roles/grants, existing policies/triggers/event triggers, Auth/Storage
   columns, bucket configuration, cron and migration history using the read-only
   queries in [backup-recovery.md](backup-recovery.md), [database.md](database.md)
   and the prepared private `staging-preinstall-review.sql` evidence file. Check
   the nine proposed names, `commerce_private`, five public RPC names,
   `commerce_media_*` policies and `commerce-media` bucket are absent. Stop on
   conflicts or missing privileges; do not overwrite existing objects.
4. Verify the migration checksum, then apply exactly the canonical file and run
   read-only verification:

   ```sh
   sha256sum supabase/migrations/20261022160000_commerce_foundation.sql
   node scripts/test-commerce-staging.mjs
   psql "$COMMERCE_STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/migrations/20261022160000_commerce_foundation.sql
   psql "$COMMERCE_STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/commerce_verify.sql
   node scripts/test-commerce-staging.mjs
   ```

   Keep the canonical transaction wrapper. Stop at the first error; do not rerun
   a partially understood migration. It intentionally rejects existing objects.
   Record filename/hash/target/results in the established migration release log;
   do not fabricate migration history or blindly run `supabase db push`.
5. Compare all pre-existing policies/grants/constraints/triggers, Auth/Storage and
   cron definitions and approved synthetic data snapshots. Expected changes are
   only the reviewed new commerce objects/bucket/policies and Auth FK triggers.
   Investigate every other difference before running the hosted matrix below.

### Alternative: exact staging SQL Editor sequence

These are manual steps for an authorized operator; **not actions completed by
this task**. They do not authorize production SQL.

1. Open the staging project at
   <https://supabase.com/dashboard/project/gylicwwrmpqomregevqe> and verify the
   Reference ID `gylicwwrmpqomregevqe` in its settings. Open **SQL Editor → New
   query** in that same project; do not use a production browser tab.
2. Complete the backup/recovery prerequisites above first. Record the four new
   synthetic Auth fixture IDs privately. Preserve all existing Auth/business/
   Storage data. A SQL Editor result export or schema inventory is not a
   restorable database/Storage backup.
3. Paste and run only the prepared **read-only** inventory from
   [`commerce_preinstall_verify.sql`](../../supabase/tests/commerce_preinstall_verify.sql),
   plus the relevant read-only backup inventory
   queries. Preserve outputs privately. Confirm supported UUID/Auth/Storage
   objects, installation privileges, no proposed-name/bucket collisions and
   understood shared policies/hooks/cron. Database name `postgres` alone does not
   identify the project; the dashboard reference is the target check.
4. Open the full canonical
   [`20261022160000_commerce_foundation.sql`](../../supabase/migrations/20261022160000_commerce_foundation.sql)
   from this PR. Verify its checksum against the value above. Paste the
   **entire file**, including its transaction wrapper, into a new staging query
   and run it once. Do not paste local bootstrap/test fixture SQL, execute
   fragments, replace existing functions or remove policies to make it pass.
5. Run the complete read-only
   [`commerce_verify.sql`](../../supabase/tests/commerce_verify.sql) in a separate
   staging query. All nine tables must have RLS enabled, anon table SELECT and
   authenticated direct writes denied, all four service-role table grants
   present, RPC privileges restricted as reviewed, bucket settings correct and
   invariant-error queries empty. Archive the result with the migration identity.
6. Repeat/compare the pre-install inventory and preserve migration history through
   the project's established workflow. The cloud PostgreSQL preflight may still
   fail until its network route is restored; report that separately. Once hosted
   objects are exposed, complete real tenant-RLS/Storage/application workflows
   below and create a staging-backed Vercel Preview with staging-only variables.

**Never run `commerce_bootstrap.sql`, `commerce_rls_checkout.sql` or
`test-commerce-db.mjs` on hosted/shared databases.** They are destructive local
fixtures, not installation scripts. Do not treat a missing REST table/RPC 404 or
successful SQL installation as a tenant-isolation/workflow PASS.

## Required real hosted workflow test matrix

The completed Auth fixtures comprise two owners, one customer and one unverified
owner; they are not two complete customer/tenant datasets. Reuse the recorded
fixtures where appropriate and provision a separate second customer when running
the matrix. Preserve existing staging identities and retain fixture provenance.

Reuse the retained real Auth fixtures for owners A/B, customer C and the
unverified-account gate; create a separate verified synthetic customer D when
completing the two-customer matrix. Use separate browser profiles plus a
development Super Admin session. Use
controlled test email inboxes. Create two websites with a unique test-run slug
prefix and visibly mark all products/addresses/orders as development fixtures.
Record exact website/user/product/order IDs privately with each test result.
Do not reuse production accounts, process payments, or call existing wallet or
settlement procedures. The preview must point exclusively at the verified staging
project before any test signup, upload or order.

| Scenario | Required observed result |
| --- | --- |
| Real signup, email verification and recovery | Owner/customer verification and password recovery complete through actual staging Auth email links. Unverified/expired sessions cannot submit applications, open private data or order. Redirects return to the same staging Preview origin. |
| Onboarding and approval | A submits `/commerce/apply`; only development Super Admin sees/reviews it. Approved application creates a setup website assigned to that verified applicant. A cannot assign an owner, activate a website or grant permissions. |
| Tenant reads | With A's real JWT, query B's products, categories, customers, orders, order items, website settings and memberships through actual PostgREST. No B-private records are returned. Public catalog fields are intentionally public and must not contain private configuration/customer data. Repeat B→A and with C/D customer histories. |
| Tenant mutations | With A's JWT, call owner actions using B's website ID and B product/category/order IDs; each is denied, with no B data/stock/configuration change. Browser-supplied owner/customer IDs do not establish authority. |
| Permission and revocation | Disable A's products/categories/inventory/orders/customers/branding permissions separately. Both direct REST/RPC and Preview API/UI access must honor the flags. Reassign the owner in Admin; the old owner loses access immediately, including a request waiting behind the reassignment lock. |
| Product/category management | Allowed owner creates/edits/archives own products/categories; editing a product does not reset stock. Other-tenant category/product IDs fail composite FK/authorization checks. Invalid prices/attributes/URLs and direct table writes are rejected. |
| Real Storage | Upload JPEG/PNG/WebP up to 5 MB into A's website UUID prefix; public bytes load on A's storefront. Invalid MIME/oversized uploads and B-prefix uploads fail. Owner UPDATE/DELETE fails even for A's objects because uploads are immutable. Broad pre-existing Storage policies cannot bypass commerce guards; existing unrelated-bucket workflows still work. |
| Cart and customer isolation | Desktop/mobile filters and product details work; carts persist within a website without leaking into the other website. Signing out/switching users clears private checkout fields/history and does not replace owner/restaurant sessions. |
| COD checkout and inventory | Prices/totals come from staging DB rows; pickup/delivery/minimum order rules apply. Last-unit concurrent orders cannot oversell. Invalid/cross-tenant lines, insufficient stock and disabled COD/website states leave orders/stock unchanged. Inventory-disabled stock-zero products remain orderable without stock consumption. |
| Retry and cancellation | Identical and lost-confirmation retries use one idempotency key and produce one order. Changed retries cannot create a duplicate and reconcile to the buyer's own history. Cancellation restores tracked inventory exactly once, including after inventory configuration changes. |
| Admin boundary | Missing/expired HMAC cookie fails; cross-origin mutations fail. Only development Super Admin configures features/permissions/owners, activates/suspends websites or opens an audited management view. Authenticated owner/customer JWTs cannot execute the administrative RPC. |
| Existing features | Use synthetic development fixtures to test restaurant/manager, `/delivery`, legacy store, resort, existing auth, wallet/order/return controls and scheduled-job definitions. Payment-provider integration stays sandbox-only; live wallet/payment/settlement operations remain out of scope. |

Run the same application at 1440×1000 desktop and 375×812 mobile, inspect screenshot
and keyboard/scroll behavior, and check no horizontal document overflow. Record
build/commit, Preview URL, project reference, fixture IDs, expected/actual results,
timestamps and failed requests in a secure staging report. Mask tokens and PII.
Archive/suspend synthetic websites when finished; retain test order/audit history
for review. Any fixture cleanup must be independently scoped to recorded IDs and
must not delete unrelated staging users/data.

If the network proxy blocks the Preview, this test matrix can be run by a reviewer
in a normal browser signed into the appropriate Vercel team, or by a trusted
staging-only CI runner with access to the Preview and staging services. Record the
same evidence. Local protocol-fixture tests cannot replace this hosted result.

Passing this future matrix and reviewing backup/recovery does not grant production
SQL, merge or live deployment permission. The user's separate explicit approval
is still required after reviewing the final results.
