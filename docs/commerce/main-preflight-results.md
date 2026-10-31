# Historical main preflight and backup investigation — 26–27 October 2026

**Superseded installation status:** the user waived the backup condition and
subsequently ran the reviewed SQL in main SQL Editor. The 31 October read-only
checks verify the foundation is installed. Do not reapply it. Use
[main-postinstall-results.md](main-postinstall-results.md) for current results.
The rest of this document records the earlier backup investigation.

Target: `table-pay` (`wispidcdmunqzahjacws`). Branch:
`feature/client-websites-phase1`; draft [PR #3](https://github.com/chiruthalanaveen/DIGITAL-DINING/pull/3).

**PARTIAL PASS. No migration/DDL/DML, business-data writes, database backup,
restore, live test user/order, payment, main merge or deployment occurred.**
A separate encrypted Storage-only workspace copy succeeded as detailed below.
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

## Backup transport — confirmed cloud limitation

The required pooler and Debian hosts are now published/allowed. No additional
hostname entry, password reset or token re-entry is presently needed. The
earlier HTTP 403 and unsaved-draft observations are superseded by these results:

| Check | Actual result |
| --- | --- |
| Direct PostgreSQL DNS | `EAI_AGAIN`; no direct connection established. |
| Configured proxy CONNECT to the verified main Session pooler, port 5432 | HTTP **200** after publication. This alone does not establish PostgreSQL transport. |
| Standard PostgreSQL SSLRequest through the configured proxy and local-only adapter | **EOF** on both paths, before database authentication. |
| Verified TLS-direct diagnostic, requesting ALPN `postgresql` | TLS 1.3 handshake succeeds with a proxy-issued certificate, but **no ALPN is selected** on either path. This is not verified PostgreSQL routing. No credentials/startup/SQL were sent by these diagnostics. |
| `psql` read-only identity attempt, `sslmode=verify-full` | **FAIL, exit 2**, connection closes before successful authentication or SQL. No business writes. |
| Official `pg_dump`, `pg_dumpall`, `pg_restore`, `psql` | **PASS: 17.11**, compatible with main PostgreSQL 17.6. Debian signatures, package-index and package SHA-256/size were verified before workspace-local extraction; system packages were not changed. |
| Local adapter / encryption / Storage export helper checks | **8/8, 11/11 and 20/20 synthetic tests pass** respectively. These do not establish main system recovery. Their fixture keys/data are separate from the real Storage-only export below. |

The exact verified pooler is `aws-0-ap-south-1.pooler.supabase.com`, Session port
5432, user `postgres.wispidcdmunqzahjacws`. Its transaction-pooling settings were
not changed. PostgreSQL 17's official protocol documentation requires ALPN
`postgresql` for direct TLS. A generic intercepted TLS handshake without that
negotiation is insufficient; authentication was not attempted on that route.
These findings identify a cloud transport limitation, not an invalid password or
proof that Supabase is down. No route that disables TLS or bypasses network
controls was used. The temporary local adapter is not a retained startup service.

The concrete alternative is a trusted operator computer with supported
PostgreSQL networking. Follow [trusted-machine-backup.md](trusted-machine-backup.md)
to make a private complete logical database backup and record recovery checks.
Do not substitute a catalog snapshot, REST export or archive listing for a
recoverable backup. Migration remains on hold until the backup gate passes.

## Separate Storage copy — PASS within its limited scope

The supported main HTTPS Storage API worked independently of PostgreSQL. Only
bucket/object listing and original-byte download routes were used; there were no
uploads, updates, deletes, new buckets or live test files.

- All **four buckets** were inventoried, including the empty bucket. **28/28
  objects, 7,431,276 bytes** were downloaded and immediately encrypted as opaque
  local filenames. Original names, settings and source metadata are in the
  encrypted manifest only. No plaintext payload file was written.
- AES-256-GCM key is a separate mode-0600 file outside the mode-0700 backup
  directory. The data/key stay outside Git and public evidence archives.
- Before/after inventories matched. Every object's size, encrypted/plaintext
  SHA-256 and GCM authentication passed local readback; the encrypted manifest
  passed authentication too. An independent local verification reread all 28
  encrypted objects and checked their manifest digests without remote requests.
- Manifest encrypted SHA-256:
  `7e7d7691d62c44dcebd58ef8c26de54c02db9b9f77c8d3a62a1163eb135fa4f5`.
- **This is a workspace Storage copy only.** No database/Auth-row backup, offsite
  durable copy, managed restore rehearsal or atomic database/Storage recovery
  point exists. Separate key placement is not offsite key custody. A trusted
  recovery operator must secure durable encrypted copies and recovery access.

Private output is under `/workspace/secure-backups/table-pay/`; its key-location
record stays in the separate private tools directory. Do not upload either to
chat/GitHub or treat this Storage result as permission to skip the database backup.

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

Private evidence is under `/workspace/commerce-validation-artifacts/main-release/`,
`main-backup-attempt/` and `main-project-review/official-backup-research/`. Full function definitions,
connection metadata, bucket metadata, cron definitions and catalog snapshots must
remain outside Git/public evidence archives. Only sanitized summaries, counts,
hashes and status codes may be shared.

Executed checks included:

```sh
python /workspace/commerce-validation-artifacts/main-project-review/check-main-management.py
python /workspace/commerce-validation-artifacts/main-release/run-readonly-catalog.py
python /workspace/.commerce-validation-tools/main-backup-network/test_relay.py
python /workspace/.commerce-validation-tools/main-backup-network/test_backup_crypto.py
python /workspace/.commerce-validation-tools/main-backup-network/test_backup_storage.py
python /workspace/commerce-validation-artifacts/main-backup-attempt/check-transport-tls.py
git diff --check
```

The main Storage export and independent local verification were executed with
`python -` heredocs. Their exact stdin programs/commands are recorded in
`main-backup-attempt/storage-export-executed.sh` and
`main-backup-attempt/storage-verification-executed.sh`, alongside the sanitized
`storage-main-backup-summary.json` and `storage-local-verification.json` results.
These records contain no credentials or actual backup-key bytes. They are
execution records, not instructions to rerun a production export blindly.

The Management checker ran two fixed GET requests; metadata SQL queries used the
fixed main endpoint and SELECT-only statements. The installer identity exception
also used SELECT only. No mutating SQL was tested. Official API/schema references:
[Management OpenAPI](https://api.supabase.com/api/v1-json),
[Supabase backups](https://supabase.com/docs/guides/platform/backups), and
[backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
PostgreSQL's [protocol TLS section](https://www.postgresql.org/docs/17/protocol-flow.html#PROTOCOL-FLOW-SSL)
documents the direct-TLS ALPN requirement.

Fresh `npm run build` **PASS (exit 0)**, including compilation and TypeScript,
with synthetic loopback development credentials using the following wrapper;
its output is recorded in
`main-backup-attempt/build.log`. Existing main environment variables are excluded
by `developmentEnvironment()`:

```sh
node --input-type=module - > /workspace/commerce-validation-artifacts/main-backup-attempt/build.log 2>&1 <<'JS'
import {spawnSync} from 'node:child_process'
import {developmentEnvironment} from './tests/helpers/commerce-fixture.mjs'
const r=spawnSync('npm',['run','build'],{env:developmentEnvironment(),stdio:'inherit'})
process.exit(r.status??1)
JS
```

Only documentation/instructions changed in this update. The 82 Node tests,
88 local SQL assertions and browser screenshots were not rerun; their historical
results and unresolved lint/provider/PIN/hosted-workflow limits above still apply.
