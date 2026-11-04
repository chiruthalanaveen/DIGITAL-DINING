# Client Websites — current commerce expansion

Updated 4 November 2026. The current work is on
`feature/commerce-expansion`, based on the previously published application.
Read the [expansion implementation/test report](expansion-report.md) and
[six-migration installation/recovery runbook](expansion-installation.md) first.
The source includes catalog/fulfillment, customer experience, coupons/outbox,
verified domains and separately gated merchant payments. Local tests are not a
claim of hosted/provider acceptance or live activation. New hosted SQL,
production deployment and merges remain unperformed and require separate
applicable approval. Domain/provider/notification/payment flags remain off.

The 4 November follow-up adds a read-only Super Admin open-payment queue and
buyer recovery references, plus an owner configuration-status panel. The sixth
SQL migration only adds a service-only read RPC; it never marks an attempt paid,
refunded, cancelled or abandoned. The first five migrations remain unchanged.
The final current-source checks pass: 561 isolated SQL assertions, 296/296 unit
tests, zero lint errors/166 warnings, the full repository build and 198 combined
browser screenshots. Source fingerprints remain stable across the build and
both browser suites. The valid-uppercase-UUID Admin query regression passes
within 21 payment tests; owner status adds eight focused tests. Expansion browser
coverage includes owner status and retained-intent discovery without provider
queries. Hosted/provider acceptance and activation remain held. The
3 November 531-SQL/284-unit/build/browser
results in the report remain dated historical evidence, not a fresh release
claim. Draft [PR #7](https://github.com/chiruthalanaveen/DIGITAL-DINING/pull/7)
remains the review destination.

The sections below preserve the dated first-increment record; its narrower
source scope and “No SQL migration required” statement describe that older
increment only. **The current expansion requires six new migrations.** The
installed foundation must not be replayed, and the separate pending platform
subscription ledger remains excluded/off.

## Historical first shopping increment

Updated 1 November 2026. Work remains on `feature/client-websites-phase1`, draft
[PR #3](https://github.com/chiruthalanaveen/DIGITAL-DINING/pull/3).

The [current report](storefront-increment-report.md) records the first three
shopping improvements from the uploaded brief: combined price/availability
filters, accessible zoom for the existing product image, and a premium bag and
checkout presentation. It also carries the commerce email callback repair.
[storefront-roadmap.md](storefront-roadmap.md) maps all seventeen requests,
before/after UX, dependencies and later migration approvals. Multiple product
images, variants, reviews, coupons, notifications and online payments are not
activated by this increment.

The original storefront stylesheet is preserved. `storefront-modern.css` is not
in this checkout; any local copy/import must be retained. The new editorial and
gallery files are additive and scoped. Tenant names, photos, colors, categories,
prices and stock come from the catalog. No shared component hardcodes the sample
store, fake reviews, discounts or delivery promises.

No SQL migration required. The existing foundation was installed by the user and
[verified on 31 October](main-postinstall-results.md). Do not run it again or
replay migration history. The latest user instructions prohibit production SQL,
secret changes, deployment, live payments and merging without separate approval.
The code is not represented as deployed. The Vercel feature-branch guard remains.

## Development and acceptance

Use the [isolated development workflow](testing.md). Destructive SQL/browser
fixtures permit only an explicit loopback `commerce_test` database and must never
be pointed at a hosted project. Current tests use synthetic credentials and a
local Auth/REST/Storage adapter over actual PostgreSQL. Email/code exchanges are
simulated provider interactions, not proof of real Supabase email delivery.

The module continues to provide applications and Super Admin approval,
owner/store assignment, branded catalogs, optional inventory, customer accounts
and COD pickup/delivery orders. Existing feature/owner permissions and active
store checks remain authoritative. The new browsing controls default to the
original complete catalog; zoom appears only with a supplied working image.
Checkout remains governed by the existing store COD/fulfillment configuration.

Commerce verification/recovery emails now return through
`/auth/callback/commerce`, using the correct owner or storefront client scope.
That prefix matches the observed primary-origin callback allowlist. Each actual
Preview or additional hostname needs its precise allowed origin and verified
email-provider configuration. Existing restaurant/delivery auth callbacks are
unchanged. See [preview-and-environment.md](preview-and-environment.md) for the
measured Vercel access limitation and configuration review; do not resume the
withdrawn staging/backup workflow or copy production secrets without review.

Read [storefront-increment-report.md](storefront-increment-report.md) for final
commands/results, screenshots, performance-measurement limits, TXT code handoff,
manual acceptance and outstanding release risks. The [changed-file list](changes.md)
identifies the exact first-increment and complete PR files.

## Retained review material

- [Architecture and API contracts](architecture.md)
- [Every foundation database object](migration-review.md)
- [Installed-state verification and recovery considerations](main-project-installation.md)
- [Historical application testing](application-testing.md)
- [Historical PIN/billing follow-up](pr3-followup-report.md)
- [Original production-release review](release-review.md)

The older reports retain their dated observations. They must not be used to
claim current Preview URLs, fresh screenshots or hosted workflows passed.
