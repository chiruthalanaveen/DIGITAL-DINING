# Customer experience migration review

Every new table/column/function/index/policy/trigger is inventoried in
[expansion-schema-inventory.md](expansion-schema-inventory.md), alongside the
full versioned SQL. The final coordinated database run passes 531 assertions;
see [expansion-db-validation.md](expansion-db-validation.md).

Prepared 2 November 2026 on `feature/commerce-expansion`. The new migration is
`supabase/migrations/20261102161000_commerce_customer_experience.sql`, applied
only after `20261102160000_commerce_catalog_fulfillment.sql`. This is source for
review; it has not been installed on any hosted database or deployed.

## Objects and authorization

| New object | Purpose and protection |
| --- | --- |
| `commerce_saved_addresses` | Website + Auth user owned address book, maximum 20 addresses through the RPC. Unique partial index permits one default per website/user; an advisory transaction lock serializes saves. Owners cannot read customer addresses through their membership. |
| `commerce_wishlist_items` | Website + user + product key; composite tenant product FK. Only the owning customer can SELECT; active catalog validation precedes additions. Duplicate additions are idempotent. |
| `commerce_reviews` | One review per website/customer/product with composite order and product FKs. The RPC requires that exact product in a completed order belonging to the verified customer. Customer edits clear moderation. Direct SELECT exposes only one's own reviews. |
| `commerce_order_requests` | Cancellation/return request and immutable decision identity/timestamp, reason and policy snapshot. Composite order FK and one request per order/type. Customers see their requests; owners need `orders` permission. A decided request cannot be changed to the opposite decision. |
| `commerce_order_status_events` | Append-only order facts from actual INSERT/status/payment changes. Composite order FK; customer/owner `orders` SELECT scope. Identity `event_sequence` provides deterministic order even within one transaction; no historical transitions are invented. |
| `commerce_order_status_events_event_sequence_seq` | Private identity sequence; all public, anon, authenticated and service execution/access grants are removed. Only the elevated event trigger assigns values. Gaps from rolled-back transactions are valid. |
| Five new SELECT RLS policies | Apply solely to the five new tables. Existing policies are not replaced or edited. No mutation policies are introduced. |
| `commerce_order_status_event_record` | AFTER order INSERT or UPDATE of status/payment_status, appends a fact only when stored state changes. Initial state retains the order's stored creation timestamp. Later facts use `clock_timestamp()`. |
| `commerce_order_status_event_immutable` | BEFORE UPDATE/DELETE on events rejects rewriting or deleting facts, including privileged ordinary SQL. |
| `commerce_customer_experience(uuid,text,jsonb)` | Verified authenticated user only; derives identity from `auth.uid()`, locks and checks the website, then rechecks and SHARE-locks the verified Auth row after the wait. Validates exact action keys/types, scopes every query to website/user and returns the private account snapshot. Mutation requires an active non-pharmacy website. Read access preserves own history when a store becomes read-only. |
| `commerce_owner_engagement(uuid,text,jsonb)` | Verified current owner only. Moderation needs `products`; request decisions need `orders`; reads require either and omit disallowed modules. Mutations lock the website FOR UPDATE before request/order rows, matching core's lock hierarchy and rechecking current membership after waiting. |
| `commerce_public_product_reviews(uuid,uuid)` | The only public review surface. Returns up to 50 approved reviews with id/rating/title/body/created_at, count and average over all approved reviews. Requires active store/catalog/product/category. Returns null for unavailable or mismatched tenants. No customer, order or moderator identities are returned. |
| `commerce_private.customer_payload(jsonb,text[])` | Private exact-key/object/size validator, rejecting identity and financial field injection. |
| `commerce_private.customer_identifier(jsonb)` | Private canonical UUID JSON-string validator; rejects numeric/null/missing identifier coercion. |
| `commerce_private.saved_address(uuid,uuid,uuid)` | Private checkout lookup, requires the verified current Auth user and exact website/user/address ownership. Returns stored name, phone, address and pincode; not callable by API roles. |
| `commerce_private.customer_snapshot(uuid,uuid)` | Private tenant/user result builder with wishlist IDs/names, addresses, own reviews/requests, timeline and authoritative review/request eligibility. |
| `commerce_private.owner_engagement_snapshot(uuid)` | Private permission-filtered owner result builder. Review moderation output excludes customer and order identities so product permission does not reveal order/customer records. |
| `commerce_private.record_order_status_event()` | SECURITY DEFINER trigger implementation; no callable API grant. |
| `commerce_private.reject_event_mutation()` | Private append-only event guard. |

All five tables explicitly revoke all privileges from PUBLIC, anon,
authenticated **and service_role**, then grant SELECT to authenticated and
service_role. Consequently neither a customer nor an Admin service client can
bypass mutation validation through direct INSERT/UPDATE/DELETE. Public mutation
RPCs grant EXECUTE only to authenticated; the public safe review RPC additionally
grants anon and service_role. Every new function explicitly removes inherited
PUBLIC/anon/authenticated/service grants, including private helpers.

Owner snapshot limits are the latest 200 reviews, latest 200 requests and latest
1,000 timeline events, ordered chronologically in the response. Customer timeline
reads cover the latest 200 own orders to match the account order-history window.
This limits response size without deleting history. Review eligibility chooses
one completed order per product, preferring the order attached to an existing
review and otherwise the latest completed purchase.

## Decisions and financial preservation

Cancellation requests do not change an order. An owner's approval invokes the
existing core `commerce_owner_action(...,'update_order_status',...)` in the same
transaction, preserving its valid transitions, base/variant restocking and
exactly-once `inventory_released_at` handling. Repeating the same decision does
not restock twice. A completed order cannot subsequently be cancelled.

Returns require an explicitly configured policy: `returns_enabled: true`, an
integer `return_days` from 1 through 365 and nonempty plain text `returns` terms.
Eligibility uses a stored immutable completed event. For completed orders that
record only later payment changes, those events do not establish completion or
extend the return window. Only initial completed creation facts or genuine
status changes to completed qualify. For completed orders that
predate event installation, the known order creation date is a conservative
lower bound; later payment updates never extend the return window. This can
exclude a legacy order whose completion date is unknown, requiring the store to
handle that request separately. History remains available; the migration does
not fabricate completion timestamps or backfill events.

Return approval records the merchant's decision only. It does not mark payment
refunded, collect payment, restock goods or rewrite completed order status. No
refund/provider integration, wallet transaction, cron or notification is added.

## Input contract

All objects are strict; extra actor IDs, ratings in moderation payloads, payment
flags or arbitrary status fields are rejected. UUID identifiers must be canonical
JSON strings. Address saves use optional `id`, label 1–60, name 2–180, phone
7–30 matching `^\+?[0-9][0-9 ()-]+$`, address 5–1,000, six-digit pincode and an
optional boolean `is_default`. Deletion uses `address_id`.

Reviews use `order_id`, `product_id`, JSON integer rating 1–5, title 0–120 and body
1–3,000. Requests use `order_id`, `type` (`cancellation`/`return`) and reason
5–2,000. Decisions use `request_id`, decision `approved`/`rejected` and note
0–2,000. Moderation uses `review_id` and status `approved`/`rejected`. Text fields
are trimmed on mutation; SQL and the HTTP schemas use the same bounds.

## Preservation and rollback

This migration performs no existing-row UPDATE/DELETE/backfill and replaces no
existing function, table, policy, grant or cron definition. Existing commerce
orders, customer rows, request payloads, payments and legacy restaurant/delivery/
resort/wallet tables remain intact. The sole existing-table addition is the
AFTER trigger on `commerce_orders`; it appends new order facts transactionally.
A failed event write aborts the surrounding order transaction rather than losing
timeline truth.

Rollback should restore the previous application while retaining all new tables,
identity sequence, policies, functions and events. Older source ignores them;
retaining the append-only order trigger preserves subsequent facts. Do not drop
tables or truncate events, addresses, reviews or requests to roll back: that
would destroy newly collected customer/history data. If disabling capture ever
becomes necessary, review a separate migration that drops only the capture
trigger and documents the resulting timeline gap; preserve the immutability
trigger and all recorded rows. No destructive down migration is supplied.

## Exact local installation and verification

Only an explicitly selected isolated loopback database named `commerce_test` is
an authorized target. The customer-specific development run used PostgreSQL
18.4 at `127.0.0.1:55453`, disposable data under `/tmp/commerce-customer-pgdata`,
and synthetic Auth roles/users; no hosted credentials or network/provider calls.
Do not run these fixture instructions on main, staging, a hosted Supabase target
or a database containing application data. Do not reapply the installed
foundation on any existing target or run `supabase db push`.

For a fresh local `commerce_test` fixture, after checking the URL and endpoint:

```sh
export COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55453/commerce_test
psql "$COMMERCE_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -c "SELECT current_database(), inet_server_addr(), version();" \
  -f supabase/tests/commerce_bootstrap.sql \
  -f supabase/migrations/20261022160000_commerce_foundation.sql \
  -f supabase/tests/commerce_rls_checkout.sql \
  -f supabase/migrations/20261102160000_commerce_catalog_fulfillment.sql \
  -f supabase/migrations/20261102161000_commerce_customer_experience.sql \
  -f supabase/tests/commerce_customer_experience.sql
```

The foundation/bootstrap commands above are for a **new disposable fixture
only**. If the isolated fixture already contains the foundation and core, apply
only this customer migration once, then its test file using the existing test
helpers. Each migration is transactional and intentionally one-time. A replay
must fail and must be followed by explicit ROLLBACK before further commands;
never hide a failure with manual partial installation or history repair.

Read-only checks after installation:

```sql
SELECT tablename, policyname, roles, cmd, qual
FROM pg_policies WHERE schemaname='public'
AND tablename IN ('commerce_saved_addresses','commerce_wishlist_items',
 'commerce_reviews','commerce_order_requests','commerce_order_status_events')
ORDER BY tablename, policyname;

SELECT c.relname, c.relrowsecurity, c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('commerce_saved_addresses',
 'commerce_wishlist_items','commerce_reviews','commerce_order_requests',
 'commerce_order_status_events','commerce_order_status_events_event_sequence_seq')
ORDER BY c.relname;

SELECT p.oid::regprocedure, p.prosecdef, p.proconfig, p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='public' AND p.proname IN ('commerce_customer_experience',
 'commerce_owner_engagement','commerce_public_product_reviews'))
OR (n.nspname='commerce_private' AND p.proname IN ('saved_address',
 'customer_payload','customer_identifier','customer_snapshot',
 'owner_engagement_snapshot','record_order_status_event','reject_event_mutation'))
ORDER BY 1;

SELECT tgname, pg_get_triggerdef(oid)
FROM pg_trigger WHERE NOT tgisinternal AND tgname IN
 ('commerce_order_status_event_record','commerce_order_status_event_immutable');
```

## Actual evidence and limits

The fresh local installation and tests passed on PostgreSQL 18.4: canonical
foundation, 72 existing baseline SQL assertions, core catalog migration,
customer migration and **71 customer SQL assertions: 143 assertions total**.
Coverage includes cross-owner/customer/website access, verified identity,
strict identifier types, direct customer/Admin DML denial, private-helper grants,
review eligibility/moderation/reset/public safety, explicit policy and expired
returns, cancellation replay/restock, deterministic immutable status facts,
unchanged-update suppression and legacy wallet/cron preservation. Broader expansion-migration and concurrency results must be recorded in the
parent integration report.

These synthetic local Auth primitives do not establish Supabase 17.6/hosted Auth,
PostgREST/RLS/session compatibility or payment/provider behavior. Hosted
installation/validation is intentionally unperformed and remains a separate gate.
The customer module's HTTP regression run passed 11 actual handler/security tests;
repository lint/build and broader browser acceptance are reported by the parent
integration report, not inferred from SQL results.

The coordinated runner in [expansion-db-validation.md](expansion-db-validation.md)
also verifies concurrent withdrawal of customer Auth verification while waiting
for the website lock, owner membership withdrawal, and simultaneous approval
of a customer's discounted variant cancellation. The losing/repeated decision
does not restock twice and coupon redemption history remains intact. Verified
Auth and current owner membership rows are SHARE-locked through the operation.
