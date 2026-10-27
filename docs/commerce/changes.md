# Exact changed-file list

Complete PR #3 diff against main `7385253c5381fdf4998fddf8f58e84b783aabba1`.
A means added; M means modified. No files are deleted or renamed.

## Latest backup transport update versus 26d6697: 8 files

Both required hosts are published. Official PostgreSQL 17.11 client signatures
and checksums were verified, and local-only adapter/encryption helpers passed
8, 11 and 20 synthetic adapter/encryption/Storage export tests. The configured
proxy still closes PostgreSQL SSL negotiation; direct TLS negotiates no required
`postgresql` ALPN. A separate encrypted Storage-only copy passed: 28/28 objects,
7,431,276 bytes, stable inventory and authenticated local readback. It is a
workspace copy, not an offsite/database backup or full recovery proof. No
successful database login, database backup, migration or business write occurred. Existing main
read-only catalog results remain valid evidence within their stated limits.
No additional credential/hostname entry is needed. The trusted-machine runbook
provides the supported backup alternative. Fresh `npm run build` passed using
synthetic development configuration. Application source and foundation SQL are
unchanged. No SQL migration required for this documentation/investigation update.

See [main-preflight-results.md](main-preflight-results.md) for commands/results,
[trusted-machine-backup.md](trusted-machine-backup.md) for backup steps and
[main-project-installation.md](main-project-installation.md) for conditional
installation and rollback. Historical unit/SQL/browser counts were not rerun;
full production readiness still fails.

- **M** [AGENTS.md](../../AGENTS.md)
- **M** [docs/commerce/README.md](README.md)
- **M** [docs/commerce/changes.md](changes.md)
- **M** [docs/commerce/main-preflight-results.md](main-preflight-results.md)
- **M** [docs/commerce/main-project-installation.md](main-project-installation.md)
- **M** [docs/commerce/pr3-followup-report.md](pr3-followup-report.md)
- **M** [docs/commerce/release-review.md](release-review.md)
- **A** [docs/commerce/trusted-machine-backup.md](trusted-machine-backup.md)

## Complete PR: 88 files

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
- **A** [docs/commerce/main-preflight-results.md](../../docs/commerce/main-preflight-results.md)
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
- **A** [docs/commerce/trusted-machine-backup.md](../../docs/commerce/trusted-machine-backup.md)
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
