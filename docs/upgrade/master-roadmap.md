# Dependency-aware platform upgrade roadmap

Current Phase 0 follow-up: [durable subscription activation](subscription-ledger-report.md)
is being verified on a separate stacked branch. Its migration/flag are held for
review; later phases and production actions remain gated as described below.

1 November 2026. Start from the existing application and draft commerce PR #3;
do not rebuild modules or collect this entire roadmap into one large release.
See [feature-audit.md](feature-audit.md) for source findings and the distinction
between tested, unverified, partial, missing and externally blocked workflows.

## Shared completion gates

Every slice must identify its before/after behavior, minimal file scope,
database/security dependencies and data-preserving rollback. Add focused tests,
run `npm test`, `npm run build`, `npm run lint` and the relevant isolated
integration/browser checks. Separate inherited lint failures from new failures.
Record actual commands, counts and blockers; do not disable guards to make a run
pass. Do not claim production performance or provider success from mock fixtures.

Use feature branches and reviewable commits/PRs; leave draft PR #3 unmerged.
Preserve existing commerce progress and its deployment guard. Any new branch
must also be protected from accidental automatic deployments before pushing.
Production SQL/config changes, deployments, main merges, live orders/payments
and actual financial operations remain separately protected. No staging target
is silently replaced by production. Use isolated loopback fixtures now.

The already-installed commerce foundation is not a pending migration. Never
reapply it or run `supabase db push` to populate an absent migration ledger.
For a genuinely required new schema, create one additive versioned migration,
test application/reapplication/preservation/RLS/concurrency in development, and
provide exact reviewed install/verification/rollback instructions before asking
for hosted application approval. Preserve wallets, payments, histories and cron.

## Phases and order

| Phase | Independently reviewable slices | Dependencies and risks | Exit evidence |
| --- | --- | --- | --- |
| **0 — Audit and stabilization** | **First bounded increment: owner registration/login association and approval consistency, plus captured-payment/approval guards in existing subscription/delivery verification.** Reuse authenticated server lookup, preserve explicit-owner precedence and null-owner legacy compatibility. Then design durable payment replay protection separately, reproduce/measure slow save actions, complete PIN recovery only with a verified channel, close additional tenant defects and add redacted diagnostics. | Existing Auth identity/approval helpers; legacy installed RPC/RLS contracts are incomplete in repository. Do not backfill by unverified email/mobile, auto-approve or activate a subscription from an uncaptured payment. Synthetic handler reproduction proves these payment-state/approval failures and duplicate activation writes; the latter needs durable transactional design. PIN reset remains unavailable if proof channel is absent. | Pending/approved/rejected/suspended/orphan/legacy/multi-business/tampering/session tests; captured/uncaptured/failed payment, amount/order binding and approval tests; current lint delta; build and narrow mobile/login/dashboard tests. Explicitly retain the durable replay/provider/RLS blockers. |
| **1 — Shared design and performance** | Inventory reusable `PortalShell`, forms/dialogs/tokens; resolve targeted theme/focus/touch issues; instrument one safe mutation; remove measured redundant requests; review PWA registration/duplicate root conventions and private caching. | Stabilized auth/permissions. Preserve functional layouts, source types and original commerce styles. Need representative timing baselines before optimization. No global cosmetic rewrite or mass TypeScript conversion. | Before/after request counts and p50/p95 under stated conditions; four-width critical-route checks, keyboard/contrast/reduced motion, bundle/loading comparison. Field p75/INP only when actually measured. |
| **2 — Delivery** | Verify eligible nearest-three discovery and stale-store context; address ownership/coverage; persisted order timeline/reconnect; authoritative fee snapshots and wallet gates; then consented notifications and returns/substitutions. | Phase 0 customer/staff auth, approved delivery policy, existing wallet semantics, maps/push providers, real coordinates and coverage configuration. Target `/delivery` only. | GPS accepted/denied/no-store/invalid coordinate; coverage/plan/wallet eligibility; cross-customer denial; totals/replay/stock/returns; driver authorization; notification sandbox delivery or explicit blocker. |
| **3 — Restaurant operations** | Existing QR/table/parcel/counter and KDS/waiter regressions first; then constrained POS/receipt/inventory improvements; later reservations/waitlist, loyalty and hardware-print adapters as separate slices. | Complete representative legacy SQL/RPC definitions, staff session permissions, financial correctness and ingredient/inventory mapping. Reservations and loyalty likely need separate additive schemas; no ledger/inventory merging by convenience. | Table/session validation, order/stock/status transitions, cross-role denial, receipt/GST fixtures; reservation concurrency and loyalty idempotency; actual printer capability evidence or blocked classification. |
| **4 — E-commerce completion** | Keep locally verified onboarding/catalog/media/stock/COD and three shopper improvements. Resolve hosted release proof separately. Implement later capabilities in dependency order from `docs/commerce/storefront-roadmap.md`: status/policies/SEO, then variants/addresses/wishlist, promotion/reviews/returns/analytics/builder/notifications; online payments last and disabled by default. | PR #3 review, active/approval/assignment/permissions, immutable server totals and stock; additive scoped data models; real hosted Auth/mail and optional providers. No foundation replay or duplicate commerce implementation. | Tenant owner/customer Auth+RLS tests, COD/inventory races/retry/history, 360/390/768/1440 UI, server coupon/refund constraints; sandbox payment signatures/webhooks/reconciliation before any activation request. |
| **5 — Resort** | Reproduce booking/hold/availability behavior; verify overlap prevention; then check-in/out and token privacy, room service and maintenance/housekeeping tasks; dynamic packages/deposits/refunds only after deterministic pricing/payment contracts. | Installed booking RPC/constraint definitions, occupancy/timezone/expiry semantics, resort staff roles and authorized test-mode gateway. Existing room status UI is not proof of a full operations system. | Concurrent booking/hold expiry, date/occupancy boundaries, token/tenant isolation, booking price snapshots and role-safe status transitions. Provider capture/refund evidence must be authoritative. |
| **6 — Admin, wallet and BI** | Role-scoped analytics that distinguishes placed/collected/settled totals; immutable reconciliation/adjustment evidence; failure/retry settlement visibility; tax/export improvements; audited entitlements and support diagnostics using existing support tools. | Existing ₹5 default delivered-order fee, per-store overrides, ₹2,000 initial recharge, ₹500 default threshold/spendable policy and 23:00 Asia/Kolkata settlement. Admin actor/reason/proof, owner-only recharge and manager read-only rules remain. | Exact-paise accounting, duplicate accrual/settlement/refund tests, locked concurrency, adjustment audit and restricted exports; failed settlement cannot become completed. No live accounting mutations for verification. |
| **7 — Integration and release readiness** | Cross-module acceptance, security/privacy/a11y/performance review, provider and hosted Preview verification, migration/recovery/install runbooks and operator release checklist. | All slice gates and explicit authorized target/credentials. Resolve legitimate Vercel read access; last metadata check was HTTP403. A source push or local build is not a deployed Preview. | Actual URL/configuration/branch/commit, scoped smoke tests, all remaining risks and blockers, migration/rollback and monitoring delivery evidence. Stop for separate approval before production SQL/deploy/merge/payment activation. |

## First bounded increment plan

1. Capture the current owner lookup/approval mismatch with isolated fixtures.
2. Reuse the existing server owner-restaurant resolver and authoritative approval
   helper for authenticated login/dashboard identity. Explicit `owner_id` wins;
   legacy fallback is allowed only for a null owner. Validate requested business
   IDs against the verified Auth user, including multi-business selection.
3. Preserve pending/rejected/suspended experiences and approved legacy access.
   No corrective database mapping is needed or authorized for this slice.
4. Separately strengthen existing subscription/delivery verification to require
   authoritative captured payment and approved ownership before reporting
   success. Preserve exact amount/order/signature checks. Add captured,
   authorized-but-uncaptured, failed, pending-owner and tampering regressions.
   Do not claim durable replay prevention from this state guard: the observed
   duplicate activation remains a separately tracked critical issue.
5. Add focused security/regression tests; run the core checks and narrow browser
   cases. Compare inherited lint against the current pre-slice snapshot.
6. Record changed files, exact commands, test limitations and rollback in the
   Phase 0 progress/test/security documents; create a reviewable feature commit.

**No SQL migration required** for the first source-only owner-access and payment
state/approval guards. A later need for database authorization or audit
persistence must be separately scoped;
do not silently expand this slice into registration data cleanup.

## Parallel work and external dependencies

Read-only source audits, local fixtures, documentation, independent helper tests
and provider-contract design may progress in parallel. Keep edits to shared
authentication/financial code sequential and reviewed. Do not keep rerunning
unchanged Vercel requests, request previously waived backups again or substitute
production credentials for a missing fixture. Record each operational dependency
and complete unaffected local work.

The roadmap is a prioritization and dependency plan, not a claim that later
features are implemented or production-approved. Finish the first safe slice
before beginning another schema/provider-sensitive feature.
