# Client Websites — current commerce expansion

Updated 4 November 2026. The current work is on
`feature/commerce-expansion`, based on the previously published application.
Read the [expansion implementation/test report](expansion-report.md) and
[seven-migration installation/recovery runbook](expansion-installation.md) first.
The source includes catalog/fulfillment, customer experience, coupons/outbox,
verified domains and separately gated merchant payments. Local tests are not a
claim of hosted/provider acceptance or live activation. New hosted SQL,
production deployment and merges remain unperformed and require separate
applicable approval. Domain/provider/notification/payment flags remain off.

The current 4 November increment adds a narrow **stop unstarted checkout** flow.
Only a verified buyer's existing `new` intent with no provider order, no creation
lease and no captured receipt can stop, under the same row lock used to claim
provider creation. Immutable cancellation proof preserves the original request
and key. Only bound proof unlocks the browser; the bag stays and the next
checkout uses a fresh UUID. Missing records and already-started/unknown/ready/
captured payments remain locked for reconciliation. No provider cancellation,
expiry inference, refund or activation is introduced. Read the
[full seventh-migration review](stop-unstarted-payment-migration-review.md).

Shared online-payment pointers are serialized across cooperating tabs with Web
Locks. Online start/stop and receipt/proof release require a secure browser with
`navigator.locks.request`; unsupported browsers retain the attempt and can still
fetch/display status through Check payment. COD without a saved online pointer
is unaffected. A recovered `new` request must use Stop to restart checkout;
Continue does not add a provider-resume capability.

The seven-file local PostgreSQL suite passes **628 assertions**, retaining all
prior 561 and adding 67 stop/race/preservation checks. Current full application
checks pass **327/327 unit tests**, lint with **zero errors/166 warnings**, and
`npm run build`. Focused payment API tests pass 27; pointer/state tests pass
18/10. Fresh full-app browser suites pass 13 expansion groups/112 screenshots
and 118 original compatibility screenshots: **230 total** at four desktop/mobile
widths. The first six migration files remain byte-for-byte unchanged. The full
checklist is **PARTIAL PASS** until hosted/provider/domain/notification acceptance
and applicable activation approvals are complete.

The preceding committed recovery follow-up passed 561 SQL assertions, 296 unit
tests, zero lint errors/166 warnings, build and 198 browser screenshots. It added
read-only Admin discovery, buyer references and owner configuration status; the
sixth migration itself never changes payment state. Those results and the
3 November 531-SQL/284-unit results remain dated historical evidence. Draft
[PR #7](https://github.com/chiruthalanaveen/DIGITAL-DINING/pull/7) remains the review
destination. Hosted/provider acceptance and activation remain held.

The sections below preserve the dated first-increment record; its narrower
source scope and “No SQL migration required” statement describe that older
increment only. **The current expansion requires seven new migrations.** The
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
