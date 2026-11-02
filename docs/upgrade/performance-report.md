# Phase 0 performance report

The [current subscription increment](subscription-ledger-report.md) prioritizes
durable correctness, not speed. Its RPCs bound lock waits to five seconds; this
is not a measured p95 or whole-request deadline. No mutation-speed or field
performance target is claimed by the newer work.

1 November 2026. Branch: `feature/phase0-account-payment-guards`.

The first increment fixes owner-account admission and payment-state correctness.
It does **not** claim faster Save/Update/Submit actions or achieved production
Web Vitals targets. No representative p50/p95 mutation baseline has been
measured, and no production field p75/INP dataset is available.

## Observed source behavior

- The dashboard intentionally keeps its opening experience visible for a
  minimum of four seconds. The existing `4000 - elapsed` timer remains unchanged.
  That visible delay must not be reported as measured database/API latency.
- Initial dashboard access now uses the existing server approval endpoint with
  bearer verification. The additional authoritative server check is a security
  choice, not evidence of a performance improvement.
- `ResortManagement.load()` already issues its four data reads concurrently.
  Replacing those reads with another `Promise.all` is not a new optimization.
- Large client components, repeat Auth checks and broad settings reloads are
  candidates for measurement. Source size alone does not prove a bottleneck;
  no broad rewrite, speculative index or private-data cache was introduced.

## Measurements and limits

| Measurement | Current evidence |
| --- | --- |
| Save/Update/Submit p50 and p95 | **Not measured.** No before/after improvement claim. |
| Database query plans/RPC latency | **Not measured for legacy modules.** Installed legacy definitions and representative isolated fixtures are incomplete. |
| New owner-auth request timings | No production-representative baseline. Focused correctness tests are not latency benchmarks. |
| Mobile LCP/INP/CLS p75 | **Not measured.** Do not infer field results from local screenshots or build success. |
| Historical storefront initial-load lab samples | Recorded in the earlier [storefront report](../commerce/storefront-increment-report.md), using one unthrottled loopback navigation per width and a short initial observation window. They are not new Phase 0 measurements, INP measurements or production target proof. |
| Current retained-commerce initial-load lab samples | LCP 224/240/204/228 ms at 360/390/768/1440 px, initial CLS 0 at all widths. One unthrottled loopback navigation per width; observed only through image/font readiness plus two frames (~0.46–0.57 seconds). Not a field p75, full-lifespan CLS, INP or before/after improvement measurement. Evidence: `phase0-audit-20261101/commerce-browser/storefront-lab-performance.json`. |
| Build/browser results for this increment | Fresh build and owner/commerce browser checks pass; exact commands/conditions are in [test-results.md](test-results.md). A successful build does not establish a performance target. |

## Next measurable save-action slice

1. Select one safe settings mutation with an isolated tenant fixture. Separate
   click-to-feedback, network duration, server duration, database time and
   render/refresh completion. Use redacted correlation IDs without private values.
2. Capture p50/p95 across repeated runs with stated sample count, warm/cold state,
   hardware/network conditions, request counts and error rate. Capture a baseline
   before modifying the path.
3. Apply only a demonstrated improvement: bounded field updates, duplicate-submit
   protection, safe independent query concurrency or precise state invalidation.
   Never show saved success before the authoritative mutation succeeds.
4. Repeat the same measurement and failure/retry tests. Explain any tradeoff,
   regressions or remaining intentional UI delay. Add indexes only with measured
   query-plan evidence and a separately tested additive migration if necessary.

**No SQL migration required.** This report introduces no schema, telemetry
provider, production query, cache change or external monitoring configuration.
