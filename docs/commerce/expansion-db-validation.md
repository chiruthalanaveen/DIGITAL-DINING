# Isolated commerce expansion database validation

3 November 2026. Source on `feature/commerce-expansion`; no hosted SQL,
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

The separate platform subscription ledger is excluded. The runner never globs
migrations, runs `db push`, repairs migration history or connects to a hosted
target. Additional reviewed commerce migrations must be explicitly added.

The final integrated run passes **531 PostgreSQL assertions**:

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
| Integrated preservation, validation, races and atomic reapplication | 76 |
| Total | 531 |

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

Evidence log:
`/workspace/commerce-validation-artifacts/commerce-expansion-20261103/integrated-sql.log`.
Consolidated metadata, assertion labels, breakdown and migration hashes:
`/workspace/commerce-validation-artifacts/commerce-expansion-20261103/integrated-sql-summary.json`.
The final fixture has 33 tables across the inspected schemas, 31 policies and
64 public/private application functions. Read-only consistency queries report
zero inconsistent order totals, coupon redemptions or linked captured receipts,
and exactly one preserved existing cron fixture. These are observed local
fixture counts, not hosted Supabase metadata claims.
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
```

Expected final two queries: no inconsistent rows. Do not use these instructions
to query production without separate applicable approval.

Rollback means reverting application source while retaining collected variants,
orders, customer requests/timeline, coupons/redemptions, outbox and domain claim
history. Existing discounted/variant orders may need the expanded code, so a
reviewed forward repair is safer after such orders exist. Dropping new tables,
resetting hosted data or replaying the foundation is not a data-preserving
rollback. Per-migration reviews describe their additional limits.

PostgreSQL 18.4 with simulated local Auth/Storage roles does **not** establish
Supabase 17/17.6 compatibility, hosted Auth hooks, PostgREST sessions/RLS behavior,
Storage HTTP behavior, production restoration, real payment capture/settlement,
DNS/TLS ownership, provider acceptance or external delivery. Those remain
separate, unperformed acceptance gates.
