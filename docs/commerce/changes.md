# Phase 1 changed files

The feature adds `/commerce` onboarding/workspace, `/shops/[slug]` storefronts,
seven commerce API handlers, nine tenant tables, restricted mutation RPCs,
admin review/configuration, COD checkout and automated local verification.

Compared with the feature baseline `4d036fb`, existing application source changes
are limited to adding one navigation entry and panel in the Super Admin dashboard.
`package.json`/lock add test scripts and development-only PostgreSQL/Playwright
packages. `vercel.json` disables Git deployment for this feature branch only.
All remaining listed files are new module, migration, test or documentation files.

The feature branch starts from the already completed maintenance-mode commit
`4d036fb`, which is not yet on GitHub main (`7385253`). The review PR therefore
also contains that prerequisite commit; this feature preserves its behavior and
all 14 maintenance tests pass.

## Files added or modified for Phase 1

- [`app/admin/dashboard/page.jsx`](../../app/admin/dashboard/page.jsx)
- [`app/api/commerce/admin/route.js`](../../app/api/commerce/admin/route.js)
- [`app/api/commerce/applications/route.js`](../../app/api/commerce/applications/route.js)
- [`app/api/commerce/catalog/[slug]/route.js`](../../app/api/commerce/catalog/[slug]/route.js)
- [`app/api/commerce/checkout/[websiteId]/route.js`](../../app/api/commerce/checkout/[websiteId]/route.js)
- [`app/api/commerce/customer/orders/route.js`](../../app/api/commerce/customer/orders/route.js)
- [`app/api/commerce/workspace/[websiteId]/route.js`](../../app/api/commerce/workspace/[websiteId]/route.js)
- [`app/api/commerce/workspace/route.js`](../../app/api/commerce/workspace/route.js)
- [`app/commerce/apply/page.jsx`](../../app/commerce/apply/page.jsx)
- [`app/commerce/auth/page.jsx`](../../app/commerce/auth/page.jsx)
- [`app/commerce/dashboard/page.jsx`](../../app/commerce/dashboard/page.jsx)
- [`app/commerce/layout.jsx`](../../app/commerce/layout.jsx)
- [`app/commerce/page.jsx`](../../app/commerce/page.jsx)
- [`app/components/commerce/AdminClientWebsites.jsx`](../../app/components/commerce/AdminClientWebsites.jsx)
- [`app/components/commerce/OwnerApplication.jsx`](../../app/components/commerce/OwnerApplication.jsx)
- [`app/components/commerce/OwnerAuth.jsx`](../../app/components/commerce/OwnerAuth.jsx)
- [`app/components/commerce/OwnerDashboard.jsx`](../../app/components/commerce/OwnerDashboard.jsx)
- [`app/components/commerce/OwnerSession.jsx`](../../app/components/commerce/OwnerSession.jsx)
- [`app/components/commerce/StoreAccount.jsx`](../../app/components/commerce/StoreAccount.jsx)
- [`app/components/commerce/Storefront.jsx`](../../app/components/commerce/Storefront.jsx)
- [`app/components/commerce/admin-commerce.css`](../../app/components/commerce/admin-commerce.css)
- [`app/components/commerce/owner.css`](../../app/components/commerce/owner.css)
- [`app/components/commerce/storefront.css`](../../app/components/commerce/storefront.css)
- [`app/shops/[slug]/account/page.jsx`](../../app/shops/[slug]/account/page.jsx)
- [`app/shops/[slug]/error.jsx`](../../app/shops/[slug]/error.jsx)
- [`app/shops/[slug]/loading.jsx`](../../app/shops/[slug]/loading.jsx)
- [`app/shops/[slug]/not-found.jsx`](../../app/shops/[slug]/not-found.jsx)
- [`app/shops/[slug]/page.jsx`](../../app/shops/[slug]/page.jsx)
- [`app/shops/[slug]/store-metadata.js`](../../app/shops/[slug]/store-metadata.js)
- [`app/shops/layout.jsx`](../../app/shops/layout.jsx)
- [`docs/commerce/README.md`](../../docs/commerce/README.md)
- [`docs/commerce/architecture.md`](../../docs/commerce/architecture.md)
- [`docs/commerce/changes.md`](../../docs/commerce/changes.md)
- [`docs/commerce/database.md`](../../docs/commerce/database.md)
- [`docs/commerce/testing.md`](../../docs/commerce/testing.md)
- [`lib/commerce/client.js`](../../lib/commerce/client.js)
- [`lib/commerce/config.js`](../../lib/commerce/config.js)
- [`lib/server/commerce/catalog.js`](../../lib/server/commerce/catalog.js)
- [`lib/server/commerce/core.js`](../../lib/server/commerce/core.js)
- [`lib/server/commerce/validation.js`](../../lib/server/commerce/validation.js)
- [`package-lock.json`](../../package-lock.json)
- [`package.json`](../../package.json)
- [`scripts/test-commerce-db.mjs`](../../scripts/test-commerce-db.mjs)
- [`supabase/migrations/20261022160000_commerce_foundation.sql`](../../supabase/migrations/20261022160000_commerce_foundation.sql)
- [`supabase/tests/commerce_bootstrap.sql`](../../supabase/tests/commerce_bootstrap.sql)
- [`supabase/tests/commerce_rls_checkout.sql`](../../supabase/tests/commerce_rls_checkout.sql)
- [`supabase/tests/commerce_verify.sql`](../../supabase/tests/commerce_verify.sql)
- [`tests/commerce-api.test.mjs`](../../tests/commerce-api.test.mjs)
- [`tests/commerce.browser.mjs`](../../tests/commerce.browser.mjs)
- [`tests/helpers/commerce-fixture.mjs`](../../tests/helpers/commerce-fixture.mjs)
- [`vercel.json`](../../vercel.json)
