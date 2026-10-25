# Exact changed-file list

Complete PR #3 diff against GitHub main `7385253c5381fdf4998fddf8f58e84b783aabba1`.
A means added; M means modified. No files are deleted or renamed.

## Latest main-access diagnosis versus f1fb01d: 6 files

The supplied main SQL URI is correctly shaped and its exact hostname is now
published/allowed. Actual PostgreSQL access still fails during DNS and the
configured proxy CONNECT returns 403 before credentials. Current instructions do
not request the same URI, hostname or migration approval again. A restricted
HTTPS Management API access check is prepared, with a missing
`SUPABASE_ACCESS_TOKEN` requirement scoped to `api.supabase.com`. Backup and
compatibility checks remain prerequisites; no production SQL was executed.

Runtime application code, the read-only SQL queries and the foundation migration
are unchanged. Build passed. A separate helper review passed six local mocked
security checks without network/database calls; those are not production tests.
No SQL migration required for these documentation changes. Deployment, main
merge, live payments and live test-data writes remain on hold.

See [main-project-installation.md](main-project-installation.md) for current steps
and [pr3-followup-report.md](pr3-followup-report.md) for historical test evidence.

- **M** [AGENTS.md](../../AGENTS.md)
- **M** [docs/commerce/README.md](../../docs/commerce/README.md)
- **M** [docs/commerce/changes.md](../../docs/commerce/changes.md)
- **M** [docs/commerce/main-project-installation.md](../../docs/commerce/main-project-installation.md)
- **M** [docs/commerce/pr3-followup-report.md](../../docs/commerce/pr3-followup-report.md)
- **M** [docs/commerce/release-review.md](../../docs/commerce/release-review.md)

## Complete PR: 86 files

- **M** [AGENTS.md](../../AGENTS.md)
- **M** [README.md](../../README.md)
- **M** [app/admin/dashboard/page.jsx](../../app/admin/dashboard/page.jsx)
- **M** [app/api/admin/control-center/route.js](../../app/api/admin/control-center/route.js)
- **A** [app/api/admin/maintenance/route.js](../../app/api/admin/maintenance/route.js)
- **A** [app/api/commerce/admin/route.js](../../app/api/commerce/admin/route.js)
- **A** [app/api/commerce/applications/route.js](../../app/api/commerce/applications/route.js)
- **A** [app/api/commerce/catalog/[slug]/route.js](../../app/api/commerce/catalog/[slug]/route.js)
- **A** [app/api/commerce/checkout/[websiteId]/route.js](../../app/api/commerce/checkout/[websiteId]/route.js)
- **A** [app/api/commerce/customer/orders/route.js](../../app/api/commerce/customer/orders/route.js)
- **A** [app/api/commerce/workspace/[websiteId]/route.js](../../app/api/commerce/workspace/[websiteId]/route.js)
- **A** [app/api/commerce/workspace/route.js](../../app/api/commerce/workspace/route.js)
- **A** [app/api/create-subscription-order/route.js](../../app/api/create-subscription-order/route.js)
- **A** [app/api/delivery/customer/forgot-pin/route.js](../../app/api/delivery/customer/forgot-pin/route.js)
- **A** [app/api/delivery/customer/returns/route.js](../../app/api/delivery/customer/returns/route.js)
- **A** [app/commerce/apply/page.jsx](../../app/commerce/apply/page.jsx)
- **A** [app/commerce/auth/page.jsx](../../app/commerce/auth/page.jsx)
- **A** [app/commerce/dashboard/page.jsx](../../app/commerce/dashboard/page.jsx)
- **A** [app/commerce/layout.jsx](../../app/commerce/layout.jsx)
- **A** [app/commerce/page.jsx](../../app/commerce/page.jsx)
- **A** [app/components/AdminMaintenanceSettings.jsx](../../app/components/AdminMaintenanceSettings.jsx)
- **A** [app/components/commerce/AdminClientWebsites.jsx](../../app/components/commerce/AdminClientWebsites.jsx)
- **A** [app/components/commerce/OwnerApplication.jsx](../../app/components/commerce/OwnerApplication.jsx)
- **A** [app/components/commerce/OwnerAuth.jsx](../../app/components/commerce/OwnerAuth.jsx)
- **A** [app/components/commerce/OwnerDashboard.jsx](../../app/components/commerce/OwnerDashboard.jsx)
- **A** [app/components/commerce/OwnerSession.jsx](../../app/components/commerce/OwnerSession.jsx)
- **A** [app/components/commerce/StoreAccount.jsx](../../app/components/commerce/StoreAccount.jsx)
- **A** [app/components/commerce/Storefront.jsx](../../app/components/commerce/Storefront.jsx)
- **A** [app/components/commerce/admin-commerce.css](../../app/components/commerce/admin-commerce.css)
- **A** [app/components/commerce/owner.css](../../app/components/commerce/owner.css)
- **A** [app/components/commerce/storefront.css](../../app/components/commerce/storefront.css)
- **M** [app/dashboard/[id]/billing/page.jsx](../../app/dashboard/[id]/billing/page.jsx)
- **M** [app/delivery/forgot-pin/page.jsx](../../app/delivery/forgot-pin/page.jsx)
- **A** [app/shops/[slug]/account/page.jsx](../../app/shops/[slug]/account/page.jsx)
- **A** [app/shops/[slug]/error.jsx](../../app/shops/[slug]/error.jsx)
- **A** [app/shops/[slug]/loading.jsx](../../app/shops/[slug]/loading.jsx)
- **A** [app/shops/[slug]/not-found.jsx](../../app/shops/[slug]/not-found.jsx)
- **A** [app/shops/[slug]/page.jsx](../../app/shops/[slug]/page.jsx)
- **A** [app/shops/[slug]/store-metadata.js](../../app/shops/[slug]/store-metadata.js)
- **A** [app/shops/layout.jsx](../../app/shops/layout.jsx)
- **A** [docs/commerce/README.md](../../docs/commerce/README.md)
- **A** [docs/commerce/application-regression-report.md](../../docs/commerce/application-regression-report.md)
- **A** [docs/commerce/application-testing.md](../../docs/commerce/application-testing.md)
- **A** [docs/commerce/architecture.md](../../docs/commerce/architecture.md)
- **A** [docs/commerce/backup-recovery.md](../../docs/commerce/backup-recovery.md)
- **A** [docs/commerce/changes.md](../../docs/commerce/changes.md)
- **A** [docs/commerce/database.md](../../docs/commerce/database.md)
- **A** [docs/commerce/lint-review.md](../../docs/commerce/lint-review.md)
- **A** [docs/commerce/main-project-installation.md](../../docs/commerce/main-project-installation.md)
- **A** [docs/commerce/migration-review.md](../../docs/commerce/migration-review.md)
- **A** [docs/commerce/pin-recovery-review.md](../../docs/commerce/pin-recovery-review.md)
- **A** [docs/commerce/pr3-followup-report.md](../../docs/commerce/pr3-followup-report.md)
- **A** [docs/commerce/preservation-review.md](../../docs/commerce/preservation-review.md)
- **A** [docs/commerce/preview-and-environment.md](../../docs/commerce/preview-and-environment.md)
- **A** [docs/commerce/release-review.md](../../docs/commerce/release-review.md)
- **A** [docs/commerce/review-test-results.md](../../docs/commerce/review-test-results.md)
- **A** [docs/commerce/staging-verification.md](../../docs/commerce/staging-verification.md)
- **A** [docs/commerce/testing.md](../../docs/commerce/testing.md)
- **A** [lib/commerce/client.js](../../lib/commerce/client.js)
- **A** [lib/commerce/config.js](../../lib/commerce/config.js)
- **A** [lib/maintenance-page.ts](../../lib/maintenance-page.ts)
- **A** [lib/server/adminRequestOrigin.js](../../lib/server/adminRequestOrigin.js)
- **A** [lib/server/commerce/catalog.js](../../lib/server/commerce/catalog.js)
- **A** [lib/server/commerce/core.js](../../lib/server/commerce/core.js)
- **A** [lib/server/commerce/validation.js](../../lib/server/commerce/validation.js)
- **A** [lib/server/maintenanceSettings.js](../../lib/server/maintenanceSettings.js)
- **M** [package-lock.json](../../package-lock.json)
- **M** [package.json](../../package.json)
- **A** [proxy.ts](../../proxy.ts)
- **A** [scripts/test-commerce-db.mjs](../../scripts/test-commerce-db.mjs)
- **A** [scripts/test-commerce-staging.mjs](../../scripts/test-commerce-staging.mjs)
- **A** [supabase/migrations/20261022160000_commerce_foundation.sql](../../supabase/migrations/20261022160000_commerce_foundation.sql)
- **A** [supabase/tests/commerce_bootstrap.sql](../../supabase/tests/commerce_bootstrap.sql)
- **A** [supabase/tests/commerce_preinstall_verify.sql](../../supabase/tests/commerce_preinstall_verify.sql)
- **A** [supabase/tests/commerce_rls_checkout.sql](../../supabase/tests/commerce_rls_checkout.sql)
- **A** [supabase/tests/commerce_verify.sql](../../supabase/tests/commerce_verify.sql)
- **A** [tests/commerce-api.test.mjs](../../tests/commerce-api.test.mjs)
- **A** [tests/commerce-staging-guard.test.mjs](../../tests/commerce-staging-guard.test.mjs)
- **A** [tests/commerce.browser.mjs](../../tests/commerce.browser.mjs)
- **A** [tests/delivery-pin-recovery.test.mjs](../../tests/delivery-pin-recovery.test.mjs)
- **A** [tests/delivery-return-alias.test.mjs](../../tests/delivery-return-alias.test.mjs)
- **A** [tests/helpers/commerce-fixture.mjs](../../tests/helpers/commerce-fixture.mjs)
- **A** [tests/legacy-payment-guards.test.mjs](../../tests/legacy-payment-guards.test.mjs)
- **A** [tests/maintenance.test.mjs](../../tests/maintenance.test.mjs)
- **A** [tests/subscription-billing.test.mjs](../../tests/subscription-billing.test.mjs)
- **A** [vercel.json](../../vercel.json)
