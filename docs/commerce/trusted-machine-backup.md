# Main backup from a trusted computer

Target: **table-pay** (`wispidcdmunqzahjacws`). These are prospective backup
instructions, not a report that a database backup exists. No SQL migration required for
this runbook. The existing commerce foundation migration remains pending its
backup and compatibility gate.

The cloud hostname settings and database credentials are already supplied. The
remaining cloud problem is PostgreSQL transport: the published proxy accepts
CONNECT but closes the PostgreSQL SSL request; direct TLS does not negotiate the
required PostgreSQL protocol. Re-entering the password or hostname will not fix
that result. Use a trusted computer that permits normal PostgreSQL connections.
Do not disable certificate verification or route around network controls.

## 1. Inspect supported dashboard backups first

Open [table-pay Database Backups](https://supabase.com/dashboard/project/wispidcdmunqzahjacws/database/backups).
Confirm the project reference before proceeding. Record a completed backup's
identifier, timestamp, retention and supported restore procedure if one is now
available. The last checked provider response had **no backups and PITR off**;
this runbook does not enable a paid feature, change the plan or create a recovery
point through an internal API. A dashboard backup still needs separate Storage
object-byte protection. Do not press Restore on the live project.

## 2. Prepare local tools and private storage

Install an official **PostgreSQL 17 client** using the
[PostgreSQL download instructions](https://www.postgresql.org/download/) for your
operating system. The server was verified as PostgreSQL 17.6; the cloud's verified
17.11 client cannot currently reach it. Do not use an older `pg_dump`. On Windows,
run the following Bash examples in a properly configured WSL environment, or have
the backup operator translate them to PowerShell before use.

Use a fresh directory on an encrypted disk/volume outside the checkout, cloud
sync folders and shared Downloads. Confirm that the volume is actually encrypted
and that the recovery operator can unlock it; `chmod` alone is not encryption.
Keep a second encrypted copy and its decryption/recovery key separately. Never
upload backups, passwords, keys, customer rows or complete function/cron exports
to this chat, GitHub or the PR.

In a fresh Bash terminal with tracing disabled, replace only the path below:

```sh
set +x
set -euo pipefail
umask 077
export COMMERCE_BACKUP_DIR='/path/on/encrypted-volume/table-pay-before-commerce'
mkdir -m 700 "$COMMERCE_BACKUP_DIR"
pg_dump --version
pg_dumpall --version
pg_restore --version
psql --version
```

`mkdir` deliberately fails if that directory already exists. Stop on that error
and choose a new directory; do not overwrite a previous backup. Confirm all four
client tools are version 17.x before continuing. Use current supported official
packages and the operating system's trusted CA certificates.

## 3. Make the database export without placing a password in shell history

In [table-pay Connect](https://supabase.com/dashboard/project/wispidcdmunqzahjacws),
select **Session pooler**, not Transaction pooler. Confirm that the dashboard
still shows the host/user below and port **5432**. Stop if it differs; verify the
new endpoint with the operator rather than guessing. The password is the database
password, entered only into each tool's hidden password prompt. Do not paste a
connection URI into a shell command.

```sh
export PGHOST='aws-0-ap-south-1.pooler.supabase.com'
export PGPORT='5432'
export PGUSER='postgres.wispidcdmunqzahjacws'
export PGDATABASE='postgres'
export PGSSLMODE='verify-full'
export PGSSLROOTCERT='system'
export PGCONNECT_TIMEOUT='15'
export PGAPPNAME='table-pay-approved-backup'
export PGOPTIONS='-c default_transaction_read_only=on -c lock_timeout=5000'
unset PGPASSWORD PGSERVICE PGSERVICEFILE PGHOSTADDR PGPASSFILE

psql --password -X -v ON_ERROR_STOP=1 -c "select current_database(), current_user, current_setting('server_version'), current_setting('transaction_read_only');"
psql --password -X -v ON_ERROR_STOP=1 -c "select ssl, version, cipher from pg_stat_ssl where pid = pg_backend_pid();"

pg_dump --password --format=custom --lock-wait-timeout=5s \
  --file="$COMMERCE_BACKUP_DIR/table-pay.dump.partial"
mv "$COMMERCE_BACKUP_DIR/table-pay.dump.partial" "$COMMERCE_BACKUP_DIR/table-pay.dump"

pg_dumpall --password --roles-only --no-role-passwords \
  --file="$COMMERCE_BACKUP_DIR/roles.sql.partial"
mv "$COMMERCE_BACKUP_DIR/roles.sql.partial" "$COMMERCE_BACKUP_DIR/roles.sql"

pg_restore --list "$COMMERCE_BACKUP_DIR/table-pay.dump" \
  > "$COMMERCE_BACKUP_DIR/table-pay.contents.private.txt"
sha256sum "$COMMERCE_BACKUP_DIR/table-pay.dump" "$COMMERCE_BACKUP_DIR/roles.sql" \
  > "$COMMERCE_BACKUP_DIR/database.sha256"
sha256sum --check "$COMMERCE_BACKUP_DIR/database.sha256"
```

`PGSSLROOTCERT=system` requires PostgreSQL 17 and its configured system trust
store. If certificate/hostname verification fails, stop and use the provider's
supported certificate setup; do not change `verify-full` to `require` or disable
checks. Confirm SSL is true and the identity/version are expected before dumping.
These commands request read-only sessions and do not install the migration.

The full custom dump intentionally has **no schema/table/data exclusions**. It
uses one consistent database snapshot and retains schema, data, owners and ACLs
that the connected role is allowed to export. Auth tables, Storage metadata,
application/migration history and relevant cron/extension definitions must be
present or have a documented supported supplemental export. If either dump fails,
retain the private error for the operator and stop. A partial file, missing grant,
managed-schema exclusion or empty Auth export is not a complete backup. Do not
remove a failing table, change RLS or escalate roles to make the command pass.

The roles export omits passwords intentionally. It does not back up custom LOGIN
passwords, Supabase platform keys, Vault encryption-root material or external
provider secrets. Preserve those using their supported secret-recovery process.
Do not restore roles over Supabase-managed roles without a reviewed compatible
restore plan. `pg_restore --list` confirms archive readability, **not** that every
row/object can be restored to a managed Supabase project.

## 4. Export Storage bytes and operational settings separately

A separate cloud HTTPS export has now protected **28/28 objects across four
buckets (7,431,276 bytes)** as encrypted files, with matching before/after
inventories and successful authenticated local readback. Its separate key and
data remain private outside Git. This is only a workspace copy, with no durable
offsite copy or managed restore rehearsal. It does not supply the missing
database backup. A recovery operator must secure durable encrypted copies/key
custody and repeat the inventory if the live source has changed. See the
[current results](main-preflight-results.md) for the exact scope.

Database backups contain Storage metadata, not file contents. The last read-only
inventory found four buckets and 28 objects (7,431,276 known bytes), with objects
in three buckets. These are historical comparison counts, not numbers to force
onto a live, changing system.

Use a supported Storage backup/export tool or the official Supabase client on
the same trusted computer. Have the operator perform these steps before calling
the backup complete:

1. List every bucket, including private and empty buckets, and record its settings.
2. Paginate and recurse through every folder until every object has been listed.
   Download original bytes with the main project's service credential held in the
   local secret manager/process only. Write all files to the encrypted backup
   volume. This is a **read/list/download-only** job: no destination project,
   uploads, bucket creation, updates or deletes.
3. Create a private manifest containing bucket ID, exact object path, available
   object/version metadata, downloaded byte length and SHA-256. Encode names safely;
   object names must not become paths outside the backup directory. Report every
   failed listing/download and verify hashes by rereading the saved files.
4. List again and reconcile additions/changes/deletions. A changing database and
   object store do not share a snapshot; record their time window and resolve
   mismatches. Do not delete live objects to obtain matching counts. If an
   atomic cross-service recovery point cannot be established, record that limit.
5. Preserve Auth provider/redirect/email configuration, Vercel environment scopes,
   Storage policies, DNS, approved cron definitions and external webhook/scheduler
   settings privately. Do not run or enable copied jobs/webhooks during verification.

The [official Storage migration example](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore#migrating-storage-objects)
illustrates listing and downloading, but its complete script also **uploads to a
new project**. Do not run that migration script for this read-only backup. An
operator must supply a reviewed read-only export implementation with pagination,
checksums and the consistency checks above. A download of public product images
alone does not cover private customer documents or all existing buckets.

## 5. Verify recovery before installation

Keep a private release record with the source reference/version, UTC export start
and finish, app commit, migration SHA-256, command exit statuses, backup hashes,
Storage manifest totals, supplemental configuration exports, encryption/key
custody and recovery limitations. Confirm the second encrypted copy can be read
by the recovery operator. Share only sanitized completion status and checksums;
do not send the archive or its keys through chat.

A complete managed restore rehearsal requires a **separate disposable recovery
project**, compatible Supabase versions/roles and explicit authorization. The user
currently chose main only, so that rehearsal has not run and must not be replaced
by restoring onto table-pay. A generic PostgreSQL restore cannot prove Supabase
Auth/Storage compatibility. Do not import production data into public development
fixtures. Restrict recovery-target access and disable outbound cron, email,
payment and webhook activity before loading sensitive backups.

Review [backup-recovery.md](backup-recovery.md) for the complete restoration scope.
Only after the backup/recovery artifact and compatibility gate are accepted does
[main-project-installation.md](main-project-installation.md) describe the
previously approved migration. This runbook does not authorize a production
restore, deployment, merge, additional SQL migration or live payment.

If installation fails before COMMIT, verify transaction rollback. If the
application later fails, prefer reverting the application while preserving the
additive commerce schema and history. Do not drop commerce objects or restore an
old full backup automatically: a full recovery can discard unrelated restaurant,
delivery, resort, wallet, payment, customer and cron activity committed afterward.
