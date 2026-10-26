# Main-project preflight results — 26 October 2026

Target: `table-pay` (`wispidcdmunqzahjacws`). Branch:
`feature/client-websites-phase1`; draft [PR #3](https://github.com/chiruthalanaveen/DIGITAL-DINING/pull/3).

**PARTIAL PASS. No migration/DDL/DML, business-data writes, backup creation,
restore, live test user/order, payment, main merge or deployment occurred.**
Read-only SQL/catalog checks did run on main through the official Management API.
The reviewed foundation migration remains approved only after backup and
compatibility checks; the approval is not being requested again.

## Verified main access and compatibility

- Account token works: main project metadata and backup metadata return HTTP 200;
  project name `table-pay`, region `ap-south-1`, status `ACTIVE_HEALTHY`.
- Read-only SQL returns HTTP 201, PostgreSQL 17.6, effective
  `supabase_read_only_user`, `transaction_read_only=on`.
- Required eleven Auth/Storage columns, UUID and `auth.uid()` functions exist.
  No proposed private schema, public table/RPC/policy or image-bucket collision
  was found. Four pre-existing Storage buckets were inventoried privately.
- The candidate `postgres` installer role has database/schema creation, Auth
  SELECT/REFERENCES and bucket SELECT/INSERT permissions. It does not own
  `storage.objects`, but live `supautils.policy_grants` explicitly permits its
  policy operations there. No existing `storage.objects` policies were reported;
  that removes the earlier ownership-only concern but is not an upload/RLS test.
- Private catalog preservation evidence records 131 relations, 1,602 columns,
  644 constraints, 498 function fingerprints,419 indexes, 49 policies, 754 triggers,
  15 default ACLs and six event triggers. Two cron definitions were captured
  privately. No cron command or business-row content is included in this report.
- A SELECT-only identity request to the general SQL endpoint with literal
  `read_only:false` still returned the read-only role/transaction. The request
  body and endpoint were independently checked. Its cause is unknown and no
  write/role-escalation probe was attempted. **Actual DDL capability is not
  established**, even though the candidate role's catalog privileges exist.

These checks are useful compatibility evidence, not proof of RLS isolation,
Storage upload behavior, full production workflows or complete data preservation.
Private catalog snapshots/fingerprints are not a restorable backup.

## Backup gate — not satisfied

The full available provider backup metadata returns:

```text
backups: []
pitr_enabled: false
walg_enabled: true
physical_backup_data: {}
```

No completed backup or recoverable physical range is demonstrated. The user
confirmed **no external backup exists**. The first metadata-only checker omitted
WAL/physical-range fields; those fields were subsequently inspected separately
before reaching this conclusion.

Official public Supabase API documentation exposes backup listing/restoration,
not a supported public manual-create/download API. Internal-only restore-point
operations were not used. Official documentation recommends a Supabase CLI/
`pg_dump` logical backup for manual backups. No plan upgrade/PITR activation was
performed. Actual managed-backup availability must not be inferred from a general
plan description, and a schema-only/result/REST export is not a complete backup.

## Supported backup route still being prepared

The supplied direct main URI is correctly shaped and the direct hostname is
published/allowed, but direct DNS/pg connection returns `EAI_AGAIN`; proxy CONNECT
to port 5432 returns HTTP 403 before PostgreSQL bytes or credentials.

Official main-project pooler metadata supplies the actual host
`aws-0-ap-south-1.pooler.supabase.com` and username
`postgres.wispidcdmunqzahjacws`. The API reports transaction 6543 configuration;
the documented session listener on the same verified host uses 5432 for backups.
No transaction-pooler backup or configuration/password change was attempted.
The session hostname is not yet allowlisted. A pre-allowlist probe failed DNS
and proxy CONNECT; this does not establish what an allowed route will do.

A PostgreSQL 17+ backup client is also required. This workspace has Debian 13,
`libpq5` 17.11 and trusted Debian archive keys/tools, but no `pg_dump`, `psql`,
`pg_restore` or Supabase CLI. The compatible official package is
`postgresql-client-17`; `deb.debian.org` repository access is currently denied by
the proxy. No unverified binary, disabled TLS/checksum verification or system
installation was used.

The configuration service rejected both attempted exact-host additions with
`INVALID_ARGUMENT` and no named field; immediate readback showed neither saved.
A later readback found the pooler hostname present in the editable draft, with
`deb.debian.org` still absent. Publication/actual connection remain unverified. An operator must add only the missing required entries in environment
settings and publish, preserving existing entries:

```text
aws-0-ap-south-1.pooler.supabase.com
deb.debian.org
```

The direct main URI/token need no re-entry. After the backup route works, obtain
and verify the official client using signed repository metadata/checksums,
take a consistent private database/Auth/Storage-metadata backup, back up Storage
bytes separately and verify recovery access before migration. Do not substitute
IP addresses, guess pooler regions, expose an ad-hoc SQL proxy, disable TLS or
remove required tables from a failed backup. If cloud routing remains unavailable,
use a trusted operator machine with the official client, following
[main-project-installation.md](main-project-installation.md).

## Remaining checks and safety boundary

- Full hosted tenant RLS, real commerce onboarding/product/cart/COD/tracking and
  provider workflows remain unrun. No production fixture writes were substituted.
- Actual main SQL reset functions were inspected read-only. Their argument shapes
  and source show that recovery/session behavior needs review; current PIN
  unavailability remains. A proposed local concurrency reproduction did not
  complete after its tool reported a cybersecurity-risk flag. Race behavior is
  therefore unverified; no PIN SQL hardening migration or production reset was
  applied under the separate foundation approval.
- Earlier 82 unit tests, 88 local SQL assertions, 19 staging Auth checks and 64
  browser screenshots remain historical evidence in [pr3-followup-report.md](pr3-followup-report.md).
  Staging work remains stopped. Fresh build results are reported separately.
- No SQL migration required for this documentation/read-only review. The existing
  [foundation migration](../../supabase/migrations/20261022160000_commerce_foundation.sql)
  remains unchanged at SHA-256
  `dd2882f6329808783b1d4d97c4264f59989b7e834753aa06efe46d63855db1ca`.

## Evidence and commands

Private evidence is under `/workspace/commerce-validation-artifacts/main-release/`
and `main-project-review/official-backup-research/`. Full function definitions,
connection metadata, bucket metadata, cron definitions and catalog snapshots must
remain outside Git/public evidence archives. Only sanitized summaries, counts,
hashes and status codes may be shared.

Executed checks included:

```sh
python /workspace/commerce-validation-artifacts/main-project-review/check-main-management.py
python /workspace/commerce-validation-artifacts/main-release/run-readonly-catalog.py
git diff --check
```

The Management checker ran two fixed GET requests; metadata SQL queries used the
fixed main endpoint and SELECT-only statements. The installer identity exception
also used SELECT only. No mutating SQL was tested. Official API/schema references:
[Management OpenAPI](https://api.supabase.com/api/v1-json),
[Supabase backups](https://supabase.com/docs/guides/platform/backups), and
[backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
