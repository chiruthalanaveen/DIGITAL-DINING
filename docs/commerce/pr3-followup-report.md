# PR #3 follow-up verification — 25 October 2026

Branch: `feature/client-websites-phase1`. Draft PR:
<https://github.com/chiruthalanaveen/DIGITAL-DINING/pull/3>.

**PARTIAL PASS for this repair; FAIL for complete production-release readiness.**
The legacy billing entry point is repaired, missing PIN recovery now fails
explicitly and safely, and the complete local checks pass. Successful PIN reset,
hosted migration/RLS/workflows and provider integration remain unverified;
repository-wide lint still fails. No production database connection, SQL, live
payment, production deployment or merge was performed by this follow-up.

## Actual results

| Check | Result and evidence boundary |
| --- | --- |
| `npm test` | **PASS: 82/82**, zero failures/skips. 21 commerce API, 14 maintenance, eight staging guards, seven returns, five PIN availability/privacy, ten subscription-route/contracts and 17 legacy payment/wallet guard tests. |
| `npm run build` | **PASS**, fresh optimized Next.js build and TypeScript checks using clean synthetic development configuration. Executed by the browser runner, not with production or incorrectly configured staging values. |
| PostgreSQL migration/RLS/concurrency/reapplication | **PASS: 82 assertions** on isolated loopback PostgreSQL 18.4. These are SQL assertions, distinct from the 82 Node tests. |
| Actual Next.js API and Chromium integration | **PASS**, owner onboarding/admin approval, Saree/Grocery tenant management, products/media/inventory, cart, COD pickup/delivery, owner receipt/status and customer history. Synthetic Auth/REST/Storage adapter over actual PostgreSQL; not hosted Supabase Auth. |
| Desktop/mobile | **PASS**, 1440×1000 and 375×812; **64 screenshots**, 32 pairs. Includes the PIN form/unavailable state. No browser page errors or horizontal document overflow. PIN unavailable and Grocery confirmation mobile screenshots were visually inspected. |
| Scoped ESLint | **PASS**, zero errors; three native-image recommendation warnings. |
| Full `npm run lint` | **FAIL**, 169 errors and 179 warnings. All 169 errors match the pre-commerce baseline; **zero introduced errors**. |
| Staging Auth settings / service-role REST metadata | **PASS: HTTP 200** using independently verified staging host and matching staging keys, read-only. No user/session/mutation or RLS workflow is implied. |
| Guarded staging database preflight | **BLOCKED**, exits 1 before DB connection: two configured URLs are incorrect. |
| Hosted migration, real Auth sessions/RLS, Storage and workflows | **NOT RUN**, database connection configuration unavailable. |
| Existing restaurant/delivery/resort/provider integration | **PARTIAL**, source review plus specified offline guard/returns/maintenance tests only. Compatible legacy staging fixtures and provider sandbox credentials are unavailable. |
| Staging-backed Vercel Preview | **NOT CREATED / NOT TESTED**, pending validated database and migration. No working Preview URL is claimed. |

The previous [22 October report](application-testing.md) is historical. Its 50
unit tests and two HTTP 404 observations are superseded by the results here.

## The two missing endpoints

### Legacy subscription billing: repaired entry point, retired API

`/dashboard/<id>/billing` contained obsolete Starter/Pro/Enterprise prices,
called an API that never existed, and attempted a direct browser update of the
restaurant plan after the Razorpay callback. No current application caller
depends on that page/component or the old API contract; dashboard/onboarding
already use `/subscribe/<id>`.

The bookmarked billing URL now issues **307** to `/subscribe/<id>`, preserving
only one of the five current supported `plan` values. It drops supplied amounts,
old plan names, arrays and external redirect input. It uses the existing
authenticated `/api/create-order` and server-verified `/api/verify-subscription`
workflow; supported plans and their authoritative server prices remain intact.

`POST /api/create-subscription-order` deliberately returns
error **410 `SUBSCRIPTION_ENDPOINT_RETIRED`**, with `Cache-Control: no-store`
and the replacement API path. It does not parse or translate the obsolete price
payload or contact any provider/database. A retired API is not counted as a
successful payment flow. Unit tests cover all 15 current plan/cycle prices,
authentication, ownership, signatures, provider metadata/amount/currency/status
rejection and scoped activation using synthetic dependencies. Running Next.js
HTTP checks verify the actual 307 and 410 routes.

### PIN recovery: safe error handling restored; successful reset unresolved

The delivery login still links to `/delivery/forgot-pin`, so its API is required.
Git history shows that UI was introduced without a corresponding server route;
no authoritative recovery RPC/schema was checked into the repository. The
authenticated staging REST metadata exposes no matching recovery/question/reset
RPC. That absence is not proof that a private database function does not exist.

The added GET/POST handler returns **400** for malformed store/mobile input and
the same private/no-store **503 `PIN_RECOVERY_UNAVAILABLE`** for every valid
account. It performs no lookup, PIN write, session/cookie change or secret
logging. The UI displays the service-unavailable explanation and does not offer
the reset form after the failure. Tests verify generic responses, no account or
secret disclosure and no database/network dependencies; actual Next.js/browser
checks verify the HTTP status and desktop/mobile error state.

**This does not implement a successful PIN reset.** Its verified atomic recovery
contract, recovery-code rotation, brute-force protection and old-session
revocation still need implementation/verification against isolated legacy
staging data. See [pin-recovery-review.md](pin-recovery-review.md). Do not present
changing a 404 into 503 as a complete authentication repair.

## Lint classification and scope

[lint-review.md](lint-review.md) lists all ten failing rules and all 56 affected
files. Baseline `4d036fb` and this branch used the same installed ESLint 9.39.5
and configuration; normalized file/rule/message multisets have no introduced or
removed errors. Baseline warnings were 177; this branch adds three storefront
`no-img-element` recommendations and removes one unused callback warning with
the obsolete billing implementation, producing 179.

The 169 errors comprise 94 set-state-in-effect, 24 unescaped-entities, 22
no-html-link-for-pages, ten immutability, six purity, five manual-memoization,
four no-require-imports, two refs, one static-components and one module-variable
assignment finding. No commerce error required a speculative refactor. Rules
were not disabled, tests were not weakened and unrelated legacy hooks/features
were not rewritten merely to hide the baseline lint failure.

## Staging: corrected evidence and exact blocker

Separate staging **now exists** at reference `gylicwwrmpqomregevqe`. Both supplied
JWT keys identify that reference and their intended anon/service roles. Read-only
HTTPS checks against the exact independently known staging host succeeded:
Auth email signup is enabled with email confirmation required; service-role
REST/OpenAPI metadata is reachable. No commerce tables are exposed there.
No real signup, email verification, password recovery or owner/customer JWT/RLS
test was performed by those two metadata requests.

The strict configured preflight rejects the supplied values:

| Secure setting | Required correction |
| --- | --- |
| `COMMERCE_STAGING_SUPABASE_URL` | Set exactly `https://gylicwwrmpqomregevqe.supabase.co`. It currently identifies localhost port 3000. |
| `COMMERCE_STAGING_DATABASE_URL` | Replace its HTTPS API URL with the staging PostgreSQL URI from **Connect → Connection String → URI**, including the staging database password and TLS. |

Keep the existing matching anon/service keys and project reference. Enter
credentials securely in environment settings, never chat, Git or command logs.
Do not overwrite the existing production application variables with staging
values. A direct URI has this shape; it is a template, not a working credential:

```text
postgresql://postgres:<URL-ENCODED-STAGING-PASSWORD>@db.gylicwwrmpqomregevqe.supabase.co:5432/postgres?sslmode=verify-full
```

Direct-host DNS resolution separately failed **EAI_AGAIN (-3)** in this runtime.
No TCP, TLS, authentication or SQL followed, so this does not prove a password,
IPv6 or PostgreSQL server defect. If direct connectivity remains unavailable,
use the exact **Session pooler URI on port 5432** from the staging Connect panel;
its username must identify `postgres.gylicwwrmpqomregevqe`. Its actual pooler
hostname may need an allowlist addition. Do not guess a regional hostname or
disable TLS verification.

Then run `node scripts/test-commerce-staging.mjs` again. Only after it passes,
complete the staging backup/inventory, migration and actual Auth/tenant workflow
sequence in [staging-verification.md](staging-verification.md). The guard never
falls back to production and explicitly forbids `wispidcdmunqzahjacws`.

## Pending migration: exact effect and installation boundary

For these route/test/documentation fixes: **No SQL migration required.** The
existing commerce feature still requires the unchanged, unabridged migration:

[`supabase/migrations/20261022160000_commerce_foundation.sql`](../../supabase/migrations/20261022160000_commerce_foundation.sql)

SHA-256:
`dd2882f6329808783b1d4d97c4264f59989b7e834753aa06efe46d63855db1ca`.

Its nine new tables store websites/configuration, owner memberships,
applications/review, categories, products/stock, tenant customer snapshots,
orders, immutable order-item snapshots and administrative audit history.
[migration-review.md](migration-review.md) explains all 103 columns, twelve
functions (seven private/five public), 25 indexes (six explicit/nineteen automatic),
fifteen RLS policies (eight new-table SELECT/seven shared Storage policies),
grants and sixteen foreign keys. It installs no explicit custom trigger; local
PostgreSQL creates 64 internal FK triggers, including ten on existing Auth users.

Static review finds no DELETE/DROP/TRUNCATE, existing business-row update,
payment/wallet procedure call or cron change. It creates a public `commerce-media`
JPEG/PNG/WebP bucket capped at 5 MiB and tenant-prefix/immutable-upload policies.
Five Auth foreign keys can restrict future identity hard deletion. Shared
Storage policy coexistence and that account-lifecycle effect require hosted
verification; local synthetic preservation is not production certification.

The migration is **one-time**, not safe to reapply blindly. Local rollback-after-
failed-reapplication comparisons preserve all nine commerce tables, legacy
wallet/order/Auth/Storage/cron fixtures and definitions/grants/policies. No hosted
SQL was executed in this follow-up. Exact staging application/verification
commands are in [staging-verification.md](staging-verification.md), with read-only
queries in [commerce_verify.sql](../../supabase/tests/commerce_verify.sql).

Use [backup-recovery.md](backup-recovery.md) for database/Auth/Storage metadata,
separate object-byte backups, managed-backup/PITR checks and a restore rehearsal.
No hosted backup or recovery rehearsal is claimed. Application rollback should
retain commerce history and suspend sales; dropping tables, deleting identities
or replaying wallet/payment transactions is not a data-preserving rollback.

## Remaining release risks and Preview

- Successful legacy PIN recovery is unresolved. Full legacy restaurant, delivery,
  resort, returns progression, wallet settlement/top-ups and provider sandbox
  journeys need compatible isolated fixtures and approved test-mode credentials.
- New offline tests execute actual subscription and wallet handlers with synthetic
  dependencies. They do not establish provider availability or atomic wallet RPC
  idempotency. Existing subscription verification accepts `authorized` as well as
  `captured` payments and has no evident payment replay ledger before computing
  expiry from the current time. These inherited billing risks require a reviewed
  durable idempotency/capture policy; the tests do not certify them as fixed.
- A staging-backed Vercel Preview awaits valid DB connectivity and the migration.
  No new Preview URL exists. The earlier production-target staged artifact must
  not receive staging test writes. Current API/REST HTTPS calls worked; the new
  Preview has not been created, so no current Preview proxy result is asserted.
  The earlier proxy CONNECT-403 and alternative allowed-network/manual checks
  remain documented in [preview-and-environment.md](preview-and-environment.md).
- Configure Preview-only staging API/anon/server keys, separate development Admin
  credentials/secret, precise staging Auth redirects and real Storage policies.
  `/shops/<slug>` needs **no DNS change**. Keep the branch-specific Vercel Git
  deployment guard, PR draft and explicit production release hold in place.

## Commands and evidence

From `/workspace/DIGITAL-DINING`, executed commands included:

```sh
node --test tests/delivery-pin-recovery.test.mjs tests/subscription-billing.test.mjs
node --test tests/legacy-payment-guards.test.mjs
node --test tests/commerce-staging-guard.test.mjs
npm test
npm run lint
node scripts/test-commerce-staging.mjs
COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55438/commerce_test COMMERCE_BROWSER_ARTIFACTS=/workspace/commerce-validation-artifacts/pr3-followup npm run test:commerce:browser
git diff --check
```

The browser runner internally executes `node scripts/test-commerce-db.mjs`,
**`npm run build`**, and
`npm run start -- --hostname 127.0.0.1 --port 4320`, using
`developmentEnvironment()` from the fixture helper. No skip-build flag was used
for this final run. The same clean environment strips existing provider and
Supabase credentials, replaces them with loopback/synthetic values, and blocks
external browser requests including the Razorpay script.

The exact scoped lint commands and normalized baseline-comparison procedure are
in [lint-review.md](lint-review.md). Initial four subscription-test harness
failures were corrected with the required transpiler interop option; the final
aggregate is the complete 82-pass run. No application assertion was skipped to
obtain it. Dependencies/lockfile were unchanged and `npm ci` was not repeated.

Logs, `results.json`, the sanitized staging diagnosis, Vercel read-only metadata,
`screenshots.md` and 64 PNGs are under
`/workspace/commerce-validation-artifacts/pr3-followup/`, outside Git. The exact
changed-file list is [changes.md](changes.md). PR #3 is the review URL; a local
loopback URL and an older production-connected artifact are not staging Preview
evidence. GitHub main remains `7385253c5381fdf4998fddf8f58e84b783aabba1`;
Vercel's active production target remains `dpl_9Q2yJ1vG7e7oF4fHiLZE1NK4KbsU`.
