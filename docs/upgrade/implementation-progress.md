# Phase 0 implementation progress

This is the completed first increment (PR #4). Current follow-up, 2 November:
[durable subscription activation](subscription-ledger-report.md), with its own
migration review, test evidence and changed-file list. Neither increment is a
production deployment.

1 November 2026. Branch `feature/phase0-account-payment-guards`, based on
`4ac1e12` from draft [commerce PR #3](https://github.com/chiruthalanaveen/DIGITAL-DINING/pull/3).
The master audit and dependency roadmap were created before implementation.
This is the first bounded stabilization increment, not the complete upgrade.
Implementation commit: `60a8ea14157c402148eb51713929b69562c1ebdf`, delivered
through stacked **draft [PR #4](https://github.com/chiruthalanaveen/DIGITAL-DINING/pull/4)**
targeting PR #3's feature branch. Neither PR is merged.

## Owner association and approval

**Previous status: broken, reproducible identity-contract mismatch.** Registration
sets `restaurants.owner_id = auth.users.id` and receives a separate restaurant
primary key. Password login queried that primary key using the Auth ID; the
dashboard rejected a different route ID before checking explicit ownership.

Login now reuses the existing authenticated owner resolver. Dashboard admission
uses the existing server approval-status endpoint, which verifies the bearer
token and requested business. Its refresh guard also gives explicit `owner_id`
precedence over legacy ID matching. Legacy access remains valid only where no
explicit owner is set. The biometric flow retains its authenticated email and
DOB checks, reading DOB only for the resolved business.

Pending, rejected and suspended owners see a locked status view, rather than an
operations dashboard. Orphaned accounts receive support guidance. Generic login
does not select an arbitrary business for multi-business owners; it returns the
existing clear conflict response. A known, explicitly authorized business URL
works. A full business-switcher UI remains later work.

No corrective mapping is written. Repeating the read-only lookup is safe and
does not attach accounts by email, phone or user-editable metadata. Existing
records with genuinely missing/inconsistent ownership need a separately
authorized administrative review, not an automatic backfill.

## Payment capture and subscription approval

**Previous status: broken, locally reproduced with actual handler code and
synthetic effects.** An authorized-but-uncaptured provider payment could activate
a subscription; a pending owner could activate one as well. Delivery verification
also accepted authorized status before inventory/paid effects.

Subscription creation and verification now require explicit approval before
provider/coupon/activation work. Final activation updates also bind the same
owner and approved state. Subscription and delivery verification return HTTP 202
with `success:false`, `pending:true` and `PAYMENT_NOT_CAPTURED` for authorization
without capture. Other noncaptured states and contradictory `captured:false`
responses are rejected. Existing callers inspect `success`, so HTTP 202 cannot
be interpreted as paid. Matching captured payments retain existing behavior.

These guards do not provide durable subscription replay protection. Repeated
captured callbacks can still re-activate; that remains a P0 release blocker
requiring a separately reviewed transaction/persistence design. No online
commerce payment, capture request, refund or live payment was activated here.

## Preservation and delivery

**No SQL migration required.** No table, column, policy, function, trigger,
index, grant, migration ledger, business row, wallet balance, order history,
payment reference or cron job was changed. No SQL was executed on production.
The installed commerce foundation must not be reapplied.

The existing commerce storefront, original styles, COD/pickup, inventory,
server totals, customer sessions, owner workspace and admin assignment gates
remain intact. Restaurant registration writes and OAuth callbacks are unchanged.
No discontinued delivery frontend was introduced. A branch-specific automatic
deployment guard was added before pushing; PR #3 stays draft and unmerged.

The [audit](feature-audit.md) classifies the broader platform. The
[test report](test-results.md) records exact executed commands, results and
limitations; [security review](security-review.md), [performance report](performance-report.md)
and [release readiness](release-readiness.md) track unresolved gates. No new
application environment variable, DNS record, dependency or storage policy is
needed. Test artifact variables are local test controls only.

## Manual acceptance and rollback

1. With isolated accounts, sign in to a generated-ID business in each approval
   state. Only approved owners may see operations or subscribe.
2. Verify null-owner legacy access, missing mapping, explicit other-owner ID
   collisions, wrong business IDs, expired/missing sessions and safe
   multi-business ambiguity/direct selection.
3. Verify authorized payment returns pending and causes no inventory, paid,
   notification or activation effect; captured matching payment still succeeds.
   Retest forged signatures, wrong amount/order/currency and nonapproved owners.
4. Inspect login/status/dashboard at 360, 390, 768 and 1440 px. Real device
   passkeys, full PWA lifecycle and complete accessibility remain separate tests.
5. Do not perform these tests on production or use real payments.

Rollback is a reviewed revert of the Phase 0 source increment to the `4ac1e12`
baseline on its feature branch. It needs no database rollback and must retain
the installed foundation and data. Reverting reintroduces known defects; use
an alternate verified fix before any affected release. Production deployments,
SQL/config changes, main merges and live financial operations remain held.

Full TXT handoff is outside Git at
`/workspace/commerce-handoff/phase0-stabilization-20261101/`, with exact VS Code
destinations in `README.md` and hashes/operations in `manifest.json`. Its sibling
`phase0-stabilization-20261101-code-txt.zip` contains complete changed JS/JSX/MJS
files and the deployment-guard configuration. The sibling
`phase0-stabilization-20261101-evidence.zip` contains the final 154 screenshots,
logs, summaries and command wrappers. Remove only the appended `.txt` extension
when applying source; compare local differences and retain the existing PR #3
implementation. No SQL or provider keys are included or required by the patch.

## Exact changed files

Compared with `4ac1e12` from PR #3: 21 files. No files deleted or renamed.

- **M** [AGENTS.md](../../AGENTS.md)
- **M** [app/api/create-order/route.js](../../app/api/create-order/route.js)
- **M** [app/api/delivery/razorpay/verify-payment/route.js](../../app/api/delivery/razorpay/verify-payment/route.js)
- **M** [app/api/verify-subscription/route.js](../../app/api/verify-subscription/route.js)
- **M** [app/dashboard/[id]/page.jsx](../../app/dashboard/[id]/page.jsx)
- **M** [app/login/page.jsx](../../app/login/page.jsx)
- **A** [docs/upgrade/feature-audit.md](feature-audit.md)
- **A** [docs/upgrade/implementation-progress.md](implementation-progress.md)
- **A** [docs/upgrade/master-roadmap.md](master-roadmap.md)
- **A** [docs/upgrade/performance-report.md](performance-report.md)
- **A** [docs/upgrade/release-readiness.md](release-readiness.md)
- **A** [docs/upgrade/security-review.md](security-review.md)
- **A** [docs/upgrade/test-results.md](test-results.md)
- **A** [lib/ownerAccount.js](../../lib/ownerAccount.js)
- **A** [tests/delivery-payment-capture.test.mjs](../../tests/delivery-payment-capture.test.mjs)
- **A** [tests/helpers/owner-account-fixture.mjs](../../tests/helpers/owner-account-fixture.mjs)
- **M** [tests/legacy-payment-guards.test.mjs](../../tests/legacy-payment-guards.test.mjs)
- **A** [tests/owner-account.browser.mjs](../../tests/owner-account.browser.mjs)
- **A** [tests/owner-account.test.mjs](../../tests/owner-account.test.mjs)
- **M** [tests/subscription-billing.test.mjs](../../tests/subscription-billing.test.mjs)
- **M** [vercel.json](../../vercel.json)
