# Client Websites — Phase 1

**Current scope — 26 October:** the user selected main project only and approved
the reviewed foundation migration after backup/compatibility checks. Staging is
stopped. The main SQL URI and hostname are supplied, but PostgreSQL networking
remains blocked. An HTTPS Management API token is now required for the prepared
alternative access check. Backup/compatibility remain pending; no production SQL
was executed. Use [main-project-installation.md](main-project-installation.md)
for current steps. Prior staging requirements/results below are historical;
deployment, merging and live payments remain on hold.

This additive module provides owner applications and approval, independently
branded tenant catalogs, an owner workspace, image uploads, optional tracked
inventory, customer accounts and COD orders. It does not charge subscriptions or
integrate another payment provider. Industry-specific templates, verified custom
domains, coupons and recurring billing remain later phases.

## Review and installation

The latest [PR #3 follow-up report](pr3-followup-report.md) records 82 passing
unit tests, 88 local PostgreSQL assertions, 19 real staging Auth checks and a
passing build; 64 screenshots remain from the unchanged application run. Billing bookmarks use current checkout; PIN recovery now reports
explicit unavailability. Inherited repository lint and hosted verification remain
release blockers. Staging settings validate; PostgreSQL network access is blocked.

The following development workflow is retained for reference; main-only
execution must follow [main-project-installation.md](main-project-installation.md).

Start with [release-review.md](release-review.md) for the full SQL review,
preservation and backup analysis, latest test evidence, environment requirements
and the explicit hosted-staging blockers. Production release is on hold.

1. Read [architecture.md](architecture.md) for repository analysis, tenant design,
   routes, API contracts and the phase plan.
2. Follow [database.md](database.md) to install the versioned migration into a
   **separate Supabase development project**, inspect the read-only verification
   queries, and understand the data-preserving rollback approach. The destructive
   local database fixtures must never be installed into a hosted/shared project.
3. Use the development project's `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` and server-only `SUPABASE_SERVICE_ROLE_KEY`.
   Keep the existing `ADMIN_EMAIL`, `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET`
   configuration for the development Super Admin. Never commit credential files.
   Configure Supabase Auth email verification and allow development redirects to
   `/commerce/auth` and `/shops/<slug>/account` for the tested application origin.
4. Run `npm ci`, `npm test`, `npm run build`, then `npm run dev` using that
   development configuration. Existing global maintenance mode also applies to
   the new public/owner pages; turn it off through the development Admin settings
   when reviewing them.
5. Visit `/commerce/auth` to create and verify a development owner, then submit
   `/commerce/apply`. In `/admin/dashboard`, open **E-Commerce Website
   Management**, review/approve the application, set up its website and assign
   the verified owner. Configure branding, permissions and pickup/delivery.
6. In `/commerce/dashboard`, add categories/products and stock if inventory is
   enabled. Activate the website through Super Admin, then open `/shops/<slug>`.
   Use a separate development customer session for COD checkout and order history.

For a fully isolated local review without hosted Supabase, follow
[testing.md](testing.md). Its browser runner starts Next.js using only synthetic
development credentials and loopback services, runs the migration tests, and
removes its running HTTP services on exit.

See [changes.md](changes.md) for the exact file list and the prerequisite
maintenance-mode commit included in the review branch.

## Release state

No production database migration, live payment or merge was performed. An earlier
production-target Vercel build was staged before the review hold; existing live
domains remain on the previous deployment. It is not a staging-backed Preview.
Hosted Supabase workflows remain unverified: staging Auth/REST metadata is
reachable and real Auth checks pass, but PostgreSQL network access blocks
migration and tenant workflows.
No further production deployment/promotion is authorized until
the user separately approves after reviewing the final results.

The root [vercel.json](../../vercel.json) disables automatic Git deployment only
for `feature/client-websites-phase1`, allowing a review PR without a preview
deployment. Other branches retain their existing deployment behavior. This guard
does not disable manual CLI/API deployment; none was performed for this feature.
