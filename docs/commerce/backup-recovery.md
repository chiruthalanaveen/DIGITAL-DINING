# Database backup, recovery and rollback plan

**Plan only: no production backup, SQL, restore or data export was executed.** No
backup artifact is claimed to exist. The production project
`wispidcdmunqzahjacws` remains outside migration/restore authorization. The SQL
under review is
[`20261022160000_commerce_foundation.sql`](../../supabase/migrations/20261022160000_commerce_foundation.sql).
Use the same plan first on the separate staging project, rehearse recovery there,
and review the results before requesting any later production approval.

## Recovery objectives and ownership

Record a named release operator, backup custodian and recovery approver. Agree on
the acceptable recovery-point objective (RPO, how much committed activity could
be lost) and recovery-time objective (RTO, tolerated downtime). No RPO/RTO or
backup retention has been verified for the current Supabase plan. Record UTC
timestamps, project reference, database version, app commit, migration checksum,
backup identifiers, encryption/key location, restore duration and verification
results in a private release record. Do not put customer exports, credentials or
secret-bearing function/cron definitions into Git or a public PR.

## Establish a restorable backup before an approved rollout

1. In the verified project's Supabase **Database → Backups** dashboard, inspect
   the actual plan, available backup timestamps, retention and restore options.
   Do not assume that a free project has managed daily backups or that PITR is
   enabled. Supabase documents daily backups for paid plans and PITR as a separate
   capability subject to plan/compute requirements. Record the chosen snapshot
   or available recovery point; verify it precedes installation. Confirm its
   restore procedure and permissions before proceeding.
2. Take a logical export where supported as an additional portable recovery
   artifact. A database export includes sensitive Auth and business information.
   Use a development-only database connection securely supplied as
   `COMMERCE_STAGING_DATABASE_URL`; do not paste the URL into chat or Git. Use a
   secure backup destination outside the repository with restrictive access and
   approved encryption. The following are staging-only command templates from
   Supabase's documented CLI backup flow, not commands executed in this task:

   ```sh
   umask 077
   mkdir -p "$COMMERCE_BACKUP_DIR"
   supabase db dump --db-url "$COMMERCE_STAGING_DATABASE_URL" -f "$COMMERCE_BACKUP_DIR/roles.sql" --role-only
   supabase db dump --db-url "$COMMERCE_STAGING_DATABASE_URL" -f "$COMMERCE_BACKUP_DIR/schema.sql"
   supabase db dump --db-url "$COMMERCE_STAGING_DATABASE_URL" -f "$COMMERCE_BACKUP_DIR/data.sql" --use-copy --data-only -x storage.buckets_vectors -x storage.vector_indexes
   sha256sum "$COMMERCE_BACKUP_DIR/roles.sql" "$COMMERCE_BACKUP_DIR/schema.sql" "$COMMERCE_BACKUP_DIR/data.sql"
   ```

   Set `COMMERCE_BACKUP_DIR` to a new, access-controlled directory and record the
   installed CLI version. Ensure the target project reference is staging before
   running these commands. The three separate commands do not form one shared
   database snapshot; plan a consistent export window without concurrent schema
   changes and reconcile business activity. A verified managed backup/PITR point
   is preferable when a consistent production recovery point is required.
   The documented vector-table exclusions are not permission to discard vector
   Storage data: if vector buckets/indexes are in use, inventory and export them
   through the supported service-specific recovery procedure as well. A backup
   that omits a used subsystem is incomplete, even if these commands succeed.
   Export `supabase_migrations` history separately if the project's workflow uses
   it. The current repository did not previously contain the hosted migration
   history, so do not reconstruct or overwrite it by assumption.
   In the reviewed official CLI implementation, the default `--data-only` dump
   deliberately includes Auth table rows and Storage metadata rows; it excludes
   platform migration tables such as `auth.schema_migrations`,
   `storage.migrations` and `supabase_functions.migrations`, and several internal
   schemas. This behavior must be rechecked for the installed CLI version and
   any supplied schema/table exclusions. Inspect the private export manifest and
   compare Auth/Storage row counts during the restore rehearsal; a successful
   exit status alone does not establish complete Auth coverage.
3. Preserve custom Auth/Storage schema changes separately. The CLI's standard
   schema dump excludes managed schemas including `auth`, `storage` and `cron` by
   default, so it does not back up their custom policies, triggers or grants as
   normal application DDL. The data dump's inclusion of Auth/Storage rows does
   not recreate those definitions. Capture the definitions/grants
   below and review a staging Auth/Storage schema diff using the project's
   established Supabase migration workflow. Verify all custom changes are present
   in the restore rehearsal. Custom LOGIN-role passwords are not recoverable
   from the standard backup; keep approved secret-management records and reset
   them through the supported process when needed.
4. Back up **Storage object bytes separately** through the supported Storage API
   or an existing approved backup integration. Database backups include Storage
   metadata, not image/file contents. Inventory every relevant bucket, object
   path, size, MIME type, version/ETag where available and a checksum of downloaded
   bytes. Use paginated/recursive listings; record permission errors and retry
   changed objects until the manifest is consistent. Preserve existing bucket
   configuration/policies as well as new `commerce-media` images. Confirm the
   restore destination will not overwrite unrelated objects. Encrypt object
   exports and restrict access just like the database backup.
5. Preserve operational configuration separately: staging/production Vercel
   environment scopes, secret-manager entries, Auth email/redirect/provider
   configuration, Storage configuration, DNS/verified-domain records, relevant
   external scheduler settings, webhook endpoints, extension versions and approved
   scheduled-job definitions. Database rollback does not reverse provider state,
   send/unsend emails or reconcile transactions at a payment provider. Do not
   export production secrets into the preview or into this report. If the project
   uses Vault/encrypted database columns, follow Supabase's supported key-recovery
   procedure; a database backup alone may not restore the encryption root key.
6. Check export hashes and decryptability, store copies under the approved
   retention/access policy, and confirm access from the recovery operator's
   account. An untested dump is not a verified backup. Do not delete a Supabase
   project as a rollback; that can also delete its managed backups.

Supabase references:
[database backups](https://supabase.com/docs/guides/platform/backups) and
[CLI backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
The managed-schema/data distinction was also checked in the official CLI
[dump implementation](https://github.com/supabase/cli/blob/cad09571874a22db60da5ecbfcc047bf35cf6e0a/apps/cli-go/pkg/migration/dump.go)
and its embedded schema/data dump scripts. This source review is not a backup
execution or a successful restore rehearsal.
Current plan availability must be checked in the actual dashboard rather than
inferred from these general product capabilities.

## Read-only definition inventory

Run these queries through a secure connection to the independently verified
**staging** project. Save results outside Git before installation and repeat after
installation. The queries read catalog/configuration information only; they do
not prove the environment is staging, so verify the project reference separately.
The role needs sufficient catalog visibility. Keep complete definition snapshots
private because function bodies, policies or job commands may contain secrets.

```sql
begin transaction read only;

select current_database(), current_user, host(inet_server_addr()), version();

-- Existing table ACLs and RLS flags, excluding the expected new commerce tables.
select n.nspname as schema_name, c.relname, c.relacl,
       c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r','p') and n.nspname in ('public','auth','storage')
  and not (n.nspname = 'public' and c.relname like 'commerce\_%' escape '\')
order by 1,2;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname in ('public','auth','storage')
order by schemaname, tablename, policyname;

-- Include internal triggers: new Auth FK triggers are expected additions.
select n.nspname, c.relname, t.tgname, t.tgisinternal,
       pg_get_triggerdef(t.oid) as trigger_definition
from pg_trigger t join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public','auth','storage')
order by 1,2,3;

select n.nspname, c.relname, co.conname, co.contype,
       pg_get_constraintdef(co.oid) as constraint_definition
from pg_constraint co join pg_class c on c.oid = co.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public','auth','storage') order by 1,2,3;

-- Fingerprints avoid printing full function bodies; retain a secure schema dump too.
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       p.proacl, p.prosecdef, p.proconfig,
       md5(pg_get_functiondef(p.oid)) as definition_fingerprint
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','auth','storage') and p.prokind in ('f','p')
order by 1,2,3;

select pg_get_userbyid(d.defaclrole) as owner_role,
       n.nspname as schema_name, d.defaclobjtype, d.defaclacl
from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
order by 1,2,3;

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets order by id;

select to_regclass('cron.job') as cron_job_table;
commit;
```

If `cron.job` exists and the approved role can read it, separately save
`SELECT jobid, schedule, command, active FROM cron.job ORDER BY jobid;` in the
secure inventory. Job commands can contain credentials. If visibility is denied,
report the missing verification; do not disable policies or increase privileges
blindly. Compare runtime sentinel balances/order counts using synthetic staging
fixtures, not exported production customer/wallet rows as test data.

Expected after-install differences are the new commerce objects, the new bucket,
seven `commerce_media_*` policies on `storage.objects`, and the Auth-side internal
triggers for the five new foreign keys. Existing definitions must retain their
values; all other differences require investigation. Run the module's additional
[read-only verification queries](../../supabase/tests/commerce_verify.sql).

## Rehearse recovery on a separate development project

Use a newly created, positively identified disposable **Supabase staging recovery
project** with no users or financial data that need preservation. Follow the
supported Supabase restore workflow for the source/target database versions and
managed roles. Restore roles/schema/data in the documented order, review managed
schema differences, and restore Storage bytes from the matching manifest. Do not
copy production keys or bind a live payment webhook to the restored test project.
Do not run this rehearsal against the source project or production.

After restoring, explicitly compare source/target `auth.users`, `auth.identities`
and other required Auth table row counts and identity links, as well as Storage
bucket/object metadata counts. Verify all needed Auth/Storage tables are present
in the private export and restored target; investigate every omitted table.
Compare schema/RLS/grants/triggers, account and tenant relations,
wallet/transaction/order fixtures, cron definitions and Storage object checksums.
Verify restored development Auth sign-in and recovery, both legacy and commerce
ownership permissions, application approval, media upload/read, product edits,
cart/checkout, once-only stock changes and order history. Use sandbox/disabled
payment integrations. Test a shared legacy/commerce Auth identity's deletion
preflight without deleting retained commerce history. Measure elapsed recovery
time, compare it with the agreed RTO, and record the achieved recovery point.

Keep application traffic and external schedulers isolated during a rehearsal.
Do not allow restored cron jobs, emails, webhooks or settlement functions to
contact live providers or production databases; review their destinations before
enabling them in staging. A restoration is not complete until Auth, object bytes,
custom policies, operational configuration and development app checks succeed.
**This restore rehearsal has not run; no separate staging project is available.**

## Rollback while retaining data

If the migration fails before `COMMIT`, PostgreSQL rolls back its new DDL and
bucket metadata atomically. Inspect the transaction error and verify database
state before any retry. Do not suppress a name conflict or delete an existing
bucket/table to force installation.

If the application causes a problem after successful installation, roll back the
application release to the last verified deployment and leave the additive
commerce schema, users, orders, audit history and images intact. With explicit
authorization, suspend affected commerce websites to stop new catalog/checkout
activity while preserving history. A browser cache or an old session is not a
reason to delete records. Review feature access/API grants in a separate forward
migration if database access must be restricted; do not publish a broad revoke
that changes existing business privileges.

Do not provide or run a destructive down migration that drops commerce tables,
schema, bucket or Auth identities. Shared Auth foreign keys require a reviewed
retention/anonymization/succession workflow rather than a blind `CASCADE` change.
The new module has no existing wallet/payment settlement procedure to reverse.

A full database/PITR restore is a disaster-recovery operation, **not** the default
feature rollback: it can discard unrelated restaurant, delivery, resort, wallet,
payment, customer and cron changes committed after the recovery point. Before an
explicitly approved recovery, record the cutover point, protect later activity
for reconciliation, account for queued jobs/provider state, announce the
supported outage window, restore through the approved procedure, verify the
entire application and reconcile business activity before reopening traffic.
Never replay live payments or debit/credit wallet records just to make a recovery
test pass. Production backup/restore/promotion remains separately approval-gated.
