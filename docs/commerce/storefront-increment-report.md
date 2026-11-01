# Storefront shopping increment — 1 November 2026

Branch: `feature/client-websites-phase1`, [PR #3](https://github.com/chiruthalanaveen/DIGITAL-DINING/pull/3).
The [roadmap](storefront-roadmap.md) audits all seventeen requests. This increment
implements only the first three related shopping improvements.

**PASS for this local increment; PARTIAL PASS for overall release readiness.**
Hosted authentication/email, provider payments and a Vercel Preview remain
unverified. The other fourteen capabilities remain roadmap work.

**No SQL migration required.** The existing foundation remains installed and was
not reapplied. No production SQL, secret/configuration change, deployment, live
payment or merge was performed for this increment.

## Implemented scope and preservation

| Experience | Before | Implemented behavior |
| --- | --- | --- |
| Product inspection | One image in the product dialog. | Zoom of that actual image, 100–300% controls, keyboard/scroll inspection, nested-dialog close and focus return. Missing/failed photos have an honest fallback. Multiple persisted images remain a later reviewed phase. |
| Finding products | Search, category and sorting. | Compatible price/availability filters, exact decimal-rupee bounds, accurate counts, invalid-range feedback and reset. Untracked inventory does not acquire an invented sold-out state. |
| Bag and checkout | Functional bag with one long checkout panel. | Editorial drawer with three always-visible bag/fulfillment/review sections. Quantity/removal, autofill, fees, verified-account gating, minimum order, COD, confirmations and retries remain. |
| Presentation | Tenant-driven baseline styles. | Additive serif/sans editorial styling, responsive navigation/grid, sticky bag access, accessible color tokens and loading skeletons. Actual tenant branding and photos remain the data source. |

Original `storefront.css` is unchanged (SHA-256
`409e198eef58fc2ddde3ff96d348ef39b042985fad7e0408623b41c41a3a78d7`).
`storefront-modern.css` is absent from this checkout; none was removed or
overwritten. New editorial/gallery styles are separate layers. Preserve any
additional modern stylesheet/import in a local checkout during handoff.

Existing cart keys and quantity/checkout functions are preserved. The server still
controls prices, fees, stock and idempotency. No API/RLS/payment implementation was
replaced. Filtering and zoom are optional customer controls; existing catalog,
inventory, COD, fulfillment and owner/admin permissions remain authoritative.
No new persisted business feature or online-payment flag was activated.
No independent per-store switch was added for these presentation changes.
Price bounds are empty and availability is unrestricted by default; zoom is
available only for a working existing image. Existing business feature flags
continue to govern checkout and fulfillment.

This increment also retains the already-in-progress commerce email callback
repair. Signup/resend/recovery use `/auth/callback/commerce`, the correct owner or
store-customer PKCE client, and fixed validated destinations. Invalid, expired,
replayed and wrong-scope links cannot treat unrelated stored sessions as success.
Legacy callbacks and delivery PIN logic are unchanged. The callback back-link
avoids a global light-theme rule that had made its text unreadable.

## Actual tests and limits

| Check | Result |
| --- | --- |
| `npm test` | **PASS: 101/101**, zero failures, synthetic development configuration; includes eleven redirect and eight filter/theme regressions. |
| Changed-source ESLint | **PASS: zero errors**, three retained native-image recommendations in `Storefront.jsx`. |
| Full configured ESLint | **FAIL: 169 errors, 179 warnings**. Fresh comparison to pre-commerce `4d036fb` (169 errors/177 warnings) finds zero introduced errors, three commerce native-image warnings and one removed old billing warning. No broad legacy refactoring was performed. |
| Final SQL/API/browser suite | **PASS**, `browser-final-rerun4`: 88 PostgreSQL assertions, tenant/API/RLS and Chromium workflows. Exit code 0; all fixture services stopped. |
| `npm run build` | **PASS**, fresh production build inside the final integrated run with synthetic development credentials. |
| Widths/screenshots/visual review | **PASS**: 118 PNGs (39 desktop, 39 mobile, ten new checkpoints at each of 360/390/768/1440 px), zero horizontal document overflow and zero collected `pageerror` events. Storefront, zoom and bag screenshots visually reviewed. |
| Performance | Initial local LCP samples: 244/476/216/184 ms at 360/390/768/1440 px respectively; initial CLS 0 at each width. One unthrottled loopback navigation per width, observed only through image/font readiness and two animation frames (~0.49–0.61 seconds). INP and production field p75 were not measured. |
| Hosted Auth/SMTP/payments | **NOT RUN**. The local provider simulates email; the real SDK performs PKCE. No live identities, orders or payments were created. |
| Vercel Preview | **NOT CREATED / UNVERIFIED**. Last project/env/deployment-list GETs returned HTTP 403 `forbidden`; see [preview review](preview-and-environment.md). |

Executed from the repository root with `developmentEnvironment()` and an
explicitly guarded loopback `commerce_test` database:

```sh
npm test
node /workspace/commerce-validation-artifacts/storefront-increment-20261101/run-browser-final-rerun4.mjs
npm run test:commerce:browser
node scripts/test-commerce-db.mjs
npm run build
npm run start -- --hostname 127.0.0.1 --port 4320
npx --no-install eslint --format json --output-file /workspace/commerce-validation-artifacts/storefront-increment-20261101/eslint.json
node /workspace/commerce-validation-artifacts/storefront-increment-20261101/compare-lint-current.mjs
git diff --check
```

The wrapper invokes the browser command; the browser command invokes the listed
database script, build and application-start commands. They are nested commands,
not claims of additional independent reruns. Tests use synthetic credentials,
real isolated PostgreSQL/Next.js/Chromium and the installed Supabase browser SDK
with a simulated Auth provider. External browser requests are blocked. Exact
PostgreSQL startup/stop arguments and exit statuses are in the included run
wrapper and `summary.json`. Hosted fixtures are prohibited.

Evidence is under
`/workspace/commerce-validation-artifacts/storefront-increment-20261101/`.
Unit/lint summaries are `unit-summary.json` and `eslint-summary.json`. Final
evidence is `browser-final-rerun4/{summary.json,database.log,build.log,
browser-run.log,storefront-increment-checks.json,storefront-lab-performance.json}`.
Failed browser attempts are retained separately, not counted as passing evidence.
The first run found low callback-link contrast from a global light-theme utility;
the commerce link now avoids that utility. Later attempts corrected test-only
handling of hidden fallback text, native browser-chrome focus and a controlled
textarea locator. The fourth rerun passed the complete suite. Sample contrast
was 7.611:1 for the callback link and 8.760:1 for the storefront primary action.
Ordinary `console.error` events are not monitored; `pageerror` results cannot
establish zero console errors. Native browser chrome focus is distinct from
focus escaping to background application controls.

The suite verifies nested Escape/backdrop closure and focus return; three native
browser-chrome visits were allowed only while the page lacked focus and the zoom
dialog remained modal, with the following Tab returning inside it. This does not
claim the browser chrome is excluded from the native dialog's Tab sequence.

Legacy route regressions pass for validation and explicit unavailable/retired
responses: delivery PIN reset still returns 503 for a valid request and the
retired subscription-order API returns 410. Successful PIN reset remains
unimplemented. These commerce checks do not establish complete restaurant,
delivery, resort, wallet or external-provider business workflows. Those modules
were not changed by this increment. Online commerce payment activation, hosted
owner/customer isolation, SMTP delivery and field performance remain release
risks requiring separate authorized verification.

## Acceptance and TXT handoff

- Check all four widths: navigation/account/bag access, counts/grid, footer and
  drawer without horizontal document overflow.
- Combine/reset search, category, price, availability and sort; check invalid
  bounds, empty catalogs and inventory-disabled products.
- Inspect real/missing/failed photos; test zoom, keyboard scrolling, Escape,
  backdrop and focus return without closing the underlying product dialog.
- Check quantity/removal, three-step navigation, autofill, actual configured fees,
  stock/minimum limits, disabled checkout and lost/replayed request recovery.
- Repeat owner/customer/store session isolation with isolated fixtures. Review
  real authorized tenant media before any hosted release; synthetic screenshots
  do not certify production image performance or email delivery.

Complete code TXT handoff and evidence are outside Git at
`/workspace/commerce-handoff/storefront-increment-20261101/`:
`README.md` contains exact destinations and installation/acceptance steps;
`manifest.json` records operations and SHA-256 hashes. The sibling
`storefront-increment-20261101-code-txt.zip` contains all changed/new JS/JSX/MJS
and CSS files in full, with only `.txt` appended to their filenames. The sibling
`storefront-increment-20261101-evidence.zip` contains all 118 screenshots, final
logs, metrics, command wrappers and unit/lint summaries. See
[changes.md](changes.md) for the exact increment and complete PR file lists.
Remove only the final `.txt` suffix when installing; review local differences
before replacing working files. Keep original/modern imports and load the
additive layers afterward. No dependency or SQL install is needed.

Rollback is a reviewed source revert of this increment to commit `a65cb4a` on
the feature branch. It requires no database rollback; retain the already
installed foundation and all existing data. Do not drop tables or replay SQL.

Stop before deployment, production changes, payment activation or merging.
Future persisted features require their own additive, tested, rollback-aware SQL
migration and explicit approval before hosted application. Remaining roadmap
features are planned, not silently enabled by this increment.
