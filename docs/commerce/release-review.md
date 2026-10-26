# Client Websites: review before any production release

**Current scope — 26 October:** main-only access is confirmed and read-only SQL
preflight passes. No usable backup is available; the user confirmed no external
backup. Migration remains pending, and deployment/merge/live-payment holds remain.
Use [main-preflight-results.md](main-preflight-results.md) for the current blocker
and [main-project-installation.md](main-project-installation.md) for execution
steps. Earlier staging results below are historical.

The latest [PR #3 follow-up report](pr3-followup-report.md) records 82 unit tests,
88 local SQL assertions, a passing build, 64 retained screenshots, repaired billing
navigation and explicit PIN unavailability. Staging configuration now validates
and 19 real Auth checks pass. PostgreSQL DNS/proxy access blocks the migration
and hosted tenant workflows. Inherited repository lint also fails. Historical counts
and the earlier no-staging status below are retained as the 22 October review
record; use the follow-up for current status. Production release remains on hold.

Review date: 2026-10-22. **Production SQL, merges into main and further production
deployments/promotions are on hold.** The user explicitly requires separate
approval after reviewing the final results. No such approval is inferred here.

This review adds documentation, a read-only staging preflight, staging-target
guard tests and twelve additional local tenant-isolation assertions. No SQL
migration required. That statement applies only to this review update: the
existing Phase 1 feature still requires the unchanged foundation migration below,
which has not been applied to production by this work.

## 1. Full migration and every database object

The complete, unabridged **472-line SQL file** is
[`20261022160000_commerce_foundation.sql`](../../supabase/migrations/20261022160000_commerce_foundation.sql).
It is the only executable installation source; no partial snippet or generated
review copy replaces it. Its SHA-256 is:

```text
dd2882f6329808783b1d4d97c4264f59989b7e834753aa06efe46d63855db1ca
```

[migration-review.md](migration-review.md) explains every one of the **103
columns**, all constraints and defaults, twelve function signatures and action
branches, 25 indexes, fifteen policies, grants and transaction effects. It covers
all nine tables: websites, memberships, applications, categories, products,
customers, orders, order items and audit logs.

There are six explicitly declared indexes plus nineteen automatic PK/UNIQUE
indexes. There is no explicit `CREATE TRIGGER`, but sixteen foreign keys install
64 PostgreSQL internal constraint triggers in the local catalog, including ten
on existing `auth.users`. No custom automatic timestamp trigger is installed.

## 2. Existing data and feature preservation

[preservation-review.md](preservation-review.md) provides a statement-by-statement
effect boundary, existing-code inspection and limits. The migration contains no
`DELETE`, `TRUNCATE` or `DROP`. It does not rewrite existing restaurant, delivery,
resort, wallet, payment, order-history or customer rows. It does not call existing
payment/settlement/cron procedures or replace existing function/policy bodies.

It intentionally inserts one new Storage bucket and adds seven policies to the
shared `storage.objects` table. Their guards allow the existing policy decision
for other buckets, but hosted coexistence is still unverified. Five Auth foreign
keys can block future account hard deletion while commerce history references
the identity. This is a material lifecycle compatibility risk to review; it was
not hidden by adding destructive cascades. Unknown hosted hooks/event triggers
and full legacy service workflows have not been certified.

## 3. Separate hosted Supabase migration test

**BLOCKED / NOT RUN.** The user confirmed that there is no staging Supabase
project. There are no staging credentials or management capabilities configured
to perform that hosted test. Production was not substituted, and no paid resource
was created automatically.

[staging-verification.md](staging-verification.md) supplies the exact development
setup/application sequence and required hosted workflow matrix. The new read-only
preflight exits before any connection when its five explicit staging variables
are missing. That refusal is expected, not a hosted compatibility pass.

## 4. Tenant isolation

**Local PostgreSQL tests passed.** The new assertions create real local checkout
records, enable customer permission for both owners, prove permitted own-tenant
reads succeed, then prove Owner B cannot directly SELECT Owner A's private
settings, products, customers, orders or order items. Revoking an owner's customer
permission also removes its own customer-module access. Existing tests cover
foreign-tenant mutations, composite references, private grants, media path
isolation and authorization rechecking after concurrent revocation.

Public storefront catalog DTOs and public product image bytes are intentionally
public; private database rows and management rights remain tenant-scoped. Local
proofs do not replace the same tests with real hosted Auth/PostgREST/Storage.

## 5. Authentication and commerce workflow checks

[review-test-results.md](review-test-results.md) records exact commands, coverage,
evidence paths and limitations:

| Check | Actual result |
| --- | --- |
| `npm test` | **43/43 passed**: 21 commerce API, 14 maintenance, eight staging guards. |
| Scoped ESLint | **Passed**, zero errors; three native image optimization warnings. |
| `npm run build` | **Passed**, synthetic development credentials only. |
| Local migration / RLS / transaction / concurrency checks | **76 PostgreSQL assertions passed**. |
| Actual Next.js API plus Chromium browser integration | **Passed**, desktop 1440×1000 and mobile 375×812. |
| Read-only migration verification | **Ten SELECT query groups passed** on the local fixture. |

The local suite exercises owner sign-in, application approval and assignment,
products/categories/image-upload metadata/inventory, filters/details/cart
persistence, COD checkout, stock failures, lost/changed retries, order history,
account switching, Admin permission boundaries and audited views. Auth and
Storage HTTP use a local adapter over real PostgreSQL/RLS. Real verification and
recovery emails, hosted Auth hooks/refresh/revocation and real Storage delivery
remain unrun. No payment provider or live wallet transaction was used.

## 6. Vercel Preview and network limitation

**A staging-backed Vercel Preview does not exist and has not been tested.**
Read-only Vercel inspection found the application's configured credentials scoped
to Production, with no staging Preview credential set. No new deployment was
created for this review.

The earlier URL
<https://digital-dining-6kfz79na2-digital-dining.vercel.app> is a **production-target
staged build with production environment configuration**, created before this
review hold. It is not a staging Preview and must not receive test writes.
The active live deployment remains `dpl_9Q2yJ1vG7e7oF4fHiLZE1NK4KbsU`.

A read-only reachability attempt was rejected with `Tunnel connection failed:
403 Forbidden` during the outbound proxy CONNECT step, before an app response.
[preview-and-environment.md](preview-and-environment.md) gives Preview-only setup
and alternatives: an authorized browser from an allowed network, a trusted
staging-only CI/developer machine, and authenticated Vercel request tooling.
These are future verification steps, not completed hosted results.

## 7. Backup, recovery and rollback

[backup-recovery.md](backup-recovery.md) is the full plan. **No production backup
or restore was taken/performed, and no verified backup artifact is claimed.**
It includes checking actual managed backup/PITR availability, secure consistent
schema/data/role exports, custom Auth/Storage definitions, migration history,
separate Storage object-byte backups/checksums, operational secrets/configuration
and a separate development recovery rehearsal.

If installation fails, its transaction rolls back. After successful installation,
prefer an application rollback while retaining new commerce history and images.
Do not drop tables/buckets or introduce Auth cascades. A full database/PITR
restore can discard unrelated later business activity and requires its own
approved recovery/reconciliation procedure. Restore rehearsal remains unrun.

## 8. Environment, DNS and Storage requirements

- No new application runtime variable name is required by commerce. For staging,
  the existing Supabase URL/anon/service-role and Admin configuration must use
  separate development values in **Vercel Preview only**. Never expose the
  service key through `NEXT_PUBLIC_*` or copy live payment/mail/wallet credentials.
- The preflight additionally needs five explicit `COMMERCE_STAGING_*` variables,
  including a project reference and staging-only database URL. They are test-only.
- Staging Auth needs allowed Preview redirect URLs and actual email testing.
- No DNS change is required for `/shops/<slug>`. Wildcard subdomains and verified
  custom domains are not implemented/activated in Phase 1.
- The reviewed migration creates a public 5 MiB JPEG/PNG/WebP image bucket and
  seven Storage policies. Real hosted bucket/policy compatibility remains pending.

Exact names and setup are in
[preview-and-environment.md](preview-and-environment.md).

## 9. Branch, PR and exact file list

- Branch: `feature/client-websites-phase1`.
- Draft PR: <https://github.com/chiruthalanaveen/DIGITAL-DINING/pull/3>.
- Implementation commit: `aba881a`; migration file remains unchanged.
- [changes.md](changes.md) lists every current PR file against GitHub main,
  distinguishes the earlier maintenance prerequisite from commerce, and lists
  this review's added documentation/tests.

The branch-specific Vercel Git-deployment guard remains enabled. No merge or
production promotion is authorized by updating review documentation in the PR.

## 10. Release decision and remaining risks

**Hold release.** Completed local tests and static preservation analysis are
useful evidence, but the following results are still missing:

1. A positively identified separate Supabase staging project and hosted migration
   installation/compatibility result.
2. Real Auth/email/recovery/refresh, PostgREST RLS/RPC and Storage HTTP tests,
   including coexistence with existing policies/hooks and account-deletion paths.
3. A genuine Vercel Preview using staging credentials, plus remote desktop/mobile
   and legacy restaurant/delivery/resort/auth/order/wallet regression results.
4. A verified backup and measured restore rehearsal, including Storage bytes and
   prevention of live cron/webhook/email/payment effects in restored staging.
5. Separate explicit user approval for any production SQL, merge or production
   deployment after these results are reviewed.

Do not interpret a green local build, a successful target guard or the earlier
staged Vercel build as approval or evidence that these missing gates have passed.
