# Main-project installation — verified installed

Updated 31 October 2026. Target: **table-pay** (`wispidcdmunqzahjacws`), PostgreSQL
17.6. Keep changes on draft PR #3 / `feature/client-websites-phase1`.

The user reported running the reviewed foundation in the main SQL Editor.
Read-only verification now confirms installation. **Do not run the migration
again, ask the user to run it again or resume backup preparation.** The user
waived the backup prerequisite on 27 October. No additional migration or repeated
credential entry is needed for this verification update.

## Current verification

[main-postinstall-results.md](main-postinstall-results.md) is the current report.
The installed module matches an independently installed canonical local fixture:

| Check | Verified main result |
| --- | --- |
| Tables and columns | Nine commerce tables, 103 columns; compared types, defaults and definitions match. |
| Functions | Twelve functions; grants/security settings match. All twelve body hashes match after CRLF-to-LF normalization only. |
| Policies, indexes and constraints | Fifteen policies, 25 indexes and 81 constraints; compared definitions and expressions match. |
| Constraint triggers | 54 on commerce tables plus ten Auth FK triggers. No custom application trigger was added by the migration. |
| Existing metadata | All prior compared catalog records, four prior bucket settings and two cron definitions remain unchanged. |
| Hosted read-only REST | Eleven checks pass: nine anonymous raw-table reads rejected with HTTP 401 / SQLSTATE 42501, missing-slug catalog returns 200/null, service-role GET with limit zero returns 200. |
| Fresh local checks | `npm test`: 82/82; isolated PostgreSQL suite: 88 assertions; `npm run build`: PASS. |

These checks establish installation/catalog compatibility and specified access
denials. They do not establish actual owner/customer sessions, cross-tenant hosted
RLS workflows, live checkout behavior or a managed recovery rehearsal. No live
test identities/orders, business-row writes, payments or production deployment
were used for verification. Staging remains stopped by user choice.

The old 27 October API request was rejected with HTTP 400 / SQLSTATE `25006`
(`cannot execute CREATE SCHEMA in a read-only transaction`). That attempt is
historical; the user's SQL Editor installation resolves the schema-installation
blocker. Do not retry it or try to elevate a read-only session.

## Canonical source and migration history

Complete reviewed source:
[20261022160000_commerce_foundation.sql](../../supabase/migrations/20261022160000_commerce_foundation.sql).
Its SHA-256 remains:

```text
dd2882f6329808783b1d4d97c4264f59989b7e834753aa06efe46d63855db1ca
```

[migration-review.md](migration-review.md) explains every new table, column,
function, index, policy and foreign key. Installation does not update/delete
existing business rows or call an existing wallet/payment/cron procedure. Seven
policies affect shared Storage authorization, and five Auth foreign keys can
restrict future identity hard deletion. Those compatibility effects remain
relevant after installation.

The read-only history check found **no
`supabase_migrations.schema_migrations` table**. SQL Editor execution does not
establish a synchronized CLI migration ledger. No history table/record was
created or repaired by this work. Plan a reviewed baseline before a future CLI
migration workflow; do not use `supabase db push`, replay this file or run
unrelated historical migrations to force a ledger into place.

## Installed-state verification

Use read-only catalog/REST verification only. The checked-in
[commerce_verify.sql](../../supabase/tests/commerce_verify.sql) describes the
post-install grant, policy, bucket and invariant inspection. Its data-returning
sections can contain private operational identifiers; keep full output outside
Git/public reports. The current hosted checks use safe summaries and metadata,
with no role/JWT impersonation or live fixtures.

The older
[commerce_preinstall_verify.sql](../../supabase/tests/commerce_preinstall_verify.sql)
is a historical pre-install inventory. It will now report installed commerce
objects as collisions; that is expected and is **not** a reason to drop objects
or rerun the foundation. Never point bootstrap, checkout/concurrency fixtures,
`test-commerce-db.mjs` or browser fixtures at this hosted project.

## Historical installation commands — DO NOT RERUN on installed main

The following commands document the earlier installation route only. They were
not executed by the cloud against main; the user completed SQL Editor execution.
The foundation is one-time and already installed. **Do not run this block.**

```text
PGOPTIONS='-c default_transaction_read_only=on -c lock_timeout=5000' psql -W -X -v ON_ERROR_STOP=1 -f supabase/tests/commerce_preinstall_verify.sql
PGOPTIONS='-c lock_timeout=5000 -c statement_timeout=120000' psql -W -X -v ON_ERROR_STOP=1 -f supabase/migrations/20261022160000_commerce_foundation.sql
PGOPTIONS='-c default_transaction_read_only=on -c lock_timeout=5000' psql -W -X -v ON_ERROR_STOP=1 -f supabase/tests/commerce_verify.sql
```

The source retains its own BEGIN/COMMIT. A one-time reapplication is expected to
fail on the existing schema; it is not a repair or harmless readiness check.
Do not split the SQL, suppress conflicts, remove existing objects, rewrite the
reviewed file or wrap competing transactions to force success.

## Release hold, rollback and retained evidence

Installation does not authorize production deployment/promotion, merge into main,
other migrations, live test users/orders or payments. Retain PR #3 draft status
and the branch's Vercel automatic deployment guard. Real hosted authentication,
tenant workflows and legacy/provider integration limits are listed in the
[current report](main-postinstall-results.md).

After a committed installation, prefer application rollback while retaining
commerce orders, audit history, users and media. Dropping commerce tables/buckets
or identities is not a data-preserving rollback. A full/PITR recovery could discard
unrelated later activity and requires its own reviewed recovery decision. No
database backup or managed restore rehearsal is established. The prior encrypted
28-object Storage workspace copy stays private with its separate key; it is not
a database backup. Older backup runbooks are optional references, not a current
work item or installation prerequisite.

**No SQL migration required.** This update verifies the existing installed
foundation without adding schema changes. Exact fresh commands, sanitized
results, preservation limits and remaining risks are in
[main-postinstall-results.md](main-postinstall-results.md). Never publish full
catalog/function/cron exports, customer data, database URLs/passwords, tokens or
backup keys.
