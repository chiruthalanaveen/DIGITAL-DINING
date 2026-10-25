# Main-project installation — approved scope, access still required

Updated 26 October 2026 (Asia/Kolkata). Draft PR #3,
`feature/client-websites-phase1`.

Target: `wispidcdmunqzahjacws`, the existing main Supabase API target used by the
`table-pay` application. The user's latest instruction selects main only, and
migration approval was given conditionally on backup and compatibility checks.
Deployment, merging into main and live payments remain on hold. The user has
withdrawn the staging requirement. Do not request the same migration approval
again, and do not resume staging tests or repurpose their credentials.

No SQL, backup, restore or production data mutation was executed by this review.
This document contains no credentials. No restorable backup currently exists
from this task. Main API metadata authenticated successfully and exposes neither
the nine proposed commerce tables nor five proposed public RPCs. This is not a
complete SQL/catalog conflict check, RLS test or proof of backup readiness.
The application already uses this main project; runtime keys need no switch.

## Current connection state — URI and hostname supplied, PostgreSQL blocked

`COMMERCE_MAIN_DATABASE_URL` is present and its parsed host is
`db.wispidcdmunqzahjacws.supabase.co`. Its database/username match main, port 5432
is used and TLS certificate verification remains enabled. The password is not
printed or validated: DNS lookup and PostgreSQL connection fail with
`EAI_AGAIN/getaddrinfo` before TCP/TLS/authentication. The configured proxy
separately rejects standard CONNECT to the exact host/port with HTTP 403 before
PostgreSQL bytes or credentials. No rejection reason was supplied.

The user has now published the main hostname's allowlist addition. Readback
confirms the published configuration includes it, but both connection errors
persist after that change. Do not request the same URI, hostname or approval
again. These results do not identify an invalid password or prove an IPv6 cause.
A hostname allowlist alone does not establish supported PostgreSQL transport.

## Next access requirement — official HTTPS Management API

To continue from this workspace without the blocked PostgreSQL transport, a
`SUPABASE_ACCESS_TOKEN` secret requirement and its exact HTTPS destination
`api.supabase.com` have been saved in the draft. The first save returned a generic
error; subsequent readback confirmed both entries exist. The token binding is
still missing. Open [Supabase Account → Access Tokens](https://supabase.com/dashboard/account/tokens),
create an account access token with the permissions required for the selected
main project, enter it in that secure secret field, then save/publish. Never paste
it into chat, Git, scripts or logs. This is distinct from anon/service-role keys.

The prepared access checker at
`/workspace/commerce-validation-artifacts/main-project-review/check-main-management.py`
is fixed to project `wispidcdmunqzahjacws`, allows only GET project/backup-metadata
endpoints, refuses redirects and alternate targets, and suppresses raw errors or
responses that could contain secrets. Its current run exits 1 before any HTTP
request because the token is absent. It cannot execute SQL or certify a backup:

```sh
python /workspace/commerce-validation-artifacts/main-project-review/check-main-management.py
```

A local security review passed six mocked boundary checks without any network or
database calls: missing credentials/flags/alternate target, project mismatch,
fixed GET-only endpoints, redirects and sensitive-output filtering. Evidence is
`management-checker-local-review.json` beside the helper. This does not establish
real API access or backup readiness.

Once access works, review actual backup availability and SQL/catalog compatibility
through the supported main-project management API before any migration request.
The canonical migration may be submitted only after those prerequisites succeed;
that mutating operation is not part of this checker. Existing conditional SQL
approval remains recorded; deployments/merges/live payments remain on hold.

## PostgreSQL URI reference and trusted-machine alternative

The existing URI is retained. The instructions below are reference or a route to
use on a trusted machine that supports PostgreSQL; they are not a request to
replace it or to change the already-published hostname again.

Obtain it from the main project's **Connect → Connection String → URI → Session
pooler** on port **5432**. Its username must identify
`postgres.wispidcdmunqzahjacws`; its actual regional hostname must be copied from
Connect, not guessed. Replace the password placeholder with the main database
password, URL-encoding reserved characters, and keep verified TLS. A direct URI
is also acceptable only if a supported direct network route is demonstrated:

```text
postgresql://postgres:<URL-ENCODED-MAIN-DATABASE-PASSWORD>@db.wispidcdmunqzahjacws.supabase.co:5432/postgres?sslmode=verify-full
postgresql://postgres.wispidcdmunqzahjacws:<URL-ENCODED-MAIN-DATABASE-PASSWORD>@<EXACT-MAIN-SESSION-POOLER-HOST>:5432/postgres?sslmode=verify-full
```

Do not put the completed URI in chat, Git, scripts or logs. Do not repurpose any
`COMMERCE_STAGING_*` variable or the staging guard: that guard intentionally
forbids production. An anon/service-role API key is not the database password and
does not establish DDL or backup access. No Supabase management access token is
currently configured. It is now requested specifically because the supplied
PostgreSQL route was tested and remains blocked; it is not a duplicate database
password request. If an independently supported PostgreSQL route becomes
available, the management credential need not be used for SQL execution.

## Local tooling and network findings

`psql`, `pg_dump`, `pg_restore` and the Supabase CLI were not found on PATH or in
the existing validation tools. Embedded PostgreSQL 18.4 supplies the local
server/initdb/control binaries, not these client programs. Install trusted
PostgreSQL clients appropriate for the hosted server version; a pg_dump client
must not be older than the server major version. Record client versions and
retain TLS/signature/checksum verification during installation.

A hostname allowlist and a well-shaped URI do not prove SQL connectivity. Probe
only the explicitly verified main host/port, first through the supported route,
then perform a read-only identity/version query. Report DNS, TCP, TLS and password
failures separately without raw exception text or connection URLs. If a Session
pooler is used, allow only its copied exact hostname. Do not disable TLS, guess
regional hosts, substitute IPs or expose an ad-hoc SQL-over-HTTP RPC.

## Backup and preservation gate before installation

1. Positively identify the main project in its Supabase dashboard. Record the
   database server version and the installation role without exposing secrets.
2. Inspect actual managed backup/PITR availability and retention in **Database →
   Backups**. Record a recoverable backup or recovery point predating the change,
   access/restore instructions and the agreed recovery point/time objectives.
   Do not assume the plan has managed backups or PITR.
3. Obtain a consistent logical backup where supported, following the current
   Supabase backup procedure and the verified client version. Store it outside
   Git with restrictive permissions and approved encryption. Verify Auth rows,
   all business/wallet/payment/order/customer tables, Storage metadata, custom
   policies/triggers/grants and migration history are included. Provider-managed
   schemas/roles require the documented provider restore flow. A partial export,
   schema-only SQL Editor export, REST row dump or row fingerprint is not a full
   restorable database backup. On any permission failure, stop; do not drop
   required schemas from the backup or change production grants to force it.
4. Back up Storage object bytes separately, with paginated manifest/checksums.
   Database backups contain metadata, not the object payloads. Preserve provider
   settings, encrypted-data key recovery, scheduler definitions and secret-manager
   configuration separately through approved channels.
5. Capture private, consistent pre-install catalog/row preservation evidence for
   the existing public/Auth/Storage/cron objects. Review required columns/functions,
   installation/storage ownership, private/public proposed-name conflicts, event
   triggers/default ACL and current policies. No test fixture creation or other
   test writes belong between preservation snapshots. Read-only REST metadata
   cannot establish these conditions.
6. Confirm the backup can be accessed and restored through the supported recovery
   route. Static dump readability/checksums alone do not prove recovery. Never
   test a restore against the live source database. The user has declined hosted
   staging; do not invent a successful restore rehearsal or use the source as its
   own recovery test. Report any remaining restore-rehearsal limitation explicitly.

## Apply only after the above gate succeeds

Canonical migration:
[`20261022160000_commerce_foundation.sql`](../../supabase/migrations/20261022160000_commerce_foundation.sql).
The [complete migration review](migration-review.md) explains all columns,
functions, triggers/indexes, policies and shared-object effects. It adds nine
commerce tables, restricted functions and fifteen policies, including seven on
shared Storage. Five new Auth foreign keys can restrict future hard deletion.
Hosted compatibility remains unverified; existing business rows are not rewritten.
SHA-256:
`dd2882f6329808783b1d4d97c4264f59989b7e834753aa06efe46d63855db1ca`.

The following are prospective commands, not commands executed in this review.
The completed secret stays in the environment; shell tracing must remain off.
Run only from the approved checkout, after a main-specific target/backup guard:

```sh
psql "$COMMERCE_MAIN_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/commerce_preinstall_verify.sql
psql "$COMMERCE_MAIN_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/migrations/20261022160000_commerce_foundation.sql
psql "$COMMERCE_MAIN_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/commerce_verify.sql
```

The migration contains its own BEGIN/COMMIT and is one-time. Do not wrap it in
competing transactions, apply fragments, suppress name conflicts, delete objects,
rerun blindly, run local bootstrap/checkout test fixtures on main, or use
`supabase db push` to apply unrelated history. On an error, explicitly roll back
and inspect state before any retry. Preserve the established migration ledger.

Compare before/after existing data/definitions. Expected additions are commerce
objects, one bucket, seven commerce-only Storage policies and Auth foreign-key
internal triggers. Existing business rows, RLS policies, wallet balances,
transactions, histories and cron definitions must remain unchanged.

Application rollback should retain the new schema/history and use the previous
application version; a table/bucket/Auth-user drop is not a safe rollback. A
full/PITR restore can discard unrelated activity and requires a separate reviewed
recovery decision. No production deployment, main merge, payment or live-order
processing is authorized by completion of the SQL installation.

## SQL Editor alternative

If the cloud network still cannot reach PostgreSQL, an authorized operator can
open the main project's [SQL Editor](https://supabase.com/dashboard/project/wispidcdmunqzahjacws/sql)
from an allowed browser. Verify that exact project reference, complete the same
backup and preservation prerequisites, then run the read-only
[pre-install inventory](../../supabase/tests/commerce_preinstall_verify.sql).
Stop on an object-name conflict, unverified backup, unexpected policy/hook or
missing installation privilege. Run the full canonical migration once only after
those checks succeed, then run the complete
[post-install verification](../../supabase/tests/commerce_verify.sql) and compare
before/after inventories. Keep result exports private; they may reveal internal
policies, function or cron configuration. A SQL Editor result export is not a
restorable backup. Do not paste customer records or credentials into chat.

No new live accounts, orders, wallet entries or payments should be created merely
to test installation. Existing PIN reset procedures are exposed in main metadata,
but their argument shapes alone do not prove atomic recovery/session behavior.
Their implementation still needs review without resetting a real customer's PIN.

For this documentation/header update: **No SQL migration required.** The existing
foundation migration remains pending until the prerequisites above are met.
The latest fresh build result is recorded in
`/workspace/commerce-validation-artifacts/main-project-review/build.log`.
[Prior test evidence](pr3-followup-report.md) remains historical: 82 unit tests,
88 local SQL assertions and 19 staging Auth checks passed; staging work is now
stopped by the user's preference. Production workflow/RLS compatibility is not
certified by those local or historical results.
