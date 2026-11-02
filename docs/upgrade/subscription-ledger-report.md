# Durable subscription activation — implementation and tests

2 November 2026. Branch `feature/phase0-subscription-ledger`, based on `727be8e`
from draft PR #4. PR #4 and commerce PR #3 remain draft and unmerged. This is a
separate Phase 0 increment, not a production release.

**Local implementation: PASS with inherited lint failure disclosed. Hosted
release: BLOCKED.** The new migration is prepared for review, not applied to any
hosted project. Paid checkout is disabled by default. The previous deployed
application and its database have not been changed by this work.

## Before, after and security boundary

Previously a valid captured callback ran a fresh direct restaurant update and
computed another expiry. The earlier synthetic reproduction showed repeated
activation writes. A new private ledger now requires a server-opened intent and
bound provider order, then records one immutable receipt in the same transaction
as activation. Exact retries return the original result without extending expiry
or undoing a later subscription. Conflicting payment/order/tenant/term use fails.

The API still verifies Auth, explicit ownership, Super Admin approval, signature,
provider order/payment IDs, amount/currency and capture. It opens an intent before
provider order creation and binds the order before exposing checkout. There is
no direct paid update fallback when the ledger is missing. Historical orders
without the new registered UUID require reconciliation; a paid owner is told
not to pay again. Coupon behavior and non-overwriting delivery defaults remain.

The UI distinguishes a historical replay from new activation and labels the
originally verified plan as historical. Pending/failed verification no longer
claims funds were received. `SUBSCRIPTION_PAID_CHECKOUT_ENABLED` must be exactly
`true` on the server to enable paid paths; this operator switch has no ordinary
owner dashboard control. No hosted setting was changed.

## SQL, preservation and rollout

**A new SQL migration is required:**
[20261101123000_subscription_payment_ledger.sql](../../supabase/migrations/20261101123000_subscription_payment_ledger.sql).
The [full object review](subscription-ledger-review.md) explains all 24 new
columns, two tables, six functions, two triggers, five indexes, grants and RLS.
There are no new RLS policies: private direct access is denied, with service-only
definer RPCs and a fail-closed inherited-ACL assertion.

Installation has no existing-row DML, legacy/Auth foreign key, ownership backfill,
RLS replacement, wallet/order/payment/customer/booking alteration, storage change
or cron change. Full representative fixture catalogs and data survive install
and failed reapplication. Runtime activation changes only the existing eight
subscription fields in one transaction. Actual production remains untouched
because no hosted connection or SQL was used.

The [installation and recovery runbook](subscription-ledger-installation.md)
contains exact local/future-approved steps and read-only verification queries.
Never reapply the commerce foundation or run blanket `supabase db push`. Preserve
intents/receipts on rollback; stop paid paths with secure code retained, never
restore the replayable fallback or drop the ledger. A restore requires provider
reconciliation after the restore cutoff. No backup or recovery test is claimed.

## Actual checks

| Check | Result |
| --- | --- |
| `npm test` | **PASS: 142/142**, zero failures, synthetic development credentials. |
| Focused actual payment-handler tests | **PASS: 49/49**, a subset of the unit total. Provider/database effects are strictly simulated. |
| New subscription migration/database suite | **PASS: 66 PostgreSQL assertions**, final run `database-final2`, PostgreSQL 18.4 with representative legacy fixtures. |
| Migration objects observed | Two tables, 24 columns, six functions, two triggers, five indexes, zero policies. PostgreSQL 18 catalogs also expose NOT NULL constraints; do not compare that total directly to PostgreSQL 17. |
| Fresh `npm run build` | **PASS**, compiled with synthetic loopback settings inside the subscription browser command. |
| Subscription UI | **PASS: 16 cases/screenshots**, fresh/replayed/authorized/disabled scenarios at 360/390/768/1440 px, zero recorded page errors or horizontal document overflow. Payment HTTP responses/widget are completely simulated. |
| Retained commerce SQL/API/browser | **PASS**, final run `commerce-final`: 88 PostgreSQL assertions plus the complete retained API/browser suite; 118 additional screenshots and zero recorded page errors/overflow. Ordinary console errors are not collected by that suite. |
| `npm run lint` | **FAIL: 169 errors, 179 warnings**. Exact comparison to PR #4's recorded baseline finds zero introduced or removed errors/warnings. No rule was disabled. |
| Official Supabase PostgreSQL 17 | **BLOCKED**: Docker Hub image metadata failed with proxy CONNECT `Tunnel connection failed: 403 Forbidden`; no tag was guessed, image pulled or container started. |
| Hosted Auth/RLS/providers/Preview | **NOT RUN / UNVERIFIED**. No real payment, charge, capture, refund, hosted fixture or deployment was performed. |

The SQL suite tests all fifteen plan/cycle prices and flags, twelve UTC calendar
boundaries, service-only/forged-role/direct-access denials, cross-owner/tenant
tampering, unknown/unbound historical orders, conflicting payment/order use,
concurrent identical callbacks and exactly one activation audit event. It tests
rollback after receipt failures and immediate AFTER-trigger overrides, approval
withdrawal/owner reassignment while waiting, lost-response retry, later-plan
preservation, immutable receipts and hostile inherited schema/table/function
ACLs. The final run also executes the actual read-only verification SQL.

The new UI suite does **not** execute the payment API handlers or prove SQL
atomicity. Those are separate actual-handler unit and PostgreSQL tests. Browser
Auth is a memory protocol fixture with the real SDK, not hosted Supabase Auth.
Real Razorpay test-mode behavior, webhooks, reconciliation, legacy trigger/RLS
compatibility and a complete restaurant/resort business lifecycle remain gaps.

The subscription UI suite collected 44 console errors from deliberately blocked
service-worker/script activity and expected pending/disabled responses. It is
not a clean-console or PWA-lifecycle claim. It recorded zero `pageerror` events.
No production p75/INP or Save p50/p95 measurement was performed.
The final suites captured **134 screenshots** in total. The 66 new-ledger and
88 retained-commerce assertions ran in separate isolated databases; neither
replaces hosted Supabase or provider acceptance testing.

## Exact executed commands and evidence

From `/workspace/DIGITAL-DINING`:

```sh
node --test tests/subscription-billing.test.mjs tests/legacy-payment-guards.test.mjs
node /workspace/commerce-validation-artifacts/subscription-ledger-20261101/run-core-checks.mjs
node /workspace/commerce-validation-artifacts/subscription-ledger-20261101/run-core-final.mjs
npm test
npm run lint -- --format json --output-file /workspace/commerce-validation-artifacts/subscription-ledger-20261101/eslint.json
node tests/subscription-checkout.browser.mjs
SUBSCRIPTION_BROWSER_ARTIFACTS=/workspace/commerce-validation-artifacts/subscription-ledger-20261101/ui-final node tests/subscription-checkout.browser.mjs
npm run build
npm run start -- --hostname 127.0.0.1 --port 4320
node /workspace/commerce-validation-artifacts/subscription-ledger-20261101/run-subscription-db.mjs
node /workspace/commerce-validation-artifacts/subscription-ledger-20261101/run-subscription-db.mjs final
node /workspace/commerce-validation-artifacts/subscription-ledger-20261101/run-subscription-db.mjs final2
node scripts/test-subscription-db.mjs
node /workspace/commerce-validation-artifacts/subscription-ledger-20261101/run-commerce-regression.mjs
node /workspace/commerce-validation-artifacts/subscription-ledger-20261101/run-commerce-final.mjs
npm run test:commerce:browser
node scripts/test-commerce-db.mjs
git diff --check
```

These include nested commands, not extra independent builds: the clean-env core
wrapper starts unit/lint/browser; browser performs the fresh build and local
server start. The commerce wrapper reuses that exact synthetic build with
`COMMERCE_BROWSER_SKIP_BUILD=1`. Database wrappers initialize separate guarded
loopback clusters, set explicit test database URLs and stop every cluster.
Their summaries retain exact binary/init/start/stop arguments and exit codes.

Initial SQL tests passed 63 assertions before the inherited-ACL review addition;
the later 66-check runs cover those extra negative installs. The final repetition
also records safe catalog aggregates/object counts; it is the final evidence.
No failing check was hidden, disabled or converted to a mock success.

Final review also added uppercase-UUID handler regressions. UUID bodies are now
canonicalized before comparing PostgreSQL's lowercase result. The first retained
commerce run then exposed a test setup race: its asynchronous old logout could
delete a manually seeded next customer's session. The test now waits for completed
logout and empty own-session storage before seeding, then asserts the new buyer's
identity survives navigation and cart reload. Commerce application source is
unchanged; the corrected full suite passed. The failed initial run and its
signed-out-cart screenshot remain separate evidence, not passing screenshots.

Evidence root:
`/workspace/commerce-validation-artifacts/subscription-ledger-20261101/`.
Use `database-final2/{run-summary.json,subscription-db-summary.json,
verification-results.json,subscription-db.log}`, `core-final/{core-checks-summary.json,
npm-test.log,eslint.json,lint-vs-pr4.json}`, `ui-final/`,
`commerce-final/` and `local-supabase/{registry-error.json,readiness-summary.json}`.
Focused API logs are in the sibling `subscription-ledger-api-20261101/` directory.
The final `ui-final` run rebuilt and retested the replay wording, which refers
to current subscription status without assuming a historical payment means the
current account is active. Retained commerce source is unchanged; its final
regression run used the preceding core build.

Docker context/version checks succeeded. The image-discovery check was a Python
`urllib.request.urlopen` GET to the exact Docker Hub URL in the runbook, with a
30-second timeout, blocked at the CONNECT tunnel. This is distinct from the last
31 October Vercel HTTP403 API denial, which did not establish a CONNECT failure.
No unchanged proxy request was retried or bypassed.

## Remaining release gates

- Review the full new SQL, migration-history baseline and exact target contract.
  Local representative PostgreSQL tests do not establish current Supabase 17,
  installer privileges, legacy trigger/RLS or hosted application compatibility.
- Test real authorized provider test-mode confirmation/reconciliation and hosted
  Auth separately. Existing old captures need an audited decision; no automatic
  historical ledger import exists.
- Vercel Preview remains unavailable/unverified after the last metadata HTTP403;
  no Preview URL or production deployment is claimed.
- Keep paid paths disabled and all deployments, hosted SQL/configuration,
  main/PR merges and live financial operations held for separate approval.

This increment adds only one server environment flag. No new DNS, storage policy,
dependency or provider credential is needed. The full file change list and TXT
handoff are recorded below. Full source/configuration/SQL and evidence packages
are outside Git at `/workspace/commerce-handoff/subscription-ledger-20261102/`,
with exact VS Code destinations and SHA-256 hashes in `README.md`/`manifest.json`.
Sibling archives are `subscription-ledger-20261102-code-txt.zip` and
`subscription-ledger-20261102-evidence.zip`. The full migration is included;
local fixture SQL is explicitly separated from hosted installation instructions.

## Migration fingerprint

SHA-256: `5ff6a97d35f5fa891879e5ebd33c0433620d27fd10bdb95fb64eccd9de6eb93c`. The migration remains unapplied to any hosted target.

## Exact changed files

Compared with PR #4 baseline `727be8e`: 25 files; no deletion or rename.

- **M** [AGENTS.md](../../AGENTS.md)
- **M** [app/api/create-order/route.js](../../app/api/create-order/route.js)
- **M** [app/api/verify-subscription/route.js](../../app/api/verify-subscription/route.js)
- **M** [app/subscribe/[id]/page.jsx](../../app/subscribe/[id]/page.jsx)
- **M** [docs/upgrade/feature-audit.md](feature-audit.md)
- **M** [docs/upgrade/implementation-progress.md](implementation-progress.md)
- **M** [docs/upgrade/master-roadmap.md](master-roadmap.md)
- **M** [docs/upgrade/performance-report.md](performance-report.md)
- **M** [docs/upgrade/release-readiness.md](release-readiness.md)
- **M** [docs/upgrade/security-review.md](security-review.md)
- **A** [docs/upgrade/subscription-ledger-installation.md](subscription-ledger-installation.md)
- **A** [docs/upgrade/subscription-ledger-plan.md](subscription-ledger-plan.md)
- **A** [docs/upgrade/subscription-ledger-report.md](subscription-ledger-report.md)
- **A** [docs/upgrade/subscription-ledger-review.md](subscription-ledger-review.md)
- **M** [docs/upgrade/test-results.md](test-results.md)
- **A** [lib/server/subscriptionLedger.js](../../lib/server/subscriptionLedger.js)
- **A** [scripts/test-subscription-db.mjs](../../scripts/test-subscription-db.mjs)
- **A** [supabase/migrations/20261101123000_subscription_payment_ledger.sql](../../supabase/migrations/20261101123000_subscription_payment_ledger.sql)
- **A** [supabase/tests/subscription_bootstrap.sql](../../supabase/tests/subscription_bootstrap.sql)
- **A** [supabase/tests/subscription_ledger_verify.sql](../../supabase/tests/subscription_ledger_verify.sql)
- **M** [tests/commerce.browser.mjs](../../tests/commerce.browser.mjs)
- **M** [tests/legacy-payment-guards.test.mjs](../../tests/legacy-payment-guards.test.mjs)
- **M** [tests/subscription-billing.test.mjs](../../tests/subscription-billing.test.mjs)
- **A** [tests/subscription-checkout.browser.mjs](../../tests/subscription-checkout.browser.mjs)
- **M** [vercel.json](../../vercel.json)
