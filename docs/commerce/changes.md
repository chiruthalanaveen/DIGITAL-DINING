# Exact changed-file list

This is the complete branch diff against GitHub main
`7385253c5381fdf4998fddf8f58e84b783aabba1`. A means added; M means modified.
No files are deleted or renamed. The PR includes the earlier maintenance-mode
prerequisite `4d036fb`, the commerce implementation `aba881a`, and subsequent
review/testing work.

Commerce originally changed 51 files from its working baseline. Its existing
Admin dashboard insertion is preserved. The latest testing update adds a plural
delivery returns compatibility route, retains the original singular handler,
and expands isolated regression/browser/migration-reapplication coverage. The
foundation migration is byte-for-byte unchanged; no production SQL, live payment,
production deployment or merge occurred in this testing update.

## Latest application-testing update versus fbf8132

- [`app/api/delivery/customer/returns/route.js`](../../app/api/delivery/customer/returns/route.js)
- [`docs/commerce/README.md`](../../docs/commerce/README.md)
- [`docs/commerce/application-regression-report.md`](../../docs/commerce/application-regression-report.md)
- [`docs/commerce/application-testing.md`](../../docs/commerce/application-testing.md)
- [`docs/commerce/changes.md`](../../docs/commerce/changes.md)
- [`docs/commerce/release-review.md`](../../docs/commerce/release-review.md)
- [`docs/commerce/testing.md`](../../docs/commerce/testing.md)
- [`scripts/test-commerce-db.mjs`](../../scripts/test-commerce-db.mjs)
- [`tests/commerce.browser.mjs`](../../tests/commerce.browser.mjs)
- [`tests/delivery-return-alias.test.mjs`](../../tests/delivery-return-alias.test.mjs)

## Complete PR: 74 files

- **M** [`AGENTS.md`](../../AGENTS.md)
- **M** [`README.md`](../../README.md)
- **M** [`app/admin/dashboard/page.jsx`](../../app/admin/dashboard/page.jsx)
- **M** [`app/api/admin/control-center/route.js`](../../app/api/admin/control-center/route.js)
- **A** [`app/api/admin/maintenance/route.js`](../../app/api/admin/maintenance/route.js)
- **A** [`app/api/commerce/admin/route.js`](../../app/api/commerce/admin/route.js)
- **A** [`app/api/commerce/applications/route.js`](../../app/api/commerce/applications/route.js)
- **A** [`app/api/commerce/catalog/[slug]/route.js`](../../app/api/commerce/catalog/[slug]/route.js)
- **A** [`app/api/commerce/checkout/[websiteId]/route.js`](../../app/api/commerce/checkout/[websiteId]/route.js)
- **A** [`app/api/commerce/customer/orders/route.js`](../../app/api/commerce/customer/orders/route.js)
- **A** [`app/api/commerce/workspace/[websiteId]/route.js`](../../app/api/commerce/workspace/[websiteId]/route.js)
- **A** [`app/api/commerce/workspace/route.js`](../../app/api/commerce/workspace/route.js)
- **A** [`app/api/delivery/customer/returns/route.js`](../../app/api/delivery/customer/returns/route.js)
- **A** [`app/commerce/apply/page.jsx`](../../app/commerce/apply/page.jsx)
- **A** [`app/commerce/auth/page.jsx`](../../app/commerce/auth/page.jsx)
- **A** [`app/commerce/dashboard/page.jsx`](../../app/commerce/dashboard/page.jsx)
- **A** [`app/commerce/layout.jsx`](../../app/commerce/layout.jsx)
- **A** [`app/commerce/page.jsx`](../../app/commerce/page.jsx)
- **A** [`app/components/AdminMaintenanceSettings.jsx`](../../app/components/AdminMaintenanceSettings.jsx)
- **A** [`app/components/commerce/AdminClientWebsites.jsx`](../../app/components/commerce/AdminClientWebsites.jsx)
- **A** [`app/components/commerce/OwnerApplication.jsx`](../../app/components/commerce/OwnerApplication.jsx)
- **A** [`app/components/commerce/OwnerAuth.jsx`](../../app/components/commerce/OwnerAuth.jsx)
- **A** [`app/components/commerce/OwnerDashboard.jsx`](../../app/components/commerce/OwnerDashboard.jsx)
- **A** [`app/components/commerce/OwnerSession.jsx`](../../app/components/commerce/OwnerSession.jsx)
- **A** [`app/components/commerce/StoreAccount.jsx`](../../app/components/commerce/StoreAccount.jsx)
- **A** [`app/components/commerce/Storefront.jsx`](../../app/components/commerce/Storefront.jsx)
- **A** [`app/components/commerce/admin-commerce.css`](../../app/components/commerce/admin-commerce.css)
- **A** [`app/components/commerce/owner.css`](../../app/components/commerce/owner.css)
- **A** [`app/components/commerce/storefront.css`](../../app/components/commerce/storefront.css)
- **A** [`app/shops/[slug]/account/page.jsx`](../../app/shops/[slug]/account/page.jsx)
- **A** [`app/shops/[slug]/error.jsx`](../../app/shops/[slug]/error.jsx)
- **A** [`app/shops/[slug]/loading.jsx`](../../app/shops/[slug]/loading.jsx)
- **A** [`app/shops/[slug]/not-found.jsx`](../../app/shops/[slug]/not-found.jsx)
- **A** [`app/shops/[slug]/page.jsx`](../../app/shops/[slug]/page.jsx)
- **A** [`app/shops/[slug]/store-metadata.js`](../../app/shops/[slug]/store-metadata.js)
- **A** [`app/shops/layout.jsx`](../../app/shops/layout.jsx)
- **A** [`docs/commerce/README.md`](../../docs/commerce/README.md)
- **A** [`docs/commerce/application-regression-report.md`](../../docs/commerce/application-regression-report.md)
- **A** [`docs/commerce/application-testing.md`](../../docs/commerce/application-testing.md)
- **A** [`docs/commerce/architecture.md`](../../docs/commerce/architecture.md)
- **A** [`docs/commerce/backup-recovery.md`](../../docs/commerce/backup-recovery.md)
- **A** [`docs/commerce/changes.md`](../../docs/commerce/changes.md)
- **A** [`docs/commerce/database.md`](../../docs/commerce/database.md)
- **A** [`docs/commerce/migration-review.md`](../../docs/commerce/migration-review.md)
- **A** [`docs/commerce/preservation-review.md`](../../docs/commerce/preservation-review.md)
- **A** [`docs/commerce/preview-and-environment.md`](../../docs/commerce/preview-and-environment.md)
- **A** [`docs/commerce/release-review.md`](../../docs/commerce/release-review.md)
- **A** [`docs/commerce/review-test-results.md`](../../docs/commerce/review-test-results.md)
- **A** [`docs/commerce/staging-verification.md`](../../docs/commerce/staging-verification.md)
- **A** [`docs/commerce/testing.md`](../../docs/commerce/testing.md)
- **A** [`lib/commerce/client.js`](../../lib/commerce/client.js)
- **A** [`lib/commerce/config.js`](../../lib/commerce/config.js)
- **A** [`lib/maintenance-page.ts`](../../lib/maintenance-page.ts)
- **A** [`lib/server/adminRequestOrigin.js`](../../lib/server/adminRequestOrigin.js)
- **A** [`lib/server/commerce/catalog.js`](../../lib/server/commerce/catalog.js)
- **A** [`lib/server/commerce/core.js`](../../lib/server/commerce/core.js)
- **A** [`lib/server/commerce/validation.js`](../../lib/server/commerce/validation.js)
- **A** [`lib/server/maintenanceSettings.js`](../../lib/server/maintenanceSettings.js)
- **M** [`package-lock.json`](../../package-lock.json)
- **M** [`package.json`](../../package.json)
- **A** [`proxy.ts`](../../proxy.ts)
- **A** [`scripts/test-commerce-db.mjs`](../../scripts/test-commerce-db.mjs)
- **A** [`scripts/test-commerce-staging.mjs`](../../scripts/test-commerce-staging.mjs)
- **A** [`supabase/migrations/20261022160000_commerce_foundation.sql`](../../supabase/migrations/20261022160000_commerce_foundation.sql)
- **A** [`supabase/tests/commerce_bootstrap.sql`](../../supabase/tests/commerce_bootstrap.sql)
- **A** [`supabase/tests/commerce_rls_checkout.sql`](../../supabase/tests/commerce_rls_checkout.sql)
- **A** [`supabase/tests/commerce_verify.sql`](../../supabase/tests/commerce_verify.sql)
- **A** [`tests/commerce-api.test.mjs`](../../tests/commerce-api.test.mjs)
- **A** [`tests/commerce-staging-guard.test.mjs`](../../tests/commerce-staging-guard.test.mjs)
- **A** [`tests/commerce.browser.mjs`](../../tests/commerce.browser.mjs)
- **A** [`tests/delivery-return-alias.test.mjs`](../../tests/delivery-return-alias.test.mjs)
- **A** [`tests/helpers/commerce-fixture.mjs`](../../tests/helpers/commerce-fixture.mjs)
- **A** [`tests/maintenance.test.mjs`](../../tests/maintenance.test.mjs)
- **A** [`vercel.json`](../../vercel.json)
