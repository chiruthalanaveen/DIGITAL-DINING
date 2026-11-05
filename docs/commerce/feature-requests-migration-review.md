# Owner feature requests — migration review

Prepared 4 November 2026; local evidence reviewed 5 November 2026. Complete SQL:
[`20261104160000_commerce_feature_requests.sql`](../../supabase/migrations/20261104160000_commerce_feature_requests.sql).
The exact RPC/DTO contract is [feature-requests-contract.md](feature-requests-contract.md).

This eighth commerce migration has passed isolated development tests and is
prepared for review. It has not been approved or applied to a hosted database. It adds a
business requirement submission/review workflow; it does not enable a feature,
change owner permissions, execute supplied code, charge, send a notification,
create a cron job or deploy anything. The first seven migration files, installed
foundation and separate pending subscription ledger remain unchanged.

## Behavior and its limits

A currently verified, active website owner submits a plain-text title and
description. Signed Super Admin can review, approve, reject or assign that
request. Owners can read their current website's retained request history,
including requests submitted by a predecessor. A former or foreign owner has no
read access after membership changes. This is business-level history belonging
to the website, not permission to view another website's records.

The transition graph is `submitted` → `under_review`/`approved`/`rejected`,
`under_review` → `approved`/`rejected`, then `approved` → `assigned`.
`assigned` and `rejected` are terminal. Assigned means queued for a separate,
controlled development task. It does not mean implemented, tested, released or
activated. Existing configurable features still use their separate Admin
controls and permissions. There is no same-status note rewrite or reopening.

Initial revision is 1, and every accepted review increases it once. The graph
permits at most four immutable events per request. A stable 50-row keyset list
lets owners browse their website and signed Admin browse one website or the
global queue. There is no unbounded response or status-dependent offset paging.

## Every new table and column

### `public.commerce_feature_requests` — 13 columns

| Column | Definition and purpose |
| --- | --- |
| `id` | Generated UUID primary key. Stable request identity. |
| `website_id` | Required UUID referencing `commerce_websites(id)`. Tenant boundary for rows, paging, review and history. |
| `submitted_by` | Required UUID referencing `auth.users(id)`. Derived from verified Auth, never accepted as a submitted field. Original identity is retained through owner reassignment. |
| `submission_key` | Required client UUID. Together with website and submitter, binds identical submission retries to their original request. |
| `title` | Required text, 5–180 characters with non-whitespace content. The RPC trims it; the original value is immutable. |
| `description` | Required text, 10–6000 characters with non-whitespace content. Plain text, trimmed by the RPC and immutable after submission. |
| `status` | Required text, default `submitted`, checked against the five explicit workflow states. |
| `revision` | Required integer, default 1, bounded 1–4. Supports comparison-and-set review and bounded history. |
| `review_note` | Required text, initially empty, maximum 2000 characters. Non-submitted states require a nonblank note; each accepted review retains its own note in history. |
| `assignment_reference` | Required text, initially empty, maximum 160 characters. Nonblank only for `assigned`; an informational reference, never fetched or executed. |
| `last_action_key` | Required UUID. Initially equals the submission key; later identifies the accepted Admin review action. Not an authorization credential. |
| `created_at` | Required timestamptz. The insertion guard sets it from the database clock, ignoring a caller value. It never changes. |
| `updated_at` | Required timestamptz. Initially equals creation time; a review sets it to at least the previous value. A table CHECK prevents it preceding creation. |

The row CHECKs also require a submitted row to remain revision 1 with empty
review/assignment fields. Reviewed rows require revision ≥2 and a nonblank note;
only assigned rows may have an assignment reference. The trigger checks the
actual transition and freezes every original submission field.

### `commerce_private.feature_request_events` — 12 columns

| Column | Definition and purpose |
| --- | --- |
| `id` | Generated UUID primary key. Stable history/action evidence reference. |
| `website_id` | Required UUID, part of the composite request foreign key. |
| `request_id` | Required UUID, tied to the same website's request. |
| `revision` | Required integer 1–4. Each request/revision occurs once. |
| `operation_key` | Required UUID. Each request/action key occurs once; original review retries compare this retained event. |
| `from_status` | NULL for initial submission; otherwise one of the five stored states. |
| `to_status` | Required allowlisted state. Initial event is `submitted`. |
| `note` | Required text, maximum 2000 characters. Empty for submission, nonblank for review. |
| `assignment_reference` | Required text, maximum 160 characters. Nonblank only for assignment. |
| `actor_kind` | Required `owner` or `admin`. Initial event records owner; reviews record Admin. |
| `actor_email` | Nullable, maximum 320 characters. NULL for submission; a bounded signed Admin email for reviews. It stays private and is excluded from owner/Admin safe DTOs. |
| `created_at` | Required timestamptz copied from the request's authoritative updated timestamp. |

The composite `(website_id,request_id)` foreign key references
`commerce_feature_requests(website_id,id)`. Initial-event CHECKs require revision
1, NULL prior state/email, owner actor, empty note/reference and submitted next
state. Reviewed-event CHECKs require a prior state, Admin actor and valid note/
identity shape. The automatic recording trigger supplies coherent transitions;
events cannot be rewritten or deleted through the workflow.

All three new foreign keys use retained-history/default deletion behavior; no
`ON DELETE CASCADE` is introduced. Original Auth/business rows are not backfilled
or updated by installation.

SQL text lengths count Unicode code points. The API and owner form check the
same 5/10-character minimums before dispatch/persisting a pending submission;
their 180/6000 UTF-16 maximums remain conservative. Valid Tamil and emoji text
is supported. Review actor email is bounded to 320 characters by SQL and is
provided by a signed session whose HTTP validation has the stricter 254-character
email maximum.

## Every new index and constraint-backed index

Two explicit indexes support bounded newest-first paging:

- `commerce_feature_requests_tenant_latest(website_id,created_at DESC,id DESC)`;
- `commerce_feature_requests_global_latest(created_at DESC,id DESC)`.

Six additional unique indexes back table constraints:

- Requests: primary key `id`, unique `(website_id,id)`, and unique
  `(website_id,submitted_by,submission_key)`.
- Events: primary key `id`, unique `(request_id,revision)`, and unique
  `(request_id,operation_key)`.

No sequence, extension, pre-existing index rebuild, or change to an existing
constraint is introduced.

## Every new function and trigger

All nine functions pin `search_path=''`. Inherited execution privileges are
explicitly revoked before narrow grants are made. Existing function definitions
and ACLs are not replaced.

| Function | Security and purpose |
| --- | --- |
| `commerce_private.feature_request_can_read(uuid)` | SQL STABLE SECURITY DEFINER. Checks live verified Auth plus current active owner membership. Authenticated has EXECUTE solely to support the new SELECT policy. It discloses only whether that caller can read the specified website. |
| `commerce_private.feature_request_payload(jsonb,text[])` | PL/pgSQL IMMUTABLE validator. Requires an object, rejects unknown keys and bounds serialized input to 64 KiB. Required fields/types are additionally checked by each action. No direct API execution. |
| `commerce_private.feature_request_guard()` | SECURITY DEFINER trigger function. Rejects deletion. Insert requires authenticated role, the Auth submitter, original submitted shape and matching initial keys. Update requires actual service role, unchanged original fields, the next revision, a new action key and an allowed transition. Sets authoritative timestamps. |
| `commerce_private.record_feature_request_event()` | SECURITY DEFINER trigger function. Appends the submission/review event automatically in the same transaction. An update requires the signed Admin actor provided by the controlled review RPC; actor context is restored afterwards. |
| `commerce_private.feature_request_event_immutable()` | Ordinary trigger function rejecting event UPDATE/DELETE with `42501`. No direct API execution. |
| `commerce_private.feature_request_detail(uuid,uuid)` | SQL STABLE SECURITY DEFINER. Constructs the explicit safe request/event projection for exactly one website/request, ordered by revision. No keys, submitter identity or Admin email are returned. No direct API execution. |
| `commerce_private.feature_request_page(uuid,jsonb)` | PL/pgSQL STABLE SECURITY DEFINER. Validates paired cursor fields, selects at most 51 candidates, returns 50 safe rows and a last-visible-row cursor only when more exist. NULL website is used only after the Admin RPC authorizes a global list. No direct API execution. |
| `public.commerce_feature_requests_owner(uuid,text,jsonb)` | SECURITY DEFINER owner RPC, EXECUTE only to authenticated. Derives Auth identity, locks and verifies current membership/verification, and implements list/get/submit. Never reviews a request or changes website configuration. |
| `public.commerce_feature_requests_admin(uuid,text,jsonb,text)` | SECURITY DEFINER Admin RPC, EXECUTE only to actual service role. Validates signed actor identity; implements scoped/global list, scoped detail and serialized review/replay. Appends a small existing Admin audit record for a new accepted review. |

Three explicit triggers are new:

1. `commerce_feature_request_guard`: BEFORE INSERT/UPDATE/DELETE on requests.
2. `commerce_feature_request_event_record`: AFTER INSERT/UPDATE on requests.
3. `commerce_feature_request_event_immutable`: BEFORE UPDATE/DELETE on events.

New foreign keys also create PostgreSQL internal constraint triggers. Existing
explicit and internal triggers are preserved. Transactional
`NOTIFY pgrst,'reload schema'` refreshes PostgREST's schema cache; it is not an
email, job or customer notification.

## RLS, grants and projection boundary

Both tables enable RLS. Public requests add exactly one authenticated SELECT
policy, `commerce_feature_requests_owner_read`, using the live verified-owner
helper. Authenticated receives column-level SELECT only for the ten safe request
fields listed in the contract. `submitted_by`, `submission_key` and
`last_action_key` are not directly selectable; use an explicit safe-column query,
not `SELECT *`. Direct INSERT/UPDATE/DELETE/TRUNCATE privileges are revoked from PUBLIC,
anon, authenticated and service_role. The controlled RPCs perform writes as
their definer after their explicit role/ownership checks.

Private events add no policy or direct API-role SELECT/mutation privilege. Their
Admin email and replay evidence therefore cannot be read through a raw API table
query. The public RPC projections also omit internal submitter/replay keys and
all actor emails. The actor kind and public review note remain visible history.

No existing RLS policy, default privilege or table/function grant is changed.
The actual `SET ROLE` context gates Admin operations, not a caller-supplied JWT
role string. Service Admin does not receive owner-RPC impersonation authority.
SQL validates the role and bounded actor-email shape; the BFF validates the
signed Admin session and supplies that identity. The database does not itself
verify an HTTP cookie. Holders of the service credential are trusted
administrators, and that credential is never exposed to owner/browser code.

## Locks, idempotency and race behavior

Owner RPC order is website SHARE, verified Auth SHARE, then active owner
membership SHARE. The checks execute after their respective waits. Existing
Admin assignment/state changes take the website lock, so an owner waiting on
that change must be authorized against the committed result. Auth verification
withdrawal and direct membership revocation also serialize with their row locks.
An inactive website with retained membership remains readable. A new submission
requires `setup`/`active` for any business type; an identical known retry remains
recoverable after the website becomes read-only. Tracking a pharmacy requirement
does not activate pharmacy catalog or checkout functionality.

Submission uniqueness is website + actual submitter + UUID. Identical concurrent
requests produce one request and one initial event. A conflict waits, then the
RPC compares immutable trimmed text against the saved row. Changed-content
reuse raises `23505`; it never overwrites original text.

Admin review locks the website SHARE then the bound request FOR UPDATE. A fresh
action requires both expected status and revision. A stale or illegal review
raises `23505` with no event, audit, configuration or request-state mutation.
An action UUID retry first compares the retained original event's prior/next
state, prior revision, note and assignment. Identical replay returns that event
plus the current detail, even if a later accepted review has progressed. It does
not overwrite or rewind the later state and adds no duplicate audit/event.

The review RPC temporarily sets its transaction-local signed-actor context for
the history trigger and restores its previous value. API roles cannot exploit
that setting to mutate either table directly. Errors roll back request/event/
audit changes together.

## Installation and verification target

Authorized testing is only the disposable loopback `commerce_test` fixture.
The guarded runner requires the URL explicitly, verifies supplied and connected
host/database, and recreates that fixture. Never run it on retained data.

```sh
export COMMERCE_TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55447/commerce_test'
node scripts/test-commerce-expansion-db.mjs
npm test
npm run lint
npm run build
```

The complete explicit expansion order is:

1. `20261102160000_commerce_catalog_fulfillment.sql`
2. `20261102161000_commerce_customer_experience.sql`
3. `20261102162000_commerce_growth_notifications.sql`
4. `20261103090000_commerce_verified_domains.sql`
5. `20261103091000_commerce_online_payments.sql`
6. `20261104090000_commerce_payment_recovery_queue.sql`
7. `20261104120000_commerce_stop_unstarted_payment.sql`
8. `20261104160000_commerce_feature_requests.sql`

The runner constructs the foundation only inside its fresh fixture. Never
reapply the already-installed hosted foundation, use `supabase db push`, repair
hosted migration history, or apply the separate pending subscription ledger.

A future hosted installation requires separate explicit approval of the exact
target and reviewed hashes. Confirm the installed prefix read-only, then apply
only absent approved files once, in order, as complete transactions. If a target
already has the approved first seven, its future eighth-file command would be:

```sh
# FUTURE APPROVED TARGET ONLY — not executed by this work.
psql "$COMMERCE_APPROVED_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20261104160000_commerce_feature_requests.sql
```

Use a securely supplied operator URL, never a pasted credential. Keep existing
payment/domain/notification activation flags off. This migration introduces no
new environment variable, DNS setting, Storage policy, cron job or provider
configuration. The withdrawn staging/backup prerequisites are not reintroduced;
no production backup or hosted acceptance is claimed.

## Read-only verification queries

Use only the isolated fixture or a separately approved read target. These query
metadata and aggregate consistency rather than request text or actor identities.

```sql
select current_database(),inet_server_addr(),version();
select table_schema,table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns
where (table_schema,table_name) in
 (('public','commerce_feature_requests'),('commerce_private','feature_request_events'))
order by table_schema,table_name,ordinal_position;

select n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where c.oid in ('public.commerce_feature_requests'::regclass,
 'commerce_private.feature_request_events'::regclass);
select * from pg_policies
where (schemaname,tablename) in
 (('public','commerce_feature_requests'),('commerce_private','feature_request_events'));
select schemaname,tablename,indexname,indexdef from pg_indexes
where (schemaname,tablename) in
 (('public','commerce_feature_requests'),('commerce_private','feature_request_events'))
order by 1,2,3;

select p.oid::regprocedure,p.prosecdef,p.provolatile,p.proconfig,p.proacl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='commerce_private' and p.proname in
 ('feature_request_can_read','feature_request_payload','feature_request_guard',
 'record_feature_request_event','feature_request_event_immutable',
 'feature_request_detail','feature_request_page'))
 or (n.nspname='public' and p.proname in
 ('commerce_feature_requests_owner','commerce_feature_requests_admin'))
order by 1;

select count(*) as inconsistent_request_history
from public.commerce_feature_requests r
where r.revision<>(select count(*) from commerce_private.feature_request_events e
 where e.website_id=r.website_id and e.request_id=r.id)
 or not exists(select 1 from commerce_private.feature_request_events e
 where e.website_id=r.website_id and e.request_id=r.id and e.revision=r.revision
 and e.to_status=r.status and e.note=r.review_note
 and e.assignment_reference=r.assignment_reference
 and e.operation_key=r.last_action_key and e.created_at=r.updated_at);

select count(*) as inconsistent_admin_events
from commerce_private.feature_request_events
where revision>1 and (actor_kind<>'admin' or actor_email is null
 or from_status is null or to_status='submitted' or note='');

select a.attname,
 has_column_privilege('authenticated','public.commerce_feature_requests',
                     a.attname,'SELECT') as owner_can_select
from pg_attribute a
where a.attrelid='public.commerce_feature_requests'::regclass
 and a.attnum>0 and not a.attisdropped
order by a.attnum;

select has_function_privilege('authenticated',
 'public.commerce_feature_requests_owner(uuid,text,jsonb)','EXECUTE') as owner_rpc,
 has_function_privilege('authenticated',
 'public.commerce_feature_requests_admin(uuid,text,jsonb,text)','EXECUTE') as owner_admin_rpc,
 has_function_privilege('service_role',
 'public.commerce_feature_requests_admin(uuid,text,jsonb,text)','EXECUTE') as service_admin_rpc,
 has_table_privilege('authenticated',
 'commerce_private.feature_request_events','SELECT') as owner_private_events,
 has_table_privilege('service_role',
 'commerce_private.feature_request_events','INSERT,UPDATE,DELETE,TRUNCATE') as service_direct_events;
```

The history inconsistency counts should be zero. Expected RPC/ACL booleans in
order are true, false, true, false, false. Verify table/column SELECT grants and
the one owner policy separately; no caller role should have direct mutation.
Compare existing schema/policy/grant/cron definitions and authorized aggregate
business invariants with their recorded pre-installation state. A local pass
does not establish hosted Supabase/Auth/PostgREST compatibility.

## Preservation and rollback

Installation performs no existing-row DML and replaces no existing object. At
runtime, submission writes only its new request/event; review updates only that
request, appends its event and adds a small existing Admin audit record. It does
not change website feature/permission/subscription settings, customer/order
records, stock, wallets, payments, refunds or cron jobs.

Each file is transactional and intentionally one-time. Failure before COMMIT
rolls back the complete installation; issue `ROLLBACK` if the session remains
aborted and investigate the cause. Reapplication must fail atomically, not be
made silently idempotent with destructive drops or partial reruns.

After requests exist, retain both tables, original text, keys and immutable
events. Reverting the application to the reviewed earlier source removes its
normal request/review controls while preserving database history. The installed
public Supabase RPCs remain callable by their authorized roles; hiding controls
alone is not a database-level write hold. If that hold is needed, prepare a
separately approved forward migration that blocks new submissions/reviews while
preserving scoped history and identical known-operation recovery. Do not drop
tables, truncate events, rewrite a terminal decision, disable RLS/guards or delete
Auth/business rows as a rollback shortcut. A database correction requires a
separate reviewed forward migration and explicit target approval. Reconcile a
lost response with its same submission/action key, never by inventing a new
operation or manually rewriting history. Recovery of existing business data is
governed by the existing runbook; no new production backup is claimed or required
by this source-only preparation.

## Test evidence

The completed eight-file isolated run passes **702 PostgreSQL assertions**,
retaining all previous 628 and adding 74. The new module contributes 62 cases;
ten concurrency/paging cases, eighth-migration preservation and atomic
reapplication contribute twelve more. The command was:

```sh
COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55447/commerce_test \
  node scripts/test-commerce-expansion-db.mjs
```

Evidence:
`/workspace/commerce-validation-artifacts/commerce-feature-requests-20261104/integrated-sql.log`.
The source migration SHA-256 is
`85dcd7d29dab60029ccf3f0d5b3fb847acc7f14fa17885e75d22ff7410b309f2`.
The seven preceding migration files are unchanged. The 5 November read-only
capture in the same folder's `integrated-sql-summary.json` observes 36 inspected
tables, 32 policies, 78 application functions (81 with three synthetic fixture
helpers), one preserved cron fixture, and exactly the ten safe authenticated
request-read columns. It records all eight migration hashes and no hosted SQL
or production write.

Checks include verified owner/customer/foreign-owner role separation, column
privacy and raw `SELECT *` denial, direct-mutation/private-history denial,
current-owner reassignment and Auth withdrawal, strict fields/cursors/Unicode,
unchanged-content replay, legal review/assignment/rejection, immutable original
text/events, stale comparison-and-set review, identical concurrent submissions,
conflicting submissions/reviews, duplicate review audit prevention, website and
Auth lock waits, global/tenant pagination, full business/configuration/financial/
Auth/Storage/cron preservation, and one-time reapplication failure after rollback.
A first fixture identifier collision was corrected by moving only the new test
IDs into their own namespace; its failed log and the passing rerun are retained.

This is PostgreSQL 18.4 on loopback with synthetic Auth/Storage primitives,
not managed Supabase 17/Auth/PostgREST acceptance. Full application unit, build,
lint and browser results are recorded separately in the coordinated report;
SQL evidence does not claim that the new browser flow has passed.
