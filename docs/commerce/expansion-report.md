# E-commerce expansion implementation and verification

3 November 2026. Branch: `feature/commerce-expansion`, based on `f9dd674`.
This report describes new source under review. It is **not a production release
or a claim that all e-commerce acceptance gates are complete**.

The work follows the requested dependency order: catalog/fulfillment contracts,
customer records and order facts, coupons/analytics/outbox, verified domains,
then separate merchant online payments. The application integration and full
repository/browser checks are being completed against those contracts.

## Current result: PARTIAL PASS

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

Use the final handoff’s manifest for exact changed files, full JS/JSX TXT copies,
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

An unresolved online attempt deliberately keeps the cart/payment method locked.
There is currently no safe unpaid-intent abandonment workflow, so a buyer can
need merchant help after closing an unpaid checkout. Do not clear the attempt or
switch it to COD as a workaround; unknown provider results or delayed capture
must first be reconciled. Real provider sandbox acceptance and a reviewed
abandonment/recovery workflow remain operational risks before activation.

## URLs, release state and remaining gates

Source branch: `feature/commerce-expansion`; automatic Git deployment is
disabled for it. This report does not claim a new PR URL before one exists.
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
