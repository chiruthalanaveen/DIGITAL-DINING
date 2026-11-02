# Phase 0 security review

Current follow-up, 2 November: the
[subscription ledger review](subscription-ledger-review.md) and
[test report](subscription-ledger-report.md) address replay in a new, default-off
flow. The migration is not hosted; this does not close production release gates.

1 November 2026. Branch: `feature/phase0-account-payment-guards`, based on
commerce commit `4ac1e12`. This is a bounded repository/local-fixture review,
not a certification of the installed production database or every platform role.

## Changes and security rationale

| Finding | Bounded change | Verification boundary |
| --- | --- | --- |
| New restaurant registration stores Auth identity in `owner_id`, while login/dashboard assumed restaurant ID = Auth ID. | Login reuses `/api/auth/owner-restaurant` through `lib/ownerAccount.js`. Initial dashboard admission uses the existing server approval endpoint. Refresh ownership gives explicit `owner_id` precedence over legacy ID matching. | The server verifies the bearer token and requested restaurant. Legacy fallback is limited to null-owner records. No email/phone matching, ownership reassignment, new mapping table or production repair. |
| A valid login must not bypass owner approval. | Dashboard waits for authoritative approval; non-approved states remain gated. Subscription create/verify reject non-approved owners. | Pending, rejected and suspended accounts must not gain protected operations merely because authentication succeeded. Multiple-business ambiguity remains an explicit support/selection error; never choose a random restaurant. |
| Subscription/delivery verification accepted provider status `authorized` before capture. | Authorized-but-uncaptured payments return pending HTTP 202 with `success: false`. A successful verification requires captured status; an explicit `captured: false` is rejected. | Existing signature, provider order/amount/tenant checks remain. Provider calls are simulated in local tests; no actual charge/capture/refund is performed. A browser success callback alone is insufficient. |

Focused owner and payment guard tests have passed during implementation. Final
core/build/browser/lint evidence belongs in the separate Phase 0 test report;
passing these focused tests does not establish a successful hosted payment or
complete RLS isolation across legacy modules.

## Open findings and release gates

| Priority | Residual issue | Required action before the affected release |
| --- | --- | --- |
| **P0** | Durable subscription replay protection is not solved. Synthetic execution of the actual pre-fix handler produced two activation writes for two identical captured callbacks. Capture/approval guards do not make that activation transactional or idempotent. | Design persistent provider-payment/order claims and an atomic activation transaction with unique constraints/locking and immutable audit evidence. Prepare a separate additive migration only after reviewing existing ledger contracts; test concurrent callbacks, retries and failure recovery locally. No in-memory lock or optimistic UI substitutes for durable protection. |
| **P1, conditional exposure** | QR guest history passes restaurant ID/mobile to `get_public_customer_orders`. Delivery guest tracking also falls back after 401 to `get_public_delivery_orders_by_mobile` using store/typed phone, then loads order details. Frontend calls do not prove adequate ownership checks or a working exploit; installed RPC definitions/grants are absent here. | Inspect authorized representative definitions and test cross-customer/anonymous behavior in isolated development. Require appropriate proof/session scoping if absent. Do not claim confirmed deployed customer-data exposure from these source observations. |
| **High verification gap** | Complete legacy restaurant/staff/delivery/wallet/resort RPC definitions and RLS policies are not versioned in this checkout. UI role gates and secure-sounding RPC names do not establish authorization. | Obtain representative isolated schema fixtures/evidence and test all staff/customer/owner roles, forged IDs, expiry and concurrent state changes. Do not broaden grants or test by impersonating production users. |
| **Blocked capability** | Successful delivery PIN reset remains unavailable (HTTP 503). A security question alone is not acceptable recovery proof. | Connect an explicitly approved, verified OTP/recovery channel; design expiry, rate/attempt limits, single use, hashing and affected-session revocation; test isolated accounts. Keep the endpoint safely unavailable until then. |
| **Provider/hosted gap** | Real hosted Auth/email, payment capture/refund/webhook/reconciliation, push/alert delivery and complete cross-module business flows remain unverified. | Use authorized test infrastructure and provider test-mode credentials; record authoritative outcomes. Never substitute production orders or live payments as fixtures. |

The reproducible financial evidence is
`/workspace/commerce-validation-artifacts/phase0-audit-20261101/financial-source-reproduction.json`.
It records synthetic lexical dependencies, zero hosted connections and zero
production mutations. This is evidence of handler behavior under those inputs,
not an executed provider/database transaction.

## Data, secrets and rollback

**No SQL migration required.** This increment changes source guards, not
ownership records, balances, payment references, histories, policies or cron jobs.
Do not reapply `20261022160000_commerce_foundation.sql`, run `supabase db push`,
repair migration history or create live fixtures. New financial persistence is a
separately reviewed migration, never an implicit part of these guards.

No service-role/provider secret should enter client source or public handoffs.
The browser sends its own bearer token to existing server-verified endpoints;
that token is not used as a database service-role key. Preserve no-store behavior,
avoid token/PIN/payment-detail logging and keep synthetic credentials local.

Rollback is a reviewed revert of this phase's source commit on its feature
branch. No database rollback is needed. Reverting restores known owner-linking
and uncaptured-payment defects, so it must not be used as a release shortcut.
All production SQL, secret changes, deployments, merges and live financial
operations remain held for separate explicit approval.
