# Preview, environment and DNS review

## Actual status

Updated 25 October 2026 (Asia/Kolkata). Staging project
`gylicwwrmpqomregevqe` now passes strict API/database/key configuration validation.
The earlier incorrect-URL findings are resolved. Auth settings and service-role
REST metadata return 200. A separate real staging Auth run completed **19 checks,
zero failures**: four synthetic fixture users, real password sign-in/identity,
unverified/wrong-password denial, token boundaries, refresh, logout and revoked
refresh denial. Admin-confirmed fixtures do not establish actual signup-email
verification/recovery UI or commerce tenant RLS.

The remaining blocker is the PostgreSQL network route. Direct DNS lookup and
`pg.Client.connect` fail `EAI_AGAIN` before TCP/TLS/password validation/SQL. A
standard configured-proxy CONNECT to the same database host on port 5432 returns
403 before PostgreSQL bytes or credentials; no rejection reason was supplied.
Both exact staging API and direct DB hosts already appear in saved network
configuration. Do not ask for replacement working keys or infer an invalid
database password. See [staging-verification.md](staging-verification.md) for
exact Session pooler, trusted-machine and staging SQL Editor alternatives.

Hosted commerce schema exposure remains absent: products return 404 `PGRST205`
and the catalog RPC returns 404 `PGRST202`. Those read-only observations are not
RLS-denial passes. No hosted commerce SQL, Storage or application workflow has
run, and no staging-backed Preview exists.

Earlier read-only inspection of Vercel found Production-only application
credentials. They were not copied to Preview. Preview environment configuration
and a working staging database must be verified before creating a new deployment.

There is currently **no Vercel Preview tested against staging Supabase**. The
earlier URL below is a different artifact and must not be described as one:

- URL: <https://digital-dining-6kfz79na2-digital-dining.vercel.app>
- Vercel dashboard:
  <https://vercel.com/digital-dining/digital-dining/HyGsCtVcXVRcwz1YmDFk4ezwbQ2Q>
- Deployment: `dpl_HyGsCtVcXVRcwz1YmDFk4ezwbQ2Q`.
- Build state: `READY`; source commit: `aba881a`.
- Target: **production**, with `autoAssignCustomDomains: false` and production
  environment configuration. It was staged before the latest review hold.
- At the earlier deployment check, live domains and the active production target
  remained bound to `dpl_9Q2yJ1vG7e7oF4fHiLZE1NK4KbsU`. This historical record
  is not a new live-domain verification.

Do not place test applications, products, customer accounts or orders into that
production-connected artifact. No new deployment or promotion was performed for
this review. Production SQL, production deployment and merging remain on hold
until the user separately approves them after reviewing results.

## Required environment configuration

The commerce application reuses these existing runtime variable names. It does
not need another runtime provider, payment key or database connection URL.

| Variable | Development/Preview value | Exposure |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://gylicwwrmpqomregevqe.supabase.co` | Browser-visible |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | That staging project's anon/publishable-compatible key supported by the current SDK | Browser-visible; RLS still required |
| `SUPABASE_SERVICE_ROLE_KEY` | That staging project's service-role key | Server-only secret; never `NEXT_PUBLIC_*` |
| `SUPABASE_URL` | Same staging URL, for existing modules that use this variable | Server environment |
| `ADMIN_EMAIL` | Dedicated development Super Admin email | Server environment |
| `ADMIN_PASSWORD` | Dedicated development Super Admin password | Server-only secret |
| `ADMIN_SESSION_SECRET` | Separate random development secret, at least 32 characters | Server-only secret |
| `MAINTENANCE_MODE` | Development fallback only, if needed | Existing saved maintenance setting takes precedence |

Configure these in Vercel for **Preview only**, scoped to
`feature/client-websites-phase1`, or use a separately identified staging Vercel
project. Do not change Production values. Keep Preview deployment protection
enabled. Never copy production payment, wallet, Firebase or mail credentials into
staging. Commerce uses COD only; any later tests of existing online-payment
features need provider-issued sandbox credentials and separate approval/scope.

`NEXT_PUBLIC_*` variables are compiled into browser bundles. After adding or
changing staging values, create a fresh Preview build. The existing local build
uses a loopback test adapter and is not a deployment artifact for hosted staging.

The read-only staging preflight uses **additional test-only variables**:

```text
COMMERCE_STAGING_PROJECT_REF
COMMERCE_STAGING_SUPABASE_URL
COMMERCE_STAGING_SUPABASE_ANON_KEY
COMMERCE_STAGING_SUPABASE_SERVICE_ROLE_KEY
COMMERCE_STAGING_DATABASE_URL
```

These must identify a separate verified development project. They are not required
by the deployed application, are not committed, and must not contain production
values. See [staging-verification.md](staging-verification.md) for the guard checks
and remaining hosted test sequence.

The application does not automatically use the `COMMERCE_STAGING_*` names. Map
the verified staging URL/keys into the application runtime names above for
Preview only. Keep direct database credentials out of browser variables. Changing
the cloud preflight variables alone does not reconfigure a Vercel deployment.

## Auth redirects, storage and DNS

- In the **staging** Supabase dashboard, enable the intended email verification
  settings and configure the development/Preview origin's allowed redirects for
  `/commerce/auth` and `/shops/<test-slug>/account`. Include the query-string
  variants used by onboarding and recovery. Use a development mailbox or mail
  capture service to verify actual signup, resend, PKCE callback and recovery.
  Avoid broad production redirect changes and unrestricted wildcard origins.
- The versioned migration creates the `commerce-media` public image bucket,
  permits JPEG/PNG/WebP up to 5 MiB, and installs seven storage policies. Owners
  upload fresh immutable objects below their website UUID; authenticated owner
  overwrites/deletes and anonymous writes are denied for this bucket. Public
  image bytes are intentionally public; customer documents must not be uploaded.
  Inspect pre-existing hosted Storage policies before applying the migration and
  compare them afterward. Actual Storage HTTP behavior remains untested.
- Phase 1 routes tenants at `/shops/<slug>` on the same Next.js application.
  **No DNS change, wildcard subdomain or custom domain is required.** Subdomain
  routing and verified custom domains remain later work; the example business
  domains are not configured by this feature.

## Create the real Preview only after staging is verified

1. Positively identify staging `gylicwwrmpqomregevqe`. Complete the database
   preflight/inventory through a supported route: this cloud runtime after its
   network path is restored, a trusted staging machine/CI runner, or the exact
   staging SQL Editor sequence in [staging-verification.md](staging-verification.md).
   Capture/rehearse the staging backup and compare existing schema, grants, RLS,
   Auth hooks and cron. Apply only the reviewed versioned migration; never install
   `commerce_bootstrap.sql` on hosted Supabase. No backup/install is completed yet.
2. Configure the Preview-only application variables listed above. Inspect their
   environment targets; ensure Production values and live domain bindings remain
   unchanged. Add the precise Preview origin to staging Auth redirects.
3. From this feature branch, a team member with their own Vercel CLI login can
   create a manual **Preview** with this command:

```sh
vercel deploy --environment preview --project prj_Zh1KOvZq6Vm7e9YecZDwur4RbeHL --scope digital-dining --yes
```

The installed Vercel CLI 65.1.0 `deploy --help` was checked locally and confirms
`--environment` and `--project <NAME_OR_ID>` are supported. The command identifies
the existing project by ID; its team is `team_v6sVn9Vr7yAcgv3wlQCSZ2aH`.
The help check disabled telemetry/update checks and supplied no credentials.
It created no deployment or project. Help output is retained as
`/workspace/commerce-validation-artifacts/pr3-followup/vercel-deploy-help.log`.

Do not add `--prod`, `--environment production`, `promote` or `alias`. The existing
branch-specific `vercel.json` guard disables automatic Git deployments; leave it
in place. The deployment command was **not executed**: staging database network
access, migration/workflow verification and Preview-only configuration remain
incomplete. Correct staging variable shape alone does not satisfy these checks.

4. Record the new URL and verify via Vercel that `target` is Preview and its
   environment is staging. Run the hosted workflow matrix in
   [staging-verification.md](staging-verification.md), using synthetic staging
   users and data only. Confirm that all live domains still use the previous
   deployment. These checks are release prerequisites, not completed results.

## Network limitation and alternative verification

During the earlier run, the outbound proxy rejected the old staged deployment host
with an HTTP 403 **during CONNECT, before the application received a request**.
This is a network limitation; it is not evidence of an application 403 or a
successful HTTP smoke test. Vercel API metadata and build status were reachable.
Deployment protection may separately require the user's Vercel login.

Current staging API/REST HTTPS and real Auth-session checks succeeded. Direct
PostgreSQL DNS fails before TCP/TLS, and a separate standard proxy CONNECT probe
to the direct DB host on port 5432 returns 403 before a PostgreSQL handshake.
The proxy gives no precise cause. No new staging-backed Preview exists to probe;
neither historical Preview CONNECT nor current DB CONNECT is a measured result
for a future Preview URL.

The current settings validate correctly. If testing the exact Session pooler URI
from the staging **Connect** panel, use port 5432, the matching staging username
and verified TLS, and add its actual hostname to the cloud allowlist if needed.
Do not guess regional hosts or replace a known-good database password solely
because the network failed. A hostname allowlist does not establish TCP access.
Alternatively, use the documented staging SQL Editor/trusted-runner procedure
after backup and read-only inventory, then retain hosted migration/RLS/workflow
evidence. No network bypass or SQL-over-HTTP RPC is needed or authorized.

If a future staging Preview host is also blocked:

1. Open its Vercel dashboard and deployment URL from an allowed network while
   logged into the authorized team. Run the same staging workflow matrix and
   capture screenshots, response codes and console errors at desktop and mobile
   widths. Verify the browser's Supabase requests go to the staging reference.
2. On a trusted developer machine with network access, check out this branch and
   run `npm ci`, `npm test`, `npm run build` and `npm run dev` with **staging-only**
   application configuration. Complete real Auth email/recovery and Storage HTTP
   tests there. Save redacted results; local adapter tests are not a substitute.
3. An authorized team member can use Vercel's authenticated request tooling, for
   example `vercel curl /commerce --deployment <actual-staging-preview-url>`, to
   separate deployment-protection failures from app failures. It cannot bypass
   this environment's outbound proxy rules.
4. Retain the successful local isolated PostgreSQL/Next.js/Chromium results as
   separate evidence. Leave hosted Preview verification marked **blocked/unrun**
   until an actual result is available. Do not substitute production credentials.
