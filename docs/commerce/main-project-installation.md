# Main-project installation — approved migration, backup prerequisite waived

Updated 27 October 2026. Target: **table-pay** (`wispidcdmunqzahjacws`). Keep all
changes on draft PR #3 / `feature/client-websites-phase1`.

The user selected main only and explicitly approved the reviewed foundation
migration. On 27 October the user instructed **"FORGET ABOUT THE BACKUP AND WORK
FORWARD"**, waiving the earlier backup prerequisite. Do not request the same
migration approval or a backup again. Continue with fresh compatibility checks
and the exact canonical file through a supported authorized write route.
Staging remains stopped. Deployment/promotion, main merge, live payments,
unrelated migrations and live test-data writes remain on hold.

## Current result — installation blocked by read-only API

Fresh main compatibility checks passed after the backup waiver: required managed
objects/privileges exist, no proposed commerce-name collision was found and
PostgreSQL 17.6 is confirmed. Private read-only catalog/cron evidence is retained.

The complete canonical foundation SQL was submitted once through the documented
Management `/database/query` endpoint with `read_only:false`. Only session
`lock_timeout=5000` and `statement_timeout=120000` settings preceded the file.
The API returned **HTTP 400 / SQLSTATE 25006**:

```text
cannot execute CREATE SCHEMA in a read-only transaction
```

API identity checks report `supabase_read_only_user`. The first schema creation
was rejected and **no migration committed**. Post-attempt catalog/cron
preservation checks passed with identical catalog/cron fingerprints; see
[main-install-results.md](main-install-results.md).
The blocker is the available API's write access, **not backup**. Re-entering
credentials/hostnames or repeating the same request is not the next step.
Do not elevate roles, install write probes or route around the denial.

The concrete operator alternative is the
[main Supabase SQL Editor](https://supabase.com/dashboard/project/wispidcdmunqzahjacws/sql):
verify the project and preinstall checks, run the entire already-approved
canonical file below once, then run its read-only verification queries. This does
not need another backup/migration approval and does not authorize unrelated SQL,
`supabase db push`, deployment, merge, live test orders or payments.

**No usable database backup is available.** Last provider metadata has no
completed backup record or physical recovery range; PITR is off, and the user
confirmed no external backup. The user explicitly waived this prerequisite.
Catalog fingerprints are not a backup. Public backup APIs, internal-only restore
points and paid upgrades are not current work items.

## Available connections and retained Storage evidence

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
The older [trusted-machine-backup.md](trusted-machine-backup.md) remains an
optional reference if backup work is separately requested. It is not a current
prerequisite. The supported HTTPS Management API was attempted and rejected the
write; the operator SQL Editor route is now the available alternative.
A separate encrypted Storage-only export
did succeed: four buckets, 28 objects, 7,431,276 bytes, matching before/after
inventories and authenticated local readback. Its data/key are private and
outside Git. It is a workspace copy only, not a durable offsite/database backup
or managed restore rehearsal. The user has waived the database backup prerequisite;
retain this evidence without starting more backup work.

## Compatibility and installation checks

The backup prerequisite is waived for this exact migration/target. Complete the
remaining checks before and after installation:

1. Verify the main dashboard reference and SQL connection target. Confirm the
   expected server/version and supported installer route. Token presence and a
   candidate role's catalog privileges are not proof of effective write access.
2. Recheck the canonical migration hash below. Do not generate replacement SQL,
   install unrelated migration history or use a destructive fixture script.
3. Run [commerce_preinstall_verify.sql](../../supabase/tests/commerce_preinstall_verify.sql)
   or equivalent read-only catalog checks through the supported API, and compare
   current state with the private pre-install evidence. Check proposed names,
   shared policies, managed ownership/custom policy privileges, triggers/event
   hooks and existing cron definitions. A collision requires investigation, not
   dropping an existing object to force success.
4. Submit only the exact reviewed transaction using the supported authorized
   connection. Do not use sample DDL/DML write probes or try to change/elevate a
   read-only role. If the official route rejects writes, report the exact
   sanitized denial and provide the SQL Editor alternative below.
5. After a successful COMMIT, run
   [commerce_verify.sql](../../supabase/tests/commerce_verify.sql) and compare
   existing schema/RLS/grants/functions/triggers/cron preservation evidence.
   Normal concurrent production changes are not proof of migration corruption;
   never alter business records to force hashes to match.

There is no verified database recovery artifact or restore rehearsal. The user
waived its prerequisite, not this fact or the preservation requirement. A catalog
snapshot, REST export, SQL Editor result or `pg_restore --list` alone is not full
recovery proof. [backup-recovery.md](backup-recovery.md) remains an optional
recovery-scope reference; its development examples must not be pointed at main.
Do not resume staging or backup preparation under this waiver.

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

These fallback commands are **not executed**. Use after compatibility checks, from
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
after the compatibility checks above if a supported cloud write route is
unavailable. The backup prerequisite has been explicitly waived for this exact
migration; do not repeat that gate or request the same approval. Do not run local bootstrap, checkout/concurrency test fixtures or
`test-commerce-db.mjs` on main. Actual production RLS/workflow compatibility is
not certified by a successful installation or past isolated tests.

## Rollback and evidence

If installation fails before COMMIT, verify transaction rollback and existing
state. After a committed installation, prefer application rollback while retaining
commerce orders/audit/users/media. Dropping tables/buckets/identities is not a
history-preserving rollback. Full/PITR restore can discard unrelated later
activity and needs its own reviewed recovery decision. No deployment, main merge,
payment or live-order permission follows automatically from SQL completion.

This runbook introduces no additional SQL migration. The feature uses the existing
foundation file above; the attempted API installation failed before schema
creation. A fresh `npm run build` passed with isolated development settings in
this continuation. [Prior test results](pr3-followup-report.md) remain historical
and do not certify main workflows. Full private catalog/function/cron/connection details stay out of
Git/public archives. Never print account tokens, DB URLs/passwords or row exports.
