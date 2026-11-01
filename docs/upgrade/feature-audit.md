# Phase 0 feature audit

Audit date: 1 November 2026. Source snapshot: `4ac1e12`, the existing
`feature/client-websites-phase1` branch and draft
[PR #3](https://github.com/chiruthalanaveen/DIGITAL-DINING/pull/3). This master
upgrade continues from the existing implementation; it does not replace or
merge the commerce PR. Status below distinguishes source inspection from
executed workflows. The first stabilization increment contains two bounded fixes:
restaurant owner account lookup/approval consistency and captured-payment/approval
checks in the existing subscription and delivery verification paths. Durable
financial replay protection remains a separate critical dependency, not a claim
of this increment.

## Evidence and boundaries

- Read `AGENTS.md`, `README.md`, current commerce documentation, application
  routes, security helpers, local SQL definitions and the available tests.
- The preceding storefront increment has recorded local evidence for 101/101
  Node tests, 88 PostgreSQL assertions, a passing build and 118 screenshots.
  This is historical evidence for that tested configuration, not a new run for
  Phase 0 or proof that all platform modules work.
- The only versioned business migration in this checkout is the commerce
  foundation. Legacy restaurant, staff, wallet, delivery and resort RPCs are
  extensively called but their complete installed definitions/policies are not
  versioned here. Their transactional/RLS behavior cannot be certified from
  browser code or RPC names. Use existing installed-schema evidence; do not
  query or mutate production to fill these gaps during this slice.
- The foundation was installed and independently verified on 31 October.
  Do not reapply it, create a migration ledger ad hoc or run `supabase db push`.
- No production SQL, provider/payment operation, live fixture, deployment or
  merge is part of this audit. Staging remains unavailable/stopped by the user's
  prior choice. Synthetic loopback fixtures are the permitted test target.
- Last hosting evidence is HTTP 403 `forbidden` from Vercel metadata GETs on
  31 October. There is no verified Preview URL. Do not infer a proxy CONNECT
  failure, token expiry or that PR code is deployed.

Classification: **verified** means named executed evidence exists;
**implemented/unverified** means code exists without a complete verified
workflow; **partial** means only part of the requested behavior exists;
**broken/unreliable** requires a specific observed or source-reproducible defect;
**not implemented** means the requested feature has no implementation found in
the inspected source; **blocked** identifies an external or test dependency.

## Inventory

| Feature | Current status and implementation | Database/security dependency | Tests and next action |
| --- | --- | --- | --- |
| Restaurant registration → owner login | **Broken/unreliable, source-confirmed mismatch.** `app/api/register/route.js` stores the authenticated ID in `restaurants.owner_id`; `app/login/page.jsx` looks up `restaurants.id = user.id`. The first dashboard guard also requires route ID = Auth ID. The server lookup already prefers `owner_id` with a null-owner legacy fallback. | `auth.users`, `restaurants.owner_id/id/approval_status`; use authenticated user identity, never an email/phone guess. A non-null explicit owner must override the legacy ID convention. Do not create or repair mappings implicitly. | First slice: regression fixtures for pending/approved/rejected/suspended, orphaned, tampered, legacy and multiple-business accounts; reuse a verified server lookup and approval checks. See selected fix below. |
| Owner approval and tenant access | **Implemented/unverified across the whole platform.** `lib/server/ownerApproval.js`, `/api/owner/approval-status`, `/api/auth/owner-restaurant`, registration-pending UI and admin registration routes already exist. Dashboard has two inconsistent ownership guards. | Auth verification, approval status, `restaurants`, installed RLS. Existing server helper prioritizes explicit `owner_id`; preserve that rule. Client checks do not establish database authorization. | Local ownership/approval tests first; broader role/RLS verification needs isolated definitions/fixtures. No automatic owner/subscription activation. |
| Save/Update/Submit actions | **Implemented but performance unmeasured.** Large owner/manager views use a mixture of direct queries, RPCs, local updates and full reloads. `ResortManagement.load()` already runs four reads concurrently; do not duplicate that optimization. | Existing RLS/RPC contracts and authoritative mutation results. Never acknowledge success before completion. Financial actions require idempotency. | No representative p50/p95 baseline recorded. Instrument selected safe mutation and count requests before optimizing. Do not claim an improvement from source review. |
| Delivery PIN recovery | **Partial/blocked.** `/delivery/forgot-pin` and `/api/delivery/customer/forgot-pin` validate inputs and return an explicit unavailable response; successful reset remains absent. Existing security-question data must not become sufficient reset proof. | Admin-controlled OTP/PIN policy, a verified operational recovery channel, rate/attempt/expiry/single-use and session revocation design. | Existing `tests/delivery-pin-recovery.test.mjs` covers negative/unavailable behavior. Successful recovery requires isolated provider/test accounts; retain safe unavailability until a verified channel exists. |
| Restaurant QR menu/order/cart | **Implemented/unverified end to end.** `app/menu/[id]/page.jsx` calls `get_public_qr_menu`, `get_public_customer_orders`, QR payment/counter APIs, subscribes to menu/order changes, supports table/parcel choices, cart and order history. | `restaurants`, `menu_items`, `daily_offers`, `orders`; public RPC field projection, tenant feature gates, authoritative counter/payment totals and table/session validation. SQL definitions are not in the local migration. | No full restaurant lifecycle fixture in `tests/`. Reuse existing UI; build local RPC/API fixtures and verify invalid table/tenant, price tampering and order retry before enhancement. |
| Kitchen display and waiter operations | **Implemented/unverified.** `app/kitchen/[restaurantId]/page.jsx` and `app/waiter/[restaurantId]/page.jsx` include alarms, secure saved app sessions, order loading and status/direct-order RPCs. Session-based and legacy waiter paths coexist. | `create_staff_app_session`, `validate_staff_app_session`, `get_kitchen_portal_data_session`, `kitchen_update_order_status_session`, waiter RPCs and their installed role/tenant checks. | No complete kitchen/waiter fixture suite. Verify session expiry, cross-role/cross-restaurant denial, reconnect and allowed status transitions before touching financial fields. |
| Manager operations, POS and receipts | **Partial relative to requested unified POS.** Manager dashboard has menu/offers/table operations and `manager_action(_session)`; owner view has stored-order totals/tax settings; menu has browser printing. | `restaurants`, `tables`, orders/menu RPCs, GST settings, manager permission contract. Manager must not gain owner-only gateway, subscription or wallet write privileges. | Existing negative payment guard tests are not POS acceptance. Establish billing/receipt fixtures; preserve each business ledger. Printer hardware and fiscal compliance are unverified. |
| Product/ingredient inventory and low-stock operations | **Partial.** Commerce stock is implemented and locally tested; delivery inventory paths exist. Restaurant menu availability exists, but no complete ingredient/recipe stock ledger or unified adjustment workflow was found. | Separate tenant/product/ingredient models, atomic consumption/release, audit reason and immutable financial linkage where applicable. Never combine inventories without a reviewed mapping. | Preserve existing stock controls; audit actual legacy SQL before designing any additive inventory migration. Test concurrent consumption and cancellation release. |
| Restaurant reservations/waiting list and loyalty | **Not implemented in inspected application routes.** Existing table inventory is not evidence of reservation slots/conflict protection; offers/reorder counts are not a points ledger. | Future tenant-scoped reservations/capacity and loyalty event models, locking/idempotency, staff authorization, consented notifications. | Later separate additive migrations and development concurrency/RLS tests. Do not add placeholder controls and call these complete. |
| Resort browsing/availability/booking | **Implemented/unverified.** `app/stay/[restaurantCode]/page.jsx` uses `get_public_resort`, `check_resort_availability`, booking/hold APIs; `ResortManagement.jsx` reads property, types, rooms and bookings. | `resort_properties`, `room_types`, `rooms`, `room_bookings`; installed booking RPCs must enforce no overlap/hold expiry transactionally. Their definitions are not available in the versioned migration. | No full resort concurrency or booking fixture suite. Verify simultaneous booking/hold expiry/date/occupancy behavior with isolated SQL before claiming reliable availability. |
| Resort payment/deposit/refund | **Implemented/unverified for existing payment paths; partial for requested lifecycle.** Multiple resort create/verify routes exist. Source includes provider order/capture/amount checks; this does not establish deposit or refund support. | Tenant gateway configuration, order binding, signatures, provider states, idempotency and booking transaction contract. | No real provider test-mode confirmation here. Audit duplicate route contracts, then use approved sandbox credentials; never mark booking/refund successful from a client callback alone. |
| Guest access/check-in/out and housekeeping | **Partial.** `ResortManagement.jsx` updates booking/room statuses; `/stay/room/[publicToken]` calls `get_public_room_guest_portal` and `create_room_service_request` for food, housekeeping, water, maintenance and other requests. | Room token scope/expiry, booking ownership, staff permissions and database transition rules. Room maintenance status is not a task-assignment/inspection system. | Verify token isolation, expired stays and status transitions; plan actual assignment/inspection queues later. No guest identity document expansion. |
| Resort seasonal/packages/dynamic pricing | **Partial/not implemented for advanced rules.** Room base/discount prices and property times are present. No complete seasonal/weekend/package/extra-guest rule engine was found. | Deterministic tenant pricing model and immutable booking price snapshot; later additive schema only if required. | Audit current booking calculation before extension; test rule precedence, boundaries and existing booking preservation. |
| Commerce onboarding/admin/catalog/COD | **Implemented and verified locally; hosted workflows blocked/unverified.** PR #3 contains `/commerce`, owner/admin controls, `/shops/[slug]`, media, stock, account and COD history; see `docs/commerce/storefront-increment-report.md`. | Nine commerce tables, installed foundation RPCs/RLS, explicit approval/assignment/active/feature/owner permissions; exact integer-paise totals and idempotent orders. | Prior 101 Node/88 SQL/build/API/Chromium evidence; real SDK with simulated Auth, not real hosted mail/Auth isolation. Keep draft PR and original styles; do not duplicate the foundation. |
| Commerce image zoom/filter/bag | **Implemented and verified locally.** Real single-image 100–300% zoom, combined filters and responsive bag shipped on PR branch in `4ac1e12`. | Existing image/product/config fields; no new schema or independent persisted presentation switches. Existing business gates govern checkout. | 118 prior screenshots at four widths and focused helper/dialog/filter tests. Multi-image storage, variants/SKUs, autocomplete, richer product SEO and related products remain later work. |
| Commerce variants/coupons/wishlist/reviews/addresses/returns/analytics/builder/notifications/payments | **Not implemented or partial as individually audited in the existing seventeen-feature roadmap.** Order history and basic branding are already present; do not count them as missing or duplicate them. Online commerce remains COD-only. | Each persisted capability needs scoped ownership, server rules, reviewed additive schema/RLS and a separately gated provider design when relevant. | Reuse `docs/commerce/storefront-roadmap.md`. Implement independent slices after stabilization; no online payment activation or fabricated shipping/review data. |
| Delivery discovery/address/tracking/returns/notifications | **Implemented/unverified or partial by subfeature.** Dedicated `/delivery` routes, address components, map/tracking, driver/packer/owner tools and returns APIs exist. This inventory does not certify nearest-three eligibility, all fees or provider delivery. | Customer/staff sessions, coverage/availability/wallet eligibility, order-state/driver scoping, private address ownership and external map/push providers. | Delivery security audit supplies detailed findings. Extend `/delivery`; do not revive `/dd-delivery`. No simulated coordinates/ETA or unauthorized live orders. |
| Wallet/settlement/payment correctness | **Broken in reproduced subscription cases; otherwise implemented/unverified as a complete finance workflow.** A lexical fixture of the actual subscription handler accepted an authorized-but-uncaptured payment, activated a pending owner's subscription, and performed two activation writes for the same captured callback repeated twice. Delivery verification also permits provider status `authorized` in source. Owner/manager wallet, admin adjustments/settings and cron exist, but their presence does not prove immutable/idempotent ledger behavior. | Existing wallet ledger/RPCs, per-store fees/thresholds, actor/reason/proof, settlement cron and gateway configuration. Preserve all balances, transaction references and scheduled jobs. Captured status and approval checks are bounded source fixes; durable replay protection needs separately reviewed persistence/concurrency design. | Reproduction: `/workspace/commerce-validation-artifacts/phase0-audit-20261101/financial-source-reproduction.json`, zero hosted connections/mutations. Add focused captured/uncaptured/approval/amount/order-binding tests now. Require isolated durable replay/concurrency/provider tests before claiming full financial correctness. |
| Shared design/a11y/performance | **Partial.** `PortalShell`, existing Tailwind/CSS and module styles are reusable; the latest commerce layers are scoped. Large monolithic client pages remain (owner ~7,545 lines, waiter ~8,203, kitchen ~3,651 at audit); size alone does not establish a runtime bottleneck. Two root layout files contain differing metadata/manifest conventions. | Preserve role layouts, tenant context and private cache boundaries. Root viewport `maximumScale: 1` and light-theme utility overrides need targeted accessibility review. | Prior commerce four-width evidence does not certify all routes. No global p75/INP/save p95 measurements. Audit bundles/network first; avoid a mass rewrite or dependency swap. |
| PWA/offline/push | **Partial.** Manifests, install capture, icons, native/browser push and `/sw.js` exist. Main worker deliberately does not cache requests. `instrumentation-client.js` registers `/app/` while `PWARegister.jsx` registers `/`, so lifecycle/scope needs review. Old dd-delivery worker assets remain; do not reintroduce their frontend. | Consent, scoped push destinations, authenticated token registration, service-worker update lifecycle and external delivery provider. No offline financial mutation queue is proven safe. | Add focused installed/update/offline tests later. No private cache exposure was established by source review; do not claim push delivery tested. |
| Support/monitoring/diagnostics | **Implemented/unverified support; partial monitoring.** Live-chat widgets, support-session RPCs, `/api/live-support` admin workflow and `/api/admin/health` exist. Health currently checks environment booleans, not dependencies. | Admin/staff/customer scope, `support_chat_sessions`, messages/audit logs, provider credentials and redaction/retention policy. | No centralized correlation-ID/duration/alert-delivery test evidence found. Reuse support system; add structured redacted tracing and authorized diagnostics incrementally. |
| SEO/internationalization | **Partial SEO; no complete locale framework found.** Root robots/sitemap and commerce store metadata exist; private account/unavailable store metadata is noindex. Sitemap is static and includes a hard-coded restaurant example; www/non-www conventions differ. English UI uses INR formatting in modules. | Publish only active public data; no tenant/private content in shared cache or sitemap. Translation review and language-state preservation are required. | Preserve current URLs; separately test canonical/noindex/structured data. Do not claim unreviewed Hindi/Telugu translations or field performance. |

## Selected first stabilization increment

The registration/login identity mismatch is prioritized because legitimate new
owners can be denied access before reaching their approved dashboard, and the
two dashboard guards apply inconsistent ownership precedence. A server resolver
already exists; this is not a reason to introduce another owner-mapping table.

Source findings at audit snapshot:

1. `app/api/register/route.js:129` inserts `owner_id: userId` without requiring
   the restaurant primary key to equal that Auth ID.
2. `app/login/page.jsx:21`/`:29` resolves only `id = user.id`.
3. `app/dashboard/[id]/page.jsx:1613` rejects a route ID differing from the Auth
   ID before checking `owner_id`; its subsequent guard at `:1717` permits either
   primary-key or owner-ID matching, even though explicit ownership must win.
4. `app/api/auth/owner-restaurant/route.js:38` already prefers explicit ownership,
   refuses ambiguous multi-business results, and limits legacy fallback to a
   null `owner_id`. It currently returns identity only; approval handling must
   remain explicit and fail closed.
5. `lib/server/ownerApproval.js` already checks verified Auth ID against explicit
   owner or null-owner legacy ID and provides approved-owner enforcement.

The fix should reuse one authenticated identity/approval contract for login and
dashboard admission, preserve existing approved legacy accounts, show pending or
rejected states clearly, reject mismatched IDs, and support legitimate explicit
business selection without granting another tenant's access. No email/mobile
matching, silent backfill, account reassignment or production data repair is
authorized. Add local regression tests before replacing the conflicting guards.

A second bounded slice addresses financial failures reproduced without any
provider or database contact. The actual subscription handler, executed with
lexical synthetic dependencies, accepted `status: authorized` with
`captured: false` and wrote `subscription_status: active`; it also activated an
owned but pending restaurant. `app/api/verify-subscription/route.js` and
`app/api/delivery/razorpay/verify-payment/route.js` both accept `authorized` in
their inspected status checks. Require authoritative captured-payment state and
existing approved-owner enforcement before confirming success. Do not change
amounts, wallet ledgers or provider activation configuration as part of this fix.

The same reproduction found two activation writes for two identical captured
subscription callbacks. **Durable replay protection is still an open critical
issue.** A captured-state guard alone does not establish idempotency. Plan a
separate reviewed transactional ledger/claim design with development concurrency
tests; do not disguise an in-memory/cache workaround as authoritative financial
reconciliation.

**No SQL migration required** for these source-only owner-access and payment-state
guards. Existing database/RLS policies and customer/financial data remain
untouched. If installed
legacy RLS later needs a change, that is a separate reviewed additive migration
with isolated tests and explicit hosted approval.

## Audit limitations

This is a repository inventory, not a penetration-test certification or a full
legacy schema dump. Features marked unverified stay unverified until their actual
role, transaction and provider flows run in an isolated representative fixture.
The separate Phase 0 implementation report must record new test commands,
results, changed files, commit/branch and remaining risks. Deployment status must
be established independently; a pushed branch is not a live release.
