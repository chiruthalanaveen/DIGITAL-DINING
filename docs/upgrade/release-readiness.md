# Phase 0 release readiness

1 November 2026. **Overall production release: BLOCKED.**

Current branch: `feature/phase0-account-payment-guards`, based on `4ac1e12`.
The intended delivery is a separate stacked **draft** PR targeting
`feature/client-websites-phase1`; commerce PR #3 remains draft and unmerged.
Do not invent a PR or Preview URL before it exists and is verified. The final
Phase 0 progress/test reports must record the actual commit and PR reference.

## Increment status

**Local increment: PASS with inherited lint failure disclosed.** Owner admission
and captured-payment/approval guards are implemented. Fresh checks pass: 123/123
unit tests, build, twelve owner browser cases, 88 PostgreSQL assertions and the
retained commerce API/browser suite. There are 154 screenshots at four widths.
Full lint still fails with 169 errors/179 warnings, with zero new errors or
warnings versus the preceding PR #3 snapshot. See [test-results.md](test-results.md)
for commands, initial test correction, console evidence and verification limits.
The complete platform upgrade remains phased work, not a completed release.

**No SQL migration required.** The installed commerce foundation must not be
reapplied. No ownership backfill, live data edit, RLS change, wallet adjustment,
cron change or provider activation is part of this increment.

## Blocking gates

| Gate | Status and required evidence |
| --- | --- |
| Durable financial idempotency | **BLOCKED / P0.** Duplicate captured subscription callbacks can perform repeated activation writes. Current captured-state/approval guards do not solve durable replay. A separately reviewed atomic persistence design and isolated concurrency/recovery tests are required. |
| Owner admission correctness | **PASS locally** for pending/approved/rejected/suspended, legacy/orphan/mismatch/multi-business, missing/expired-session and browser checks. No unverified email/mobile auto-linking or automatic approval. Real hosted/legacy-RLS verification remains separate. |
| All legacy tenant/role boundaries | **UNVERIFIED.** Complete legacy installed SQL/RLS definitions and representative staff/customer/wallet/resort fixtures are unavailable in repository. Do not claim complete isolation from UI guards or commerce-only tests. |
| Hosted Auth/email and provider payments | **UNVERIFIED.** Local simulated providers do not prove actual SMTP, capture/refund, reconciliation or webhook delivery. Use approved test infrastructure only. |
| PIN recovery | **BLOCKED capability.** No operational verified recovery channel is established; successful reset remains safely unavailable (503). Do not replace ownership proof with a security answer. |
| QR guest order privacy | **CONDITIONAL GAP.** Phone-based public order-history RPC requires an isolated definition/authorization test; no exploit is proven from the frontend call alone. |
| Core tests, build and lint | Core/build/browser checks pass. **Full lint FAIL**, inherited 169 errors/179 warnings with zero Phase 0 additions. No rule/check was disabled. |
| Performance/a11y/cross-module regression | Save p50/p95 and field p75/INP are unmeasured; unchanged four-second dashboard opening delay remains. Existing commerce evidence does not certify every restaurant/resort/PWA route. |
| Vercel Preview | **NOT AVAILABLE / UNVERIFIED.** Last project/env/deployment metadata GETs on 31 October returned HTTP 403 `forbidden`. This is not a measured proxy CONNECT failure or proof of token expiry. No usable Preview URL/configuration is established. |

## Deployment and installation hold

Both `feature/client-websites-phase1` and
`feature/phase0-account-payment-guards` are disabled for automatic Git deployment
in `vercel.json`. Retain those guards. A feature-branch push is not a deployment
or release approval. Do not deploy a loopback-fixture build with `--prebuilt` or
copy production secrets into a Preview to make tests run.

No new environment variable, DNS record or storage policy is required for these
source guards. Existing server Auth and provider configuration remain unchanged.
Any future hosted verification must first establish the authorized target and
scope; do not silently use main credentials when staging is unavailable.

Production SQL, secrets/configuration changes, production deployments, any
previously held Preview deployment, main merges and live payments remain on
hold for separate explicit approval. Do not change live maintenance settings or
write test customers/orders as a testing shortcut.

Rollback consists of a reviewed revert of this increment's source commit. No
database rollback is needed, and all installed data/policies must remain. Since
that revert reintroduces known correctness failures, validate any alternate fix
before considering release. See [security-review.md](security-review.md) and
[performance-report.md](performance-report.md) for residual risks and next gates.
