# Phase 0 — saved-address coordinate validation

2 November 2026. Branch `feature/phase0-address-coordinate-validation`, based on
`deee372` from draft PR #5. This continues the existing upgrade. The user fixed
Vercel team-token access during this work; project/environment/deployment reads
now succeed. Runtime settings currently exist for Production only, so a Preview
still requires its own approved configuration. No SQL, live test data/payment or
main/PR merge is authorized by the publication request.

## Audit and minimal plan

The existing delivery saved-address API runs `Number()` directly on latitude
and longitude. JavaScript converts `null`, blank strings, booleans and arrays
into finite numbers; missing-location payloads can therefore be saved as fake
zero coordinates. This is distinct from a legitimate numeric zero coordinate.

The existing API requires a valid GPS/map pin. The current picker also validates
a selected or manually entered pin before saving. The fix preserves numeric
coordinates, decimal numeric strings, genuine zeroes, range boundaries and
manual map selection. It rejects missing/null/blank/boolean/object/array values
before conversion and retains finite WGS84 range checks. Optional GPS accuracy
keeps its null/empty semantics while rejecting malformed present values.

Focused regressions found a second existing defect: the address UUID regex
omitted three hex digits and a separator. It rejected valid 36-character IDs for
edit, delete and default selection. The corrected regex accepts standard UUIDs
while preserving the existing authentication/ownership and RPC contracts.

Implement the smallest change in
`app/api/delivery/customer/addresses/route.js`, with actual-handler regressions
in `tests/delivery-address-validation.test.mjs`. Preserve authentication,
customer/store scoping, defaults, delete behavior, cache headers and existing
database/RPC contracts. No UI redesign, new GPS requirement, database cleanup
or automatic coordinate backfill is part of this slice.

**No SQL migration required.** This validation fix changes no existing rows,
schema, RLS, wallet, order, payment or cron data. The separate subscription
ledger migration remains review-only and its paid-checkout flag stays off.

## Actual verification

| Check | Result |
| --- | --- |
| Focused actual-handler regressions | **PASS: 12/12**, strict injected Auth/database effects, no network or SQL. |
| `npm test` | **PASS: 154/154**, zero failures. Focused tests are included in this total. |
| `npm run build` | **PASS**, fresh build with synthetic loopback credentials. This local artifact must never be deployed prebuilt. |
| Full lint | **FAIL: 169 inherited errors, 179 warnings**; zero introduced/removed compared with PR #5's recorded result. |
| Focused lint | **PASS**, zero errors/warnings in the route and new test file. |
| Browser/layout | No page/UI source changed in this slice. Earlier four-width evidence remains separate; no new screenshot or hosted workflow claim. |

Cases cover malformed coordinates/accuracy with zero writes/default RPC effects,
real zero, negative/edge/decimal/scientific values, valid/invalid UUIDs, Google
and Mobile/PIN identity, wrong-store/customer denial, address limits, defaults,
list/edit/delete and unchanged response cache headers. The existing default
selection RPC's installed SQL/RLS behavior remains unverified by these mocks.

Exact commands from the repository root:

```sh
node --test tests/delivery-address-validation.test.mjs
npx --no-install eslint app/api/delivery/customer/addresses/route.js tests/delivery-address-validation.test.mjs
node /workspace/commerce-validation-artifacts/address-validation-20261102/run-checks.mjs
npm test
npm run build
npm run lint -- --format json --output-file /workspace/commerce-validation-artifacts/address-validation-20261102/eslint.json
git diff --check
```

The wrapper starts the listed npm commands with `developmentEnvironment()`;
these are nested commands, not additional independent builds. Evidence:
`/workspace/commerce-validation-artifacts/address-validation-20261102/` contains
the full unit/build/lint logs, `summary.json` and `lint-comparison.json`. Focused
logs and the baseline reproduction are in the sibling
`delivery-address-validation-20261102/`. The reproduction demonstrates eight
coercible malformed values and the old malformed UUID shape at baseline
`deee372`; it is before-fix evidence, not a passing current test or a hosted run.

No hosted fixture or real customer address was used. Existing malformed stored
data requires a separately authorized review; it is not rewritten here.
Rollback is a reviewed source revert; it requires no database rollback and
restores the known validation defects. Preserve all existing records and RLS.

## Exact files

- `app/api/delivery/customer/addresses/route.js` — coordinate/type/accuracy validation and UUID correction.
- `tests/delivery-address-validation.test.mjs` — twelve handler regression groups.
- `vercel.json` — retain the new branch's automatic-deployment guard.
- `AGENTS.md` — current scope and publication authorization boundaries.
- This report and [Vercel publication status](vercel-publication-status.md).
