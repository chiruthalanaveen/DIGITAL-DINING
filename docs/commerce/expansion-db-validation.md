# Isolated commerce expansion database validation

Evidence reviewed 5 November 2026; source prepared 4 November 2026. Source on `feature/commerce-expansion`; no hosted SQL,
deployment, live payment, DNS/provider provisioning or external notification
send was performed. The installed hosted foundation is not an installation
target for these destructive fixtures.

The permanent runner is `scripts/test-commerce-expansion-db.mjs`. It requires
an explicit PostgreSQL URL, permits only a loopback hostname and the database
name `commerce_test`, rejects URL query overrides, and checks the connected
server address. Its unchanged baseline runner drops/recreates only that verified
disposable database. Never supply application/main/staging credentials.

Actual target: PostgreSQL **18.4**, `127.0.0.1:55447/commerce_test`, synthetic
`postgres` development identity, no hosted credentials. The existing local cluster under
`/workspace/.commerce-validation-tools/` was restarted on loopback for the final
checks; no managed
Supabase database, Auth user or provider account was used.

```sh
COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55447/commerce_test \
  node scripts/test-commerce-expansion-db.mjs
```

The runner installs the canonical foundation only while constructing this fresh
isolated fixture. It then applies an explicit allowlist, in this order:

1. `supabase/migrations/20261102160000_commerce_catalog_fulfillment.sql`
2. `supabase/migrations/20261102161000_commerce_customer_experience.sql`
3. `supabase/migrations/20261102162000_commerce_growth_notifications.sql`
4. `supabase/migrations/20261103090000_commerce_verified_domains.sql`
5. `supabase/migrations/20261103091000_commerce_online_payments.sql`
6. `supabase/migrations/20261104090000_commerce_payment_recovery_queue.sql`
7. `supabase/migrations/20261104120000_commerce_stop_unstarted_payment.sql`
8. `supabase/migrations/20261104160000_commerce_feature_requests.sql`

The separate platform subscription ledger is excluded. The runner never globs
migrations, runs `db push`, repairs migration history or connects to a hosted
target. Additional reviewed commerce migrations must be explicitly added.

The current eight-file integrated run passes **702 PostgreSQL assertions**.
It preserves every prior 628 assertion and adds 62 owner feature-request SQL
cases, ten request race/paging cases, eighth-installation preservation and
atomic reapplication: 74 new assertions. The first seven migration files remain
byte-for-byte unchanged. Historical evidence is 531 assertions for the five-file
3 November run, 561 for the six-file recovery run, and 628 for the seven-file
stop-unstarted run; those dated results are not the current source totals.

| Checks | Actual assertions |
| --- | ---: |
| Unchanged original SQL/concurrency/reapplication/grant runner | 88 |
| Original SQL cases re-executed against expanded RPCs | 72 |
| Catalog/variant/coverage module | 33 |
| Customer/address/review/request/timeline module | 71 |
| Coupon/analytics/outbox module | 40 |
| Bounded UTC trends, best sellers and stock alerts | 34 |
| Verified-domain module | 73 |
| Online payment/receipt/webhook and online-only quote module | 44 |
| Read-only payment recovery queue | 27 |
| Stop-unstarted payment module | 58 |
| Owner feature-request module | 62 |
| Integrated preservation, validation, races and atomic reapplication | 100 |
| Total | 702 |

The 72 post-expansion baseline cases run inside a rollback-only synthetic fixture
transaction. It temporarily truncates commerce/Auth/Storage **fixture** tables
inside the disposable database, executes the original SQL body, and rolls back.
The runner then compares every prior row to prove that this compatibility
transaction restored the complete fixture, including immutable history. It
does not delete application data or disable history protections on any hosted
database.

Before installing expansions, the runner snapshots all original columns and rows
across **14 fixture tables**, all **18 existing RLS policy definitions**, and
existing table ACLs/RLS enablement. Installation preserves them exactly.
Every original function remains unchanged; the two intentionally replaced
public checkout/owner implementations retain their exact original bodies in
private functions with API execution revoked. This is synthetic fixture
preservation evidence, not a business-data backup or proof about unqueried
hosted records.

Independent connections verify last-unit variant contention, identical checkout
retries, simultaneous cancellation, owner membership withdrawal and customer
verification withdrawal after lock waits, final coupon usage, concurrent customer
cancellation decisions, separate notification worker leases, and cross-tenant
domain claims. The coupon race creates one redemption; the losing checkout
does not consume stock or leave a partial order. Cancelling a discounted variant
order restores inventory once and retains its coupon redemption history.

The seventh migration is tested separately against a complete before-state of
all existing rows, function bodies, policies, grants, indexes and unrelated
constraints/triggers. It adds only its reviewed objects and constraints, eight
internal foreign-key triggers and two explicit history guards; it performs no
existing-row DML during installation. The complete new table/column/function/
constraint/trigger/index/RLS explanation is in the
[stop-unstarted migration review](stop-unstarted-payment-migration-review.md)
and [seven-file object inventory](expansion-schema-inventory.md).

The new stop tests cover verified own-buyer website/cart/intent binding,
anonymous/unverified/foreign-buyer denial, immutable proof and terminal-row
guards, duplicate requests, both creation-versus-stop race winners, Auth
withdrawal during a lock wait, and the invisible/uncommitted original-request
case. Missing rows never authorize a stop or release. The retained old cart key
cannot create a COD order; a fresh key can. Stock, orders, receipts, redemptions,
wallet fixtures and the original scheduled-job fixture remain unchanged by a
verified stop. Ready, unknown, dispatched or captured payments are excluded.

The stop RPC locks the verified Auth row FOR SHARE, then the intent FOR UPDATE,
serializing with provider-creation claim. It deliberately does not take a cart
advisory lock, which would invert fulfillment's lock order. These are local
transactional tests, not real provider cancellation, refund or capture tests.

The eighth migration adds only two new tables, nine functions, two explicit
paging indexes, three explicit history/guard triggers and one owner SELECT
policy, plus its key/foreign-key constraints. Both tables enable RLS; owners
can directly select only ten safe request columns, while private events and
all direct writes remain denied. Every preceding row, function body, policy,
grant, index and unrelated constraint/trigger is compared before and after
installation. Read the [complete owner feature-request object review](feature-requests-migration-review.md)
and [RPC/DTO contract](feature-requests-contract.md).

The new tests cover authenticated owner-only submission/list/detail, foreign or
revoked membership and missing/withdrawn verification, safe column projection,
private replay/actor evidence, strict payloads/cursors and Unicode, immutable
original text/history, identical and conflicting submission/review keys, legal
approval/rejection/assignment, stale status/revision comparisons and unchanged
website settings. Ten independent integration cases exercise simultaneous same
submissions, changed-content collisions, competing reviews, duplicate review
replay/audit, website-lock Auth/membership withdrawal, an Auth SHARE wait,
bounded global paging after a new submission, tenant paging, and a complete
unrelated business/configuration/financial/Auth/Storage/cron snapshot.
A known immutable submission replay remains readable after website suspension;
new submissions remain blocked. Assignment is a recorded development queue
state, never feature activation, code execution or release.

Saved-address checkout uses the stored address/PIN to choose delivery coverage;
submitted replacement shipping fields cannot choose a different zone. A retry
uses the order's original shipping snapshot even after that saved address is
edited or deleted. Changed recipient/cart instructions reject, and simultaneous
retries after deletion retain one order and one inventory decrement.

Direct authenticated and service-role mutation privileges are absent on all
13 new core/customer/growth tables. Admin catalog reads use a service-only
`get_workspace` RPC; direct service SELECT on settings supports the bounded
Admin template lookup. New mutations use their validated RPCs. Existing table
grants remain unchanged.

Each one-time expansion file is deliberately reapplied in the disposable target.
The second application fails at its existing first object, the transaction
remains aborted until explicit rollback, and all rows, function definitions,
constraints, indexes, triggers, grants and RLS definitions match the prior
snapshot. No destructive down migration is supplied.

COD and online attempts share the same per-buyer/site/cart advisory lock. Both
winning directions are tested: an established online intent blocks a second COD
order, and an existing COD order blocks initiating an online payment. Original
order replays remain available, including cancellation retries. Concurrent capture
retries create one receipt/order and decrement stock once. Two independently
captured intents contending for the last unit produce one fulfilled order and
one retained `captured_unfulfilled` receipt for reconciliation. Cancelling a paid
order preserves the captured receipt and paid status; it does not invent a refund.

The online-only quote function succeeds when COD is disabled but the merchant
is enabled. Anonymous/unverified access, cross-tenant products and disabled
merchants reject. Order, intent, receipt, redemption and inventory snapshots are
unchanged by quote calls. These are SQL-side synthetic provider facts, not real
provider order creation, payment capture or settlement.

Analytics accepts only 7/30/90-day UTC calendar periods. It uses the earliest
immutable completion fact once per current completed order, fills zero days,
and flags legacy completed orders whose completion date is unknown. It ignores
payment-only facts even when their stored status is completed; those facts also
cannot reopen a legacy customer's return window. Best sellers sum completed item
units and gross item line values before coupons/delivery;
they return at most ten products. Stock alerts return at most fifty active base
or variant sources at five units or fewer, require inventory permission and the
inventory feature, and omit unused base stock for required-variant products.
The 34 dedicated SQL assertions cover boundaries, timezone independence,
payment-event deduplication, window-dependent ranking, exact gross definitions,
tenant/Auth permissions and response caps. No additional table, policy or cron
job was introduced for analytics.

The runner also rejects missing URLs, hosted hosts, another database name,
host overrides and database query overrides before any fixture work. `node
--check` and focused ESLint on the runner pass. Full application test/lint/build
and browser evidence belong to the coordinated implementation report.

Current eight-file evidence log:
`/workspace/commerce-validation-artifacts/commerce-feature-requests-20261104/integrated-sql.log`.
The new migration's source SHA-256 is
`85dcd7d29dab60029ccf3f0d5b3fb847acc7f14fa17885e75d22ff7410b309f2`.
Its first failed fixture run reused an existing payment-test UUID; only the new
test namespace was corrected, and the full subsequent run passed. The initial
failure and contract-only pass remain alongside the final integrated log.

The seven-file historical metadata/labels/hash summary remains at
`/workspace/commerce-validation-artifacts/commerce-unstarted-20261104/integrated-sql-summary.json`.
That earlier fixture had **34 inspected tables, 31 policies and 69 application
functions** (33 public + 36 private), plus three synthetic Auth/Storage helpers.
Its aggregate consistency checks were zero and the existing cron fixture count
was one. Those are dated seven-file observations.

The 5 November eight-file read-only capture is
`/workspace/commerce-validation-artifacts/commerce-feature-requests-20261104/integrated-sql-summary.json`.
It observes **36 inspected tables, 32 policies and 78 application functions**;
the 81-function total includes three synthetic Auth/Storage helpers. The existing
cron fixture count remains one. The authenticated request SELECT grant contains
exactly the ten safe columns: `assignment_reference`, `created_at`, `description`,
`id`, `review_note`, `revision`, `status`, `title`, `updated_at`, `website_id`.
The summary records all eight migration hashes and no hosted SQL or production
write. These are observed local metadata and fixture invariants, not hosted
Supabase compatibility or production data checks.

The historical five-file log/summary remain under
`/workspace/commerce-validation-artifacts/commerce-expansion-20261103/`
(531 assertions; 33 tables, 31 policies, 64 application functions). The
six-file recovery evidence remains under
`/workspace/commerce-validation-artifacts/commerce-recovery-20261104/`
(561 assertions). The seventh migration's tested SHA-256 is
`a53667d6003885e4ec972ba63859d7e3047b0fbe29344ffca5aa8463a7a6a754`.
The original foundation remains SHA-256
`dd2882f6329808783b1d4d97c4264f59989b7e834753aa06efe46d63855db1ca`;
the original storefront stylesheet remains SHA-256
`409e198eef58fc2ddde3ff96d348ef39b042985fad7e0408623b41c41a3a78d7`.

Read-only inspection on an explicitly authorized development target:

```sql
SELECT current_database(), inet_server_addr(), version();
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname IN ('public','storage')
ORDER BY schemaname, tablename, policyname;
SELECT p.oid::regprocedure, p.prosecdef, p.proconfig, p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','commerce_private')
ORDER BY 1;
SELECT id FROM public.commerce_orders
WHERE total_paise <> subtotal_paise + delivery_fee_paise - discount_paise;
SELECT r.id FROM public.commerce_coupon_redemptions r
JOIN public.commerce_orders o ON o.website_id=r.website_id AND o.id=r.order_id
WHERE r.user_id<>o.customer_user_id OR r.coupon_id IS DISTINCT FROM o.coupon_id
   OR r.discount_paise<>o.discount_paise;

SELECT count(*) AS inconsistent_stopped_proofs
FROM commerce_private.payment_unstarted_cancellations c
JOIN commerce_private.payment_intents i ON i.id=c.intent_id
WHERE i.website_id<>c.website_id OR i.buyer_id<>c.buyer_id
   OR i.cart_key<>c.cart_key OR i.state<>'cancelled_unstarted'
   OR i.provider_order_id IS NOT NULL OR i.create_lease IS NOT NULL
   OR EXISTS (SELECT 1 FROM commerce_private.payment_receipts r
              WHERE r.intent_id=i.id);

SELECT count(*) AS stopped_intents_without_proof
FROM commerce_private.payment_intents i
WHERE i.state='cancelled_unstarted'
  AND NOT EXISTS (SELECT 1
                  FROM commerce_private.payment_unstarted_cancellations c
                  WHERE c.intent_id=i.id AND c.website_id=i.website_id
                    AND c.buyer_id=i.buyer_id AND c.cart_key=i.cart_key);
```

Expected order/redemption queries: no inconsistent rows; final two proof counts:
zero. Private-table inspection requires a separately authorized database
administrator; no direct API-role access is added. Do not use these instructions
to query production without separate applicable approval.

Rollback means reverting application source while retaining collected variants,
orders, customer requests/timeline, coupons/redemptions, outbox and domain claim
history, including payment attempts, capture receipts and unstarted-stop proofs.
Do not reopen or delete a stopped intent or reuse its old checkout key. An older
application may not understand the new terminal state; retain compatible
proof-aware recovery or use a reviewed forward repair rather than blindly
rolling back payment handling. Existing discounted/variant orders may need the expanded code, so a
reviewed forward repair is safer after such orders exist. Dropping new tables,
resetting hosted data or replaying the foundation is not a data-preserving
rollback. Per-migration reviews describe their additional limits.

PostgreSQL 18.4 with simulated local Auth/Storage roles does **not** establish
Supabase 17/17.6 compatibility, hosted Auth hooks, PostgREST sessions/RLS behavior,
Storage HTTP behavior, production restoration, real payment capture/settlement,
DNS/TLS ownership, provider acceptance or external delivery. Those remain
separate, unperformed acceptance gates.


Read-only feature-request consistency checks for an explicitly authorized target:

```sql
SELECT count(*) AS inconsistent_feature_request_history
FROM public.commerce_feature_requests r
WHERE r.revision<>(SELECT count(*) FROM commerce_private.feature_request_events e
 WHERE e.website_id=r.website_id AND e.request_id=r.id)
 OR NOT EXISTS(SELECT 1 FROM commerce_private.feature_request_events e
 WHERE e.website_id=r.website_id AND e.request_id=r.id
 AND e.revision=r.revision AND e.to_status=r.status
 AND e.note=r.review_note AND e.assignment_reference=r.assignment_reference
 AND e.operation_key=r.last_action_key AND e.created_at=r.updated_at);

SELECT count(*) AS inconsistent_feature_admin_events
FROM commerce_private.feature_request_events
WHERE revision>1 AND (actor_kind<>'admin' OR actor_email IS NULL
 OR from_status IS NULL OR to_status='submitted' OR note='');
```

Both counts should be zero. For rollback, return to the earlier application
while retaining the new tables, original text, replay keys and immutable audit
events. Public RPC grants remain installed, so hiding UI alone is not a database
write hold. A required hold needs a separately approved forward change that
blocks new writes while preserving scoped reads and known-operation recovery.
Do not drop/truncate
history, weaken RLS, delete Auth/business rows, or replay an installed migration.
Any needed database correction is a separately reviewed forward migration.
