# Complete application testing and bug-fix report

**Historical 22 October run.** The [25 October PR #3 follow-up](pr3-followup-report.md)
supersedes these counts and the two missing-route findings: 82 unit tests, 88 SQL
assertions, 19 real staging Auth checks and build pass; 64 earlier screenshots remain; billing redirects to current checkout,
PIN recovery explicitly returns unavailable, and staging PostgreSQL network
access blocks migration/tenant workflows. Repository lint still fails and hosted release checks remain blocked.

Review date: 22 October 2026 (Asia/Kolkata). Branch:
`feature/client-websites-phase1`; draft PR:
<https://github.com/chiruthalanaveen/DIGITAL-DINING/pull/3>.

**Release conclusion: FAIL — complete application release verification is not
green.** The isolated commerce tests pass, but repository-wide lint fails, two
existing authentication/billing endpoints are missing, and hosted Supabase,
provider and staging-backed Vercel checks remain unavailable. These findings must
not be converted into a whole-application PASS or a claim that live was tested.
No production SQL, live payment, merge or deployment was performed for this task.

## Actual checks and results

| Check | Result and scope |
| --- | --- |
| `npm test` | **50/50 passed**, zero failures/skips: 21 commerce API, 14 maintenance, eight staging-target guards and seven delivery returns compatibility tests. |
| `npm run build` | **PASS**, optimized Next.js build and TypeScript checks, with synthetic development credentials. The final build includes the new plural returns route. |
| Changed-module ESLint | **PASS**, zero errors and three native-image recommendation warnings. |
| Configured `npm run lint` | **FAIL**, 169 errors and 180 warnings across the repository. |
| Baseline lint comparison | Baseline `4d036fb` has the same 169 errors and 177 warnings. Normalized errors match by file/rule/message: **zero introduced errors**. The three new warnings concern native tenant product/banner images. |
| PostgreSQL migration, RLS and concurrency tests | **82 assertions passed** against actual local PostgreSQL 18.4, including six new reapplication/rollback assertions. |
| Real Next.js API and Chromium integration | **PASS**, complete expanded Saree/Grocery flow, with synthetic local Auth/REST/Storage over actual PostgreSQL. |
| Hosted Supabase migration/Auth/Storage/RLS | **BLOCKED / NOT RUN**: no separate staging project exists. |
| Razorpay sandbox and full legacy service workflows | **BLOCKED / NOT RUN**: approved sandbox credentials, provider configuration and compatible legacy development fixtures are unavailable. |
| Staging-backed Vercel Preview | **BLOCKED / NOT CREATED**: no staging backend/credentials. |

The 50 Node tests and 82 SQL assertions are different check types; their combined
count is not a count of browser journeys. Browser assertions/scenarios are
reported separately rather than inventing a total. Actual execution logs and
screenshots are outside Git at
`/workspace/commerce-validation-artifacts/application/`.

`npm ci` was not repeated: package manifests/lockfile were unchanged, installed
dependencies were available, and the build resolved imports successfully. No
dependency versions were changed to make checks pass.

## Bugs discovered and corrections

### Fixed: delivery returns URL mismatch

The delivery storefront calls `/api/delivery/customer/returns`; only singular
`/api/delivery/customer/return` existed. The plural URL previously had no handler.
The added compatibility route re-exports the existing GET/POST functions and
preserves the singular URL, runtime, authentication, ownership, policy checks,
headers and RPC contracts. The original handler is unchanged.

Seven focused tests exercise real handler code with synthetic dependencies:
handler identity, early validation, missing Mobile/PIN session, another customer's
order, disabled return policy and valid GET/POST delegation. The running Next.js
HTTP checks confirm both singular/plural routes respond 400 to invalid input,
instead of the plural route returning 404. No real return, refund or payment was
created by those checks.

### Unresolved baseline bugs

- `/delivery/forgot-pin` calls `/api/delivery/customer/forgot-pin`, but no handler
  exists. The real local Next.js GET request returns **404**. The missing recovery
  flow was not replaced with an invented security-question reset procedure.
- The older `/dashboard/[id]/billing` page calls `/api/create-subscription-order`,
  but no handler exists. A real local POST returns **404**. The separate
  `/subscribe/[id]` flow uses `/api/create-order`; that does not validate the older
  billing contract. No financial endpoint was blindly remapped.
- Repository-wide lint still fails. These errors match the pre-commerce baseline;
  lint rules were not disabled and legacy features were not removed to hide them.

These source gaps also exist at `4d036fb`; they are inherited, not introduced by
commerce. They nevertheless remain real findings for the requested complete
application check. A secure recovery implementation and billing repair need
verified existing contracts and isolated service fixtures. See
[application-regression-report.md](application-regression-report.md) for exact
routes, evidence and the full legacy feature matrix.

Two early expanded browser runs stopped on **harness locator errors**: a select
label included its option text, and CSS-capitalized status text remained lowercase
in the DOM. The locators were corrected without changing application behavior.
The final browser result must be read from the final run, not those failed
harness attempts. No runtime feature was removed to obtain a passing result.

## Functional commerce evidence

The isolated environment creates **Saree Store** (`business_type=sarees`) and
**Grocery Store** (`business_type=grocery`) with separate verified synthetic
owners, customers, categories, products, stock, orders and branding. Both use the
implemented `general` template; this is not a claim that industry-specific
templates have been delivered.

The suite exercises:

- Owner registration UI, unverified-account denial, explicitly simulated email
  confirmation, application submission, Super Admin approval/owner assignment,
  rejection and denial of unassigned/cross-tenant workspace access.
- Product/category creation, image metadata writes under real local RLS, price
  edits that preserve stock, inventory changes and **archiving**. Hard deletion
  is intentionally absent to retain order references/history.
- Admin branding/banner/feature changes to the Saree Store while the complete
  Grocery Store configuration remains unchanged. Activation, suspension and
  archiving affect the intended website only.
- Both storefront homepages/categories, search/filtering, details, cart reload
  persistence, increment/decrement/removal, and separate tenant carts/catalogs.
- Pickup and delivery COD checkout, server-calculated amounts/fees, correct
  owner receipt, order-status changes visible to the customer, and order history
  restricted to the buyer and tenant.
- Insufficient-stock rollback, duplicate-line normalization, lost-confirmation
  and changed-request retries without duplicate orders, once-only cancellation
  restocking and untracked inventory at stored stock zero.
- Missing/expired tokens, verified identity derivation, direct private-row RLS,
  foreign IDs, forbidden RPC/table writes, cross-tenant media paths, admin cookies,
  same-origin mutation checks and permission/reassignment races.

Desktop uses 1440×1000 and mobile uses 375×812. The browser restricts requests to
the two loopback origins; the existing Razorpay script is deliberately blocked.
This is not a real email, Google sign-in, payment-provider or hosted Storage test.

## Requested scenarios not implemented in Phase 1

| Requested area | Current availability |
| --- | --- |
| Saree/Grocery/other industry-specific layouts | Only the reusable general template exists; category labels are configurable. Specialized layouts belong to Phase 2. |
| Owner feature-request submission and Admin review | Not implemented; planned for Phase 3. Email support/configuration requests are not a tracked feature-request system. |
| New commerce refunds, returns, coupons and recurring billing | Not implemented. COD cancellation and read-only billing metadata exist; no refund/provider settlement behavior is implied. |
| New commerce online payments | Disabled; no new provider flow is claimed tested. |
| Verified custom domains/wildcard routing | Later phase; `/shops/<slug>` needs no DNS changes. |

Unsupported scenarios are marked unimplemented rather than counted as tests that
passed. They were not added hastily or coupled to existing wallets/payments to
make a testing checklist appear complete.

## Migration status and preservation

For this testing/compatibility-route update: **No SQL migration required.** The
existing feature still requires
[`20261022160000_commerce_foundation.sql`](../../supabase/migrations/20261022160000_commerce_foundation.sql),
unchanged at SHA-256
`dd2882f6329808783b1d4d97c4264f59989b7e834753aa06efe46d63855db1ca`.
It has not been applied to production by this work.

The migration is **one-time, not idempotent**. The new test reapplies the complete
file to an already-installed local database and expects `42P06`. It verifies
`25P02` until explicit rollback, then compares complete definitions, RLS/grants,
constraints/functions/indexes/triggers, all nine commerce tables, bucket metadata
and synthetic Auth/legacy wallet-order/Storage/cron rows. All remain unchanged.
This is safe failure after rollback, not permission to rerun it blindly on a
hosted/shared database.

Local sentinel preservation does not verify actual production balances, orders,
customers, payments or scheduled jobs. Those were not read or changed as test
fixtures. Hosted policy/Auth lifecycle compatibility, including the five Auth
foreign keys' account-deletion restriction, remains unverified. Existing
[backup/rollback](backup-recovery.md), [preservation](preservation-review.md) and
[staging verification](staging-verification.md) plans remain applicable.

## Vercel and remaining verification

A working staging-backed Preview cannot be created with the available inputs.
The local fixture binds workspace loopback HTTP/PostgreSQL ports; Vercel cannot
reach them, and deploying the synthetic localhost bundle would point a visitor's
browser at their own computer. It is not a deployable hosted database substitute.
No production credentials were copied to Preview.

The earlier URL
<https://digital-dining-6kfz79na2-digital-dining.vercel.app> is an **older,
production-target staged build**, not this tested staging Preview and not a
deployment of the new returns fix. Its earlier proxy CONNECT request was blocked
before an application response. It must not be used for test writes.

Use [preview-and-environment.md](preview-and-environment.md) for the exact
Preview-only environment, Auth redirect and allowed-network/manual verification
steps once a separate Supabase development project exists. Full legacy
restaurant/delivery/resort/auth/addresses/wallet/payment/refund/advertisement/
delivery-region checks require their own development fixtures; source equality,
empty fixtures and build success are not full functional evidence.

## Exact commands and artifacts

Commands executed from the repository root:

```sh
npm test
npm run lint
npx --no-install eslint app/api/commerce app/commerce app/shops app/components/commerce lib/commerce lib/server/commerce app/api/delivery/customer/returns tests/commerce-api.test.mjs tests/commerce.browser.mjs tests/commerce-staging-guard.test.mjs tests/delivery-return-alias.test.mjs tests/helpers/commerce-fixture.mjs scripts/test-commerce-db.mjs scripts/test-commerce-staging.mjs
COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55438/commerce_test COMMERCE_BROWSER_ARTIFACTS=/workspace/commerce-validation-artifacts/application npm run test:commerce:browser
COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55438/commerce_test COMMERCE_BROWSER_ARTIFACTS=/workspace/commerce-validation-artifacts/application COMMERCE_BROWSER_SKIP_BUILD=1 npm run test:commerce:browser
node scripts/test-commerce-staging.mjs
git diff --check
```

The browser runner internally executes `node scripts/test-commerce-db.mjs`,
`npm run build` and
`npm run start -- --hostname 127.0.0.1 --port 4320` with
`developmentEnvironment()` from the fixture helper. `SKIP_BUILD` was used only
for harness-only corrections against the unchanged final application build.
An earlier standalone migration reapplication run used the separate disposable
loopback database on port 55439 and passed all 82 assertions.
The hosted preflight exited 1 before any connection because all five staging
variables are absent; this was a blocked check, not a hosted test pass.

Baseline/current structured ESLint comparisons used the installed `ESLint` Node
API against the working tree and a separate detached `4d036fb` worktree. Evidence:
`lint-all.log`, `lint-current.json`, `lint-baseline.json` and
`lint-baseline-comparison.json`. Other files include `unit-tests.log`,
`lint-scoped.log`, `database.log`, `build.log`, `integration.log`, `next.log` and
paired desktop/mobile PNG screenshots. The screenshot index/evidence archive
provides the captured Admin, onboarding, owner, Saree/Grocery, details, cart,
checkout and confirmation images. Do not mistake an old failure screenshot for
the final browser result.

The final suite exited zero and captured **60 current PNG screenshots** (30
desktop/mobile pairs). The Saree mobile homepage and Grocery mobile confirmation
were also visually inspected. Local order placement, owner status updates and
mobile interaction completed; no browser page errors or horizontal document
overflow were reported. Test helper locator failures were corrected and rerun;
they are not counted as application regressions or concealed as passing runs.
