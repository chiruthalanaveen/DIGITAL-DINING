# Production publication — 2 November 2026

**Production publication: PASS.** The user explicitly requested "publish it to
production" after reviewing the lint/test/build report. Published the immutable
reviewed application source without merging a PR or executing SQL.

- Live site: https://www.digitaldine-in.online/
- Admin login: https://www.digitaldine-in.online/admin
- Deployment: `dpl_GfDtcTFMBixnAKawp8XiGuBnANro`; Vercel state **READY**, target **production**.
- Deployed Git commit: `84188e385d0286fc7d40cec03a179a68a905a167`.
- Git branch: `feature/phase0-address-coordinate-validation`, draft PR #6.
- Created: 02 November 2026, 08:36 PM IST.
- Inspector: https://vercel.com/digital-dining/digital-dining/GfDtcTFMBixnAKawp8XiGuBnANro
- Unique URL: https://digital-dining-k39adcbrp-digital-dining.vercel.app (existing deployment protection remains enabled).

Subsequent commits containing this record are documentation only; they are not
new application deployments. The exact deployed commit above is authoritative.

**No SQL migration required.** No production SQL, schema/RLS change, fixture,
wallet/payment/order mutation, cron invocation or PR/main merge was performed.
The separately reviewed subscription-ledger migration remains unapplied to
hosted databases. Paid subscription checkout stays disabled.

## Published configuration and domains

Used the existing Production project `digital-dining` under team
`digital-dining`, project ID `prj_Zh1KOvZq6Vm7e9YecZDwur4RbeHL`. Node 24,
Next.js and default install/build commands were retained. Fourteen existing
Production bindings were inspected by name/target only; values were never
decrypted/exported/copied and no project binding was changed.

The deployment request pins `SUBSCRIPTION_PAID_CHECKOUT_ENABLED=false` in both
runtime `env` and `build.env`. The API exposes that key in deployment metadata;
it does not independently expose its runtime value. The recorded false request
overrides plus the exact source's fail-closed default establish the intended
configuration. The invalid-payload smoke checks are not independent flag proof.

All six existing aliases now resolve in Vercel metadata to `dpl_GfDtcTFMBixnAKawp8XiGuBnANro`:

- `www.digitaldine-in.online`
- `digitaldine-in.online` (existing 308 redirect to www preserved)
- `www.digitaldine-in.store`
- `digitaldine-in.store` (existing 308 redirect to www preserved)
- `digital-dining-alpha.vercel.app`
- `digital-dining-digital-dining.vercel.app`

The existing stable Vercel alias initially remained on the previous deployment;
it was assigned to the approved new deployment with the official alias API.
No new domain/DNS record was created. Existing protection is unchanged
(`all_except_custom_domains`), Vercel cron definitions remain empty with their
enabled/disabled state unchanged, and automatic Git deployment guards remain.
Existing Supabase cron jobs were not queried, invoked or changed.

## Verification results

| Check | Result |
| --- | --- |
| Vercel source/target/state | **PASS**, exact Git SHA, Production, READY, no alias error. |
| Remote `npm run build` | **PASS**; log confirms the command, Next.js 16.3.4/Turbopack, compilation in 19.5s and 74/74 static pages. READY confirms completion. |
| Existing six alias mappings | **PASS**, each points to the new deployment; redirects preserved. |
| Protection/cron/project preservation | **PASS** against the fresh pre-deployment snapshot. |
| Primary live HTTP checks | **PASS: 12/12**, zero failures/blocks. |
| Live browser layout | **PASS: 4/4**, home/admin at 390/1440px, no horizontal overflow or reported page errors; four screenshots. |
| Prior local verification of deployed source | **PASS**, 183 unit tests, zero lint errors/169 existing warnings, build/type check and four browser suites/68 screenshots. |

Primary HTTP requests, without app credentials/cookies:

- GET `/api/admin/health`:200, configuration-ready boolean true.
- GET `/api/admin/session`:401, authenticated false.
- GET `/api/commerce/admin`:401, expected Super Admin denial.
- GET `/api/commerce/applications`:401, expected sign-in denial.
- GET `/api/auth/owner-restaurant`:401, expected sign-in denial.
- POST JSON `{}` `/api/create-order`:400, missing restaurant ID.
- POST JSON `{}` `/api/verify-subscription`:400, missing restaurant ID.
- GET `/`, `/admin`, `/login`, `/delivery`, `/app`:200.

The two empty POSTs return before database/client/provider access, as verified
from source. No account was signed in and no customer, address, order, wallet or
payment fixture was created. Browser contexts were fresh; external origins and
non-read browser requests were blocked. Admin sign-in was not submitted.
The existing saved maintenance setting was not changed; public pages currently
return 200 and display the normal site.

## Network limits and remaining verification

Direct Chromium DNS lookup initially failed. Using the environment's existing
approved proxy resolved primary-domain browser access; TLS verification and
write blocking remained enabled. No host resolver override, proxy bypass or
protection-bypass secret was used.

The proxy still rejects connections to `www.digitaldine-in.store` and the unique
Vercel deployment hostname with CONNECT 403. The secondary apex check was also
blocked. Those hosts' direct HTTP/layout verification remains unavailable from
this cloud; all six alias mappings were independently verified through Vercel.
The primary apex redirect to www was reached and verified 308.

Alternative checks outside this restricted proxy:

```sh
curl -I https://www.digitaldine-in.store/
curl -I https://digitaldine-in.store/
curl -i https://www.digitaldine-in.store/api/admin/health
```

Open the home/admin pages at mobile and desktop widths without submitting login
or creating live fixtures. Open the protected unique deployment with the
project's normal Vercel access; do not disable protection for testing.

Hosted authenticated owner-to-owner RLS, the complete legacy workflow matrix,
real payment providers, native push and device hardware remain unverified.
Configuration-ready booleans and unauthenticated denials do not prove these.
The user approved publication with those previously reported limits; they were
not filled with production fixtures or live payments.

## Exact publication/check operations

```text
POST /v13/deployments?teamId=team_v6sVn9Vr7yAcgv3wlQCSZ2aH
GET /v13/deployments/dpl_GfDtcTFMBixnAKawp8XiGuBnANro?teamId=team_v6sVn9Vr7yAcgv3wlQCSZ2aH
GET /v3/deployments/dpl_GfDtcTFMBixnAKawp8XiGuBnANro/events?teamId=team_v6sVn9Vr7yAcgv3wlQCSZ2aH&direction=forward&limit=200
GET /v9/projects/prj_Zh1KOvZq6Vm7e9YecZDwur4RbeHL?teamId=team_v6sVn9Vr7yAcgv3wlQCSZ2aH
GET /v4/aliases/<existing-domain>?teamId=team_v6sVn9Vr7yAcgv3wlQCSZ2aH&projectId=prj_Zh1KOvZq6Vm7e9YecZDwur4RbeHL
POST /v2/deployments/dpl_GfDtcTFMBixnAKawp8XiGuBnANro/aliases?teamId=team_v6sVn9Vr7yAcgv3wlQCSZ2aH
```

Creation used the recorded repository/ref/exact SHA with Production target and
false build/runtime overrides. The alias POST body contained only the existing
stable alias. Requests authenticated through the securely supplied Vercel token;
no credential value is included in code or evidence. No `--prebuilt`, protection
change, database command, deployment to main or merge was used.

Commands used for the recorded operations:

```sh
python /workspace/commerce-validation-artifacts/production-publication-20261102/vercel-release.py preflight
python /workspace/commerce-validation-artifacts/production-publication-20261102/vercel-release.py aliases-before
python /workspace/commerce-validation-artifacts/production-publication-20261102/vercel-release.py create
python /workspace/commerce-validation-artifacts/production-publication-20261102/vercel-release.py status
python /workspace/commerce-validation-artifacts/production-publication-20261102/vercel-release.py events
python /workspace/commerce-validation-artifacts/production-publication-20261102/vercel-release.py assign-existing-stable-alias
python /workspace/commerce-validation-artifacts/production-publication-20261102/vercel-release.py aliases-after
python /workspace/commerce-validation-artifacts/production-publication-20261102/vercel-release.py postflight
python /workspace/commerce-validation-artifacts/production-publication-20261102/live-smoke.py
node /workspace/commerce-validation-artifacts/production-publication-20261102/live-browser.mjs
```

The create helper refuses duplicate execution against an existing receipt.
Do not blindly rerun publication for a different source. No installation SQL,
new DNS/storage policy or extra user-provided secret is needed for this release.

## Rollback considerations

The authoritative pre-release target and all six aliases pointed to
`dpl_9Q2yJ1vG7e7oF4fHiLZE1NK4KbsU`, not the newest-created deployment in the historical list. That previous
READY release is retained; it was not deleted and no rollback was needed.

For a verified regression, the official rollback operation is:

```text
POST /v1/projects/prj_Zh1KOvZq6Vm7e9YecZDwur4RbeHL/rollback/dpl_9Q2yJ1vG7e7oF4fHiLZE1NK4KbsU?teamId=team_v6sVn9Vr7yAcgv3wlQCSZ2aH&description=<URL-encoded-reason>
```

It has an empty body, returns 201 and restores the previous code/configuration.
Verify every alias afterward, including the explicitly assigned stable alias;
restore that mapping separately if necessary. A rollback does not guarantee the
new deployment's false override carries to old code. Review the prior payment
behavior instead of assuming it remains disabled. Do not run database rollback
DDL or reapply the foundation/ledger. Existing data and receipt history must be
preserved.

## Changed files and evidence

This publication adds/updates documentation only:

- `AGENTS.md` — latest explicit Production authorization and continuing holds.
- `docs/upgrade/vercel-publication-status.md` — current live state.
- `docs/upgrade/lint-cleanup-report.md` — link to the completed publication.
- This release record.

No application file or migration changed after the tested deployed SHA.
Sanitized pre/post settings, creation receipt, alias mappings, remote build
milestones, 12 HTTP checks and four screenshots are in
`/workspace/commerce-validation-artifacts/production-publication-20261102/`.
