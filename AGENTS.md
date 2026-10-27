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
Supabase project `wispidcdmunqzahjacws` used by the `table-pay` application. In
direct response to the explicit migration-approval question, the user replied
"continue". The reviewed `20261022160000_commerce_foundation.sql` is authorized
for that exact main project only after backup and compatibility checks succeed.
Do not ask for the same approval again. This does not authorize other migrations,
a main-branch merge, production deployment/promotion or live payments.

Main-only read-only SQL/catalog checks now work via the supplied Management API
token. Project is confirmed table-pay, PG 17.6. Required objects/privileges exist
and no commerce collisions were found; full RLS/workflow behavior is not tested.
No production DDL/DML/migration or business-data writes occurred. Do not ask for
supplied URI/token, published direct hostname or migration approval again.

Backup gate is unsatisfied: backups[], PITR false, no physical recovery range,
and the user confirmed no external backup. Catalog snapshots are not backups.
Both the actual main session pooler `aws-0-ap-south-1.pooler.supabase.com`
(port 5432) and `deb.debian.org` are now published/allowed. Official PostgreSQL
17.11 clients were verified against signed Debian metadata/checksums and extracted
outside the repository. Do not ask for these hosts or credentials again.
Direct DNS remains unavailable. The configured proxy now returns CONNECT 200,
but standard PostgreSQL SSLRequest gets EOF; direct TLS negotiates no required
`postgresql` ALPN and presents a proxy-issued certificate. This is not a usable
PostgreSQL connection. No successful PostgreSQL authentication/database backup
occurred. Do not
send startup/authentication over the failed alternative TLS route, bypass network
controls, disable verification, use internal-only backup APIs, upgrade paid plans
or create ad-hoc backup/SQL functions. Use a trusted operator machine with genuine
PostgreSQL networking for the backup; see `docs/commerce/trusted-machine-backup.md`.
Existing Management SQL SELECT with read_only:false still reports a read-only
role; write capability is not established. Follow
`docs/commerce/main-preflight-results.md` for evidence and remaining prerequisites.

A separate HTTPS read/list/download-only Storage export succeeded: four buckets,
28 objects, 7,431,276 plaintext bytes, encrypted with a separate private key.
Before/after inventories match; manifest and all objects passed authenticated
local readback. This is a workspace Storage copy only, not a database backup,
offsite backup or managed recovery rehearsal. Data/key remain outside Git and
public archives; do not print or upload them. The database backup gate still fails.

Do not put main credentials in COMMERCE_STAGING_*, run destructive test fixtures
on hosted databases, create live test users/orders or touch wallet/payment data.
Stop staging work and retain its historical evidence/private fixtures without
mutating them. Local development checks may use only their isolated fixtures.
Follow `docs/commerce/main-project-installation.md` for the pending main-only
backup, read-only inventory, exact migration and recovery steps. Retain the
Vercel branch deployment guard and PR #3 draft status. Existing financial data,
RLS, histories and cron jobs must be preserved.
