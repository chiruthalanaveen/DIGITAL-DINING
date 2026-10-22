# Preview, environment and DNS review

## Actual status

The user confirmed that there is **no separate staging Supabase project**. No
staging credentials are present in this workspace, and read-only inspection of
the connected Vercel project found that its configured application credentials
target production only. They were not copied to Preview or used for hosted tests.

There is currently **no Vercel Preview tested against staging Supabase**. The
earlier URL below is a different artifact and must not be described as one:

- URL: <https://digital-dining-6kfz79na2-digital-dining.vercel.app>
- Vercel dashboard:
  <https://vercel.com/digital-dining/digital-dining/HyGsCtVcXVRcwz1YmDFk4ezwbQ2Q>
- Deployment: `dpl_HyGsCtVcXVRcwz1YmDFk4ezwbQ2Q`.
- Build state: `READY`; source commit: `aba881a`.
- Target: **production**, with `autoAssignCustomDomains: false` and production
  environment configuration. It was staged before the latest review hold.
- Existing live domains and the project's active production target were verified
  to remain bound to `dpl_9Q2yJ1vG7e7oF4fHiLZE1NK4KbsU` after staging.

Do not place test applications, products, customer accounts or orders into that
production-connected artifact. No new deployment or promotion was performed for
this review. Production SQL, production deployment and merging remain on hold
until the user separately approves them after reviewing results.

## Required environment configuration

The commerce application reuses these existing runtime variable names. It does
not need another runtime provider, payment key or database connection URL.

| Variable | Development/Preview value | Exposure |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Separate staging project's API URL | Browser-visible |
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

## Create the real Preview only after staging is available

1. Positively identify a separate staging Supabase project and complete the
   read-only preflight. Capture a staging backup and compare the existing schema,
   grants, RLS and Auth hooks. Apply only the reviewed versioned migration to that
   staging database; never install `commerce_bootstrap.sql` on hosted Supabase.
2. Configure the Preview-only application variables listed above. Inspect their
   environment targets; ensure Production values and live domain bindings remain
   unchanged. Add the precise Preview origin to staging Auth redirects.
3. From this feature branch, a team member with their own Vercel CLI login can
   create a manual **Preview** with this command:

```sh
vercel deploy --environment preview --project digital-dining --scope digital-dining --yes
```

Do not add `--prod`, `--environment production`, `promote` or `alias`. The existing
branch-specific `vercel.json` guard disables automatic Git deployments; leave it
in place. This command was **not executed** because staging is unavailable.

4. Record the new URL and verify via Vercel that `target` is Preview and its
   environment is staging. Run the hosted workflow matrix in
   [staging-verification.md](staging-verification.md), using synthetic staging
   users and data only. Confirm that all live domains still use the previous
   deployment. These checks are release prerequisites, not completed results.

## Network limitation and alternative verification

This environment's outbound proxy rejected the earlier staged deployment host
with an HTTP 403 **during CONNECT, before the application received a request**.
This is a network limitation; it is not evidence of an application 403 or a
successful HTTP smoke test. Vercel API metadata and build status were reachable.
Deployment protection may separately require the user's Vercel login.

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
