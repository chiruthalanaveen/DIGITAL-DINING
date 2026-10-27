# Main-project installation — approved migration, backup still required

Updated 27 October 2026. Target: **table-pay** (`wispidcdmunqzahjacws`). Keep all
changes on draft PR #3 / `feature/client-websites-phase1`.

The user selected main only and approved the reviewed foundation migration
**after backup and compatibility checks**. Do not request that approval again.
Staging is stopped; deployment/promotion, main merge, live payments, unrelated
migrations and live test-data writes remain on hold.

## Current result

[main-preflight-results.md](main-preflight-results.md) is the current detailed
report. The supplied URI and account token are available. Official HTTPS main
metadata and read-only SQL work. Required objects/privileges exist and no proposed
commerce-name collision was found. PostgreSQL 17.6 is confirmed. Read-only schema,
policy, trigger/function fingerprints and two cron definitions were captured
privately; no migration, DDL/DML or business-row write occurred.

**No usable database backup is available.** Full provider metadata has no completed backup
record or physical recovery range; PITR is off, and the user confirmed no external
backup. Catalog fingerprints are not a backup. The public API supports backup
listing/restoration but no supported public manual-create/download endpoint was
found. Internal-only restore-point operations and paid upgrades were not used.

The general Management SQL endpoint still returned a read-only role/transaction
for a SELECT-only request with `read_only:false`; its cause is unknown. Actual
DDL execution capability is not established. Do not probe writes before backup
or try to elevate the existing read-only session.

## Backup transport result and concrete alternative

Both required host entries are now published. The official PostgreSQL 17.11
clients were retrieved from Debian, verified using signed repository metadata
and checksums, and extracted outside Git. The supplied URI/token need no re-entry.

The actual main Session pooler is `aws-0-ap-south-1.pooler.supabase.com`, port
5432, database `postgres`, user `postgres.wispidcdmunqzahjacws`. Transaction port
6543 was not used or changed. Direct DNS remains unavailable (`EAI_AGAIN`).
Configured proxy CONNECT now succeeds (200), but normal PostgreSQL SSLRequest
gets EOF before authentication. Direct TLS has a proxy-issued certificate and
no negotiated `postgresql` ALPN, which PostgreSQL 17 requires for direct TLS.
No authentication was sent over that diagnostic route. The verified `psql`
connection attempt closed before successful login/SQL. This is a cloud transport
limitation, not evidence of an incorrect password or a Supabase outage.

Do not request repeated hostname/credential changes, disable verification,
substitute external IPs, use internal APIs or create an ad-hoc SQL tunnel/RPC.
Use [trusted-machine-backup.md](trusted-machine-backup.md) from a trusted computer
with supported PostgreSQL connectivity. It includes read-only logical backup,
separate Storage payloads, verification and recovery limits. A separate encrypted Storage-only export
did succeed: four buckets, 28 objects, 7,431,276 bytes, matching before/after
inventories and authenticated local readback. Its data/key are private and
outside Git. It is a workspace copy only, not a durable offsite/database backup
or managed restore rehearsal; the database backup gate remains unsatisfied.

## Backup and compatibility gate

Before executing the migration from this workspace or a trusted operator machine:

1. Verify the main dashboard reference and SQL connection target. Confirm the
   actual installer role/version through read-only queries. Token presence alone
   is not proof of write permission.
2. Take a consistent complete logical backup using official supported PostgreSQL/
   Supabase tooling over a verified route. Store it privately outside Git with
   restrictive permissions and approved encryption. Preserve Auth, business,
   wallet/payment/order/customer data, schema/RLS/grants/triggers and migration
   history. Do not silently exclude a required table after a backup error.
3. Back up Storage bytes separately with a manifest/checksums; database backups
   contain metadata, not object payloads. Preserve external provider/key/scheduler
   settings separately. Inspect the actual backup contents and supported restore
   procedure, and report any untested recovery/managed-schema limitation. Never
   rehearse a restore against the live source database.
4. Run [commerce_preinstall_verify.sql](../../supabase/tests/commerce_preinstall_verify.sql)
   and compare current state with the private pre-install catalog evidence. Check
   all proposed names, policies, triggers/event hooks, ownership/Supabase custom
   policy privileges and existing scheduled jobs. Record a coherent before/after
   comparison window; do not treat legitimate concurrent production activity as
   migration corruption or alter records to force a matching hash.
5. Confirm a usable recovery artifact/point and installation capability before
   DDL. A JSON catalog snapshot, REST export, SQL Editor result or successful
   `pg_restore --list` alone is not proof of a complete recoverable system.

The full [backup/recovery plan](backup-recovery.md) supplies detailed scope and
verification queries. Its older development examples are references; do not
substitute main into destructive local test scripts or resume staging.

## Canonical migration — prospective commands only

Unabridged source:
[20261022160000_commerce_foundation.sql](../../supabase/migrations/20261022160000_commerce_foundation.sql).
SHA-256:
`dd2882f6329808783b1d4d97c4264f59989b7e834753aa06efe46d63855db1ca`.
[Full review](migration-review.md) explains nine tables/103 columns, twelve
functions, 25 indexes, fifteen policies and sixteen foreign keys. Seven new
policies affect shared Storage and five Auth foreign keys can restrict future
identity deletion. No existing business row is rewritten or wallet/payment/cron
procedure called by the reviewed migration.

These commands are **not executed**. Use only after the gate above passes, from
the repository root on the verified trusted computer. First configure the libpq
host/user/database and `verify-full`/CA environment in
[trusted-machine-backup.md](trusted-machine-backup.md). Keep shell tracing off;
`-W` prompts locally without putting the password/URI in command-line arguments.
The migration command intentionally does not inherit the backup's read-only
transaction setting; it is limited to the exact already-approved file:

```sh
PGOPTIONS='-c default_transaction_read_only=on -c lock_timeout=5000' psql -W -X -v ON_ERROR_STOP=1 -f supabase/tests/commerce_preinstall_verify.sql
PGOPTIONS='-c lock_timeout=5000 -c statement_timeout=120000' psql -W -X -v ON_ERROR_STOP=1 -f supabase/migrations/20261022160000_commerce_foundation.sql
PGOPTIONS='-c default_transaction_read_only=on -c lock_timeout=5000' psql -W -X -v ON_ERROR_STOP=1 -f supabase/tests/commerce_verify.sql
```

The file contains its own BEGIN/COMMIT and is one-time. Do not apply fragments,
wrap competing transactions, suppress conflicts, delete objects to force success,
blindly rerun it or apply unrelated history through `supabase db push`. If it
fails, explicitly rollback and inspect state. Preserve the project's established
migration ledger. Afterward verify all nine RLS tables, complete service grants,
restricted RPCs, bucket settings and invariants, then compare existing
business/financial data, RLS and cron preservation evidence.

An operator can use the [main SQL Editor](https://supabase.com/dashboard/project/wispidcdmunqzahjacws/sql)
after the same backup/compatibility gate; this is not an instruction to skip the
missing backup. Do not run local bootstrap, checkout/concurrency test fixtures or
`test-commerce-db.mjs` on main. Actual production RLS/workflow compatibility is
not certified by a successful installation or past isolated tests.

## Rollback and evidence

If installation fails before COMMIT, verify transaction rollback and existing
state. After a committed installation, prefer application rollback while retaining
commerce orders/audit/users/media. Dropping tables/buckets/identities is not a
history-preserving rollback. Full/PITR restore can discard unrelated later
activity and needs its own reviewed recovery decision. No deployment, main merge,
payment or live-order permission follows automatically from SQL completion.

For this read-only investigation/documentation update: **No SQL migration
required.** The existing foundation installation remains pending. Fresh build
output is `/workspace/commerce-validation-artifacts/main-backup-attempt/build.log`;
[prior test results](pr3-followup-report.md) remain historical and do not certify
main workflows. Full private catalog/function/cron/connection details stay out of
Git/public archives. Never print account tokens, DB URLs/passwords or row exports.
