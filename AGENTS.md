<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Digital Dine-In update requirements

For every update:

1. Assess whether Supabase database changes are necessary. When none are needed,
   explicitly state **"No SQL migration required."** in the completion report.
2. When database changes are required, create a versioned SQL migration in
   `supabase/migrations/`, using a unique timestamp and descriptive name such as
   `YYYYMMDDHHMMSS_description.sql`. Do not rely on undocumented manual SQL changes.
3. Preserve existing data, RLS policies, wallet balances, payment transactions,
   order histories, and cron jobs. Review migration effects on all of these before
   running it; use changes that preserve existing application functionality.
4. Test required migrations against a verified development database using
   development credentials. Report the actual results. Mocked storage tests do
   not establish migration compatibility with Supabase. If a development database
   is unavailable, report that validation is blocked instead of claiming success.
5. Never execute a migration on production without the user's explicit approval
   for that migration and target. Do not treat development approval as production
   approval.
6. For database changes, include the migration file path, rollback considerations,
   read-only verification queries, and exact installation/application steps with
   the target environment identified. Explain any rollback that cannot safely
   preserve data rather than supplying a destructive shortcut.
7. Run `npm run build` for every update and report its result. Run relevant tests
   using development credentials and isolated fixtures where appropriate. Do not
   process live payments or modify production data while validating changes.

Keep these requirements outside the generated Next.js instruction block above.

## Client Websites main-project scope and release hold

On 26 October 2026 the user withdrew staging and selected the existing main
Supabase project `wispidcdmunqzahjacws` used by the `table-pay` application. The
reviewed `20261022160000_commerce_foundation.sql` was explicitly approved for
that exact project. On 27 October the user instructed **"FORGET ABOUT THE BACKUP
AND WORK FORWARD"**, waiving the prior backup prerequisite. Proceed with the
already-approved exact migration after fresh compatibility checks using a
supported authorized write connection. Do not ask for migration approval or a
backup again. This waiver does not authorize other migrations, a main-branch
merge, production deployment/promotion, live test fixtures or live payments.

The foundation source remains canonical at SHA-256
`dd2882f6329808783b1d4d97c4264f59989b7e834753aa06efe46d63855db1ca`.
Preserve existing business data, RLS policies, financial histories and cron jobs.
The backup waiver does not waive preservation or permit destructive testing.

Main-only read-only SQL/catalog checks work via the supplied Management API
token. Project is confirmed table-pay, PG 17.6. The last preflight found required
objects/privileges and no commerce collisions; full hosted RLS/workflow behavior
is not tested. After the backup waiver, fresh main compatibility checks passed.
The complete canonical foundation SQL was submitted once through the documented
Management `/database/query` endpoint with read_only:false, preceded only by
session timeouts (5s lock, 120s statement). It failed HTTP 400 / SQLSTATE 25006:
`cannot execute CREATE SCHEMA in a read-only transaction`. API identity checks report
`supabase_read_only_user`; the migration request independently failed as read-only
and no migration committed. The current blocker is API
write access, not backup. Post-attempt catalog/cron fingerprints match exactly; see
`docs/commerce/main-install-results.md`.
Do not ask for the supplied URI/token, published hostname, backup or migration
approval again. Do not retry unchanged API requests, use alternative endpoints
to bypass this denial, elevate roles or create ad-hoc SQL functions/tunnels.
An authorized operator can install only the already-approved canonical file in
the main Supabase SQL Editor after the same compatibility checks; do not use
`supabase db push` or unrelated migration history.

No usable database backup exists: last provider metadata returned backups[],
PITR false and no physical recovery range; the user confirmed no external backup.
Catalog snapshots are not backups. Recovery limitations must be disclosed, but
backup creation is no longer an installation gate. Retain existing private
artifacts rather than deleting them or resuming backup preparation.

Both the actual main session pooler `aws-0-ap-south-1.pooler.supabase.com`
(port 5432) and `deb.debian.org` are published/allowed. Official PostgreSQL 17.11
clients were verified against signed Debian metadata/checksums and extracted
outside the repository. Direct DNS is unavailable; proxy CONNECT returns 200,
but normal PostgreSQL SSLRequest gets EOF. Direct TLS negotiates no required
`postgresql` ALPN and has a proxy-issued certificate, so this is not usable
PostgreSQL transport. Do not disable verification or send authentication over
that failed alternative route. Do not request repeated hostname/credential edits,
use internal-only backup APIs or upgrade paid plans.

A separate HTTPS read/list/download-only Storage export succeeded: four buckets,
28 objects, 7,431,276 plaintext bytes, encrypted with a separate private key.
Before/after inventories match; manifest and all objects passed authenticated
local readback. This is a workspace Storage copy only, not a database backup,
offsite backup or managed recovery rehearsal. Data/key remain outside Git and
public archives; do not print or upload them.

Do not put main credentials in COMMERCE_STAGING_*, run destructive test fixtures
on hosted databases, create live test users/orders or touch wallet/payment data.
Staging remains stopped; preserve its historical evidence/private fixtures.
Local development checks use only isolated fixtures. Follow
`docs/commerce/main-project-installation.md` for main-only compatibility, the exact
migration and verification/recovery steps. Older backup runbooks are optional
references, not a reason to stop the authorized installation. Retain the Vercel
branch deployment guard and PR #3 draft status.
