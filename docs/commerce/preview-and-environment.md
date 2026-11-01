# Preview, environment and DNS review

Updated 1 November 2026. Branch: `feature/client-websites-phase1`, PR #3. The user
selected main `table-pay`; staging work remains stopped. Its foundation was
installed and verified on 31 October. **Do not reapply it or request staging/
backup setup again.** The latest instructions prohibit production SQL, production
secret changes and every deployment or merge without approval.

## Actual hosting evidence

The last Vercel check, on **31 October**, used the existing token for GET-only
project, Preview-environment metadata and deployment-list requests. All returned
**HTTP 403**, JSON error code `forbidden`. The token was present; values were not
inspected or saved. This does not establish an invalid/expired token, missing team
membership or a specific proxy cause. It was an HTTP API denial, not a measured
CONNECT failure.

Current Preview bindings, a usable Preview URL and the active production target
remain **unverified**. No new deployment was created. October 25's Production-only
environment observation and production-target staged artifact are historical;
they are not current Preview evidence or a safe fixture-testing destination.

Sanitized evidence:
`/workspace/commerce-validation-artifacts/release-next-20261031/` contains
`vercel-preview-readiness.json`, `vercel-readonly-error-diagnosis.json` and
`vercel-preview-readiness-notes.md`. Legitimate project/team read access or an
authorized dashboard inspection is needed to resolve the denial. Do not retry
unchanged requests, bypass controls or request the same secrets solely because
this check returned 403.

## Auth callbacks and email

The 31 October read-only main Auth inspection found:

- Site URL `https://www.digitaldine-in.online/`.
- Email signup enabled; email auto-confirm disabled.
- The allowed `https://www.digitaldine-in.online/auth/callback**` prefix and legacy
  callbacks, but no direct `/commerce/auth` or `/shops/<slug>/account` redirects
  used by the previous commerce email flow.
- No custom SMTP host/user/password configured. No real email was sent and
  delivery/provider restrictions were not tested.

Commerce email links now use `/auth/callback/commerce` under that observed prefix.
The new route selects the matching owner or store-customer PKCE client and fixed,
validated destinations; legacy callbacks remain unchanged. It keeps the
**requesting origin**: forcing a different origin such as www would lose that
browser origin's verifier/session storage.

The observed www allowlist covers this path. A non-www or future Preview origin
needs authorized review of its exact callback origin/path before real email
testing. Do not infer all Vercel subdomains are allowed or add unrestricted
wildcard origins. Review custom SMTP/provider/sender configuration before public
email onboarding. Local PKCE tests simulate mail; they do not prove real Supabase
delivery. No production Auth setting or secret was changed.

## Runtime configuration to inspect

No new environment variable is required by the callback or shopping increment.
The application uses its existing names:

| Variable | Requirement |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Matching, explicitly approved target; browser-visible. |
| `SUPABASE_SERVICE_ROLE_KEY` | Matching server-only key; never expose through a public variable. |
| `SUPABASE_URL` | Same target for existing modules that read this name. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` | Reviewed private Preview-only admin configuration; never use public local-fixture credentials on a hosted deployment. |
| Existing maintenance configuration | Observe its behavior; do not toggle production maintenance to make Preview tests pass. |

This is a checklist, **not permission to copy Production secrets to Preview or
change their scopes**. Do not put main values in `COMMERCE_STAGING_*` or use a
fixture database URL as application runtime configuration. Do not copy provider
payment/mail/Firebase keys wholesale. Commerce remains COD-only; no live payment
credentials are needed for this increment.

`NEXT_PUBLIC_*` values are compiled into the bundle. A local loopback-fixture
build is not a hosted artifact: do not deploy it with `--prebuilt`. After approved
Preview configuration is verified, build from source with its actual settings.

## Prospective Preview sequence — not executed

1. Resolve legitimate read access to the intended project/team. Verify identity
   and current environment scopes without changing Production bindings.
2. Review Preview-only configuration and permitted tests. No main test identities,
   products/orders, role impersonation or payment operations are authorized.
3. Obtain the user's explicit deployment approval. Retain the branch's automatic
   Git deployment guard in [vercel.json](../../vercel.json).
4. Only then, an authorized operator may create a **Preview** from this branch:

```sh
vercel deploy --environment preview --project prj_Zh1KOvZq6Vm7e9YecZDwur4RbeHL --scope digital-dining --yes
```

The documented project is `prj_Zh1KOvZq6Vm7e9YecZDwur4RbeHL`, team
`team_v6sVn9Vr7yAcgv3wlQCSZ2aH`; current identity/access still needs confirmation.
An earlier CLI help check supported these arguments. The command above was
**not run**. Do not add production targeting, promotion, aliasing or prebuilt flags.

5. Record the actual URL. Verify target is Preview, its configuration matches the
   approved target and live bindings were not changed. Run only authorized checks;
   label protected/unrun workflows honestly. Classify failures from actual
   network, deployment-protection, Auth or application evidence.

If access remains unavailable, use the guarded local workflow in
[testing.md](testing.md) and the [increment report](storefront-increment-report.md).
An authorized person can inspect the actual Preview from their own permitted
browser/network after these prerequisites; this does not bypass cloud controls.

## Storage and DNS

The existing `commerce-media` bucket/policies were verified with the foundation.
The first increment consumes existing `image_url` data and introduces no storage
model/policy change. Multiple images need a separately reviewed model. Public
image media must not contain private customer documents.

Routes remain `/shops/<slug>` and `/shops/<slug>/account` on the application
origin. **No DNS change, wildcard subdomain or custom domain is required.**
Custom domains, live Razorpay and new persisted capabilities remain later work.
**No SQL migration required.**
