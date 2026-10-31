# Database review: test results

Review date: 2026-10-22. These are results from the review requested after the
Phase 1 implementation. No production SQL, production data mutation, deployment
or merge was performed for these checks. The application source and foundation
migration were unchanged during this test pass.

## Actual results

| Check | Result | What it establishes |
| --- | --- | --- |
| `npm test` | **PASS: 43/43**, zero failed/skipped | 21 commerce API tests, 14 existing maintenance regression tests and eight new staging-target guard tests. |
| Scoped ESLint | **PASS: zero errors, three warnings** | The warnings are `@next/next/no-img-element` recommendations on tenant-provided storefront images. |
| `npm run build` | **PASS** | An optimized Next.js build and TypeScript checks, using only the synthetic loopback development environment supplied by the test fixture. |
| Migration / PostgreSQL tests | **PASS: 76 assertions** | The actual versioned migration applied to disposable PostgreSQL 18.4, with RLS, grants, constraints, transactions and concurrent connections exercised. |
| Real Next.js API integration | **PASS** | Actual route handlers called the local adapter, which executed SQL under the anonymous, authenticated or service role and appropriate JWT subject. |
| Chromium desktop/mobile integration | **PASS** | The running production-mode Next.js application was exercised at 1440×1000 and 375×812; no page errors or horizontal document overflow. |
| `commerce_verify.sql` | **PASS: ten read-only SELECT groups** | Local catalog inspection of installation, RLS, grants, FKs, bucket configuration and activation/stock/total invariants. |
| Hosted Supabase staging migration/workflows | **BLOCKED / NOT RUN** | The user confirmed no separate staging project exists. Local fixtures do not establish hosted Supabase compatibility. |
| Vercel Preview using staging credentials | **BLOCKED / NOT RUN** | There is no staging project or staging credential set to configure or test such a preview. |

The first complete integration run rebuilt the application and passed the
existing 64 SQL assertions. The review then added twelve direct database tenant
checks to `supabase/tests/commerce_rls_checkout.sql`. A second complete API/browser
run passed all **76** SQL assertions using the unchanged application build. No
application or migration changes occurred between those two runs.

## Exact commands executed

All commands ran from the repository root unless an absolute binary is shown.
The only database target below is the disposable **local** `commerce_test`
database on loopback port 55438. These fixture scripts must never be pointed at a
shared or hosted database.

```sh
/workspace/.commerce-validation-tools/node_modules/@embedded-postgres/linux-x64/native/bin/pg_ctl -D /tmp/digital-dining-commerce-pgdata status
/workspace/.commerce-validation-tools/node_modules/@embedded-postgres/linux-x64/native/bin/pg_ctl -D /tmp/digital-dining-commerce-pgdata -l /tmp/digital-dining-commerce-postgres.log -o '-h 127.0.0.1 -p 55438' start
npm test
npx --no-install eslint app/api/commerce app/commerce app/shops app/components/commerce lib/commerce lib/server/commerce tests/commerce-api.test.mjs tests/commerce.browser.mjs tests/commerce-staging-guard.test.mjs tests/helpers/commerce-fixture.mjs scripts/test-commerce-db.mjs scripts/test-commerce-staging.mjs
COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55438/commerce_test COMMERCE_BROWSER_ARTIFACTS=/workspace/commerce-validation-artifacts/review npm run test:commerce:browser
COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55438/commerce_test COMMERCE_BROWSER_ARTIFACTS=/workspace/commerce-validation-artifacts/review COMMERCE_BROWSER_SKIP_BUILD=1 npm run test:commerce:browser
git diff --check
```

The first `pg_ctl status` correctly reported that the previous local cluster was
stopped (exit 3). Starting it succeeded. The test runner internally executed:

```sh
node scripts/test-commerce-db.mjs
npm run build
npm run start -- --hostname 127.0.0.1 --port 4320
```

Those subprocesses receive `developmentEnvironment()` from
`tests/helpers/commerce-fixture.mjs`, not the application's inherited production
credentials. The builder and running app use the synthetic Auth/REST/Storage
endpoint at `http://127.0.0.1:4319`. The final rerun set
`COMMERCE_BROWSER_SKIP_BUILD=1` only because the application build was unchanged;
the SQL migration test, HTTP integration and browser interactions still reran.

The read-only verification SQL and catalog proof were executed through the `pg`
driver against that explicit loopback connection. Their report is
`/workspace/commerce-validation-artifacts/review/read-only-verification.json`.
The runner cleaned up the Next.js and local adapter processes after each run.

## Tenant isolation and permission evidence

The twelve new database assertions use an actual checkout-created customer,
order and order item. Customer access is explicitly enabled for **both** test
owners before testing, so a foreign-tenant denial cannot pass solely because a
permission is disabled.

- Owner A can read its own private website settings, products, customer, order
  and order item.
- Owner B retains access to its own website/product control records, but direct
  authenticated SELECTs return zero rows for Owner A's private website settings,
  products, customers, orders and order items.
- Revoking Owner A's customer permission also hides its own customer profile
  records.

Existing assertions additionally deny foreign-tenant owner mutation, foreign
category references, forged image paths, anonymous private-table access,
authenticated Admin RPC execution and arbitrary direct product/stock/settings/
order writes. Storage guards remain effective with intentionally broad legacy
permissive policies. Separate database connections verify concurrent last-unit
checkout, identical idempotency retries and owner permission/membership
revocation while a mutation waits on the Admin's lock.

These are meaningful local proofs for the tested schema and roles. They are not
a claim that an owner can never find an untested authorization defect in a hosted
environment; the corresponding real Supabase tests remain a release gate.

## Workflow coverage

| Area | Completed local coverage | Remaining hosted checks |
| --- | --- | --- |
| Authentication | Missing/expired bearer rejection, trusted email confirmation checks, owner login, tenant-isolated customer sessions, local sign-out, separate owner/customer session storage and cross-tab identity changes clearing checkout PII. | Real Supabase signup/password verification, email delivery/callbacks, password recovery, session refresh/revocation, deployed Auth hooks and redirect configuration. |
| Onboarding | Application identity comes from the verified Auth user; unverified users are denied; submitted → under review → approved → website setup → active runs through actual Next APIs and database RPCs. Approval cannot be bypassed; active sites require an owner. | Real signup-to-verification-to-application flow and interactions with existing Auth hooks. |
| Products / inventory | Categories/products, integer pricing, owner UI product creation, PNG upload metadata under RLS, stock adjustment, catalog feature/permission switches and foreign-tenant/category denial. | Real Supabase Storage MIME/size enforcement, signed/authenticated upload HTTP behavior and public object delivery. |
| Cart / storefront | Search, category filter, product details, cart persistence after reload and separate storefront catalogs/carts. | The same behavior from a deployed Preview connected to staging. |
| Checkout / orders | Server-derived prices and delivery configuration, duplicate-line normalization, insufficient-stock rollback, COD-only enforcement, idempotency, lost-success and changed retry reconciliation, once-only cancellation/restock, suspension, untracked inventory and database outage HTTP 503/recovery. | Real hosted PostgREST transaction/error behavior and staging-backed remote browser checks. No live payment provider is called. |
| Admin | Actual HMAC Admin login/session, unauthenticated API denial, same-origin mutation rejection, user RPC denial, verified-owner assignment, feature/permission changes and audited management views. | Development deployment/session configuration, real service-role availability and review of hosted existing policies. |

Browser requests are restricted to the two loopback origins. The existing
`checkout.razorpay.com` script was blocked deliberately. No live payment,
settlement, wallet adjustment or existing business API mutation was exercised.

## Preservation evidence and remaining risks

The SQL fixture verifies unchanged synthetic legacy balances/order histories,
existing grants/RLS definitions, an existing Storage policy and a scheduled-job
fixture. This does not inspect actual production rows, existing deployed cron
jobs or every restaurant/delivery/resort workflow. Full legacy workflow checks
using development service fixtures remain unrun.

Read-only inspection of the migrated local catalog confirmed nine tables, twelve
functions, 25 indexes and fifteen policies. Five new foreign keys reference
`auth.users` with `NO ACTION`; PostgreSQL installed ten referenced-side internal
constraint triggers on the existing Auth table. There are no explicit application
trigger declarations in the migration. The FKs can prevent future hard deletion
of an Auth account while commerce records reference it; retained history and the
existing account-deletion process require review and hosted testing. This risk
was documented rather than hidden by introducing destructive cascades.

There is no staging database, staging-backed Preview, real email test, real
Storage service test, backup restore rehearsal, hosted policy comparison,
wildcard/custom domain test or live payment test in these results. A former
production-target deployment with production environment values is not evidence
of a valid staging Preview. See [staging-verification.md](staging-verification.md)
for the required next steps and proxy-independent verification options.

## Evidence files

Logs and screenshots are retained outside the Git repository at
`/workspace/commerce-validation-artifacts/review/`:

- `unit-tests.log`, `lint.log`, `integration.log`, `database.log`, `build.log`,
  `next.log` and `read-only-verification.json`.
- Paired `*-desktop.png` / `*-mobile.png` images for Admin website management,
  owner workspace, product form/products/inventory, product details, checkout,
  customer account and both storefronts.

The checkout and product-form mobile screenshots were also visually inspected:
fields/buttons remained readable and contained; table and bag content uses
contained scrolling. Mobile checkout interactions completed in the browser test.
