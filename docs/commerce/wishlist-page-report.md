# Dedicated customer wishlist page

4 November 2026. Branch: `feature/commerce-expansion`, draft
[PR #7](https://github.com/chiruthalanaveen/DIGITAL-DINING/pull/7).

## Requirement and behavior

Item 9 of the supplied storefront brief explicitly asks for a dedicated
wishlist page. Saved products already existed inside account tools, but no
`/shops/[slug]/wishlist` route existed. This increment adds that page and links
to it from the storefront and customer account.

The server renders only the selected store's public catalog. A verified customer
loads their saved product IDs through the existing authenticated
`/api/commerce/customer/experience` API. Cards use the public catalog together
with the API's current public-product eligibility. Unavailable saved products
remain removable through a generic entry; the page does not expose their old
name, photo or price. Prices, optional variants and sold-out labels come from
catalog data, and final availability remains checked at checkout.

Signed-out visitors see a sign-in link, and unverified accounts see verification
guidance. Loading, empty, failed-read and failed-removal states are explicit.
Successful removal updates the persisted wishlist, announces the result and
returns keyboard focus to a remaining removal control or the list heading.
Account-scoped state and request guards prevent an old response from being
displayed after a different customer signs in.

The page has its own wishlist title/canonical and `noindex, nofollow` metadata.
Verified custom hosts support `/wishlist` for their bound store; another store's
wishlist path remains forbidden. Maintenance behavior and activation flags stay
on their existing paths. This page does not add products to the bag, alter
checkout keys, open a provider, make a payment or process a refund.

## Database and preservation

**No SQL migration required.** The existing customer-experience migration
already supplies `commerce_wishlist_items`, verified-customer RPC checks and
tenant/customer RLS. All seven pending commerce expansion migration files remain
unchanged. They are not installed on a hosted database by this work, and the
already-installed foundation must not be replayed.

There are no new environment variables, DNS records, Storage policies or cron
jobs. Existing public Supabase URL/anon configuration and the per-store customer
Auth scope are reused. Custom-host support still requires the separately gated
domain configuration; adding this page does not activate a domain.

Original storefront CSS, existing restaurant/delivery/resort/wallet/payment
source, balances, transaction/order histories, RLS and cron definitions are
outside this page change. No production fixture or hosted SQL is used. Reverting
the new page/navigation/metadata/proxy source preserves saved wishlist rows;
there is no database rollback or data deletion to perform.

## Changed source

- [StoreWishlist.jsx](../../app/components/commerce/StoreWishlist.jsx): private
  wishlist client, scoped Auth, list/removal/error/focus states.
- [store-wishlist.css](../../app/components/commerce/store-wishlist.css): scoped
  responsive page/card/navigation styles.
- [wishlist/page.jsx](../../app/shops/[slug]/wishlist/page.jsx): dynamic server
  route, public catalog lookup and unavailable-store handling.
- [store-metadata.js](../../app/shops/[slug]/store-metadata.js): private wishlist
  metadata while retaining existing store/account behavior.
- [Storefront.jsx](../../app/components/commerce/Storefront.jsx) and
  [StoreAccount.jsx](../../app/components/commerce/StoreAccount.jsx): navigation.
- [proxy.ts](../../proxy.ts): exact bound-host wishlist routing and foreign-store
  denial.

Regression changes are in
[commerce-storefront-seo.test.mjs](../../tests/commerce-storefront-seo.test.mjs),
[commerce-domains.test.mjs](../../tests/commerce-domains.test.mjs),
[maintenance.test.mjs](../../tests/maintenance.test.mjs),
[commerce-expansion.browser.mjs](../../tests/commerce-expansion.browser.mjs) and
[commerce-wishlist.browser.mjs](../../tests/commerce-wishlist.browser.mjs).

The parent handoff's exact file inventory also includes the changed tests and
documentation, plus full code TXT exports with destination paths. This report
does not claim that a current source commit has already been pushed.

## Verification status

Current source is **local PASS; release PARTIAL PASS**. It passes 331/331 unit
tests, full lint with zero errors/166 warnings, and the full Next.js build.
Application/configuration fingerprints remain unchanged across the final build.
The expanded full-app browser suite passes 22 groups and 136 screenshots,
including nine wishlist groups/24 screenshots at 360/390/768/1440 px. The fresh
original compatibility suite passes 118 screenshots: **254 screenshots total**.
That original runner also passes all 628 PostgreSQL assertions for the unchanged
seven-migration chain; no new SQL was required for this page.

The preceding committed source `8dbc382` passed 327 unit tests, 628 local
PostgreSQL assertions and 230 screenshots; those earlier counts remain historical.

| Current check | Result | Scope |
| --- | --- | --- |
| Focused SEO/domain/maintenance tests | PASS — 54 focused tests | Wishlist metadata and exact custom-host/foreign-store/maintenance routing; isolated test doubles, no hosted domain action. |
| `npm test` | PASS — 331/331, zero skipped | Full current-source unit suite; `unit.log`. |
| `npm run lint` | PASS — 0 errors, 166 warnings | Full repository lint; warnings remain and no rules were disabled. |
| `npm run build` | PASS | Full current-source Next.js build using synthetic development configuration; application/configuration fingerprints remain stable. |
| `node tests/commerce-expansion.browser.mjs` (environment below) | PASS — 22 groups, 136 screenshots | Actual local app/API/PostgreSQL. Nine wishlist groups/24 screenshots cover the new page, real cross-tab Auth changes, retained failed removals, focus, unverified denial and hidden-product privacy. |
| `node tests/commerce.browser.mjs` (environment below) | PASS — 118 screenshots | Fresh existing onboarding, owner/Admin, catalog, cart, COD, account and legacy-route compatibility. |
| `node scripts/test-commerce-expansion-db.mjs` (invoked by the original browser runner) | PASS — 628 PostgreSQL assertions | Regression of the unchanged seven migrations in the guarded disposable local database; not a new wishlist migration or hosted acceptance. |

No new migration test was required for this source-only page. The original
expanded browser fixture reran the unchanged seven-migration SQL regressions,
with all 628 assertions passing. The application uses synthetic
`developmentEnvironment()` credentials only. Exact browser invocations after
the matching fixture-4319 build were:

```sh
COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55447/commerce_test COMMERCE_FIXTURE_PORT=4319 COMMERCE_BROWSER_SKIP_DB=1 COMMERCE_BROWSER_SKIP_BUILD=1 COMMERCE_BROWSER_ARTIFACTS=/workspace/commerce-validation-artifacts/commerce-wishlist-20261104/browser node tests/commerce-expansion.browser.mjs
COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55447/commerce_test COMMERCE_FIXTURE_PORT=4319 COMMERCE_BROWSER_USE_EXPANSION=1 COMMERCE_BROWSER_SKIP_BUILD=1 COMMERCE_BROWSER_ARTIFACTS=/workspace/commerce-validation-artifacts/commerce-wishlist-20261104/original-browser node tests/commerce.browser.mjs
```

Current evidence is under
`/workspace/commerce-validation-artifacts/commerce-wishlist-20261104/`, including
`browser/wishlist-browser-results.json`, `browser/expansion-browser-results.json`,
`original-browser/database.log`, `original-browser.log` and the unit/lint/build
logs. The initial browser attempt failed with local
PostgreSQL `ECONNREFUSED`; the disposable local cluster was restarted and the
expanded and original suites then passed. That environmental failure is retained in
`browser-environment-start.log`. It was not a diagnosed hosted network-proxy
failure. A scoped keyboard-focus outline correction was followed by a fresh
passing build. No production credential or target was used to resolve either.

## Manual acceptance

1. Open a store's wishlist signed out; confirm sign-in guidance and private
   metadata. Sign in with an unverified account and confirm no saved list loads.
2. Save products through the existing storefront controls, open the dedicated
   page from store/account navigation and verify the same store's saved list.
3. Remove a product, reload and confirm persistence, an announced result and
   usable keyboard focus. A failed removal must retain the current entry and
   provide retry/refresh feedback.
4. Verify empty, failed-read, image-failure, sold-out, variant and unavailable
   product states without invented prices or stock. Unavailable products must
   not expose archived details or product links.
5. Switch customers/stores with a slow read or mutation in flight. The new
   account must never display another customer's saved rows or stale notices.
6. Check 360, 390, 768 and 1440 px: no horizontal overflow, readable navigation,
   touch-sized controls and complete keyboard access. On a verified custom host,
   confirm `/wishlist` resolves only to that host's bound store.
7. Repeat existing bag, checkout and account flows. No wishlist interaction
   should change cart contents, pending payment references or order history.

## Release state and next dependency

Overall release remains **PARTIAL PASS**. Hosted Supabase Auth/PostgREST/RLS/
Storage, real sandbox Checkout/webhook acceptance, DNS/TLS, external notification
delivery, representative performance/accessibility and legacy provider/device
flows remain unperformed where their development integrations are unavailable.
There is no staging-backed Vercel Preview URL for this increment.

The next source dependency is the still-unimplemented owner feature-request
workflow from the original multi-tenant brief: an owner submits a requirement,
Super Admin reviews/approves/rejects/assigns it, and that owner can track its
status. Approval must not automatically enable code, change security/feature
permissions, charge a subscription or activate a provider. This is a future
slice, not functionality delivered by the wishlist page. It will need its own
versioned tenant-scoped SQL and audit/RLS/permission tests against an isolated
local database before any separately approved hosted application.

External acceptance or activation still requires applicable configuration and
separate authorization; no local pass authorizes hosted SQL, a production
deployment, merge, real DNS/provider change, notification send or live payment.
The user withdrew staging/backup prerequisites, so do not use production as their
test substitute or request those prerequisites again.
