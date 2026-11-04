# E-commerce expansion implementation and verification

## 4 November 2026: stop an unstarted checkout — local PASS, release PARTIAL PASS

The next bounded source increment remains on `feature/commerce-expansion` in
draft [PR #7](https://github.com/chiruthalanaveen/DIGITAL-DINING/pull/7). A buyer
can stop an existing payment request only when the database proves that provider
creation has never been claimed. This is not general unpaid-provider cancellation.

The seventh migration is
[`20261104120000_commerce_stop_unstarted_payment.sql`](../../supabase/migrations/20261104120000_commerce_stop_unstarted_payment.sql).
Read its [complete object/permission and rollback review](stop-unstarted-payment-migration-review.md)
and the [seven-file installation runbook](expansion-installation.md). The six
preceding migration files remain byte-for-byte unchanged.

- The authenticated control RPC binds verified buyer, website and original cart
  key, with an optional expected intent UUID. Cart-key inspection can recover a
  reference lost between intent creation and the provider-creation claim.
- Stopping takes the verified Auth-row share lock, then the same intent row lock
  used by creation. Only `new` with NULL provider order, NULL creation lease and
  no capture receipt is eligible. Creation winning the race rejects the stop;
  stopping winning leaves a terminal `cancelled_unstarted` row and immutable proof.
- A missing row is not proof. Neither absence, popup dismissal, timeout, provider
  failure nor `creating`/`provider_unknown`/`ready`/captured/fulfilled state can
  release the browser pointer. Already-dispatched payments retain reconciliation.
- The browser requires matching website/cart/intent and explicit immutable proof
  before removing its pointer. It keeps the bag and uses a fresh checkout UUID.
  The old key stays reserved, including the existing COD guard. Cancellation
  proof and the original quote/request/amount/version remain in history.
- Shared pointer changes use an exclusive Web Locks lock per buyer/store; stale
  tabs and responses cannot replace or remove a newer attempt. Online start,
  stop and receipt/proof release fail closed without secure-browser locking.
  Check payment can still fetch/display status; COD without a saved online
  pointer is unaffected. A recovered `new` intent has Continue disabled with
  “Stop this request to restart checkout” guidance, not a new provider-resume path.
- Stopped create/resume/verification paths do not reopen the request or send a
  provider order. Recovery remains possible with the store, merchant or rollout
  disabled; it is an own-record recovery operation, not payment activation.

| Current source check | Result | Limit |
| --- | --- | --- |
| `COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55447/commerce_test node scripts/test-commerce-expansion-db.mjs` | PASS — 628 PostgreSQL assertions | All prior 561 retained plus 67 new stop/race/preservation checks. Isolated PostgreSQL 18.4 with synthetic Auth, not hosted Supabase acceptance. |
| `node tests/commerce-payments.test.mjs` | PASS — 27 focused mocked tests | Includes same-origin/verified scope, malformed proof, missing row/capability, conflict, cancelled replay and creation-race paths. No real provider calls. |
| `node tests/commerce-payment-state.test.mjs`; `node tests/commerce-payment-pointer.test.mjs` | PASS — 10 state + 18 pointer tests | Included in the full unit run; tenant/proof boundaries, serialized multi-tab changes, stale scopes and unsupported-locking failures. |
| `npm test` | PASS — 327/327 actual tests, zero skipped | Current full suite; `unit.log`. The owner-payment test loader resolves the new module alias without changing application behaviour. |
| `npm run lint` | PASS — 0 errors, 166 warnings | Current full repository `lint.log`; warnings remain. |
| `npm run build` | PASS — full repository | `build.log` and `build-source-fingerprint.json`; the 321 listed application-source fingerprints remain unchanged through compilation. |
| `node tests/commerce-expansion.browser.mjs` (exact environment below) | PASS — 13 groups, 112 screenshots | Actual full Next.js app and PostgreSQL at 360/390/768/1440 px; `browser/expansion-browser-results.json`. Includes unstarted inspection/stop, retained bag/fresh COD key, races and stale accounts/tabs. Recovery controls are explicitly scrolled into view and checked against each viewport's bounds. Missing-lock rejection is covered by the separate pointer unit tests. |
| `node tests/commerce.browser.mjs` (exact environment below) | PASS — 118 screenshots | Fresh original compatibility, simulated Auth/Storage and actual local RLS. Together the suites captured 230 screenshots; no external provider acceptance. |

Exact browser invocations, sequentially after the matching synthetic fixture-4319
build, were:

```sh
COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55447/commerce_test COMMERCE_FIXTURE_PORT=4319 COMMERCE_BROWSER_SKIP_DB=1 COMMERCE_BROWSER_SKIP_BUILD=1 COMMERCE_BROWSER_ARTIFACTS=/workspace/commerce-validation-artifacts/commerce-unstarted-20261104/browser node tests/commerce-expansion.browser.mjs
COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55447/commerce_test COMMERCE_FIXTURE_PORT=4319 COMMERCE_BROWSER_USE_EXPANSION=1 COMMERCE_BROWSER_SKIP_BUILD=1 COMMERCE_BROWSER_ARTIFACTS=/workspace/commerce-validation-artifacts/commerce-unstarted-20261104/original-browser node tests/commerce.browser.mjs
```

Current evidence belongs under
`/workspace/commerce-validation-artifacts/commerce-unstarted-20261104/`.
No hosted SQL, production data change, provider lookup, charge, refund,
deployment, merge or external notification was performed. The new schema is
review-only for hosted targets and needs no new environment variable, DNS,
Storage policy or cron job. Existing activation/production holds remain intact.
General unpaid-provider cancellation, expiry, refunds and hosted/provider
acceptance remain outstanding; this increment only proves never-dispatched stops.
The full e-commerce checklist remains **PARTIAL PASS** because hosted Supabase
Auth/RLS, sandbox provider, domain/TLS and notification acceptance are unperformed.

## Earlier 4 November 2026 recovery follow-up — validated prior source

Work continues on `feature/commerce-expansion` in draft
[PR #7](https://github.com/chiruthalanaveen/DIGITAL-DINING/pull/7). This bounded
follow-up makes existing unresolved payment attempts discoverable and shows
owners their actual saved checkout configuration. It does not activate a
provider, abandon an unpaid attempt or change payment truth.

That committed-source check passed: **561 SQL assertions, 296/296 unit tests,
zero lint errors/166 warnings, the full repository build and 198 screenshots**
from both full-app browser suites. Application source fingerprints remain stable
through the build and both browser runs. Hosted Supabase/Auth/RLS, real provider
acceptance and all activation/production approvals remain separate and unperformed.

- Signed Super Admin now receives a read-only open-payment queue for the selected
  website. It includes `new`, `creating`, `provider_unknown`, `ready` and
  `captured_unfulfilled`, with captured/unfulfilled first, then unknown/creating,
  then ready/new; oldest timestamp/UUID orders each bucket. At most 100 safe rows
  are returned alongside the exact open total and `has_more` flag.
- References include intent/cart/provider-order/receipt IDs, original credential
  mode, amount/currency, created time and safe receipt reconciliation state.
  Buyer identity, shipping, email, credentials, original request and raw provider
  payloads are excluded. The UI can select the original attempt into the existing
  reconciliation form; selection itself makes no provider request or mutation.
- Buyer Checkout shows the existing payment-intent reference, or checkout/cart
  reference before an intent is confirmed, for support recovery of that same
  attempt. It retains the existing cart lock and does not create a new charge.
- The owner workspace has an orders-permission read-only configuration view for
  merchant configured/enabled state, test/live mode, rollout and blocked reason.
  It uses verified owner Auth/membership and the existing readiness RPC. Its
  status is configuration only, not provider connectivity, capture or settlement.
- Signed Admin GET now canonicalizes a valid uppercase website UUID before
  matching the database’s lowercase tenant projection. A regression using UUIDs
  with alphabetic characters passes, avoiding a false malformed-response/HTTP503
  for an otherwise valid same-tenant identifier. Tenant mismatch still rejects.

The combined follow-up requires the sixth migration,
[`20261104090000_commerce_payment_recovery_queue.sql`](../../supabase/migrations/20261104090000_commerce_payment_recovery_queue.sql),
adding only the service-only STABLE read RPC. It creates no table/column/index/
trigger/RLS policy and updates no payment/business row. The first five migration
bytes/hashes remain unchanged. Read the [full queue migration review](payment-recovery-queue-migration-review.md)
and [installation runbook](expansion-installation.md), now extended to seven files.
Owner status
alone: **No SQL migration required.** It reuses existing readiness SQL.

| Earlier recovery-source check | Result | Limit |
| --- | --- | --- |
| `COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55447/commerce_test node scripts/test-commerce-expansion-db.mjs` | PASS — 561 assertions | Original 531 retained; 27 queue cases and 3 sixth-migration preservation/read-only/reapplication checks. Loopback PostgreSQL 18.4, synthetic Auth only. |
| `node tests/commerce-payments.test.mjs` | PASS — 21 mocked tests | Four new queue projection/cross-scope/missing/denied and meaningful uppercase-UUID regressions added to the prior 17. No provider call. |
| `node tests/commerce-owner-payments.test.mjs` | PASS — 8 focused tests | Verified owner JWT, tenant membership/orders permission, safe DTO, missing/denied/malformed responses, gates and honest labels. No hosted Auth. |
| `npm test` | PASS — 296/296 actual tests, zero skipped | Final current-source full suite includes the uppercase UUID regression; the 3 November 284/284 result below remains historical. Evidence: `commerce-recovery-20261104/final-checks.json` and full unit log. |
| `npm run lint` | PASS — 0 errors, 166 warnings | Fresh full repository `commerce-recovery-20261104/lint.log`. Warnings remain; no rule disablement. |
| `npm run build` | PASS — full repository, final source | Includes the UUID normalization; source fingerprints remain stable across compilation and both browser runs. Evidence: `commerce-recovery-20261104/build.log`, `build-source-fingerprint.json`, `final-checks.json`. |
| `COMMERCE_BROWSER_SKIP_DB=1 COMMERCE_BROWSER_SKIP_BUILD=1 node tests/commerce-expansion.browser.mjs` | PASS — 9 groups, 80 screenshots | Actual full app at 360/390/768/1440 px, owner configuration and selection of the original intent from a retained synthetic local SQL capture receipt; no provider query. Evidence: `commerce-recovery-20261104/browser/expansion-browser-results.json`, `browser.log`. |
| `COMMERCE_BROWSER_USE_EXPANSION=1 COMMERCE_BROWSER_SKIP_BUILD=1 node tests/commerce.browser.mjs` | PASS — 118 screenshots, final source | Fresh original compatibility plus 80 expansion screenshots gives 198. PIN recovery remains explicit HTTP400/503 unavailable; retired subscription is HTTP410 with the existing billing HTTP307 redirect. The external Checkout script is deliberately blocked, not a passing provider test. |

The sixth SQL SHA-256 is
`71b549ed8d1e011511e5ca9e27d21aaa9dd87f676c59b955cba70f2bce053d77`.
Queue installation leaves the existing **33 tables and 31 policies** unchanged;
the public/private function count becomes 65. That recovery-source SQL/application evidence
is consolidated under
`/workspace/commerce-validation-artifacts/commerce-recovery-20261104/`. A tested
hash proves only its recorded local execution, not hosted installation.

No additional environment variable, DNS record, Storage policy or cron job is
needed for these read-only views/references. Existing server-side service role
and signed Admin/owner contexts retain their scopes. No hosted SQL, production
data change, provider setting, deployment, merge, live payment or external
notification was performed. All existing rollout/production approval holds
remain in force; no staging/backup prerequisite is requested again.

General unpaid-provider abandonment remains unimplemented and blocked on authoritative
provider proof and a separately reviewed workflow. An open queue row does not
prove that an attempt is unpaid, failed or safe to delete. The queue/reference
work never marks paid/refunded/cancelled, releases a cart, clears a receipt or
permits switching the same attempt to COD. Capture/provider-unknown recovery
still requires the original version and provider evidence.

## Historical validated expansion — 3 November 2026

3 November 2026. Branch: `feature/commerce-expansion`, based on `f9dd674`.
This report describes new source under review. It is **not a production release
or a claim that all e-commerce acceptance gates are complete**.

The work follows the requested dependency order: catalog/fulfillment contracts,
customer records and order facts, coupons/analytics/outbox, verified domains,
then separate merchant online payments. The application integration and full
repository/browser checks are being completed against those contracts.

## 3 November result: local PASS, release PARTIAL PASS

The combined local PostgreSQL suite passes **531 actual assertions** and
`npm test` passes **284/284 actual tests**. `npm run lint` passes with zero errors
and 166 warnings; the full repository `npm run build` passes. These results use
synthetic local identities and do not establish hosted Supabase Auth, PostgREST,
Storage, provider or production behaviour. All five template layouts have been
captured without overflow at 360/390/768/1440 px. Both the original browser suite
and the expansion suite pass against the actual full app; the latter has eight
check groups and 72 screenshots. No hosted SQL, production data mutation, live payment, notification
send, DNS/provider provisioning, new deployment or merge was performed.

Five SQL migrations are required. They are review-only for hosted targets; see
[installation and verification](expansion-installation.md), the complete SQL
files and the per-object reviews linked there. The installed foundation and the
separate pending platform subscription ledger must not be replayed/applied.
The [complete core/customer/growth schema inventory](expansion-schema-inventory.md)
and [merchant payment review](online-payment-migration-review.md) explain the
column/function/trigger/index/policy and recovery effects in detail.

## Requirement matrix

“Implemented” below describes source, not live activation. Optional features
require their new migration and relevant configuration. Real hosted/provider
acceptance remains unperformed even where isolated tests pass.

| Requirement | Source and local evidence | Remaining acceptance or limitation |
| --- | --- | --- |
| General, saree, grocery, fashion and food storefronts | PASS locally: explicit Admin-assigned templates, configured content/media/JSON-LD and twenty template screenshots across four widths. Legacy website template column stays unchanged; override is stored separately. | Real business content and hosted activation are operator work; no production template was changed. |
| Separate owner workspace and Super Admin control | Existing application/approval/assignment, active membership, website state, features and owner permissions retained. New catalog, growth, engagement and domain panels; signed Admin template/domain/merchant controls. Admin never impersonates an owner session. | Real hosted owner/customer Auth and RLS acceptance unperformed. |
| 1. Product gallery and zoom | PASS locally: ordered gallery/variant options, existing image fallback, keyboard/zoom focus, actual owner gallery save and four-width layouts. Up to 12 images through the validated model. | Auth/Storage provider behaviour remains simulated; real devices/provider uploads are unperformed. |
| 2. Advanced filters | PASS locally: original advanced-filter/browser compatibility suite plus variant availability and stock limits. Search/category/exact-paise bounds/availability/sorting compose. | No fabricated products or availability; no real traffic performance claim. |
| 3. Bag and checkout | PASS locally: legacy cart import, variants, saved addresses, PIN zones, coupons, authoritative COD total, lost-response/changed-retry and stock-exhausted reload reconciliation. | Unknown payment/order responses retain their attempt; real provider checkout remains separately unverified and disabled. |
| 4. SEO and performance | Tenant-configured title/description/image metadata, canonical/OpenGraph, private/unavailable noindex, native image dimensions/loading, and server-rendered CollectionPage/ItemList/Product JSON-LD with validated public facts and script-safe serialization. Nine SEO tests pass. | No field p75, real LCP/INP, search-engine rich-result acceptance or production performance claim is made. |
| 5. Order tracking | Customer-scoped history plus deterministic immutable status/payment events and exact stored order state. | No invented GPS, delivery estimate or backfilled historical transitions. Hosted updates/reconnect acceptance unperformed. |
| 6. Delivery PIN codes and fees | Tenant PIN zones, fees and minimums enforced during quote/order creation; pickup and flat-fee compatibility preserved. | Configure each store’s actual coverage. No shipping-provider or courier booking integration is claimed. |
| 7. Variants and SKUs | Stock-bearing tenant variants, options, SKU/price, separate inventory adjustments, immutable order snapshots and once-only cancellation restocking. | Variant and final-unit races pass locally; hosted compatibility unperformed. |
| 8. Policies and trust | Optional plain-text shipping/returns/privacy/terms, FAQ, explicit return policy/window and owner branding permission. | Store operators must supply their actual terms; no legal assurances or invented policies are displayed. |
| 9. Wishlist | PASS locally: persisted website/customer/product relation, private list, failed-read retry and wishlist/identity-switch isolation in the full browser suite. | Real hosted Auth/RLS remains unperformed. |
| 10. Ratings and reviews | Own completed-order eligibility, rating/body validation, moderation, reset on edit and anonymous approved-review projection without buyer identities. | No fake reviews; hosted Auth/moderation acceptance unperformed. |
| 11. Coupons and promotions | Fixed/percentage exact-paise discounts, dates, caps, spend and per-buyer/overall limits; atomic immutable redemptions and final-use contention tests. | Actual campaigns are unconfigured. Cancellation retains redemption history; no reset/refund of coupon usage is implied. |
| 12. Saved addresses | Website/customer address book, one default, scope checks and checkout autofill preserving typed input. Original shipping snapshot survives address edit/delete on identical retries. | Provider Auth/Storage behaviour is not established by local roles. |
| 13. Cancellation and returns | Customer requests and owner decisions; cancellation calls variant-aware stock logic once; returns require recorded policy/time eligibility. | Return approval records a decision only. Collection, refund and payment adjustment are separate verified operations; no automatic refund is implemented. |
| 14. Owner analytics | Permission-scoped 7/30/90-day UTC daily trends, top ten completed-order product snapshots, up to fifty permitted low-stock signals, counts, placed value, completed COD order value and notification counts. Analytics adds 34 passing SQL assertions to the integrated suite. | Only creation/status-change completion facts establish the date. Legacy payment-only facts do not reopen return windows or fabricate completions. Captured/settled funds remain explicitly unavailable; order value is not a settlement balance. |
| 15. Homepage builder | PASS locally: configured ordered sections/media on all templates, SQL/API validation and owner policy/FAQ/section panel at four widths. | No arbitrary scripts/HTML. Empty or disabled sections do not invent content; hosted operator content remains unconfigured. |
| 16. Order notifications | Transactional deduplicated outbox, leased claims, bounded retry/backoff, safe status projection and disabled-by-default Resend adapter. | Verified sender, separately approved activation and real delivery acceptance are outstanding. No new cron job or live send was installed. |
| 17. Commerce Razorpay payments | Separate encrypted immutable credential versions, durable intents/capture receipts, provider-order binding, webhook leases, signature plus provider capture checks and reconciliation. COD/online share cart-key protection. Captured/unfulfilled receipt remains recoverable. | Default off. Real sandbox Checkout/webhook acceptance, hosted Auth/SQL and later explicit live activation remain outstanding. No automated refund/settlement implementation is claimed. |
| Custom/generated domains | Tenant claims, reserved-host protection, signed Admin provider controls, ownership/deployment/TLS checks, guarded host routing and generated-name wildcard readiness. | Both flags off. Real tenant DNS, wildcard certificate, verified project alias, callback allowlist and provider acceptance remain outstanding. |

## Preservation

The new migrations do not update/delete existing restaurant, delivery, resort,
wallet, payment, customer, Auth or cron records. Existing policy definitions and
grants are retained. Catalog changes add optional order/item snapshots and widen
the commerce total/item uniqueness contracts; the payment migration widens the
commerce payment-method constraint. These are deliberate commerce DDL changes,
not a claim that no existing database object changes. The original checkout and
owner implementations are retained privately while validated wrappers prevent
older clients from bypassing the expanded rules.

The local runner snapshots **14 existing fixture tables and 18 RLS policies**,
including columns, rows, grants and definitions. It checks preservation,
cross-owner/customer access, strict mutation grants, compatibility, concurrency
and atomic failure of one-time migration reapplication. That is synthetic
preservation evidence, not a copy or backup of production data. See
[database evidence](expansion-db-validation.md).

The canonical foundation SHA-256 remains
`dd2882f6329808783b1d4d97c4264f59989b7e834753aa06efe46d63855db1ca`.
The original `app/components/commerce/storefront.css` remains
`409e198eef58fc2ddde3ff96d348ef39b042985fad7e0408623b41c41a3a78d7`.
All styling additions are separate files.

## Verified integration fixes

- The public catalog now consumes the expanded RPC instead of discarding
  template/settings/gallery/variant/zone fields. Only typed missing-extension
  errors permit a legacy fallback; denial, timeout and malformed success do not.
- Owner/Admin catalog reads validate complete, tenant-consistent workspaces.
  Template assignment confirms the requested returned template, so an empty or
  mismatched successful response cannot be reported as saved.
- Identical checkout retries retain original saved-address and variant/price
  snapshots even after address or catalog edits. Response-loss/reload recovery
  checks the buyer’s original order instead of requiring now-exhausted stock.
- COD/online share the cart lock; duplicate provider capture has one immutable
  receipt/order. Copied browser pointers, mismatched popup details and tampered
  fulfilled receipt/order bindings cannot release the saved attempt.
- Completion analytics and return eligibility use actual creation/status-change
  completion facts. A later payment-only event cannot invent a completion date
  or extend a legacy return window. Completed COD metrics exclude online orders;
  Admin’s broader report is labelled completed order value.
- The analytics layout now fits 360 px, and owner/customer history shows the
  stored variant/SKU snapshots. The original stylesheet remains unchanged.

## Verification ledger

| Exact command or check | Result at this report revision | Evidence and limit |
| --- | --- | --- |
| `COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55447/commerce_test node scripts/test-commerce-expansion-db.mjs` | PASS — 531 assertions | Isolated PostgreSQL 18.4; original 88 checks, 72 post-expansion compatibility, catalog 33, customer 71, growth 40, analytics 34, domains 73, payments/online quote 44, integrated checks 76. No hosted credentials. |
| `node tests/commerce-storefront-seo.test.mjs` | PASS — 9 actual tests | Public facts, exact-paise offers, disabled/unavailable stores, URL/privacy and JSON-LD serialization safeguards. No real search-engine or field-performance evidence. |
| `node tests/commerce-payments.test.mjs` | PASS — 17 mocked tests | Strict Auth/permission/quote/capture/signature/provider-binding and reconciliation cases; no real Razorpay sandbox account or provider request. |
| `node tests/commerce-payment-state.test.mjs` | PASS — 3 actual tests, included in `npm test` | Browser boundary checks reject copied tenant/intent pointers, mismatched popup order/amount/currency/key and tampered fulfilled receipts. |
| `node tests/commerce-api.test.mjs` | PASS — 36 actual tests | Typed missing-extension fallback, authoritative quotes, strict input, tenant projections, Admin/owner guards and malformed-success regressions. Mocked clients only. |
| `node tests/commerce-domains.test.mjs` | PASS — 27 actual tests | Mock provider/DNS/TLS contracts and routing; no real provider provisioning. |
| `node tests/maintenance.test.mjs` | PASS — 14 actual tests after fixture dependency repair | New domain resolver is explicitly stubbed for maintenance scope; domain routing has its own tests. |
| `npm test` | PASS — 284/284 actual tests | `npm-test-complete.log`; final suite includes new payment-state regressions. No skipped/cancelled tests. |
| `npm run lint` | PASS — 0 errors, 166 warnings | `npm-lint-complete.log`; warnings remain and are not described as fixed. No rule was disabled to obtain the result. |
| `npm run build` | PASS — full repository | `build-final.log`; `build-source-fingerprint.json` records exit code zero and unchanged source fingerprints throughout the build. The actual full app is used for browser verification. |
| `COMMERCE_BROWSER_USE_EXPANSION=1 COMMERCE_BROWSER_SKIP_BUILD=1 node tests/commerce.browser.mjs` | PASS | Original suite recreates the guarded local expanded database, then validates PKCE confirmation/recovery, onboarding/Admin approval, products/media/stock, COD, retry/restock, account/tenant isolation and mobile layouts. Evidence: `original-browser-release.log`, `original-browser/`. |
| `COMMERCE_BROWSER_SKIP_DB=1 COMMERCE_BROWSER_SKIP_BUILD=1 node tests/commerce-expansion.browser.mjs` | PASS — 8 groups, 72 screenshots | Five templates/JSON-LD, gallery/variants/coverage/coupon checkout, lost-response/reload recovery, customer tools/privacy, actual owner gallery save/analytics panels and signed Admin controls at 360/390/768/1440. Evidence: `browser-release/expansion-browser-results.json`, `expansion-browser-release.log`. |

Use [the exact changed-file manifest](expansion-changes.md) for paths and the
downloadable review package for full JS/JSX/MJS/TS/TSX TXT copies,
SQL, styles, tests, screenshots and command logs. Do not publish customer data or
credentials in those artifacts. A green file-wrapper result under restricted
child-process execution is not counted as the actual Node test cases above.

Evidence is under
`/workspace/commerce-validation-artifacts/commerce-expansion-20261103/`.
The initial full test run exposed 14 maintenance-fixture import failures and
lint found a reserved payment-test variable name; both were fixed and the full
checks above rerun. The expansion browser assertions also needed repair because
Playwright reported a disabled native `<option>` inconsistently with its actual
DOM `disabled` property. The rerun checks the native property and does not remove
the product-availability assertion. These test fixes are not production data or
permission changes.

Legacy route checks pass with their intended fail-closed/retired behaviour:
`/api/delivery/customer/forgot-pin` validates missing input with HTTP400 and
returns explicit `PIN_RECOVERY_UNAVAILABLE`/HTTP503 when the verified proof
channel is unavailable; it is not a working PIN-reset claim.
`/api/create-subscription-order` returns `SUBSCRIPTION_ENDPOINT_RETIRED`/HTTP410,
and bookmarked `/dashboard/<id>/billing?plan=delivery&amount=1` redirects HTTP307
to `/subscribe/<id>?plan=delivery`, dropping the caller amount. Singular/plural
delivery return routes reject missing/invalid input with HTTP400. Successful
PIN proof/reset and valid authenticated legacy return/provider flows remain
unverified where their development integration is unavailable.

Both browser runs deliberately block external `checkout.razorpay.com` requests
at the test browser’s request boundary. This is isolation of a provider script,
not a diagnosed network-proxy failure. Real Razorpay Checkout UI, hosted Auth/
Storage/email delivery and real webhook acceptance were not tested or bypassed.
The order/quote/stock/RLS checks use actual local PostgreSQL and real Next HTTP
routes with synthetic Auth/Storage protocols. The original browser run’s lab
measurements are local observations, not production/field Web Vitals.

An already-dispatched or unknown online attempt deliberately keeps the
cart/payment method locked. General unpaid-provider abandonment remains absent,
so a buyer can need merchant help after closing an opened provider checkout.
Do not clear that attempt or switch its old key to COD as a workaround; unknown
provider results or delayed capture must first be reconciled. The new flow
above is narrower: only a proven never-dispatched intent may stop, with retained
proof and a fresh next key. Real provider sandbox acceptance and a broader
authoritative cancellation/recovery workflow remain risks before activation.

## URLs, release state and remaining gates

Source branch: `feature/commerce-expansion`, under review in draft
[PR #7](https://github.com/chiruthalanaveen/DIGITAL-DINING/pull/7), stacked on
draft PR #6 and the unmerged #3/#4/#5 chain. The preceding recovery commit's
4 November build/browser fingerprint remains historical evidence. The new
unstarted-checkout source has passed the local checks recorded above; the latest
reviewed commit and its verified files belong in the updated TXT handoff
manifest. This report does not claim that the new increment has been committed
or pushed; the final handoff records that status. Automatic Git deployment is
disabled for this branch.
No Vercel Preview has been created for this expansion, and no staging-backed
Preview URL is available. No network-blocked hosted check is relabelled as a pass.

The existing live site, <https://www.digitaldine-in.online/>, serves the earlier
approved application SHA `84188e385d0286fc7d40cec03a179a68a905a167`; it does not
prove this new expansion is deployed or its migrations installed. No main push,
merge or deployment is part of the new implementation work.

Remaining operational acceptance is hosted Supabase version/Auth/PostgREST/RLS/
Storage, precise callback origins, tenant provider configuration, actual DNS/TLS,
sandbox merchant/provider signature/webhook/reconciliation behaviour, external
notification acceptance and representative performance/accessibility checks.
The full build and existing unit regressions also cover shared/legacy source,
but they do not establish exhaustive restaurant, delivery, resort, wallet,
returns, printer/device or payment-provider end-to-end acceptance with real
accounts. No live payment or production fixture was used to fill that gap.
The user withdrew staging/backup prerequisites; implementation proceeds locally
without using production as a substitute test environment or asking for those
prerequisites again. Production SQL and publication require separate applicable
approval of the final reviewed files and application commit.
