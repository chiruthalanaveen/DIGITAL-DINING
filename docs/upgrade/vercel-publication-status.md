# Vercel publication status — 2 November 2026

The user requested Vercel publication and updated access twice. The final
team-scoped token fixes the original denial: project, environment and deployment
metadata now return HTTP 200. No token/secret value was printed, decrypted or
copied. No deployment, production SQL, hosted setting change or merge has yet
been performed by this request.

Prepared source: commit `d8af507afd6322c23a99070d4544da222ad27b40` on
`feature/phase0-address-coordinate-validation`, in draft
[PR #6](https://github.com/chiruthalanaveen/DIGITAL-DINING/pull/6), based on
draft PR #5. A later documentation-only commit does not change this tested
application source. No PR has been merged and main has not been updated.

## Verified project and current configuration

- Project `digital-dining`, ID `prj_Zh1KOvZq6Vm7e9YecZDwur4RbeHL`.
- Team `digital-dining`, ID `team_v6sVn9Vr7yAcgv3wlQCSZ2aH`.
- GitHub link: `chiruthalanaveen/DIGITAL-DINING`, repository ID `1358281813`.
- Framework Next.js, Node `24.x`, repository root directory.
- Current bindings: fourteen project variables, all **Production only**.
  Preview has zero variables, no shared environment links or custom environment.
  Variable names/targets were inspected; their values were not decrypted/exported.
- The existing latest READY deployment is Production. It was already present;
  it is not a new Preview URL or evidence these feature branches are live.

The initial API response explained: `Not authorized: Trying to access resource
under scope "digital-dining". You must re-authenticate to this scope or use a
token with access to this scope.` The team-scoped replacement resolves that
specific issue. The unrelated identity endpoint still returns404; project access
and repository association are independently verified by their successful GETs.

## Publication boundary

A manual Preview is the default for the broad publication request. It must use
verified Preview runtime settings. Do not copy Production service/provider/admin
secrets, use localhost build values, or claim a functional Preview with dummy
credentials. A main-bound Preview is not isolated staging: registration, COD,
coupons, wallet and other write routes still exist even with subscriptions off.

The existing live Production configuration is a distinct deployment target.
Publishing there requires the user's explicit live-target decision after review,
including the fact that paid subscription checkout remains disabled until its
separate migration/configuration gates pass. Main/PR merges and new SQL remain
separate actions; publishing does not authorize them.

A fresh read-only continuation check again returned HTTP200 for project,
Preview-environment and deployment-list metadata, with zero Preview bindings
and no new deployment. The pending target choice has not received an answer.
This is a configuration/authorization boundary, not an unresolved token error.

The latest source includes the [address fixes](address-coordinate-report.md)
plus earlier draft work. It passes 154 unit tests and a fresh build. Full lint
remains 169 inherited errors/179 warnings, with zero new errors/warnings.
**No SQL migration required for this address/publication increment.** The ledger
migration from PR #5 is still unapplied and must not be run to unblock a Preview.

## Deployment and smoke procedure

Build from source using the authorized target's verified settings. Do not use
`--prebuilt` with local `.next` output. Keep
`SUBSCRIPTION_PAID_CHECKOUT_ENABLED=false` (also its absent-value default), retain
automatic Git deployment guards, and do not enable provider payments or toggle
the main maintenance setting to make tests pass. No new DNS/storage policy is
needed. Preview email callbacks need their actual origin reviewed separately.

After an actual READY deployment exists, record its exact URL/commit/target and
run only harmless public GETs, configuration booleans, unauthenticated denials
and invalid payloads that fail before database/provider access. Do not log in,
create customer/address/order fixtures, redeem coupons, recharge wallets,
process payments or call cron jobs on a main-backed target.

## Evidence and commands

Read-only checks used verified TLS, refused redirects and the environment token
in the Authorization header. GET paths:

```text
/v9/projects/prj_Zh1KOvZq6Vm7e9YecZDwur4RbeHL?teamId=team_v6sVn9Vr7yAcgv3wlQCSZ2aH
/v9/projects/prj_Zh1KOvZq6Vm7e9YecZDwur4RbeHL/env?target=preview&decrypt=false&teamId=team_v6sVn9Vr7yAcgv3wlQCSZ2aH
/v9/projects/prj_Zh1KOvZq6Vm7e9YecZDwur4RbeHL/env?decrypt=false&teamId=team_v6sVn9Vr7yAcgv3wlQCSZ2aH
/v6/deployments?projectId=prj_Zh1KOvZq6Vm7e9YecZDwur4RbeHL&teamId=team_v6sVn9Vr7yAcgv3wlQCSZ2aH&limit=10
```

Sanitized artifacts and exact check scripts are in
`/workspace/commerce-validation-artifacts/vercel-preview-20261102/`, including
`team-token-updated/{vercel-access.json,environment-scope-review.json}` and the
earlier denial evidence. `npm run build` passed with synthetic local settings;
its output is not a hosted-deployable artifact. Vercel CLI `65.9.0` was installed
outside the repository with install scripts disabled and no real application/
Vercel credentials passed to the installer. Project dependencies are unchanged.

The CLI rejects the environment's opaque credential handle during local token
validation, before creating a deployment; the same credential works in official
REST API requests. Do not edit/decode it or request another replacement. The
prepared fallback is the official `POST /v13/deployments` API with the linked
GitHub repository, branch and exact committed SHA. The Preview request omits
`target`; Production explicitly sets `target: production` only after the target
decision. Both request templates pin the subscription flag to `false` at build
and runtime. These templates are prepared only; no deployment POST was sent.
Do not use CLI `--verify`, alter deployment protection or create bypass secrets.

The continuation also reran `npm run build` with the same clean synthetic
loopback environment: **PASS, exit 0**. No hosted credentials were passed to
that build. Evidence is `continue-build-review/{summary.json,build.log}`.
The earlier 154-test and inherited-lint results remain applicable because this
continuation changes release documentation only.
