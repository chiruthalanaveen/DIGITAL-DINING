# Phase 1 testing

For the latest full application run, see [pr3-followup-report.md](pr3-followup-report.md):
82 unit tests, 82 SQL assertions, a passing build, 64 browser screenshots,
billing-route repair, explicit PIN unavailability, inherited lint failures and
the precise staging connection blockers. The earlier results below are historical.

Latest review results: **43/43 unit tests and 76 PostgreSQL assertions passed**,
with build and desktop/mobile browser checks passing. The earlier run details
below are historical; current commands, evidence and remaining hosted gaps are
in [review-test-results.md](review-test-results.md).

Run these commands from the repository root after `npm ci`:

```sh
npm test
npm run test:commerce
npx --no-install eslint app/api/commerce app/commerce app/shops app/components/commerce lib/commerce lib/server/commerce tests/commerce-api.test.mjs tests/commerce.browser.mjs tests/helpers/commerce-fixture.mjs scripts/test-commerce-db.mjs
COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55438/commerce_test npm run test:commerce:db
COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55438/commerce_test npm run test:commerce:browser
```

The database and browser commands require a disposable local PostgreSQL server;
see [database setup and migration verification](database.md). Both reset the
database named `commerce_test`. Run them serially, with no other process using
that database. The URL must be supplied explicitly, use a loopback host, and name
`commerce_test`; application or production database URLs are never inferred.

The browser suite executes these commands itself:

```sh
node scripts/test-commerce-db.mjs
npm run build
npm run start -- --hostname 127.0.0.1 --port 4320
```

Build and start receive a clean environment from
`tests/helpers/commerce-fixture.mjs#developmentEnvironment`: only basic operating
system runtime variables are retained, Supabase points to `127.0.0.1:4319`, and
all Auth/admin credentials are synthetic. Do not add production credentials to
local environment files. No environment file is needed for this suite.
`COMMERCE_BROWSER_SKIP_BUILD=1` is available only when rerunning against an
unchanged build produced with that same synthetic environment. A final run after
source changes must omit it.

The suite uses Playwright and `/usr/bin/chromium`; set
`COMMERCE_CHROMIUM_PATH` to another installed development Chromium executable if
needed. Ports 4319 and 4320 must be free. Logs and desktop/mobile screenshots are
written to `/tmp/digital-dining-commerce-browser`, overridable with
`COMMERCE_BROWSER_ARTIFACTS`. The Next.js process started by the suite is stopped
in its cleanup handler. No deployment is performed.

## What is actually exercised

The database suite applies the versioned migration to actual PostgreSQL with
minimal test-only Auth/Storage scaffolding. It checks SQL grants, tenant RLS,
composite relationships, feature/permission enforcement, idempotency,
server-calculated totals, stock rollback, cancellation, concurrency and legacy
fixture preservation. See [database.md](database.md) for exact coverage,
installation steps, verification queries and rollback considerations.

The API unit suite checks handler validation and authentication boundaries using
isolated protocol mocks. These are distinct from the browser integration suite,
which starts the real production-mode Next.js application and calls its actual
route handlers. Its local Supabase-shaped adapter executes allowlisted RPCs and
table reads against PostgreSQL under the `anon`, `authenticated` or `service_role`
role and user JWT subject. SQL, RLS and transactions are therefore real. Local
Auth uses test-only HMAC-signed JWTs and verified synthetic users. Image uploads
write real `storage.objects` records under RLS while image bytes are served from
local memory. Existing admin control-center datasets are empty local responses.
Admin login uses the application's real HMAC session. Its production-mode Secure
cookie is copied into the local browser context with transport security disabled
for loopback HTTP only; application cookie/security code is unchanged.

Integration coverage includes application submission/review, website creation and
activation, owner access/product/stock actions, public catalog isolation,
suspended/missing storefronts, COD totals, replay conflicts, insufficient stock,
cross-tenant rejection, private customer histories, once-only cancellation and
audited administrative views. A simulated local database outage returns 503 and
the catalog recovers after service is restored. Browser checks cover the existing admin module,
owner sign-in and workspace, catalog management/image upload, stock adjustment,
storefront filters/details/persisted tenant carts, customer checkout/history,
retry after a committed response is lost, isolated account sign-out and
desktop/mobile rendering at 1440×1000 and 375×812. Mobile pages are checked for
horizontal document overflow and screenshots are available for visual review.
Changed retries reconcile against the buyer's own history without creating a
duplicate order. A second tab switches customer identity while checkout is open
to verify that private checkout fields are cleared.

Browser requests are restricted to the two loopback application/fixture origins;
third-party scripts, including the existing Razorpay script, are blocked. The
commerce checkout remains COD and invokes no payment provider.

## Limits

The adapter is deliberately a small test harness, not a complete Supabase server.
It supports only the Auth/REST/Storage operations used by these tests. It does
not prove compatibility with hosted PostgREST, Supabase Auth hooks, real signup
verification/recovery emails, public Storage delivery, production-specific RLS
policies, `pg_cron`, wildcard domains or deployment configuration. No separate
Supabase development project was available, so those hosted integration checks
remain unrun and require a dedicated development project before production
activation. No production data, wallet, payment, order history or cron job is
used or modified by this suite.

The aggregate `npm test` run passed 35 tests: 21 commerce API tests and 14 existing
maintenance regression tests. Commerce lint passed with zero errors and three
existing native-image optimization warnings. The production build passed with
synthetic local credentials. Operational database failures also return retryable
HTTP 503 responses, while domain validation retains HTTP 400. These checks establish source/build regression
coverage; they do not establish full restaurant, resort, delivery, payment
provider or wallet workflow validation. Those real legacy workflows were not
exercised because their development service fixtures are unavailable. Legacy
database preservation checks use synthetic records and definition snapshots.

## Commands executed in this workspace

| Exact command | Result |
| --- | --- |
| `npm test` | PASS: 35/35 tests (21 commerce API, 14 maintenance). |
| `npx --no-install eslint app/api/commerce app/commerce app/shops app/components/commerce lib/commerce lib/server/commerce tests/commerce-api.test.mjs tests/commerce.browser.mjs tests/helpers/commerce-fixture.mjs scripts/test-commerce-db.mjs` | PASS: zero errors; three `@next/next/no-img-element` warnings. |
| `COMMERCE_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55438/commerce_test node tests/commerce.browser.mjs` | Runs the database reset/migration tests, synthetic-credential build and production-mode app/API/browser checks. See the final run result below. |
| `COMMERCE_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55438/commerce_test COMMERCE_BROWSER_SKIP_BUILD=1 node tests/commerce.browser.mjs` | Used for harness-only reruns against the unchanged synthetic-credential build. |
| `node scripts/test-commerce-db.mjs` | Executed by the browser runner with the explicit loopback database URL: PASS, 64 PostgreSQL assertions. |
| `npm run build` | Executed by the browser runner with `developmentEnvironment()`: PASS, optimized production build and TypeScript check. |
| `npm run start -- --hostname 127.0.0.1 --port 4320` | Executed by the browser runner with the same synthetic environment: PASS, real Next.js app available for testing. |
| `COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55438/commerce_test npm run test:commerce:browser` | Final run after the environment restart: PASS. Reapplied migration; 64 SQL assertions, clean build, real API checks, and all expanded desktop/mobile browser checks passed. |

Early browser runs stopped on test locator mismatches (a hidden website option
and a label containing select options). Those harness locators were corrected.
A Playwright route-abort race in the expanded retry test was replaced by a
deterministic gateway failure after the database transaction commits. These were
test-harness failures, not application regressions.

The final run also verified HTTP 503/recovery for a local database outage. The
read-only `commerce_verify.sql` inspection passed all ten SELECT query groups
through the local `pg` driver. Final screenshots and logs were copied to
`/workspace/commerce-validation-artifacts` to retain them across environment
restarts; the runner's default output directory remains the `/tmp` path above.
