# Coupons, order analytics and notification outbox review

Prepared for `feature/commerce-expansion`, 2 November 2026. This source has not
been deployed. No hosted SQL, external notification, provider configuration or
cron activation is authorized by this implementation.

Migration: `supabase/migrations/20261102162000_commerce_growth_notifications.sql`.
Apply only after `20261102160000_commerce_catalog_fulfillment.sql` and
`20261102161000_commerce_customer_experience.sql`. The original foundation file
is unchanged; it is installed on the hosted project and must not be reapplied.

## Behavior and preservation

Private owner coupons use the existing `orders` permission, verified Auth email,
current active membership and a setup/active website for writes. Coupon tables
have SELECT-only owner RLS; customer/anonymous reads return no coupon rows.
Authenticated and service-role clients have no direct DML grants on these new
tables. Service reads of coupons/redemptions remain available; notification
claims/status/ACK/retry use service-only SECURITY DEFINER RPCs, with no direct
outbox privileges. SQL validates allowlisted fields,
integers, dates and limits as well as the API's strict Zod schema.
Optional IDs, when supplied, must be canonical UUID JSON strings; explicit null,
empty, numeric and boolean IDs reject. Null action/status-payload values reject
instead of falling through SQL three-valued comparisons. Owner writes recheck
and SHARE-lock verified Auth and current membership after the website lock.

Fixed discounts are integer paise; percentage discounts are integer basis
points (1000 = 10%). Multiply using bigint, divide by 10000 once, and round down.
A discount cannot exceed the product subtotal or its configured paise cap; no
delivery fee is discounted. Minimum spend tests product subtotal. Start is
inclusive; end is exclusive. Optional overall limit and required per-customer
limit count immutable placed-order redemptions, including cancelled orders.
No preview creates a redemption. Missing/invalid codes fail closed.

The final checkout locks the coupon row and records the redemption in its order
transaction. The redemption trigger takes that same lock and rechecks the
current quote, matching website, customer, coupon and exact order discount.
This serializes two customers consuming the final coupon use; concurrent order
replays remain governed by the core checkout's existing idempotency lock. Unique
website/order redemption and composite tenant foreign keys prevent duplicates
and cross-tenant links. Redemptions cannot be edited or deleted by DML.

Owner analytics aggregate only the selected website. The authenticated
`commerce_growth_analytics(uuid,integer default 30)` RPC permits only 7, 30 or
90 UTC calendar days, including today; NULL/arbitrary ranges reject. The
existing growth workspace reuses its 30-day result. Placed order value uses
orders created in that window, including subsequently cancelled orders with a
separate count. Completed COD value, trends and best sellers use current
completed orders whose first immutable completion fact falls in the window.
Subsequent payment changes while still completed cannot multiply or redate an
order. Legacy completed orders lacking such a fact are omitted from dated
completion metrics. Only `created` or `status_changed` facts establish that
timestamp; a later `payment_changed` fact cannot supply unknown legacy completion
truth. Missing history is reported by `completion_history_incomplete` and
`completed_orders_without_completion_event`; updated_at is never substituted.
Captured/settled fields remain explicitly null and unavailable: order values
do not establish collection, settlement or a wallet balance.

The analytics DTO retains existing summary keys and adds `period_start_date`,
`period_end_date` (inclusive date labels), `timezone: "UTC"`, and zero-filled
`daily_trend: [{date,completed_orders,completed_order_value_paise}]`.
`best_selling_products` returns the top ten
`{product_id,product_name,units,gross_item_value_paise}` rows, aggregating all
variants by product. Gross is the sum of original order-item line values before
coupon allocation and delivery fees; it is not net revenue or captured funds.
Names come from a completed order's item snapshot.

`low_stock_available`, `low_stock_threshold: 5` and `low_stock` describe current
inventory independently of the date window. Alerts require both inventory
permission and the enabled inventory feature; otherwise the array is empty and
availability is false. At most fifty active, sellable base/variant sources are
returned, ordered by quantity/name. Rows contain product_id/product_name,
variant_id/variant_name/sku (null for base stock), and stock_quantity. Archived
products/variants and inactive categories are omitted. Required-variant products
omit their unusable base stock, preventing false zero-stock alerts. Analytics
adds no table, index, policy, trigger, cron or data mutation.

An AFTER INSERT/status-change order trigger appends a transactionally consistent
outbox event. Existing orders are not backfilled. The outbox stores recipient
user IDs and safe order metadata, with no email addresses in persistent payloads.
A website/order/event deduplication key avoids duplicate status events. No owner
or customer can SELECT outbox payloads or call worker RPCs. Owner/Admin HTTP
responses expose counts; recipient email is resolved only by the service claim
RPC from a verified Auth user. No raw provider failures or recipient emails are
returned in worker HTTP results.

Service-only claims use `FOR UPDATE SKIP LOCKED`, independent lease tokens and
bounded leases (30–600 seconds). ACK requires the matching unexpired lease.
Failed sends back off from 30 seconds, with five attempts before terminal
failure. Expired final leases become failed; Admin can explicitly retry failed
rows. A provider call receives a stable event idempotency key. Delivery after an
ambiguous provider success is recoverable, but provider idempotency retention
limits mean this is not an unlimited exactly-once external delivery guarantee.

Sending is disabled unless every server-only condition is satisfied:
`COMMERCE_NOTIFICATIONS_ENABLED=true`, provider `resend`,
`COMMERCE_NOTIFICATION_SENDER_VERIFIED=true`, a syntactically valid verified
`COMMERCE_NOTIFICATION_FROM` and `COMMERCE_NOTIFICATION_API_KEY`. These values
must be established only after separate approved provider/sender verification;
the source adds no settings or cron job and changes no environment bindings.
The API worker checks configuration before claiming or making a connection.
Automated tests inject a fetch/send stub; no live SMTP/email network test runs.

Only new commerce tables, functions and triggers are added, together with a
composite coupon foreign key on the new optional core order coupon column.
Existing business rows, Auth rows, legacy policies/grants, wallet balances,
payment ledgers, historical orders and cron jobs are not updated or deleted.
The pending paid-subscription migration/flag remains untouched.

## Isolated installation and checks

Target: disposable loopback PostgreSQL database `commerce_test`, never a hosted
Supabase target. Supply development credentials through
`COMMERCE_TEST_DATABASE_URL`, using a URL such as
`postgresql://LOCAL_TEST_USER:LOCAL_TEST_PASSWORD@127.0.0.1:LOCAL_TEST_PORT/commerce_test`.
Do not substitute main/production credentials. The existing fixture runner
rejects nonloopback servers and any database name other than `commerce_test`.
The runner resets that disposable database and installs the baseline bootstrap
and foundation only there.

Run the coordinated expansion database runner after it has installed, in order,
the bootstrap, canonical foundation, baseline assertions, catalog migration,
customer migration, this migration and domain migration. Run
`supabase/tests/commerce_growth_notifications.sql` after the commerce_test
assertion helpers have been defined. Use the repository's full expansion test
runner for independent-session concurrency checks; sequential SQL assertions
alone do not establish concurrency behavior.

Application verification: `node tests/commerce-growth.test.mjs` passes 12 API/
function tests. They exercise owner/Auth/permission/same-origin guards, exact
money validation and tampering, disabled configuration, stub provider
idempotency, safe failures, per-lease ACKs and ambiguous ACK recovery. Focused
ESLint on all new growth JS/JSX and the test file passes with zero findings.
The migration and 40 new SQL assertions pass on isolated loopback PostgreSQL
18.4 after foundation, 72 baseline assertions, catalog and customer migrations
(112 assertions total). Independent connections also pass the final overall
coupon-use race (exactly one success/redemption) and concurrent worker claims
(skip locked events and obtain distinct leases). The disposable cluster was
stopped after these checks. PostgreSQL 18.4 with simulated Auth/storage roles
does not establish Supabase 17/hosted Auth/RLS compatibility. Full-suite build
and browser results are recorded in the coordinated expansion report. These
stub checks do not establish real provider acceptance. No hosted validation or
real external send was performed.

Read-only verification queries (run on an authorized target only):

```sql
select tablename, policyname, roles, cmd, qual from pg_policies
where schemaname='public' and tablename in
 ('commerce_coupons','commerce_coupon_redemptions','commerce_notification_outbox');
select table_name, grantee, privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name in
 ('commerce_coupons','commerce_coupon_redemptions','commerce_notification_outbox');
select p.oid::regprocedure, p.prosecdef, p.proconfig, p.proacl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','commerce_private') and p.proname in
 ('quote_coupon','commerce_growth_workspace','commerce_growth_owner_action',
  'commerce_notification_claim','commerce_notification_ack','commerce_notification_admin');
select status,count(*) from public.commerce_notification_outbox group by status;
select count(*) from public.commerce_coupon_redemptions r
join public.commerce_orders o on o.website_id=r.website_id and o.id=r.order_id
where o.customer_user_id<>r.user_id or o.coupon_id is distinct from r.coupon_id
   or o.discount_paise<>r.discount_paise;
```

Expected final query: zero inconsistent redemptions. Compare existing legacy
policies, balances, histories and cron definitions against the pre-application
snapshot without dumping business/customer data into a report.

## Rollback

Keep sending disabled and stop manually invoked workers. Revert application UI/
routes to the previous source only after assessing outstanding orders that use
coupon discounts. Preserve all coupon/redemption/outbox rows and the expanded
order totals/FKs: old code alone may not understand new order features. A safe
forward repair is preferable after new discounted orders exist. Do not drop
coupon tables or replay foundation to remove this increment; that would lose
usage/order history and break references. If no new data has ever been written,
a separately reviewed reverse migration could remove only these new triggers,
functions and tables in dependency order, with the order coupon FK first.
No destructive rollback script is supplied for databases holding new orders.

The permanent coordinated runner and current evidence are documented in
[expansion-db-validation.md](expansion-db-validation.md). It includes the final
coupon-use race, simultaneous cancelled-variant decisions with redemption
retention, separate worker transactions exercising SKIP LOCKED leases, baseline
data/RLS preservation, and failed reapplication atomicity for every explicitly
listed expansion migration. The earlier module-only counts above remain
historical evidence and are not added to the integrated result twice.

The final integrated PostgreSQL 18.4 result is **531 assertions**, including
34 dedicated analytics cases and all 40 original growth cases. Analytics tests
cover UTC boundary inclusion/exclusion, 7/30/90-day differences, zero days,
timezone independence, completion/payment-event deduplication, missing legacy
facts, exact pre-coupon gross item values, cross-tenant/Auth/permission denial,
separate base/variant alerts, feature suppression and top-ten/top-fifty bounds.
The read-only function inventory is linked in
[expansion-schema-inventory.md](expansion-schema-inventory.md); full SQL remains
the installation source of truth.
