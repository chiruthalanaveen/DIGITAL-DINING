# Repository lint cleanup — 2 November 2026

**Lint cleanup: PASS. Release verification: PARTIAL PASS.** All 169 inherited
ESLint errors are fixed in source. The full repository now reports **0 errors /
169 warnings**, down from 169 errors /179 warnings. No new warning messages,
rule downgrades, ignore patterns or lint suppressions were introduced. Five
obsolete suppression directives were removed. Dependency/lock files and ESLint
configuration are unchanged.

The work continues on `feature/phase0-address-coordinate-validation`, the
branch of draft PR #6, based on `a733fbadb7dc80c9f1202c3f9fc1ebdeedf752a1`.
The handoff manifest records the final local commit and publication state; a
local commit must not be assumed to have reached GitHub. PRs/main remain unmerged.

## What changed

- Replaced derived-state effects with derived values or state scoped to the
  actual business, account, route, request or image URL. Manual module selection,
  deep links and pending-payment restoration remain supported.
- Used SSR-safe external-store snapshots for browser preferences and saved
  sessions. Event handlers own immediate interactive loading state; actual
  network response callbacks own fetched results and errors.
- Preserved sensitive wallet/settings clearing on identity changes. Requests
  started by the changed management effects ignore results after cleanup.
- Fixed a review finding in all four driver/packer session hooks: switching
  A → B → A or receiving an external logout must not revive an old in-memory
  token. Memory-only login still works when browser storage is unavailable.
- Kept photo object URL allocation/revocation in file-selection and cleanup
  paths, audio resources in refs, stable components at module scope, accurate
  memo dependencies and lazy clock initialization.
- Replaced internal anchors with Next Link, escaped JSX text, renamed the
  scanner's reserved `module` binding, and preserved both CJS utility commands
  using supported dynamic imports. No script was run against application data.

The original 169 diagnostics comprised 94 effect-state errors, 22 link errors,
24 JSX entity errors, ten immutability errors, six purity errors, five manual
memoization errors, two ref errors, one nested-component error, four CJS import
errors and one reserved-module error. Counts include repeated link diagnostics.

**No SQL migration required.** No migration, existing row, policy, wallet
balance, payment, order history, Storage policy, DNS record, cron job or hosted
configuration was changed. The installed commerce foundation must not be
reapplied. The separate subscription-ledger migration remains unapplied to
hosted databases and paid subscription checkout remains disabled.

## Actual checks

| Check | Result and scope |
| --- | --- |
| Full `npm run lint` | **PASS: 0 errors /169 existing warnings**, ten fewer warnings, zero introduced. |
| Individual unit tests | **PASS: 182/182**, in-process Node runner with synthetic development settings. Includes 28 new delivery, management and staff-session tests. |
| Default `npm test` invocation | Exit 0, but only file wrappers were reported in this restricted context. This is **not** the evidence for 182 tests; the explicit in-process run executed and reported every individual case. |
| Direct TypeScript check | **PASS**, `tsc --noEmit --incremental false`. |
| Owner helper runtime checks | **PASS: 11** extracted actual preference, QR-loader and audio-handler cases; not a full React or hosted test. |
| Utility script checks | **PASS: 2 groups**, disposable temporary files only: Suspense backup/idempotence and cleanup whitelist/dry-run/backup preservation. |
| Offline component browser | **PASS: 4 groups** in a separate execution context, using actual component SSR/hydration with intercepted documents. Theme persistence, PWA events/display mode, ad store-switch/retry/stale-response behavior. No Next server or layout screenshots. |
| Main-context component browser repeat | **BLOCKED**, Chromium crashpad `setsockopt: Operation not permitted`, SIGTRAP. |
| `npm run build` | **BLOCKED/exit 1**, Turbopack CSS worker cannot bind its local port: `Operation not permitted (os error 1)`. The requested command was run on the final source. An elevated attempt also encountered the same environment restriction. |
| `npm run build -- --webpack` | **BLOCKED/exit 1**, TypeScript CLI output unavailable. A direct child-process probe establishes `spawnSync ... EPERM`; the independent direct TypeScript command passes. No build/config/type-check bypass was added. |
| Real Next.js browser and mobile layout | **NOT RUN on this cleanup**; a successful current build is unavailable and the main execution context rejects explicit loopback binding with EPERM. A separate-context fixture bind probe succeeded but was stopped before using stale build output. |
| Hosted Supabase Auth/RLS, real provider/native device | **NOT RUN**. Mocked identities/callbacks and prior local PostgreSQL checks do not prove these. No live login, payment or production fixture was used. |
| `git diff --check` | **PASS**. |

The permissions request returned no network grant. No network-control bypass,
TLS change, borrowed Production settings or production deployment was used.
The earlier successful build of the address-only increment does not validate
this broader source change. Zero lint errors do not establish release readiness.

## Exact commands and replay

Executed from the repository root (the check wrapper supplies
`developmentEnvironment()` and never forwards hosted credentials):

```sh
node /workspace/commerce-validation-artifacts/lint-cleanup-20261102/run-checks.mjs build unit-inprocess lint
npm run lint -- --format json --output-file /workspace/commerce-validation-artifacts/lint-cleanup-20261102/eslint-final.json
npm test
node --test --test-isolation=none tests/*.test.mjs
npm run build
npm run build -- --webpack
node node_modules/typescript/bin/tsc --noEmit --incremental false
node --test --test-isolation=none tests/staff-session-state.test.mjs
node tests/lint-client-state.browser.mjs --components-only
node --check fix-delivery-suspense.cjs
node --check remove-separate-dd-apps.cjs
git diff --check
```

The glob above denotes the sorted explicit test paths recorded by the wrapper.
The npm commands listed separately are the nested commands it executed, not
additional successful build runs. Earlier focused group commands and their
results are retained in the artifact directories. The utility checks executed
`node fix-delivery-suspense.cjs <temporary-page>` twice and
`node remove-separate-dd-apps.cjs --dry-run` /`--apply` with their working
directory set to a disposable synthetic project, never this repository.

Evidence: `/workspace/commerce-validation-artifacts/lint-cleanup-20261102/`
contains the exact wrapper, detailed unit/lint/build/type logs, comparison and
scope verification. Additional component and owner evidence is in sibling
`lint-client-state-20261102-components-final/` and
`lint-owner-dashboards-20261102/`. Test/harness-only failures and the main-context
browser failure remain recorded; they are not silently recast as application
successes. The first component harness omitted a UTF-8 charset; correcting the
test document resolved its hydration errors without a product change.

For installation, restore the handoff files to their exact manifest paths in
this branch; no SQL command or new environment variable is needed for this
cleanup. Existing dependencies are sufficient (`npm ci` for a fresh checkout).
Run the commands above with development settings in an environment that permits
local compiler/browser processes. The supplied wrapper shows the exact clean
development environment used here. Do not put production credentials in tests.

After a successful build, run these **pending** browser commands sequentially,
since they own ports 4319 and4320:

```sh
COMMERCE_BROWSER_SKIP_BUILD=1 node tests/lint-client-state.browser.mjs
COMMERCE_BROWSER_SKIP_BUILD=1 node tests/lint-staff.browser.mjs
COMMERCE_BROWSER_SKIP_BUILD=1 node tests/owner-account.browser.mjs
COMMERCE_BROWSER_SKIP_BUILD=1 node tests/subscription-checkout.browser.mjs
```

The staff suite covers saved/expired sessions, photo cleanup, synthetic GPS,
module selection and audio state on actual Next.js pages at desktop/mobile
widths. The owner/client suite covers owner preferences and layout. Subscription
provider responses remain simulated. The larger commerce browser suite additionally
requires an explicitly isolated loopback `commerce_test` database; never point
it at the main Supabase project.

## Remaining release requirements and rollback

Build and current actual-page/mobile checks must pass before calling this
release verified. Hosted owner-to-owner RLS/Auth and payment-provider/native
compatibility remain unverified. Staging is not configured by user choice; no
production substitutes or fixtures were created. Preview still has no approved
runtime settings; no new Preview URL exists. The live-target decision remains
unanswered and no production approval is inferred from "continue".

Rollback is a reviewed source revert of this cleanup while retaining the
address fix at `a733fba`; no database rollback is needed. Reverting restores the
known lint defects. Preserve the installed foundation, existing data and pending
ledger/receipt history. Do not merge main, apply SQL or enable paid checkout to
unblock these checks.

## Exact changed files

The list below is generated from the cleanup diff, including its documentation
and tests. Full JS/JSX/MJS/TSX/CJS copies and exact VS Code destinations are in
the accompanying handoff manifest.

- `AGENTS.md`
- `app/admin/dashboard/page.jsx`
- `app/api/staff/kitchen/route.js`
- `app/app/components/InstallAppButton.jsx`
- `app/app/components/ManagerDeliveryManagement.jsx`
- `app/app/dd-delivery/page.jsx`
- `app/app/delivery/[restaurantcode]/page.jsx`
- `app/app/driver/[restaurantcode]/page.jsx`
- `app/app/kitchen/[restaurantId]/page.jsx`
- `app/app/manager/[restaurantId]/page.jsx`
- `app/app/owner/[restaurantId]/page.jsx`
- `app/app/packer/[restaurantcode]/page.jsx`
- `app/app/page.jsx`
- `app/app/waiter/[restaurantId]/page.jsx`
- `app/components/AdminDeliverySeasonalAds.jsx`
- `app/components/AdminDeliverySignupSettings.jsx`
- `app/components/AdminPrivacyDeletionReviews.jsx`
- `app/components/AdminWalletAdjustments.jsx`
- `app/components/DDAppInstall.jsx`
- `app/components/DeliveryAddressBook.jsx`
- `app/components/DeliveryCustomerReturnsControl.jsx`
- `app/components/DeliveryCustomerSupportChat.jsx`
- `app/components/DeliveryManagement.jsx`
- `app/components/DeliveryManagerSupportChat.jsx`
- `app/components/DeliveryReturnPickupTasks.jsx`
- `app/components/DeliverySavedAddressPicker.jsx`
- `app/components/DeliverySeasonalAds.jsx`
- `app/components/DeliveryServiceAreaEditor.jsx`
- `app/components/DeliveryStoreExperience.jsx`
- `app/components/InstallAppButton.jsx`
- `app/components/ManagerDeliveryManagement.jsx`
- `app/components/ManagerWalletReadOnly.jsx`
- `app/components/NativeDeliveryPush.jsx`
- `app/components/OwnerDeliveryManagement.jsx`
- `app/components/OwnerDeliveryWallet.jsx`
- `app/components/PaymentGatewayConfigCard.jsx`
- `app/components/ResortManagement.jsx`
- `app/components/ThemeToggle.jsx`
- `app/dashboard/[id]/page.jsx`
- `app/delivery-driver/[restaurantCode]/page.jsx`
- `app/delivery-packer/[restaurantCode]/page.jsx`
- `app/delivery/[restaurantCode]/track/[orderCode]/page.jsx`
- `app/delivery/page.jsx`
- `app/delivery/signup/page.jsx`
- `app/demo/page.jsx`
- `app/developer/dashboard/page.jsx`
- `app/kitchen/[restaurantId]/page.jsx`
- `app/manager/[restaurantId]/page.jsx`
- `app/menu/[id]/page.jsx`
- `app/page.tsx`
- `app/stay/[restaurantCode]/page.jsx`
- `app/stay/room/[publicToken]/page.jsx`
- `app/subscribe/[id]/page.jsx`
- `app/waiter/[restaurantId]/page.jsx`
- `docs/upgrade/lint-cleanup-report.md`
- `docs/upgrade/vercel-publication-status.md`
- `fix-delivery-suspense.cjs`
- `lib/barcodeScanner.js`
- `lib/useStandaloneMode.js`
- `remove-separate-dd-apps.cjs`
- `tests/lint-client-state.browser.mjs`
- `tests/lint-delivery-state.test.mjs`
- `tests/lint-staff.browser.mjs`
- `tests/management-loaders.test.mjs`
- `tests/staff-session-state.test.mjs`
