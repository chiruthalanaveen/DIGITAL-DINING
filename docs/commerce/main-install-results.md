# Historical API installation attempt — 27 October 2026

**Superseded by the 31 October installation:** the user ran the reviewed SQL in
main SQL Editor. Independent read-only checks now verify the installed canonical
schema and permissions. Do not reapply the foundation. See
[main-postinstall-results.md](main-postinstall-results.md) for current results.
The rest of this document preserves the earlier failed API attempt.

Target: **table-pay** (`wispidcdmunqzahjacws`). Branch
`feature/client-websites-phase1`, draft [PR #3](https://github.com/chiruthalanaveen/DIGITAL-DINING/pull/3).

**PARTIAL PASS for verification; installation BLOCKED.** The user explicitly
waived the backup condition: “FORGET ABOUT THE BACKUP AND WORK FORWARD”. No backup
or repeated migration approval is requested. Deployment/promotion, main merge,
other migrations, live payments and live test fixtures remain outside this approval.

## Actual attempt and result

Fresh read-only main compatibility checks passed: PostgreSQL 17.6, eleven required
Auth/Storage columns, UUID/Auth functions, candidate installer privileges and no
commerce schema/table/RPC/policy/bucket collisions. Project metadata again
confirmed the exact main reference, name `table-pay` and `ACTIVE_HEALTHY`.

The complete reviewed
[20261022160000_commerce_foundation.sql](../../supabase/migrations/20261022160000_commerce_foundation.sql)
was submitted **once** through the documented official Management API:

```text
POST https://api.supabase.com/v1/projects/wispidcdmunqzahjacws/database/query
{"query":"<session timeouts followed by the complete canonical file>","read_only":false}
```

Session-only `lock_timeout=5s` and `statement_timeout=120s` preceded the unmodified
file. Its own BEGIN/COMMIT were retained; no role switch, read-only override,
unrelated DDL/DML, fixture script or deployment was added.

**FAIL: HTTP 400, SQLSTATE `25006`:**

```text
cannot execute CREATE SCHEMA in a read-only transaction
```

API identity checks report `supabase_read_only_user`. The failed DDL response
independently confirms a read-only transaction. Requesting the documented
`read_only:false` did not produce a writable session. The precise reason that
this connection remains read-only is not established. This is the current
installation blocker; backup is no longer a condition. No alternate endpoint,
role escalation, unverified TLS route or retry was used to evade the restriction.

## Verification after rejection

A fresh independent read-only catalog inspection confirms:

| Check | Result |
| --- | --- |
| Proposed commerce schema, relations, RPCs and policies | **Absent**; zero collisions after the attempt. |
| `commerce-media` bucket | **Absent**. |
| Existing catalog fingerprint/counts before versus after | **PASS, identical**. 131 relations, 1,602 columns, 644 constraints, 498 function fingerprints, 419 indexes, 49 policies, 754 triggers, 15 default ACLs, six event triggers. |
| Existing cron definitions before versus after | **PASS, identical**, two jobs; definitions stay private. |
| Migration committed | **No**. Rejection occurred at the first schema creation. No bucket or business-row write from the file ran. |
| `npm run build` | **PASS, exit 0**, fresh compilation/TypeScript with isolated synthetic development settings. |

Catalog fingerprints are not a full business-row backup or hosted workflow test.
No existing restaurant, delivery, resort, wallet, payment, customer or order-history
data was changed by this rejected migration. No live test users/orders, payments,
restore, deployment or merge were performed.

## Exact approved migration and installation route

The canonical file remains unchanged, SHA-256:

```text
dd2882f6329808783b1d4d97c4264f59989b7e834753aa06efe46d63855db1ca
```

It creates nine tables/103 columns, twelve functions, six explicit indexes plus
nineteen constraint indexes, fifteen policies and sixteen foreign keys. The only
top-level data write inserts the new `commerce-media` bucket. Function bodies are
created, not invoked. No existing business table/row/function or cron job is
replaced, deleted or rewritten. [migration-review.md](migration-review.md)
explains every object. Seven policies affect shared Storage authorization; five
Auth foreign keys can restrict future identity hard deletion.

The available operator route is the
[table-pay SQL Editor](https://supabase.com/dashboard/project/wispidcdmunqzahjacws/sql)
with a legitimate writable project session. Follow
[main-project-installation.md](main-project-installation.md): run the read-only
pre-install check, paste/run the **entire canonical migration once**, then run
the read-only post-install verification. Do not install local fixtures, split
the file, apply unrelated migration history with `supabase db push`, run role
escalation SQL or substitute another project. The backup condition is waived;
this route does not require another approval for the same file/target.

The general query endpoint does not automatically record the filename in
migration history. This failed attempt produced no new history record. Preserve
the established ledger and record installation evidence through its normal
reviewed process after a successful manual installation; do not invent a version
or repair history by rerunning unrelated migrations.

## Commands, evidence and limits

Executed:

```sh
python /workspace/commerce-validation-artifacts/main-install-waiver/refresh-main-preflight.py
python /workspace/commerce-validation-artifacts/main-install-waiver/apply-reviewed-foundation.py
python /workspace/commerce-validation-artifacts/main-install-waiver/after-attempt/verify-committed-catalog.py
git diff --check
```

The preflight and after-attempt programs were invoked by Python stdin wrappers
that captured private output. The application command was invoked directly; it
has an exclusive attempt record and no automatic retry. The build ran using:

```sh
node --input-type=module - > /workspace/commerce-validation-artifacts/main-install-waiver/build.log 2>&1 <<'JS'
import {spawnSync} from 'node:child_process'
import {developmentEnvironment} from './tests/helpers/commerce-fixture.mjs'
const r=spawnSync('npm',['run','build'],{env:developmentEnvironment(),stdio:'inherit'})
process.exit(r.status??1)
JS
```

Sanitized results: `apply-summary.json`, `preservation-summary.json` and build
output under `/workspace/commerce-validation-artifacts/main-install-waiver/`.
Full catalog/function/cron snapshots and raw API errors stay private outside Git.
No credentials or private exports belong in a public report.

Historical 82 Node tests, 88 local SQL assertions, 19 staging Auth checks and 64
screenshots were not rerun for these instruction/report changes. Hosted commerce
RLS, onboarding, product/cart/COD/tracking workflows and a Vercel Preview remain
unverified because the hosted module is not installed. Staging remains stopped
by user choice. Successful PIN recovery remains unavailable; complete provider
sandbox integration remains untested, and full lint retains the recorded 169
inherited errors/179 warnings. No production-ready claim is made.

No additional migration was created. The existing foundation migration is still
required. If an installation fails before COMMIT, verify no partial committed
objects before retrying. After successful installation, prefer application
rollback while retaining commerce history; dropping commerce objects is not a
data-preserving rollback. No database backup/PITR recovery point is established.
The prior encrypted 28-object Storage workspace copy is retained privately; it
is not a database backup or managed recovery rehearsal.
