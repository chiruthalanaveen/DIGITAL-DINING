# Full subscription migration review

2 November 2026. This file explains the complete
[20261101123000_subscription_payment_ledger.sql](../../supabase/migrations/20261101123000_subscription_payment_ledger.sql).
Read that full SQL file, not an excerpt, before any installation approval.
It is a **new migration required by this increment**, prepared and tested locally
only. No hosted SQL or production data operation was performed.

## Why a receipt alone is insufficient

The previous verified-payment handler recomputed expiry and updated the business
on every captured callback. A unique receipt prevents subsequent callbacks only
after the first receipt exists. An empty ledger cannot identify historical
payments already consumed by the old application. The new flow therefore opens
an approved-owner checkout intent before creating the provider order, places its
UUID in server-created provider notes and binds the returned order before the
browser can pay. Unregistered old orders require reconciliation; no history is
invented or automatically imported.

## New tables and every column

Both tables live in the new `subscription_private` schema. UUID restaurant/owner
values are immutable identity snapshots. There is no foreign key to an existing
restaurant/Auth table, so this migration does not block account deletion or
cascade-delete financial evidence.

| `checkout_intents` column | Type and purpose |
| --- | --- |
| `id` | UUID primary key generated on the server; binds the entire checkout. |
| `restaurant_id` | Required UUID of the approved business, checked under its row lock. |
| `owner_id` | Required verified Auth owner UUID; never inferred from email/phone. |
| `plan_code` | Required text plan code validated by the private plan-term function. |
| `billing_cycle` | Required text cycle, validated as 1/6/12 months. |
| `amount_paise` | Required positive bigint; must equal the authoritative term price. |
| `currency` | Required text constrained to `INR`. |
| `provider_key_id` | Required bounded public key identifier; no provider secret. |
| `provider_order_id` | Nullable, unique bounded provider order reference; bound once. |
| `created_at` | Required database timestamp at millisecond precision. |
| `bound_at` | Nullable database timestamp; present exactly when the order is bound. |

| `activation_receipts` column | Type and purpose |
| --- | --- |
| `checkout_id` | UUID primary key and the only new foreign key, referencing the new intent. One receipt per checkout. |
| `restaurant_id` | Required immutable business UUID snapshot. |
| `owner_id` | Required immutable verified owner UUID snapshot. |
| `provider_order_id` | Required unique bounded order reference; cannot be consumed by another checkout. |
| `provider_payment_id` | Required unique bounded payment reference; cannot fund another activation. |
| `provider_key_id` | Required bounded public key identifier matching the intent. |
| `plan_code` | Required text plan snapshot matching the intent and verified order. |
| `billing_cycle` | Required cycle snapshot. |
| `amount_paise` | Required positive bigint amount matching the stored intent. |
| `currency` | Required `INR` snapshot. |
| `activated_at` | Required database timestamp for the first committed activation. |
| `subscription_expires_at` | Required original expiry, constrained to be after activation. |
| `restaurant_snapshot` | Required JSON object containing only the original safe subscription DTO; no phone, token, secret, card or raw provider payload. |

The twelve CHECK constraints enforce positive amounts, INR currency, bounded
reference/key syntax, binding/timestamp consistency, JSON-object snapshot shape
and expiry ordering. Twenty-two columns are NOT NULL; order/binding timestamps
are nullable only while an intent is unbound. Plan/cycle validity and matching
identity/payment terms are enforced in service-only functions. Existing tables
receive no new columns, keys or constraints.

## Five new backing indexes

| Index | Purpose |
| --- | --- |
| `checkout_intents_pkey` | Unique intent UUID. |
| `checkout_intents_provider_order_id_key` | Unique bound order, allowing unbound NULLs. |
| `activation_receipts_pkey` | Exactly one consumed-payment receipt per checkout. |
| `activation_receipts_provider_order_id_key` | An order cannot activate a second checkout. |
| `activation_receipts_provider_payment_id_key` | A payment cannot activate another checkout/order. |

These indexes belong only to the two new tables. No legacy index is changed.

## Six new functions

| Function | Authority and behavior |
| --- | --- |
| `subscription_private.plan_terms(text,text)` | Private immutable mapping of the five existing plans × three cycles, exact paise prices, legacy plan/business type and module flags. The API and SQL matrices are tested for all fifteen terms. Future price changes need coordinated source and versioned SQL review. |
| `subscription_private.term_expiry(timestamptz,text)` | Computes UTC calendar expiry once, preserving the previous UTC-host JavaScript month-end/leap-year rollover behavior. It does not silently clamp to the last day of a month. Twelve boundary cases are tested. |
| `subscription_private.reject_receipt_mutation()` | Trigger function that rejects receipt UPDATE, DELETE and TRUNCATE with `55000`. It does not replace any legacy trigger. |
| `public.subscription_open_checkout(...)` | Service-only definer RPC. Validates exact terms and verified owner/approval under the restaurant row lock, then creates the server UUID intent. Repeated identical intent registration returns the same row; conflicting terms fail. |
| `public.subscription_bind_checkout(...)` | Service-only definer RPC. Rechecks current owner/approval and binds one provider order. Identical binding is safe; replacement or cross-intent/order reuse fails. |
| `public.subscription_activate_payment(...)` | Service-only definer RPC. Requires an existing bound intent and exact owner/tenant/order/key/plan/cycle/amount/currency. Locks restaurant then intent, rechecks approval after waits, claims unique payment/order/checkout, updates the subscription and records the receipt in one transaction. A separate reread checks the final state after immediate triggers. Identical replays return the frozen result and never update the restaurant. |

Public RPCs have a five-second lock timeout and a fixed `pg_catalog` search path;
all business relations/functions are explicitly schema-qualified. They also
require the actual database role to be `service_role`, not a caller-edited JWT
claim. The service-only backend must still verify Auth, provider signature,
fetched order/payment IDs, amount/currency and capture before activation. SQL
does not contact Razorpay or independently prove capture.

## Two triggers and RLS/grants

- `reject_receipt_change`: BEFORE UPDATE OR DELETE, per receipt row.
- `reject_receipt_truncate`: BEFORE TRUNCATE, per statement.

PostgreSQL also creates its internal referential-integrity triggers for the one
receipt-to-intent foreign key. They enforce child INSERT/UPDATE references and
parent UPDATE/DELETE restrictions using existing PostgreSQL RI functions. Both
ends are new private tables; no internal FK trigger is added to a legacy/Auth
table. The reported two-trigger count means explicit user-defined triggers and
excludes those automatically managed internal triggers.

RLS is enabled on both new tables. **No new RLS policy is created.** No PUBLIC,
anonymous, authenticated or service-role schema/table access is granted. The
installer owns tables/functions and retains normal owner bypass; FORCE RLS is
not enabled because it would require an extra installer BYPASSRLS dependency.
Only the three public RPCs grant EXECUTE to `service_role`, without grant option.
Private helpers receive no application-role EXECUTE grants.

A final ACL assertion inspects all grantees on the new namespace/tables/functions.
Unexpected inherited privileges abort the transaction. It does not alter global
default privileges or silently strip another role's existing grants. Negative
tests include an unexpected BYPASSRLS role with inherited schema/table/function
grants and verify a complete installation rollback.

## Installation effects and preservation

The migration is one transaction. Its preflight only reads catalog metadata to
check the existing restaurant column types, unique ID and required service role.
Installation creates one schema, two tables/24 columns, six functions, two
user-defined triggers and five backing indexes. It performs **no existing-business-row DML**,
ownership backfill, history import, RLS replacement, wallet adjustment, cron,
storage, payment-provider operation or commerce-foundation replay. A collision
or reapplication fails and rolls back; it is not an upsert-style migration.

Only a later, explicitly authenticated runtime activation updates these eight
existing subscription fields: `plan`, `plan_code`, `billing_cycle`,
`subscription_status`, `subscription_expires_at`, `business_type`,
`resort_enabled`, `delivery_enabled`. Existing unrelated data remains outside
this function. Delivery defaults retain the previous non-overwriting upsert in
the API; they are not migration-installation writes.

Local tests preserve complete pre-existing fixture catalogs, grants, rows,
policies/triggers, wallets, transactions, orders/customers, bookings and cron.
They also prove rollback after receipt failures and immediate AFTER-trigger
overrides, approval/owner revocation during a lock wait and lost-response retry.
They do not certify unreviewed legacy triggers, deferred behavior, current target
privileges or installed Supabase compatibility. Existing 31 October metadata
records 126 restaurant triggers and no deferrable ones; no new production query
was made. Current hosted compatibility still needs separate verification.

See [test report](subscription-ledger-report.md) and
[installation/rollback/recovery](subscription-ledger-installation.md). The full
SQL and code are review artifacts; hosted application and deployment remain held.
