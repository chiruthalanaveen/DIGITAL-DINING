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

The user selected main Supabase project `table-pay` (`wispidcdmunqzahjacws`) and
explicitly approved the reviewed `20261022160000_commerce_foundation.sql`. On
27 October 2026 the user waived the backup prerequisite. On 31 October the user
reported running the complete reviewed file in the main SQL Editor; subsequent
read-only verification confirms the foundation is installed. **Do not reapply
this one-time migration or ask the user to run it, provide credentials or make a
backup again.** No additional migration is needed for post-install verification.

The canonical source remains SHA-256
`dd2882f6329808783b1d4d97c4264f59989b7e834753aa06efe46d63855db1ca`.
Main PostgreSQL 17.6 metadata matches an independently installed local canonical
fixture: nine tables/103 columns, twelve functions, fifteen policies, 25 indexes,
81 constraints, 54 commerce-table constraint triggers and ten Auth FK triggers.
Columns/defaults/types, grants, function security, policy expressions and other
compared definitions match. All twelve stored function-body hashes match after
CRLF-to-LF normalization only. Existing catalog records, four prior bucket
settings and two cron definitions remain unchanged. These are metadata
preservation checks, not a full business-row snapshot or recovery proof.

Eleven read-only hosted REST checks pass: anonymous direct reads on all nine
commerce tables are rejected (HTTP 401 / SQLSTATE 42501), a missing-slug public
catalog call returns HTTP 200/null, and a service-role GET with limit zero returns
200. No business rows or live fixtures were written. Real hosted Auth sessions,
owner-to-owner RLS isolation and commerce workflows remain untested. Fresh local
checks pass: 82 Node tests, 88 isolated PostgreSQL assertions and npm run build.
See `docs/commerce/main-postinstall-results.md` for current evidence and limits.

The 27 October Management API installation attempt failed HTTP 400 / SQLSTATE
25006 in a read-only transaction. That failure is historical: the user completed
installation through the SQL Editor. Do not retry the API migration or treat its
write denial as an installation blocker. Keep verification read-only; do not
switch roles, use JWT impersonation, create live test users/orders or call
mutating RPCs to test production behavior.

The read-only history check found no `supabase_migrations.schema_migrations`
table. No migration-history metadata was created or repaired by this work. Plan
a reviewed baseline before any future CLI migration workflow; do not run
`supabase db push`, replay the foundation or install unrelated migration history
to populate a ledger.

Staging remains stopped by user choice. Do not put main credentials in
COMMERCE_STAGING_*, run destructive fixtures on hosted databases, touch existing
wallet/payment/customer/order data or alter cron jobs. Local development checks
use isolated fixtures only. Preserve existing data, RLS, balances, transactions,
order histories and jobs. The backup waiver does not waive those requirements.
No production deployment/promotion, main merge, other migration, live fixture or
live payment approval follows from installation. Retain PR #3 draft status and
the Vercel `feature/client-websites-phase1` deployment guard.

The prior network/client/backup investigations are historical. Published host
entries and supplied secrets need no re-entry. The cloud's raw PostgreSQL route
was unavailable; do not disable TLS verification, bypass network controls,
elevate roles, use internal-only APIs or create ad-hoc SQL tunnels/functions.
No database backup or managed recovery rehearsal is established. The separate
28-object encrypted Storage workspace copy and its private key remain outside
Git/public archives; retain them without resuming backup work or printing data,
credentials or keys. Follow `docs/commerce/main-project-installation.md` for the
installed-state runbook and data-preserving rollback considerations.
