# Owner feature requests, Admin review and status tracking

Updated 5 November 2026. Source prepared on 4 November on
`feature/commerce-expansion`, draft
[PR #7](https://github.com/chiruthalanaveen/DIGITAL-DINING/pull/7).
The preceding committed wishlist milestone is `55b5934`. The exact reviewed
commit and destination hashes belong in the final handoff manifest.

## Requirement and resulting behavior

The original multi-tenant brief requires owners to submit requirements, Super
Admin to review/approve/reject/assign them, and owners to track request status.
Previously the owner workspace had no tracked feature-request workflow. The
new Feature requests panel and signed Admin global queue provide that workflow
without changing existing feature controls or authorizing custom code execution.

A verified current owner submits a plain-text title and description for their
website. New submissions require setup/active status and do not depend on
products/orders/branding permission flags. The original owner key and content
are saved per owner/store through an uncertain response, including reload.
Retrying identical content confirms the original request, rather than creating
a second one. A known identical retry remains recoverable after the website
becomes read-only, while current membership and verified Auth remain required.

Signed Super Admin can advance `submitted` to `under_review`, `approved` or
`rejected`; `under_review` to `approved` or `rejected`; and `approved` to
`assigned`. Rejected and assigned are terminal. Every review requires a note;
assignment also requires a work reference. The owner sees the stored notes,
revision history and assignment reference. Assigned means queued for separately
controlled development, not implemented, tested, released or activated.

Reviews require the expected status/revision and a stable action UUID. Stale
reviews conflict without a write. Identical retries return the original event
alongside current history, even if a later valid review has advanced it. Admin
pending decisions remain in memory; a reopened view must refresh history before
a new explicit decision. No old response may rewind a later record.

List/error/loading/retry states, 50-row keyset paging, detail focus and mobile
controls are included. Owner requests bind token lookup and responses to the
current owner and website. Unicode minimums are checked before saving a pending
payload, matching SQL character counting for valid Tamil/emoji text. References
and descriptions are displayed as plain text, never fetched or executed.

Approval or assignment does not enable website features, change permissions,
charge subscriptions, create orders, send notifications, provision a domain or
deploy work. Existing Admin feature settings remain separate controlled actions.

## Database changes and preservation

Database changes are required. The eighth versioned migration is
[`20261104160000_commerce_feature_requests.sql`](../../supabase/migrations/20261104160000_commerce_feature_requests.sql).
Read the [complete object/permission review](feature-requests-migration-review.md),
[exact RPC/DTO contract](feature-requests-contract.md) and
[eight-file installation/recovery runbook](expansion-installation.md).

It adds two tables with 25 columns, nine functions, three explicit triggers,
two explicit paging indexes, six constraint-backed indexes and one authenticated
owner SELECT policy. Authenticated users receive SELECT on ten safe request
columns only; submitter/replay keys remain internal. Private immutable events
retain Admin actor identity without exposing it in owner/Admin safe projections.
All writes use the controlled RPCs; direct mutation privileges are revoked.

The first seven migration files and installed foundation remain byte-for-byte
unchanged. Installation deletes/backfills no existing restaurant, delivery,
resort, wallet, customer, order, payment, Auth or cron data. Existing functions,
policies and grants are preserved. Runtime operations append their own requests/
events and a small existing Admin audit entry for a new accepted review; they
do not modify website features, permissions, subscriptions or financial truth.

Only the isolated loopback `commerce_test` database is a test target. All eight
expansion migrations remain unapplied to hosted databases. Never replay the
installed foundation, run blanket `supabase db push`, repair hosted migration
history or apply the separate pending subscription ledger as part of this work.

There are no additional environment variables, DNS records, Storage policies,
cron jobs or provider settings for this workflow. Existing owner JWT and signed
Admin configuration are reused. The new SQL SELECT policy is for the request
table, not for Storage.

## Changed source

- [CommerceFeatureRequestsPanel.jsx](../../app/components/commerce/CommerceFeatureRequestsPanel.jsx): scoped owner submission, saved retry, paging and history.
- [CommerceAdminFeatureRequestsPanel.jsx](../../app/components/commerce/CommerceAdminFeatureRequestsPanel.jsx): signed Admin global queue, review, replay and conflict recovery.
- [commerce-feature-requests.css](../../app/components/commerce/commerce-feature-requests.css): scoped responsive request forms, lists and timelines.
- [OwnerDashboard.jsx](../../app/components/commerce/OwnerDashboard.jsx) and [AdminClientWebsites.jsx](../../app/components/commerce/AdminClientWebsites.jsx): panel integration.
- [feature-requests.js](../../lib/server/commerce/feature-requests.js): strict validation, safe projections, scope/history checks and capability handling.
- [owner route](../../app/api/commerce/workspace/[websiteId]/feature-requests/route.js) and [Admin route](../../app/api/commerce/admin/feature-requests/route.js): verified owner/signed Admin HTTP boundaries.
- [migration](../../supabase/migrations/20261104160000_commerce_feature_requests.sql), [SQL checks](../../supabase/tests/commerce_feature_requests.sql) and [guarded runner](../../scripts/test-commerce-expansion-db.mjs).
- [API regressions](../../tests/commerce-feature-requests.test.mjs), [browser helper](../../tests/commerce-feature-requests.browser.mjs), [expansion browser suite](../../tests/commerce-expansion.browser.mjs) and [synthetic fixture](../../tests/helpers/commerce-fixture.mjs).

The final review handoff includes the exact cumulative inventory of 127 paths,
81 full JS/JSX/MJS/TS/TSX TXT exports and a destination/hash manifest. Original storefront
CSS and unrelated business modules are outside this change.

## Verification status

Final current source is **local PASS; release PARTIAL PASS**: 359 unit tests,
702 PostgreSQL assertions, zero lint errors/166 warnings, full build and 270
primary screenshots across both complete browser suites.

| Check | Recorded result | Scope and limit |
| --- | --- | --- |
| Eight-file SQL runner | PASS — 702 assertions | Isolated PostgreSQL 18.4, all previous 628 retained plus 74 new checks. Simulated Auth/Storage primitives are not hosted Supabase 17 acceptance. |
| Focused feature-request API tests | PASS — 28 tests | Auth/CSRF, strict payload/query, scope, safe projection, unavailable/error distinction, history, replay/CAS, cursor precision and Unicode boundaries. Mock clients only. |
| `npm test` | PASS — 359/359 on final source | Fresh 5 November full suite, zero failures/cancelled/skipped; `unit.log`. |
| `npm run lint` | PASS — 0 errors/166 warnings on final source | Fresh full repository run; no rules disabled, warnings remain; `lint.log`. |
| `npm run build` | PASS on 5 November | Full corrected-source Next.js build and stable application/configuration fingerprints; `build.log` and `build-source-fingerprint.json`. |
| Focused actual feature-request browser helper | Earlier source PASS — 8 groups/16 screenshots | Actual local Next.js helper before the final list/detail sync correction; separate historical evidence. |
| Expanded full-app browser suite | PASS — 30 groups/152 screenshots on final source | Actual complete local Next.js suite at four widths, including eight feature-request groups/16 screenshots and list/detail status agreement; `browser/expansion-browser-results.json`. |
| Original commerce browser suite | PASS — 118 screenshots on final source | Fresh full compatibility run after the owner status correction, plus all 702 SQL assertions; `original-browser.log` and `original-browser/database.log`. |

Evidence belongs under
`/workspace/commerce-validation-artifacts/commerce-feature-requests-20261104/`.
The eight-file SQL log is `integrated-sql.log`. The first SQL fixture attempted
an identifier namespace already used by an older payment fixture; only the new
fixture IDs were changed and the full suite passed. A timestamp restore in the
fixture preserves microseconds. Neither fix required a production data change.

Final verification continues on 5 November; the latest passing build fingerprints
cover the status-sync correction. The first expanded browser attempt passed the 136
preceding screenshots, then failed in the new feature-request flow. Two issues
were corrected during verification:

- Controlled textarea values and changing native-select options changed implicit
  accessible labels, making repeated field lookup unstable. Owner description,
  Admin review-note and Decision fields now receive explicit stable accessible
  names. The second full attempt exposed the Decision selector; the correction
  was followed by focused lint and a fresh passing build.
- Stored/audit DTO validators reused input trimming. SQL-retained Unicode
  whitespace could therefore be changed on read, affecting exact history/proof
  comparisons or making a valid stored record fail validation. Stored validators
  must preserve exact database strings. API and SQL character bounds already
  align; the current Zod version counts Unicode code points. Native HTML field
  maximums remain conservative UTF-16 bounds. A raw local-RPC regression covers
  large Unicode text, retained nonbreaking spaces and exact owner/Admin history
  under the existing SQL contract.

These application/test fixes do not change the migration or its 702-assertion
result. The earlier source passed 359 unit tests, lint/build, the focused
feature helper (eight groups/16 screenshots), expansion (30 groups/152 shots) and
original compatibility (118 shots plus 702 SQL assertions). Those are dated
pre-fix results, not final acceptance of the last UI correction.

Manual screenshot review then found that an owner detail refresh showed the
new assigned state while the matching list row still showed submitted. Detail
refresh now updates that list row; a fresh list refresh clears stale detail and
notice instead of displaying contradictory state. A browser assertion checks
that the list and detail agree. The final-source rebuild passes with stable
fingerprints, all 359 unit tests and full lint (zero errors/166 warnings). The
complete expanded suite passes 30 groups/152 screenshots with that status
agreement assertion. Fresh original compatibility also passes 118 screenshots
and all 702 SQL assertions on this final source. The primary total is 270
screenshots (152 + 118); earlier focused-helper screenshots are separate
diagnostic evidence and are not added again.
 `unicode-validator-evidence.json` records the direct
Zod/SQL verification distinguishing aligned character bounds from exact stored
whitespace preservation.
The two initial full-run failures are retained in `browser-attempt-1.log`,
`browser-attempt-2.log` and their attempt folders. The pre-fix full-check record is
retained under `before-browser-fixes/`.

Read-only local metadata verification records 36 tables, 32 policies and 78
application functions (81 including three synthetic Auth/Storage helpers), ten
safe request SELECT columns and the unchanged scheduled-job fixture. That
metadata read is not another migration or a hosted check. The earlier focused
helper used synthetic `developmentEnvironment()` credentials and its matching
earlier fixture-4319 build. Its exact command was:

```sh
node /workspace/commerce-validation-artifacts/commerce-feature-requests-20261104/run-focused-browser.mjs
```

It uses the existing isolated local app/fixture and clean development environment.
The full-suite commands are:

```sh
COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55447/commerce_test COMMERCE_FIXTURE_PORT=4319 COMMERCE_BROWSER_SKIP_DB=1 COMMERCE_BROWSER_SKIP_BUILD=1 COMMERCE_BROWSER_ARTIFACTS=/workspace/commerce-validation-artifacts/commerce-feature-requests-20261104/browser node tests/commerce-expansion.browser.mjs
COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55447/commerce_test COMMERCE_FIXTURE_PORT=4319 COMMERCE_BROWSER_USE_EXPANSION=1 COMMERCE_BROWSER_SKIP_BUILD=1 COMMERCE_BROWSER_ARTIFACTS=/workspace/commerce-validation-artifacts/commerce-feature-requests-20261104/original-browser node tests/commerce.browser.mjs
```

Both primary browser commands pass on final source. Local SQL and real Next
HTTP routes enforce their scopes with synthetic identities; they do not prove
hosted Auth/PostgREST/Storage, real merchant/provider behavior or live activation.

## Manual acceptance and rollback

1. Sign in as an approved owner, select the intended website and open Feature
   requests. Submit a requirement, then confirm it appears with revision 1 and
   one initial event. Unverified, foreign and revoked owners must be denied.
2. Lose only the committed response, reload and retry the same saved UUID/content.
   Confirm the original request/event is returned once. Short Unicode text must
   fail before saving a pending request; valid Tamil/emoji text must remain usable.
3. Switch owners/websites with a request in flight. A delayed response, failure
   or finally handler must not display or unlock another scope's request state.
4. Open signed Admin management, expand Owner feature requests and select the
   request from the global queue. Review, approve and assign with required notes/
   reference. Owner refresh must show the exact stored history, up to four events.
5. Submit two reviews against the same expected revision. Only one may succeed;
   a stale review must conflict. Retry an original accepted action after a later
   transition and confirm the original event/current history without duplicates.
6. Check 360/390/768/1440 px, keyboard focus, readable notes/references, empty/error/
   retry and paging. Verify website features, permissions, fulfillment,
   subscription fields, order/receipt counts, wallet and cron fixtures are unchanged.

A failed migration rolls back its entire transaction. If request records exist,
retain both tables, immutable events, replay keys and Admin audit history.
Disable new submissions or remove the UI/API entry points with a reviewed source
change while preserving data; prefer a forward fix. Do not drop/truncate history,
rewrite statuses/revisions or clear keys to force a downgrade. See the full
migration review for exact metadata/invariant queries and installation steps.
The user's backup waiver remains in force; no backup/restore is claimed or
requested again.

## Release state and next step

Overall release remains **PARTIAL PASS**. After local verification, the next step
is reviewing the concrete eight-migration/application package and completing
hosted Supabase/Auth/RLS/Storage and provider acceptance only where separate
configuration and permissions authorize it. Real sandbox Checkout/webhooks,
DNS/TLS, external email acceptance and representative performance/accessibility
remain unperformed. No staging-backed Vercel Preview URL is claimed.

No production SQL/data change, deployment, merge, live payment, notification or
DNS operation was performed. The withdrawn staging/backup prerequisites are not
reintroduced; production is not a substitute test database. Request approval/
assignment never grants authority to install hosted SQL, activate payments or
publish development work automatically.
