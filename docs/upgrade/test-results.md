# Phase 0 test evidence

1 November 2026. Tests use synthetic development credentials only. No hosted
Supabase project, production data, live order or payment provider was used.

## Current results

| Check | Actual result and boundary |
| --- | --- |
| `npm test` | **PASS: 123/123**, zero failures. Includes actual owner/payment handlers with strictly injected synthetic effects; not real provider or hosted RLS proof. |
| Owner focused regressions | **PASS: 15/15** for actual resolver/approval modules and browser helper request/failure contracts. |
| Payment focused regressions | **PASS: 34/34** including existing subscription/wallet regressions, approval denials, captured/uncaptured states, signature/binding checks and absence of denied business effects. |
| `npm run build` | **PASS**, fresh production build with synthetic loopback configuration, nested in the initial owner browser run. Its later test-only timing failure did not invalidate the completed build. |
| Owner browser | **PASS: 12/12 admission cases**, 36 screenshots at 360/390/768/1440 px, zero document overflow or collected page errors. Actual Next.js, server handlers and browser SDK against a memory-only Auth/REST protocol fixture. |
| `npm run lint` | **FAIL: 169 errors, 179 warnings**. Exact normalized comparison to preceding PR #3 `4ac1e12` finds zero new errors or warnings. Fresh pre-commerce comparison also confirms all 169 errors are inherited. |
| Commerce SQL/API/browser regressions | **PASS**: 88 actual PostgreSQL assertions and complete API/Chromium commerce regressions; 118 additional screenshots. All fixture services stopped. No ordinary console-error collection in this separate suite. |
| Hosted role/RLS/provider/SMTP/Preview checks | **NOT RUN**. Legacy SQL definitions/test infrastructure and provider verification remain incomplete; Vercel's last metadata check returned HTTP403. |

Focused test counts are subsets of the 123 total, not additional unit tests.
The owner fixture models authorization for the protocol test; it is not a real
Supabase RLS installation. The retained commerce database suite uses actual
isolated PostgreSQL, but does not certify all legacy module policies.
Together the final suites captured **154 screenshots**. The commerce suite
retains onboarding, approval, products/media, cross-tenant denials, stock/COD,
retries/fees/history and scoped PKCE regressions. Its build was deliberately
reused from this increment, not skipped without a fresh build.

## Exact commands

From `/workspace/DIGITAL-DINING`:

```sh
node --test tests/delivery-pin-recovery.test.mjs tests/delivery-return-alias.test.mjs
node --test tests/owner-account.test.mjs
node --test tests/subscription-billing.test.mjs tests/legacy-payment-guards.test.mjs tests/delivery-payment-capture.test.mjs
node /workspace/commerce-validation-artifacts/phase0-audit-20261101/financial-source-reproduction.mjs
node /workspace/commerce-validation-artifacts/phase0-audit-20261101/run-phase0-checks.mjs
npm test
npm run lint -- --format json --output-file /workspace/commerce-validation-artifacts/phase0-audit-20261101/eslint.json
node tests/owner-account.browser.mjs
npm run build
npm run start -- --hostname 127.0.0.1 --port 4320
COMMERCE_BROWSER_SKIP_BUILD=1 OWNER_BROWSER_ARTIFACTS=/workspace/commerce-validation-artifacts/phase0-audit-20261101/owner-browser-final node tests/owner-account.browser.mjs
node /workspace/commerce-validation-artifacts/phase0-audit-20261101/compare-lint-current.mjs
node /workspace/commerce-validation-artifacts/phase0-audit-20261101/run-commerce-regression.mjs
npm run test:commerce:browser
node scripts/test-commerce-db.mjs
git diff --check
```

`run-phase0-checks.mjs` starts the unit, lint and initial owner-browser commands
with `developmentEnvironment()`; the owner script invokes build and server start.
The final owner rerun reuses that build. The commerce wrapper runs its SQL/browser
commands with `COMMERCE_BROWSER_SKIP_BUILD=1`, reusing the same fresh synthetic
build. These are nested commands, not additional independent build runs. Shell
output redirections only capture logs; wrappers contain exact PostgreSQL binary,
init/start/stop arguments, loopback checks and subprocess exit statuses.

The initial financial reproduction was **BEFORE the fixes**, baseline `4ac1e12`.
It proved vulnerable handler behavior using synthetic SDK/database effects. It
intentionally expects the old behavior and must not be presented as a passing
current regression test or rerun against production. Current unit tests assert
the repaired behavior. The separate delivery negative suite passed 12/12.

## Browser failure correction and console evidence

The initial owner run passed build and the first five admission cases, then
read the root layout's empty ARIA alert before the async login error rendered.
The test now waits for expected nonempty text. Only the test locator changed;
the final owner rerun passed all twelve cases. Earlier failure artifacts remain
separate and are not counted as passing screenshots.

The owner browser records **48 console error events**: fifteen PWA registration
errors under deliberately blocked service workers, fifteen blocked external
Razorpay script loads, twelve expected HTTP denial responses and six expected
login errors in denial cases; zero other recorded categories. Do not report a
clean console or claim PWA lifecycle works. Its `pageerror` list is empty.
Full contrast/WCAG coverage, device passkeys, real OAuth providers, full restaurant
operations, wallet, resort booking concurrency and real refunds remain untested.

## Evidence locations

`/workspace/commerce-validation-artifacts/phase0-audit-20261101/` contains:

- `npm-test.log`, `core-checks-summary.json`, `lint.log`, `eslint.json`,
  `lint-baseline-comparison.json` and `lint-vs-pr3.json`.
- `payment-guards-focused.log`, `payment-guards-lint.log`,
  `financial-source-reproduction.json` (before fixes) and
  `owner-link-source-reproduction.json` (source-contract explanation).
- `owner-browser/build.log` and the initial failure, plus
  `owner-browser-final/owner-browser-summary.json`, its 36 PNGs and
  `owner-console-classification.json`.
- `commerce-browser/` and its final summary, database/API/browser logs and PNGs
  from the completed successful run; `final-summary.json` consolidates results.

**No SQL migration required.** No production SQL or deployment was performed.
