<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Digital Dine-In update requirements

For every update:

1. Assess whether Supabase database changes are necessary. When none are needed,
   explicitly state **"No SQL migration required."** in the completion report.
2. When database changes are required, create a versioned SQL migration in
   `supabase/migrations/`, using a unique timestamp and descriptive name such as
   `YYYYMMDDHHMMSS_description.sql`. Do not rely on undocumented manual SQL changes.
3. Preserve existing data, RLS policies, wallet balances, payment transactions,
   order histories, and cron jobs. Review migration effects on all of these before
   running it; use changes that preserve existing application functionality.
4. Test required migrations against a verified development database using
   development credentials. Report the actual results. Mocked storage tests do
   not establish migration compatibility with Supabase. If a development database
   is unavailable, report that validation is blocked instead of claiming success.
5. Never execute a migration on production without the user's explicit approval
   for that migration and target. Do not treat development approval as production
   approval.
6. For database changes, include the migration file path, rollback considerations,
   read-only verification queries, and exact installation/application steps with
   the target environment identified. Explain any rollback that cannot safely
   preserve data rather than supplying a destructive shortcut.
7. Run `npm run build` for every update and report its result. Run relevant tests
   using development credentials and isolated fixtures where appropriate. Do not
   process live payments or modify production data while validating changes.

Keep these requirements outside the generated Next.js instruction block above.

## Client Websites main-project scope and release hold

### Current remaining-commerce implementation — updated 4 November 2026

The user explicitly requested continuing the remaining e-commerce requirements.
Implement the outstanding commerce capabilities in dependency order on
`feature/commerce-expansion`, based on the published release's documentation
commit `f9dd674`. This supersedes the earlier three-improvement source limit
for commerce only; preserve all restaurant/delivery/resort/wallet modules and
the original storefront stylesheet. Keep automatic deployment disabled.

Prepare versioned, data-preserving commerce migrations and test only in
isolated loopback development fixtures. Do not apply SQL to any hosted target,
use main as a test database, deploy this new source, merge PRs or process live
payments. The previous Production approval covered commit `84188e3` only.
Keep paid subscriptions disabled and its separate pending migration untouched.
New domain/provider/notification activation needs verified configuration and
separate approval; tests must use stubs/development credentials. Preserve data,
RLS, financial history and cron jobs. Do not ask again for waived backup or
withdrawn staging setup; record hosted-validation limits accurately.

The latest 4 November source increment completes the explicit dedicated-wishlist
page requirement at `/shops/[slug]/wishlist`. Reuse the verified per-store
customer client, existing customer-experience API/RLS and current public catalog.
Keep private noindex metadata, exact custom-host rewriting/foreign-tenant denial,
account-keyed private state, stale GET/POST guards, honest unavailable items and
accessible removal/retry/focus behavior. Do not alter bag/payment state or add
provider authority. No SQL migration required; all seven pending expansion
migrations stay byte-for-byte unchanged and unapplied to hosted targets. Current
checks pass 331/331 unit tests, full lint with zero errors/166 warnings, build
with stable application/configuration fingerprints, and 22 expansion browser
groups/136 screenshots including nine wishlist groups/24 screenshots. The fresh
original suite passes 118 screenshots and 628 PostgreSQL regression assertions
for the unchanged seven migrations. Both suites captured 254 screenshots. Do not
reuse older counts as new evidence. See `docs/commerce/wishlist-page-report.md`.

After wishlist acceptance, the next source dependency is a tracked owner
feature-request workflow with signed Super Admin review and owner-visible status.
It is not implemented by the wishlist increment. Its future tenant-scoped
versioned migration, audit and RLS/permission checks must be developed locally;
no hosted SQL or automatic feature/security/payment activation is authorized.

The preceding committed 4 November source (`8dbc382`) added a verified buyer's narrow
stop of an existing never-dispatched checkout, plus the API/browser integration
needed to validate its proof. Its seventh migration is
`20261104120000_commerce_stop_unstarted_payment.sql`. Keep the first six files
byte-for-byte unchanged. It adds immutable private cancellation proof and
terminal `cancelled_unstarted` state/guards; only `new` with NULL provider order,
NULL creation lease and no receipt is eligible under Auth SHARE then intent
FOR UPDATE. Never infer safety from absence, timeouts, popup dismissal or
provider failure; a missing row cannot release the pointer. Already-dispatched,
unknown, ready or captured payments remain on existing reconciliation paths.
Only bound explicit proof permits clearing the pointer; preserve the bag and
use a fresh UUID. Do not reopen a stopped row or reuse its reserved old key.
No provider/financial activation or general unpaid-order cancellation authority
is created. Serialize all shared browser-pointer changes with exclusive Web
Locks per buyer/store. Secure-browser locking is required for online start/stop
and receipt/proof release; unsupported locking fails closed while Check can
fetch/display status, and COD without a saved online pointer is unaffected.
Recovered known-new Continue stays disabled with Stop-to-restart guidance;
do not expand provider resume or allow stale-tab responses to clear newer state.
Local SQL passes 628 assertions, preserving all prior 561 cases;
focused API tests pass 27 and pointer/state tests pass 18/10. That source’s full
application checks passed 327/327 unit tests, lint with zero errors/166 warnings,
and npm run build. The actual full-app browser suites pass 13 expansion groups/
112 screenshots plus 118 original compatibility screenshots, 230 total at four
widths. Overall completion remains PARTIAL PASS for unperformed hosted/provider/
domain/notification acceptance and activation. See the current report and
stop-unstarted migration review.

The earlier 4 November committed follow-up added only read-only Admin payment discovery/buyer
references and owner configuration status. Its sixth migration is
`20261104090000_commerce_payment_recovery_queue.sql`: one service-only read RPC,
no table/policy/row mutation. Keep the first five migration files byte-for-byte
unchanged. The six-file local SQL suite passes 561 assertions; focused payment
tests pass 21 and owner status tests pass 8. Final full unit checks pass 296/296
with zero skipped, the full repository build passes, lint passes zero errors/
166 warnings, and both final-source browser suites pass 198 combined screenshots
(80 expansion/118 original). Application fingerprints remain stable across the
build and both browser runs, including the valid-uppercase-UUID Admin query
normalization and regression. Local validation is complete; hosted/provider
acceptance and external activation remain held. No new provider, hosted SQL,
deployment, abandonment/release, paid/refund/cancel or activation authority is
created by that increment. The review remains on draft PR #7; do not merge or deploy.

Historical 3 November isolated evidence is 531 PostgreSQL assertions, 284/284 unit tests,
lint with zero errors/166 warnings, and the full repository build passing with
unchanged source fingerprints during compilation. The expansion browser suite
passes eight groups/72 screenshots at four widths, and the original commerce
browser/API compatibility suite also passes against the actual full app with
simulated Auth/Storage and external provider scripts blocked. These are local
results; valid PIN recovery and provider acceptance remain unverified.
All seven commerce expansion migrations remain unapplied to hosted databases;
provider/DNS/email/live-payment gates are not satisfied by local tests. See
`docs/commerce/expansion-report.md` and `expansion-installation.md` for the
completion matrix, exact SQL, object inventories and preserved-history rollback.

Use `docs/commerce/expansion-contract.md` as the integration contract and keep
the implementation/completion matrix truthful. A source implementation is not
proof of hosted Auth/RLS/provider behavior. Export full changed JS/JSX as TXT
with exact destinations, migrations/review/rollback steps, tests and screenshots.

### Published Production release — 2 November 2026

After reviewing the passing lint/test/build report, the user explicitly said
"publish it to production". That authorization supersedes the earlier deployment
holds below for application commit `84188e385d0286fc7d40cec03a179a68a905a167`
only. It is now deployed as `dpl_GfDtcTFMBixnAKawp8XiGuBnANro`, Production/READY,
on https://www.digitaldine-in.online/. All six existing aliases were verified
against that deployment, with redirects/protection/cron settings preserved.

The remote npm build, twelve safe HTTP checks and four live desktop/mobile
home/admin checks pass. No SQL, authenticated production fixture, live payment,
main push or PR merge was performed. Paid subscription checkout stays disabled;
the pending ledger remains unapplied. Do not enable it or infer approval for
SQL/merges/provider tests. Automatic Git deployment guards remain in place.

Subsequent record-only commits do not change the deployed application SHA.
Do not redeploy merely to publish documentation. Future source publication
requires applicable user authorization. See
`docs/upgrade/production-release-20261102.md` for exact evidence, the previous
rollback target, proxy limits and unverified hosted Auth/RLS/provider coverage.

### Current repository lint cleanup — 2 November 2026

The user explicitly requested fixing all 169 inherited lint errors before
continuing release work. This expands the source scope to the affected legacy
restaurant, staff, delivery, resort, wallet/settings and shared UI files. Keep
the existing behavior, contracts and permissions; fix source patterns rather
than disabling rules or adding scheduling tricks. Continue on the current
guarded feature branch and keep all PRs unmerged.

No SQL migration required. Do not change hosted data, policies, cron jobs,
payment configuration or the pending subscription migration/rollout flag.
At that stage publication approval was unanswered. The later explicit Production
authorization and completed release are recorded above; other holds remain.
See `docs/upgrade/lint-cleanup-report.md` for current results and limitations.

### Current address fix and Vercel publication request — 2 November 2026

The user requested the next work and Vercel publication. Prepare a manual Preview
as the default target, with paid subscriptions off; this authorizes Preview work
without removing the production SQL/configuration, live-payment or merge holds.
Do not promote to production or copy Production secrets into Preview. Verify
actual project/Preview configuration before publishing, build from source and
retain every automatic Git deployment guard. The updated team-scoped token now
returns HTTP200 for project, Preview-environment and deployment-list reads.
Preview has zero environment bindings; all fourteen existing bindings are
Production-only. The subsequent explicit Production choice and publication are
recorded above. No Preview was created and Production secrets must not be copied
into Preview. See `docs/upgrade/vercel-publication-status.md` for current state.

Continue the bounded saved-address coordinate validation fix on
`feature/phase0-address-coordinate-validation`, based on PR #5's `deee372`.
Validate existing GPS/map-pin input without coercing missing/boolean/array
values to coordinates. Preserve zero, manual selection, customer/store scope
and optional accuracy semantics. No SQL migration is required for this fix;
do not modify existing stored addresses. The separate subscription ledger SQL
remains unapplied to hosted databases and its rollout flag remains disabled.
See `docs/upgrade/address-coordinate-report.md` for the current slice.

### Current durable subscription increment — 1–2 November 2026

Continue Phase 0 on `feature/phase0-subscription-ledger`, based on PR #4's
`727be8e`; keep PR #4 and commerce PR #3 draft and unmerged. The new additive
`supabase/migrations/20261101123000_subscription_payment_ledger.sql` is prepared
for review only and has NOT been applied to any hosted project. It adds private
checkout intents and immutable activation receipts, with service-only RPCs.
Do not reapply the commerce foundation, run db push, repair migration history,
query production or execute this new migration on a hosted target without
separate explicit approval.

`SUBSCRIPTION_PAID_CHECKOUT_ENABLED` is server-only and disabled unless exactly
`true`. Do not enable it or alter hosted configuration automatically. Missing
RPCs must fail closed; never restore the old direct paid activation fallback.
Historical unregistered captured orders require reconciliation, not an empty
ledger backfill or a second payment. Preserve receipt history during rollback
or recovery. The new SQL has no legacy/Auth foreign keys or existing-row DML.

Use isolated loopback `subscription_test` fixtures only. Docker Hub official
Supabase image discovery was blocked by a proxy CONNECT 403; PostgreSQL 18.4
tests do not prove Supabase 17 or hosted Auth/provider compatibility. The new
branch also has an automatic-deployment guard. All deployment, main/PR merge,
production SQL/configuration, live-payment and real-fixture holds remain.
See `docs/upgrade/subscription-ledger-review.md`, `subscription-ledger-report.md`
and `subscription-ledger-installation.md` for current scope and evidence.

### Current platform Phase 0 — 1 November 2026

The new master upgrade request supersedes the previous storefront-only source
scope. Audit all existing modules and make small critical stabilization fixes;
do not rebuild or implement every roadmap phase at once. The first increment
uses `feature/phase0-account-payment-guards`, based on PR #3's `4ac1e12`, and
addresses owner association/approval and captured-payment/approval guards.
Keep PR #3 draft and unmerged. Preserve its source and deployment guard; disable
automatic deployment for this new branch as well before pushing.

Reuse server-verified ownership and approval helpers. Explicit owner_id overrides
legacy restaurant ID matching; never remap by unverified email/phone or silently
write corrective mappings. Pending/rejected/suspended owners must stay blocked
from operations/subscriptions. Treat authorized payments as pending capture,
not paid. Durable subscription replay prevention needs a separate reviewed
transactional design; do not invent an in-memory financial ledger.

Production SQL/config changes, deployments (including Preview), main pushes or
merges, live fixtures and live payments remain prohibited without separate
approval. No new production queries are necessary. Use synthetic loopback
fixtures; keep unavailable PIN recovery fail-closed until a verified recovery
channel exists. Do not reapply the installed commerce foundation or run
supabase db push. Preserve data, RLS, wallets, orders and cron jobs. See
`docs/upgrade/feature-audit.md` and `docs/upgrade/master-roadmap.md`.

### Previous shopping increment — historical scope, 1 November 2026

The source-scope restrictions below applied to the completed storefront increment.
The newer Phase 0 section above expands authorized stabilization work across
modules. Its production/database/deployment protections remain in effect.

The uploaded seventeen-feature brief limits this increment to three related
shopping improvements: existing single-image zoom, combined price/availability
filters, and the premium bag/checkout presentation. Later database-backed
features remain in `docs/commerce/storefront-roadmap.md`; do not implement all
seventeen at once, invent catalog content or add live commerce payments.
Preserve the pending commerce email callback repair and its scoped PKCE sessions.

The latest user instructions prohibit production SQL, production secret changes,
deployments (including Preview), PR merges and direct main pushes without
explicit approval. Do not run even read-only production SQL for this increment.
Use isolated loopback fixtures/development credentials for testing. Do not modify
restaurant QR, delivery/discontinued delivery, resort, wallet, unrelated auth or
payment functionality. Keep changes on PR #3 and retain its deployment guard.

The original `storefront.css` must remain byte-for-byte intact. This checkout
does not contain `storefront-modern.css`; preserve it if subsequently supplied.
The editorial and gallery styles are separate scoped additions. Maintain cart
storage keys, server-authoritative totals/stock, pickup/COD, verification and
Super Admin assignment/activation/permissions. No schema change is needed for
this first increment; the existing foundation must not be reapplied.

Handoff must include full changed JS/JSX files as downloadable TXT artifacts,
their exact repository/VS Code destinations, styles/tests, screenshots, actual
checks and manual acceptance steps. Do not claim field p75 Web Vitals or real
hosted Auth/payment tests from local simulations. See
`docs/commerce/storefront-increment-report.md` for current evidence.

### Installed foundation and historical verification

The user selected main Supabase project `table-pay` (`wispidcdmunqzahjacws`) and
explicitly approved the reviewed `20261022160000_commerce_foundation.sql`. On
27 October 2026 the user waived the backup prerequisite. On 31 October the user
reported running the complete reviewed file in the main SQL Editor; subsequent
read-only verification confirms the foundation is installed. **Do not reapply
this one-time migration or ask the user to run it, provide credentials or make a
backup again.** No additional migration is needed for post-install verification.

The canonical source remains SHA-256
`dd2882f6329808783b1d4d97c4264f59989b7e834753aa06efe46d63855db1ca`.
Main PostgreSQL 17.6 metadata matches an independently installed local canonical
fixture: nine tables/103 columns, twelve functions, fifteen policies, 25 indexes,
81 constraints, 54 commerce-table constraint triggers and ten Auth FK triggers.
Columns/defaults/types, grants, function security, policy expressions and other
compared definitions match. All twelve stored function-body hashes match after
CRLF-to-LF normalization only. Existing catalog records, four prior bucket
settings and two cron definitions remain unchanged. These are metadata
preservation checks, not a full business-row snapshot or recovery proof.

Eleven read-only hosted REST checks pass: anonymous direct reads on all nine
commerce tables are rejected (HTTP 401 / SQLSTATE 42501), a missing-slug public
catalog call returns HTTP 200/null, and a service-role GET with limit zero returns
200. No business rows or live fixtures were written. Real hosted Auth sessions,
owner-to-owner RLS isolation and commerce workflows remain untested. Fresh local
checks pass: 82 Node tests, 88 isolated PostgreSQL assertions and npm run build.
See `docs/commerce/main-postinstall-results.md` for current evidence and limits.

The 27 October Management API installation attempt failed HTTP 400 / SQLSTATE
25006 in a read-only transaction. That failure is historical: the user completed
installation through the SQL Editor. Do not retry the API migration or treat its
write denial as an installation blocker. Keep verification read-only; do not
switch roles, use JWT impersonation, create live test users/orders or call
mutating RPCs to test production behavior.

The read-only history check found no `supabase_migrations.schema_migrations`
table. No migration-history metadata was created or repaired by this work. Plan
a reviewed baseline before any future CLI migration workflow; do not run
`supabase db push`, replay the foundation or install unrelated migration history
to populate a ledger.

Staging remains stopped by user choice. Do not put main credentials in
COMMERCE_STAGING_*, run destructive fixtures on hosted databases, touch existing
wallet/payment/customer/order data or alter cron jobs. Local development checks
use isolated fixtures only. Preserve existing data, RLS, balances, transactions,
order histories and jobs. The backup waiver does not waive those requirements.
No production deployment/promotion, main merge, other migration, live fixture or
live payment approval follows from installation. Retain PR #3 draft status and
the Vercel `feature/client-websites-phase1` deployment guard.

The prior network/client/backup investigations are historical. Published host
entries and supplied secrets need no re-entry. The cloud's raw PostgreSQL route
was unavailable; do not disable TLS verification, bypass network controls,
elevate roles, use internal-only APIs or create ad-hoc SQL tunnels/functions.
No database backup or managed recovery rehearsal is established. The separate
28-object encrypted Storage workspace copy and its private key remain outside
Git/public archives; retain them without resuming backup work or printing data,
credentials or keys. Follow `docs/commerce/main-project-installation.md` for the
installed-state runbook and data-preserving rollback considerations.
