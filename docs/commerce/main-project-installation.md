# Main-project installation — approved migration, backup still required

Updated 26 October 2026. Target: **table-pay** (`wispidcdmunqzahjacws`). Keep all
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

**No usable backup is available.** Full provider metadata has no completed backup
record or physical recovery range; PITR is off, and the user confirmed no external
backup. Catalog fingerprints are not a backup. The public API supports backup
listing/restoration but no supported public manual-create/download endpoint was
found. Internal-only restore-point operations and paid upgrades were not used.

The general Management SQL endpoint still returned a read-only role/transaction
for a SELECT-only request with `read_only:false`; its cause is unknown. Actual
DDL execution capability is not established. Do not probe writes before backup
or try to elevate the existing read-only session.

## Backup connection and client prerequisites

The supplied direct URI is retained and its hostname is published/allowed, but
DNS/pg connection returns `EAI_AGAIN` and proxy CONNECT to 5432 returns HTTP 403
before credentials. These observations do not identify an invalid password or a
proven IPv6 issue. Do not ask for the same URI, token or direct hostname again.

Official main pooler configuration supplies this actual hostname:

```text
aws-0-ap-south-1.pooler.supabase.com
```

Its user is `postgres.wispidcdmunqzahjacws`, database `postgres`. Use the documented
**Session port 5432** for backup clients. The API's transaction 6543 setting was not
changed and must not be used as a backup shortcut. Existing credentials can be
used for this same main database; do not paste or re-enter them unnecessarily.

An official PostgreSQL 17+ client is required; hosted server is 17.6. This Debian 13
workspace has compatible `libpq5` 17.11 and trusted Debian archive keys/tools, but
no `pg_dump`, `psql`, `pg_restore` or Supabase CLI. The official package is
`postgresql-client-17`; access to `deb.debian.org` is needed to retrieve and verify
signed repository metadata/package checksums before workspace-local extraction.
No unverified client artifact or system installation was used.

The environment configuration service returned `INVALID_ARGUMENT` for attempted
new host additions without a field-level reason. Do not loop unchanged saves.
Only missing exact entries should be added manually and published, preserving all
other settings:

```text
aws-0-ap-south-1.pooler.supabase.com
deb.debian.org
```

A later readback found the pooler hostname present in the editable draft, while
`deb.debian.org` remained absent. Check current draft/published state before
asking for another entry; do not repeat a completed user action. No claim is made
that an allowed route will work until the actual PostgreSQL connection succeeds.
Use the configured supported proxy route only, keep verified TLS and never guess
hosts, substitute external IPs, disable checks or create an ad-hoc SQL tunnel/RPC.

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
the verified trusted route with tracing off and secrets securely supplied:

```sh
psql "$COMMERCE_MAIN_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/commerce_preinstall_verify.sql
psql "$COMMERCE_MAIN_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/migrations/20261022160000_commerce_foundation.sql
psql "$COMMERCE_MAIN_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/commerce_verify.sql
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
output is `/workspace/commerce-validation-artifacts/main-release/build.log`;
[prior test results](pr3-followup-report.md) remain historical and do not certify
main workflows. Full private catalog/function/cron/connection details stay out of
Git/public archives. Never print account tokens, DB URLs/passwords or row exports.
