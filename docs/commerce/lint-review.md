# PR #3 lint review

Review date: 25 October 2026 (Asia/Kolkata). Branch:
`feature/client-websites-phase1`; draft
[PR #3](https://github.com/chiruthalanaveen/DIGITAL-DINING/pull/3).

**Configured repository lint: FAIL — 169 errors and 179 warnings.**
The pre-commerce baseline has the same 169 errors and 177 warnings. All 169
current errors match inherited diagnostics; commerce introduced **zero errors**.
The new commerce paths and the PIN/billing compatibility changes pass scoped
ESLint with zero errors and three image recommendation warnings. Scoped success
does not make the repository-wide check pass.

## How inherited and introduced findings were separated

The comparison uses the existing detached baseline checkout at
`/workspace/.digital-dining-lint-baseline`, verified at full commit
`4d036fbbe47b08673797a44062361aad3627a3eb`, and the PR working tree.
Both use the same installed ESLint **9.39.5**, Next.js ESLint presets and unchanged
`eslint.config.mjs`. Dependencies and rule severities were not altered.

The structured comparison is a multiset keyed by relative file, severity, rule
and full diagnostic message. It normalizes the absolute checkout root and line
numbers embedded in React Compiler code frames, preserving the diagnostic prose
and source excerpts. This matters because the existing Admin dashboard received
three commerce import/navigation lines: shifted line numbers are not new defects.
The count alone was not used as evidence that findings are identical.

| Classification | Errors | Warnings |
| --- | ---: | ---: |
| Baseline `4d036fb` | 169 | 177 |
| Current PR working tree | 169 | 179 |
| Introduced | 0 | 3 |
| Removed | 0 | 1 |

The three introduced warnings are `@next/next/no-img-element` in
[Storefront.jsx](../../app/components/commerce/Storefront.jsx), at lines 34, 44
and 235: the tenant logo, product image and optional banner. They are performance
recommendations, not authentication, tenant-isolation or payment-validation
errors. Moving tenant-supplied images to a Next.js optimizer requires a reviewed
remote-host policy and separate rendering/performance validation; it was not
introduced just to hide warnings. The warnings remain visible and unsuppressed.

The removed warning is `@typescript-eslint/no-unused-vars` for the old
`response` callback argument in
[billing/page.jsx](../../app/dashboard/[id]/billing/page.jsx). That obsolete page
now redirects to the existing server-verified subscription flow, eliminating its
unused callback along with its unsafe client-side subscription update. The
billing correction is covered by dedicated regression tests; it was not a broad
lint rewrite.

## All inherited error rules

Every row below has zero introduced errors and zero removed errors.

| Rule | Baseline errors | Current errors |
| --- | ---: | ---: |
| `react-hooks/set-state-in-effect` | 94 | 94 |
| `react/no-unescaped-entities` | 24 | 24 |
| `@next/next/no-html-link-for-pages` | 22 | 22 |
| `react-hooks/immutability` | 10 | 10 |
| `react-hooks/purity` | 6 | 6 |
| `react-hooks/preserve-manual-memoization` | 5 | 5 |
| `@typescript-eslint/no-require-imports` | 4 | 4 |
| `react-hooks/refs` | 2 | 2 |
| `react-hooks/static-components` | 1 | 1 |
| `@next/next/no-assign-module-variable` | 1 | 1 |
| **Total** | **169** | **169** |

The React effect, memoization, purity, mutation, ref and component findings can
require behavior changes in legacy restaurant/delivery/resort workflows. They
remain real configured check failures. A baseline match does not dismiss their
risk. Broad changes to these flows without compatible legacy staging fixtures
would exceed the focused route/commerce repair and add regression risk. No rule
was disabled, no `eslint-disable` comment was added and no legacy feature was
removed to manufacture a green check.

## Every file with inherited errors

All 56 files below have unchanged normalized error findings. The
existing Admin dashboard is included even though it gained commerce navigation;
its seven diagnostics concern unchanged legacy logic.

| File | Baseline errors | Current errors |
| --- | ---: | ---: |
| [`app/admin/dashboard/page.jsx`](../../app/admin/dashboard/page.jsx) | 7 | 7 |
| [`app/api/staff/kitchen/route.js`](../../app/api/staff/kitchen/route.js) | 1 | 1 |
| [`app/app/components/InstallAppButton.jsx`](../../app/app/components/InstallAppButton.jsx) | 1 | 1 |
| [`app/app/components/ManagerDeliveryManagement.jsx`](../../app/app/components/ManagerDeliveryManagement.jsx) | 1 | 1 |
| [`app/app/dd-delivery/page.jsx`](../../app/app/dd-delivery/page.jsx) | 23 | 23 |
| [`app/app/delivery/[restaurantcode]/page.jsx`](../../app/app/delivery/[restaurantcode]/page.jsx) | 4 | 4 |
| [`app/app/driver/[restaurantcode]/page.jsx`](../../app/app/driver/[restaurantcode]/page.jsx) | 7 | 7 |
| [`app/app/kitchen/[restaurantId]/page.jsx`](../../app/app/kitchen/[restaurantId]/page.jsx) | 1 | 1 |
| [`app/app/manager/[restaurantId]/page.jsx`](../../app/app/manager/[restaurantId]/page.jsx) | 3 | 3 |
| [`app/app/owner/[restaurantId]/page.jsx`](../../app/app/owner/[restaurantId]/page.jsx) | 18 | 18 |
| [`app/app/packer/[restaurantcode]/page.jsx`](../../app/app/packer/[restaurantcode]/page.jsx) | 2 | 2 |
| [`app/app/page.jsx`](../../app/app/page.jsx) | 1 | 1 |
| [`app/app/waiter/[restaurantId]/page.jsx`](../../app/app/waiter/[restaurantId]/page.jsx) | 1 | 1 |
| [`app/components/AdminDeliverySeasonalAds.jsx`](../../app/components/AdminDeliverySeasonalAds.jsx) | 2 | 2 |
| [`app/components/AdminDeliverySignupSettings.jsx`](../../app/components/AdminDeliverySignupSettings.jsx) | 1 | 1 |
| [`app/components/AdminPrivacyDeletionReviews.jsx`](../../app/components/AdminPrivacyDeletionReviews.jsx) | 1 | 1 |
| [`app/components/AdminWalletAdjustments.jsx`](../../app/components/AdminWalletAdjustments.jsx) | 1 | 1 |
| [`app/components/DDAppInstall.jsx`](../../app/components/DDAppInstall.jsx) | 1 | 1 |
| [`app/components/DeliveryAddressBook.jsx`](../../app/components/DeliveryAddressBook.jsx) | 2 | 2 |
| [`app/components/DeliveryCustomerReturnsControl.jsx`](../../app/components/DeliveryCustomerReturnsControl.jsx) | 1 | 1 |
| [`app/components/DeliveryCustomerSupportChat.jsx`](../../app/components/DeliveryCustomerSupportChat.jsx) | 1 | 1 |
| [`app/components/DeliveryManagement.jsx`](../../app/components/DeliveryManagement.jsx) | 2 | 2 |
| [`app/components/DeliveryManagerSupportChat.jsx`](../../app/components/DeliveryManagerSupportChat.jsx) | 2 | 2 |
| [`app/components/DeliveryReturnPickupTasks.jsx`](../../app/components/DeliveryReturnPickupTasks.jsx) | 1 | 1 |
| [`app/components/DeliverySavedAddressPicker.jsx`](../../app/components/DeliverySavedAddressPicker.jsx) | 5 | 5 |
| [`app/components/DeliverySeasonalAds.jsx`](../../app/components/DeliverySeasonalAds.jsx) | 1 | 1 |
| [`app/components/DeliveryServiceAreaEditor.jsx`](../../app/components/DeliveryServiceAreaEditor.jsx) | 1 | 1 |
| [`app/components/DeliveryStoreExperience.jsx`](../../app/components/DeliveryStoreExperience.jsx) | 8 | 8 |
| [`app/components/InstallAppButton.jsx`](../../app/components/InstallAppButton.jsx) | 1 | 1 |
| [`app/components/ManagerDeliveryManagement.jsx`](../../app/components/ManagerDeliveryManagement.jsx) | 5 | 5 |
| [`app/components/ManagerWalletReadOnly.jsx`](../../app/components/ManagerWalletReadOnly.jsx) | 1 | 1 |
| [`app/components/NativeDeliveryPush.jsx`](../../app/components/NativeDeliveryPush.jsx) | 1 | 1 |
| [`app/components/OwnerDeliveryManagement.jsx`](../../app/components/OwnerDeliveryManagement.jsx) | 6 | 6 |
| [`app/components/OwnerDeliveryWallet.jsx`](../../app/components/OwnerDeliveryWallet.jsx) | 2 | 2 |
| [`app/components/PaymentGatewayConfigCard.jsx`](../../app/components/PaymentGatewayConfigCard.jsx) | 1 | 1 |
| [`app/components/ResortManagement.jsx`](../../app/components/ResortManagement.jsx) | 2 | 2 |
| [`app/components/ThemeToggle.jsx`](../../app/components/ThemeToggle.jsx) | 1 | 1 |
| [`app/dashboard/[id]/page.jsx`](../../app/dashboard/[id]/page.jsx) | 12 | 12 |
| [`app/delivery-driver/[restaurantCode]/page.jsx`](../../app/delivery-driver/[restaurantCode]/page.jsx) | 5 | 5 |
| [`app/delivery-packer/[restaurantCode]/page.jsx`](../../app/delivery-packer/[restaurantCode]/page.jsx) | 2 | 2 |
| [`app/delivery/[restaurantCode]/track/[orderCode]/page.jsx`](../../app/delivery/[restaurantCode]/track/[orderCode]/page.jsx) | 2 | 2 |
| [`app/delivery/page.jsx`](../../app/delivery/page.jsx) | 2 | 2 |
| [`app/delivery/signup/page.jsx`](../../app/delivery/signup/page.jsx) | 2 | 2 |
| [`app/demo/page.jsx`](../../app/demo/page.jsx) | 2 | 2 |
| [`app/developer/dashboard/page.jsx`](../../app/developer/dashboard/page.jsx) | 1 | 1 |
| [`app/kitchen/[restaurantId]/page.jsx`](../../app/kitchen/[restaurantId]/page.jsx) | 1 | 1 |
| [`app/manager/[restaurantId]/page.jsx`](../../app/manager/[restaurantId]/page.jsx) | 3 | 3 |
| [`app/menu/[id]/page.jsx`](../../app/menu/[id]/page.jsx) | 7 | 7 |
| [`app/page.tsx`](../../app/page.tsx) | 1 | 1 |
| [`app/stay/[restaurantCode]/page.jsx`](../../app/stay/[restaurantCode]/page.jsx) | 1 | 1 |
| [`app/stay/room/[publicToken]/page.jsx`](../../app/stay/room/[publicToken]/page.jsx) | 1 | 1 |
| [`app/subscribe/[id]/page.jsx`](../../app/subscribe/[id]/page.jsx) | 1 | 1 |
| [`app/waiter/[restaurantId]/page.jsx`](../../app/waiter/[restaurantId]/page.jsx) | 1 | 1 |
| [`fix-delivery-suspense.cjs`](../../fix-delivery-suspense.cjs) | 2 | 2 |
| [`lib/barcodeScanner.js`](../../lib/barcodeScanner.js) | 1 | 1 |
| [`remove-separate-dd-apps.cjs`](../../remove-separate-dd-apps.cjs) | 2 | 2 |
| **Total** | **169** | **169** |

No error belongs to the new `app/commerce`, `app/shops`,
`app/api/commerce`, `app/components/commerce`, `lib/commerce` or
`lib/server/commerce` paths. The new PIN unavailable handler, retired billing
endpoint, billing redirect, PIN error handling and their tests are also scoped
lint clean. The complete per-message baseline/current records remain available
for review, including warning details, outside Git.

## Exact checks and evidence

Executed from `/workspace/DIGITAL-DINING`:

```sh
npm run lint
node /workspace/commerce-validation-artifacts/pr3-followup/compare-lint.mjs
node /workspace/commerce-validation-artifacts/pr3-followup/compare-lint.mjs --reuse
npx --no-install eslint app/api/commerce app/commerce app/shops app/components/commerce lib/commerce lib/server/commerce app/api/delivery/customer/returns app/api/delivery/customer/forgot-pin app/api/create-subscription-order 'app/dashboard/[id]/billing/page.jsx' app/delivery/forgot-pin/page.jsx tests/*.test.mjs tests/commerce.browser.mjs tests/helpers/commerce-fixture.mjs scripts/test-commerce-db.mjs scripts/test-commerce-staging.mjs
```

The configured lint command exited **1**; the scoped command exited **0**.
Logs were redirected directly to files so the underlying command's exit status
was preserved. The comparison helper's `--reuse` invocation recomputes the
normalized difference from the freshly captured rows; it does not represent a
second app validation run.

Evidence directory: `/workspace/commerce-validation-artifacts/pr3-followup/`:
`lint-all.log`, `lint-scoped.log`, `lint-baseline.json`,
`lint-current.json`, `lint-baseline-comparison.json` and the exact
`compare-lint.mjs` helper. Structured records omit full source-file dumps but
retain messages and locations. Earlier evidence in `application/` is historical;
its 180-warning total precedes removal of the billing callback warning.

**No SQL migration required.** This lint review changes documentation only.
Migration/build/workflow results are reported separately in the latest PR review;
a passing build does not resolve the 169 configured lint errors.
