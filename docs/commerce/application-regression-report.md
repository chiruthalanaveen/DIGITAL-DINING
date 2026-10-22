# Existing Digital Dine-In regression review

This report addresses the existing-application checks requested after the
commerce implementation. It distinguishes source preservation, isolated handler
tests and actual browser/database workflow evidence. Production SQL, production
test writes, live payments, merges and further production deployments are not
authorized. A production-target staged build is not a staging-backed Preview.

## Scope and evidence boundary

At the start of this review, the non-commerce legacy pages, handlers and helpers
below were unchanged from pre-commerce baseline `4d036fb`; the existing Super
Admin dashboard had only the new commerce navigation/panel insertion. The branch
also includes the earlier maintenance-mode prerequisite relative to GitHub main.
Source equality reduces the change surface; it does not prove a working legacy
workflow, correct hosted RPC/RLS behavior, provider integration or mobile layout.

The prior automated run reported 43 unit tests: 21 commerce API, 14 maintenance
and eight staging-target guards. Its actual local commerce integration passed
with real PostgreSQL/RLS behind a small local Auth/REST/Storage adapter. The
adapter returns empty fixtures for many legacy Admin datasets and does not
implement the full legacy database or provider API. Opening the commerce panel
inside `/admin/dashboard` therefore does not certify every existing Admin panel.

The new returns compatibility regression below adds seven offline handler tests.
Use the final application test report for the latest aggregate count, build,
browser screenshots and any subsequently completed localhost checks. Historical
results in earlier review documents must not be represented as a new hosted run.

## Configured lint: actual failure and baseline comparison

The repository's configured `npm run lint` **fails** with 169 errors and 180
warnings. Running the same installed ESLint against baseline `4d036fb` produced
169 errors and 177 warnings. After normalizing relative filename, rule and error
message, there were **zero introduced error differences**. The three additional
warnings are `@next/next/no-img-element` recommendations for tenant-provided
storefront images.

The failing whole-repository lint result must remain visible. Passing scoped
lint for changed files and a successful Next.js build do not convert it to a
green repository-wide lint result. Broad cleanup of unchanged legacy code was
not used to hide the inherited findings.

Evidence is retained outside Git:
`/workspace/commerce-validation-artifacts/application/lint-baseline-comparison.json`,
with the full lint logs/JSON alongside it. The baseline comparison used a separate
checkout and the same installed lint toolchain, not edits to the working app.

## Existing-feature coverage matrix

“Not functionally verified” below means that source/route inspection or a build
is not sufficient evidence for the full user journey. Local rendering/error-state
smokes, when recorded separately, cover only those specific assertions.

| Existing feature | Exact routes and principal helpers | Current meaningful evidence and remaining checks |
| --- | --- | --- |
| Main Digital Dine-In website | `/` → `app/page.tsx`; `InstallAppButton`; root layout and maintenance proxy | Source unchanged. The 14 maintenance tests cover persisted on/off behavior and route exemptions. Verify actual landing navigation, branding, menu/buttons and mobile layout; build alone is insufficient. |
| Delivery discovery | `/delivery` → `app/delivery/page.jsx`; `DeliveryLocationMap`; RPCs `get_nearby_delivery_stores`, `delivery_wallet_eligible_restaurant_ids`, `delivery_plan_eligible_restaurant_ids`, `delivery_polygon_eligible_restaurant_ids` | Source unchanged. No complete location→eligible-store positive workflow is established by commerce fixtures. Test accepted/denied GPS, manual destination, empty/error states and eligibility intersections with development records. |
| Legacy delivery stores | `/delivery/[restaurantCode]` → `DeliveryStoreExperience`; native `/app/delivery/[restaurantcode]` | Both use legacy store/catalog behavior; commerce `/shops/[slug]` tests do not validate these routes. Test `get_public_delivery_store`, categories/search/cart, store switching and account-specific state. |
| Restaurant owner dashboard | `/dashboard/[id]`; `/app/owner`, `/app/owner/[restaurantId]`; `OwnerDeliveryManagement`, `OwnerDeliveryWallet`, `ResortManagement`; `/api/owner/approval-status`, `/api/owner/restaurant-orders` | Source unchanged. Commerce-owner login is a different workflow. Test approved/pending owner sessions, expired login, another restaurant's selector, module switching and persisted edits under legacy RLS. |
| Manager dashboard | `/manager/[restaurantId]`; `/app/manager/[restaurantId]`; `ManagerDeliveryManagement`, `ManagerWalletReadOnly`; `/api/staff/login`, `/api/manager/wallet` | Source unchanged. Calls `get_manager_dashboard_data_session`, table-inventory and `manager_action_session`/legacy RPC alternatives. Real role/session restrictions, inventory and order actions remain unverified without compatible development fixtures. |
| Existing Super Admin | `/admin`, `/admin/dashboard`, `/admin/delivery-advertisements`; `/api/admin/login`, `/api/admin/session`, `/api/admin/control-center` and each Admin submodule API | Actual local HMAC login and commerce-panel operations were exercised; maintenance authorization has unit coverage. Empty local legacy datasets are not proof that restaurant, delivery, wallet, privacy, registration and support panels work with real records. |
| Restaurant menu and staff operations | `/menu/[id]`, `/waiter/[restaurantId]`, `/kitchen/[restaurantId]`, their `/app/...` versions; `/api/staff/restaurant-orders`; QR handlers under `app/api/[restaurantid]/` | Source unchanged. Test menu/cart, counter/COD-like restaurant ordering, kitchen/waiter updates and staff authorization with isolated restaurant data. No full restaurant-order lifecycle is established by commerce COD tests. |
| Resort browsing, bookings and guest portal | `/stay/[restaurantCode]`, `/stay/room/[publicToken]`; `ResortManagement`; `/api/resort/create-booking`, `/api/resort/create-order`, `/api/resort/razorpay/create-order`, `/api/resort/razorpay/verify-payment` | Uses legacy `get_public_resort`, `check_resort_availability`, `create_resort_booking`, `create_public_room_booking` and room-service RPCs. Availability, overlapping bookings, guest tokens and provider verification need development functional tests. |
| Existing customer authentication | `/delivery/login`, `/delivery/signup`, `/delivery/forgot-pin`; `/auth/delivery-callback`; `/api/delivery/customer/login`, `/session`, `/register-verified`, `/register-pin-question`; `deliveryGoogleAuth`, `deliveryCustomerMobileSession`, `deliveryCustomerSignupSecurity` | Commerce Auth/session tests do not cover legacy Mobile/PIN or Google flows. Verify store-bound sessions, signup policy, wrong credentials, logout/expiration and account switching. A missing recovery endpoint is recorded below. |
| Saved addresses | `/api/delivery/customer/addresses`; selected-address UI in `DeliveryStoreExperience`; legacy saved-address tables and `dd_delivery_select_default_address` | Source unchanged. Test Mobile/PIN and Google ownership independently, create/edit/delete/default selection, another account's ID and selected-address invalidation after sign-out. No successful saved-address lifecycle has been demonstrated in the commerce suite. |
| Legacy delivery COD checkout | `/api/delivery/orders/create`; `DeliveryStoreExperience`; legacy stock/fee/customer-session helpers and `create_delivery_order_fee_confirmed` | Source unchanged. New commerce COD is a separate SQL transaction. Test legacy server prices, delivery eligibility, fees, stock, duplicate requests, owner receipt and cancellation in isolated legacy data. Do not use live restaurant/wallet rows. |
| Razorpay test checkout and subscriptions | `/api/delivery/razorpay/verify-payment`; `/api/[restaurantid]/qr-payment/{create,verify}`; `/api/resort/razorpay/{create-order,verify-payment}`; `/api/create-order`, `/api/verify-subscription`; `paymentGatewayCrypto`, `qrPaymentServer` | Browser harness deliberately blocks `checkout.razorpay.com`; this is not a sandbox provider success test. Dedicated test keys, approved merchant test configuration and isolated order records are absent. Signature, amount/currency, replay, failed/cancelled payment and refund behavior need focused mocks plus actual provider test-mode validation. An old billing-page endpoint gap is recorded below. |
| Legacy inventory | Owner/manager restaurant pages; `OwnerDeliveryManagement`, `ManagerDeliveryManagement`, `DeliveryManagement`; legacy product/order RPCs such as `delivery_consume_order_inventory` and `delivery_release_order_inventory` | Source unchanged. New commerce stock/concurrency checks do not prove legacy inventory behavior. Test own-restaurant edits, foreign IDs, last-unit competition, paid/pending order handling and exactly-once release using development data. |
| Delivery order tracking | `/delivery/[restaurantCode]/track/[orderCode]`; `get_public_delivery_order`, `get_public_delivery_orders_by_mobile`; `useLiveDeliveryRefresh`, `LiveDeliveryTrackingMap` | Source unchanged. Test correct store/order/customer identifiers, unauthorized/invalid codes, received→delivered transitions, navigation and live-refresh/map failure behavior. Third-party map availability is not established by a blocked-external-request browser run. |
| Wallet and platform fees | `/api/owner/wallet`, `/api/owner/wallet/{create-order,verify-payment}`, `/api/manager/wallet`, `/api/owner/platform-fee-preferences`, `/api/[restaurantid]/qr-platform-fee`; `/api/cron/delivery-wallet-settlement`; `OwnerDeliveryWallet`, `ManagerWalletReadOnly`, `qrPaymentServer` | Local SQL tests preserve fictional balance/history and a cron row; they do not run the real settlement RPC. Test read-only owner/manager scope, fee quotes and synthetic sandbox top-ups. Never invoke real settlement/adjustment endpoints, alter live balances, or reschedule production cron as a regression test. |
| Returns, replacements and refunds | `/api/delivery/customer/return` and new compatible `/returns`; `/api/delivery/after-sales/refund`, `/api/delivery/cod-refund`; `DeliveryCustomerReturnsControl`, owner/manager delivery views | Fixed the plural URL mismatch without changing the singular authorization/return handler. Seven offline tests cover validation, sessions, cross-customer denial, policy denial and delegated success. Real case progression, provider refunds, COD bank verification and owner/manager authorization remain separate unrun integration checks. |
| Seasonal advertisements | `/api/delivery/seasonal-ads`, `/api/admin/delivery-seasonal-ads`, `/api/admin/delivery-seasonal-ads/upload`; `/admin/delivery-advertisements`; `delivery_seasonal_campaigns` | Source unchanged. Verify authorized create/edit/media upload, start/end windows, store scoping, inactive/expired campaigns and mobile placement with staged fixtures. No real legacy campaign lifecycle is established by the new commerce banner settings. |
| Custom delivery boundaries | `app/delivery/page.jsx` and `DeliveryStoreExperience`; `DeliveryLocationMap`; `delivery_polygon_eligible_restaurant_ids` and coverage RPCs | Source retains fail-closed polygon verification in addition to radius, plan, approval and wallet checks. Test inside/outside/on-edge locations, invalid coordinates, absent coverage and RPC failure. No map/provider or hosted polygon-RPC compatibility pass is claimed. |

## Bugs found, one minimal correction, and unresolved source gaps

The final running Next.js checks confirmed singular/plural return GET/POST invalid
input responses are HTTP 400; missing PIN recovery GET and old subscription-order
POST respond HTTP 404. These are actual localhost observations under synthetic
development configuration. The missing endpoints are findings, not passing
functional journeys. See [application-testing.md](application-testing.md) for the
50-test/82-SQL-assertion result, build, screenshots and overall release verdict.

### Delivery customer returns URL — fixed

`DeliveryStoreExperience.jsx` called GET/POST
`/api/delivery/customer/returns`, while only singular `/return` existed. The
mismatch also exists at baseline `4d036fb`, so it was not introduced by commerce.
The new [`returns/route.js`](../../app/api/delivery/customer/returns/route.js)
re-exports the same existing `GET`/`POST` functions, retaining the original
singular URL, Node runtime and dynamic behavior. It does not duplicate or bypass
the original customer/order/return-policy checks, write a migration, or invent a
refund/payment procedure.

Exact focused checks executed:

```sh
node --test tests/delivery-return-alias.test.mjs
npx --no-install eslint app/api/delivery/customer/returns/route.js tests/delivery-return-alias.test.mjs
git diff --check
```

**Seven tests passed**, zero failures/skips; targeted ESLint and the diff check
passed. Tests compile the actual handlers in memory and replace only Auth/database
dependencies with fictional fixtures. They assert handler identity, both methods'
early HTTP 400 validation, HTTP 401 session rejection, HTTP 404 foreign-customer
order denial, HTTP 403 disabled-return-policy denial, successful GET response/
privacy headers and POST case creation with the expected scoped RPC arguments.
No service credentials or live RPCs are read/called. Actual route discovery and
HTTP invalid-input smoke checks are a separate final browser-run requirement.

### Delivery PIN recovery — unresolved baseline source gap

`app/delivery/forgot-pin/page.jsx` calls GET/POST
`/api/delivery/customer/forgot-pin`; no matching route or Next.js rewrite exists.
The legacy login links to that page. This is a confirmed repository route gap,
also present at baseline. Localhost HTTP status evidence should accompany the
final report; source inspection alone is not a completed recovery workflow test.
No reset handler was invented without a verified security/retention/session
invalidation contract and hosted staging tests.

### Old subscription billing page — unresolved baseline source gap

`app/dashboard/[id]/billing/page.jsx` POSTs `/api/create-subscription-order`, which
has no matching handler/rewrite, also at baseline. The separate primary
`/subscribe/[id]` flow calls the present `/api/create-order` handler; this does not
make the older billing URL valid. Confirm whether that old page remains an
intended entry point and verify its localhost failure path. Do not blindly alias
financial endpoints: request schemas, server pricing, authorization and provider
verification must be checked first. No provider call or payment remapping was
made by this review.

## Minimal isolated legacy browser smoke plan

These checks can run against the same synthetic local Next.js app without
production data, then be repeated with real development Supabase fixtures.
Allow only the local app and approved fixture origin. Keep payment providers,
push/email services, external schedulers and live databases unreachable.

1. Render `/`, `/login`, `/delivery/login`, `/delivery/signup`, and
   `/delivery/forgot-pin?store=TESTSTORE` at desktop/mobile sizes. Check headings,
   main links, keyboard controls, no page exceptions and no document overflow.
   This proves the tested rendering/navigation states, not successful login.
2. Open `/delivery`, a legacy `/delivery/TESTSTORE` and a tracking URL. Supply
   explicit isolated read fixtures for the actual public RPCs before claiming
   positive catalog/tracking results. With no such fixture, verify only a clear
   unavailable/empty/error state; do not turn every unknown RPC into a fake
   successful response.
3. In the actual running app, GET and POST invalid input to both `/return` and
   `/returns`; expect the same HTTP 400 JSON validation response. Then use an
   authenticated development order/customer to verify both legitimate return
   creation and foreign-order denial before calling the whole returns journey
   passed.
4. Verify malformed/unauthenticated requests are rejected by owner/manager/Admin,
   address, wallet and provider-verification APIs without creating any transaction.
   Do not send a valid settlement, top-up, refund or payment request without
   deliberately isolated fixtures and test-mode credentials.
5. Verify the two missing endpoint paths return a real localhost failure rather
   than silently skipping them; retain response status and originating page in
   the report. Keep missing security/provider contracts marked unresolved.
6. Load the existing Admin overview and at least one legacy read-only panel after
   actual local Admin login. Distinguish data fixture/read-state rendering from
   successful legacy mutations. Verify unauthorized dashboard access separately.

This smoke plan is intentionally a short first layer. The full positive legacy
workflows in the matrix still require a compatible development schema/accounts,
provider test configuration and known expected data. A build, unchanged source,
empty mocked dataset or successful new-commerce checkout cannot replace those
checks. The current evidence does not support an overall **PASS** for every
existing feature; repository-wide lint, unresolved baseline route gaps and
unavailable hosted/provider verification must remain visible in the final verdict.
