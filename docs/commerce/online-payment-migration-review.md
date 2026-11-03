# Separate commerce online payment migration review

3 November 2026. Full SQL: [20261103091000_commerce_online_payments.sql](../../supabase/migrations/20261103091000_commerce_online_payments.sql).
This one-time transaction is review-only for hosted targets. No hosted SQL,
merchant/provider settings, webhook registration, deployment, live charge or
refund was performed. Apply locally only after catalog, customer, growth and
domain migrations. This is separate from the still-unapplied/off platform
`20261101123000_subscription_payment_ledger.sql`.

## Result and preservation boundary

The current source/unit checks use local synthetic identities and stubbed
Razorpay responses, not a real Razorpay test-mode account. The coordinated
PostgreSQL runner includes payment binding, capture replay, cross-method cart
races, retained failed fulfillment and reapplication checks; the final
[implementation report](expansion-report.md) and
[database evidence](expansion-db-validation.md) identify the actual tested
hashes/assertions. The focused payment adapter/API suite has 17 passing mocked
tests at this revision. This does not establish hosted Supabase 17, real Auth,
PostgREST roles, browser Checkout, signatures/webhooks accepted by the provider,
refunds, settlements or recovery against real funds.

Three additional pure browser-state tests reject copied tenant/intent storage
pointers, mismatched popup details and tampered fulfilled order/receipt bindings.
They are included in the final `npm test` result of 284/284 actual tests. The
combined five-migration PostgreSQL result is 531 assertions; it is distinct from
real provider acceptance. The full repository build passes with unchanged source
fingerprints during compilation.

The migration adds five private tables, their keys/indexes, functions and two
history guards. Its sole change to an existing table is replacement of
`commerce_orders_payment_method_check` with `payment_method IN ('cod','razorpay')`.
Existing COD rows remain valid; the existing unpaid/paid/refunded status domain
is retained. There is no existing-row UPDATE/DELETE/backfill, legacy RLS/grant
replacement, wallet/restaurant/delivery/resort/payment-history mutation or cron
job. Normal future fulfilled orders use existing transactional commerce order,
item, inventory, customer, coupon, timeline and outbox contracts.

## Every table and column

All five tables are in `commerce_private`, enable RLS, and explicitly revoke
**all direct table privileges** from PUBLIC, anon, authenticated and service_role.
They have **no user/service SELECT or mutation RLS policy**. Validated elevated
functions are the only API path; an ordinary service client cannot write table
rows directly. Every relation to a tenant-specific record uses the website in
its composite reference. No plaintext merchant secret is a SQL column.

### `commerce_private.payment_credential_versions`

Immutable encrypted tenant merchant credential versions. Changing merchant credentials creates a new row instead of overwriting the version used by pending attempts.

| Column | Exact declaration | Explanation |
| --- | --- | --- |
| `id` | `uuid primary key` | Stable UUID of this credential version, intent, immutable capture receipt or webhook record. Credential version UUID is assigned before encryption so it can be authenticated. |
| `website_id` | `uuid not null references public.commerce_websites(id)` | Commerce tenant boundary, retained in keys and composite references. |
| `mode` | `text not null check(mode in ('test','live'))` | Razorpay test/live mode for this immutable credential version; live additionally requires the separate server flag. |
| `ciphertext` | `text not null check(char_length(ciphertext) between 80 and 16000)` | AES-256-GCM encrypted key ID/secret/webhook-secret envelope; tenant/version are authenticated additional data. Never returned to browser/owner. |
| `created_at` | `timestamptz not null default now()` | Creation timestamp of the retained record. |
| `created_by` | `text not null check(char_length(created_by) between 3 and 254)` | Acting signed Admin email captured server-side for immutable merchant-version attribution. |

Additional constraints and their backing key indexes:

- `unique(website_id,id)` — The stated unique scope prevents duplicate/cross-attempt binding and automatically creates its unique backing index.

### `commerce_private.payment_merchants`

One website’s current merchant version and enabled gate. Older versions remain retained for existing attempts/webhooks.

| Column | Exact declaration | Explanation |
| --- | --- | --- |
| `website_id` | `uuid primary key references public.commerce_websites(id)` | Commerce tenant boundary, retained in keys and composite references. |
| `enabled` | `boolean not null default false` | Merchant gate for new payment intents/provider-order creation; false by default. |
| `credential_version` | `uuid not null` | The exact tenant-bound immutable credential version used by this merchant configuration/attempt/receipt/event. |
| `updated_at` | `timestamptz not null default now()` | Last validated merchant/intent state change; not a new capture or refund timestamp. |

Additional constraints and their backing key indexes:

- `foreign key(website_id,credential_version) references commerce_private.payment_credential_versions(website_id,id)` — The linked version, attempt or order must belong to this same website.

### `commerce_private.payment_intents`

One durable buyer/cart attempt, original normalized request/quote and provider-order creation state. An uncertain create cannot automatically become a second provider order.

| Column | Exact declaration | Explanation |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | Stable UUID of this credential version, intent, immutable capture receipt or webhook record. Credential version UUID is assigned before encryption so it can be authenticated. |
| `website_id` | `uuid not null references public.commerce_websites(id)` | Commerce tenant boundary, retained in keys and composite references. |
| `buyer_id` | `uuid not null references auth.users(id)` | Verified customer Auth UUID originally bound to the attempt. Workers fulfill for this stored buyer rather than impersonating Auth claims. |
| `cart_key` | `uuid not null` | Customer-supplied UUID idempotency key, unique per website/buyer; shares the COD advisory lock to block cross-method duplication. |
| `credential_version` | `uuid not null` | The exact tenant-bound immutable credential version used by this merchant configuration/attempt/receipt/event. |
| `request_payload` | `jsonb not null` | Strict normalized original items, shipping recipient/address, fulfillment and coupon instructions; private and compared on retry. |
| `quote` | `jsonb not null` | Original server-calculated line, fee, discount, minimum, coverage and inventory-mode snapshot; fulfillment must still match it exactly. |
| `amount_paise` | `bigint not null check(amount_paise between 1 and 1000000000000)` | Positive exact integer-paise amount bound to the original quote/provider order/capture, at most 10^12. |
| `currency` | `text not null default 'INR' check(currency='INR')` | Only INR is permitted; callback/provider/capture binding must match. |
| `state` | `text not null default 'new' check(state in ('new','creating','provider_unknown','ready','captured_unfulfilled','fulfilled'))` | The exact durable lifecycle shown in the declaration; state is not inferred from a browser callback or order status. |
| `provider_order_id` | `text check(provider_order_id ~ '^order_[A-Za-z0-9]{4,100}$')` | The original Razorpay order bound to this tenant/credential version/intent. Unknown creation results require reconciliation instead of a replacement POST. |
| `create_lease` | `uuid` | One durable random provider-create claim token. It prevents a competing creator; no automatic lease expiry creates another order. |
| `created_at` | `timestamptz not null default now()` | Creation timestamp of the retained record. |
| `updated_at` | `timestamptz not null default now()` | Last validated merchant/intent state change; not a new capture or refund timestamp. |

Additional constraints and their backing key indexes:

- `unique(website_id,id)` — The stated unique scope prevents duplicate/cross-attempt binding and automatically creates its unique backing index.
- `unique(website_id,buyer_id,cart_key)` — The stated unique scope prevents duplicate/cross-attempt binding and automatically creates its unique backing index.
- `unique(website_id,credential_version,provider_order_id)` — The stated unique scope prevents duplicate/cross-attempt binding and automatically creates its unique backing index.
- `foreign key(website_id,credential_version) references commerce_private.payment_credential_versions(website_id,id)` — The linked version, attempt or order must belong to this same website.

### `commerce_private.payment_receipts`

Immutable captured-payment evidence independent of successful order fulfillment. State/order/reconciliation fields may advance through the validated service path; capture identity/amount/history cannot change.

| Column | Exact declaration | Explanation |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | Stable UUID of this credential version, intent, immutable capture receipt or webhook record. Credential version UUID is assigned before encryption so it can be authenticated. |
| `website_id` | `uuid not null` | Commerce tenant boundary, retained in keys and composite references. |
| `intent_id` | `uuid not null` | Original tenant-bound payment intent for one retained capture receipt. |
| `credential_version` | `uuid not null` | The exact tenant-bound immutable credential version used by this merchant configuration/attempt/receipt/event. |
| `provider_order_id` | `text not null` | The original Razorpay order bound to this tenant/credential version/intent. Unknown creation results require reconciliation instead of a replacement POST. |
| `provider_payment_id` | `text not null check(provider_payment_id ~ '^pay_[A-Za-z0-9]{4,100}$')` | The verified captured Razorpay payment identifier; uniqueness prevents binding the same tenant/credential payment twice. |
| `amount_paise` | `bigint not null check(amount_paise between 1 and 1000000000000)` | Positive exact integer-paise amount bound to the original quote/provider order/capture, at most 10^12. |
| `currency` | `text not null check(currency='INR')` | Only INR is permitted; callback/provider/capture binding must match. |
| `captured_at` | `timestamptz not null default now()` | Time SQL persists verified capture evidence; not proof of settlement or refund. |
| `state` | `text not null default 'captured_unfulfilled' check(state in ('captured_unfulfilled','fulfilled'))` | The exact durable lifecycle shown in the declaration; state is not inferred from a browser callback or order status. |
| `order_id` | `uuid` | Nullable fulfilled commerce order reference. It is present exactly when receipt state is fulfilled. |
| `reconciliation_code` | `text not null default ''` | Safe fulfillment failure classification retained with a capture needing repair; raw provider/customer data is not stored as an error. |

Additional constraints and their backing key indexes:

- `unique(website_id,intent_id)` — The stated unique scope prevents duplicate/cross-attempt binding and automatically creates its unique backing index.
- `unique(website_id,credential_version,provider_payment_id)` — The stated unique scope prevents duplicate/cross-attempt binding and automatically creates its unique backing index.
- `unique(website_id,credential_version,provider_order_id)` — The stated unique scope prevents duplicate/cross-attempt binding and automatically creates its unique backing index.
- `foreign key(website_id,intent_id) references commerce_private.payment_intents(website_id,id)` — The linked version, attempt or order must belong to this same website.
- `foreign key(website_id,credential_version) references commerce_private.payment_credential_versions(website_id,id)` — The linked version, attempt or order must belong to this same website.
- `foreign key(website_id,order_id) references public.commerce_orders(website_id,id)` — The linked version, attempt or order must belong to this same website.
- `check((state='fulfilled')=(order_id is not null))` — Enforces state consistency: fulfilled receipts must have an order; only processing webhooks may hold both lease fields.

### `commerce_private.payment_webhooks`

Durable signed-event identity/body binding, bounded attempts and recoverable processing lease. It is not an automatic delivery scheduler.

| Column | Exact declaration | Explanation |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | Stable UUID of this credential version, intent, immutable capture receipt or webhook record. Credential version UUID is assigned before encryption so it can be authenticated. |
| `website_id` | `uuid not null` | Commerce tenant boundary, retained in keys and composite references. |
| `credential_version` | `uuid not null` | The exact tenant-bound immutable credential version used by this merchant configuration/attempt/receipt/event. |
| `event_id` | `text not null check(char_length(event_id) between 1 and 200)` | Provider event identifier, unique within website/credential version for durable deduplication. |
| `body_hash` | `text not null check(body_hash ~ '^[a-f0-9]{64}$')` | SHA-256 of exact signed raw bytes; reusing an event ID with a different body rejects. |
| `provider_order_id` | `text not null` | The original Razorpay order bound to this tenant/credential version/intent. Unknown creation results require reconciliation instead of a replacement POST. |
| `provider_payment_id` | `text not null` | The verified captured Razorpay payment identifier; uniqueness prevents binding the same tenant/credential payment twice. |
| `state` | `text not null default 'pending' check(state in ('pending','processing','processed','failed'))` | The exact durable lifecycle shown in the declaration; state is not inferred from a browser callback or order status. |
| `attempts` | `integer not null default 0 check(attempts between 0 and 100)` | Bounded webhook processing attempts; at 100 attempts the event requires reconciliation. |
| `lease_token` | `uuid` | Random exclusive webhook-processing token required by ACK. |
| `lease_expires_at` | `timestamptz` | Webhook claim expiration, currently 120 seconds; expired/failed events may be claimed on redelivery. |
| `last_error_code` | `text not null default ''` | Safe failed-event classification, not raw upstream errors or secrets. |
| `created_at` | `timestamptz not null default now()` | Creation timestamp of the retained record. |
| `processed_at` | `timestamptz` | Time a matching live lease records successful processing. |

Additional constraints and their backing key indexes:

- `unique(website_id,credential_version,event_id)` — The stated unique scope prevents duplicate/cross-attempt binding and automatically creates its unique backing index.
- `foreign key(website_id,credential_version) references commerce_private.payment_credential_versions(website_id,id)` — The linked version, attempt or order must belong to this same website.
- `check((state='processing')=(lease_token is not null and lease_expires_at is not null))` — Enforces state consistency: fulfilled receipts must have an order; only processing webhooks may hold both lease fields.

## Every index, trigger and policy

`commerce_payment_webhook_recovery` is the explicit partial index on
`(state,lease_expires_at)` for pending/processing/failed events. It supports
recovery inspection and claims without indexing processed history.

Every PRIMARY KEY/UNIQUE declaration above additionally creates its own unique
backing index: stable record identity; website/version and website/intent binding;
one intent per website/buyer/cart key; one provider order/payment per tenant
credential version; and one webhook event per tenant credential version. Foreign
keys and CHECK constraints do not create extra referencing-side indexes.

| Trigger | Exact binding and effect |
| --- | --- |
| `commerce_payment_credentials_immutable` | BEFORE UPDATE OR DELETE on `commerce_private.payment_credential_versions`, FOR EACH ROW, calls `payment_history_guard()`. A saved encrypted version cannot be changed or deleted. |
| `commerce_payment_receipts_immutable` | BEFORE UPDATE OR DELETE on `commerce_private.payment_receipts`, FOR EACH ROW, calls the same guard. DELETE is denied; UPDATE may change only `state`, `order_id` and `reconciliation_code`, leaving original capture identity/amount/timestamp intact. |

No new RLS policy grants a role access to these tables. RLS is enabled on all
five, but direct API-role table privileges are revoked as well. Existing public,
Storage and legacy policies are unchanged. The exact function grants below
separate public safe readiness, own buyer operations and trusted service actions.

## Every function

| Exact function signature | Purpose |
| --- | --- |
| `commerce_private.payment_history_guard() returns trigger language plpgsql set search_path=''` | History trigger: credential versions cannot be edited/deleted; receipts cannot be deleted or have original capture evidence rewritten. |
| `commerce_private.payment_assert_service() returns void language plpgsql set search_path=''` | Requires the actual PostgreSQL SET ROLE setting to be service_role. Caller-controlled JWT role text is not accepted as service authority. |
| `commerce_private.payment_view(p_intent_id uuid) returns jsonb language sql stable security definer set search_path=''` | Private safe projection of one intent, receipt and its own fulfilled order/items; excludes ciphertext and original private request payload. |
| `public.commerce_payment_availability(p_website_id uuid) returns jsonb language sql stable security definer set search_path=''` | Anonymous-safe active non-pharmacy catalog/merchant projection: only available/provider/mode, never keys or tenant-private payment details. |
| `public.commerce_payment_readiness(p_website_id uuid) returns jsonb language plpgsql stable security definer set search_path=''` | Current website owner with orders permission may read configured/enabled/mode/version-created time, without secrets. |
| `public.commerce_payment_status(p_intent_id uuid) returns jsonb language plpgsql stable security definer set search_path=''` | Own buyer-only intent/receipt/order projection; an arbitrary supplied intent ID cannot reveal another buyer’s payment. |
| `commerce_private.payment_price_checkout(p_website_id uuid,p_request jsonb,p_lock boolean,p_buyer_id uuid) returns jsonb language plpgsql security definer set search_path=''` | Private server-authoritative pricing with an explicit stored buyer for service fulfillment; validates tenant/products/variants/stock/coverage/minimum/coupon and uses deterministic product-then-variant locks when committing. |
| `public.commerce_payment_quote(p_website_id uuid,p_items jsonb,p_customer jsonb,p_fulfillment text,p_coupon_code text default '') returns jsonb language plpgsql stable security definer set search_path=''` | Verified buyer preview for an enabled online merchant, independent of the COD feature flag. Uses the strict core request normalizer and private online price function, excludes private coupon/inventory fields, and consumes nothing. |
| `public.commerce_payment_start(p_website_id uuid,p_items jsonb,p_customer jsonb,p_fulfillment text,p_cart_key uuid,p_coupon_code text default '') returns jsonb language plpgsql security definer set search_path=''` | Verified buyer durable intent creation/replay. Locks the same tenant/buyer/cart key as COD, website and Auth, retains the original saved-address snapshot on matching retries, rejects a changed request/COD-used key and snapshots the enabled merchant version/quote. |
| `commerce_private.payment_fulfill(p_intent_id uuid) returns uuid language plpgsql security definer set search_path=''` | Private captured-receipt-only fulfillment for the stored buyer. Rechecks exact original quote and stock/coupon conditions, inserts one paid Razorpay order/items and atomically consumes inventory/redemption; repeat fulfillment returns the same order. |
| `public.commerce_payment_admin(p_website_id uuid,p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=''` | Actual service-role-only readiness/configure/disable dispatcher. HTTP callers require a signed Admin session/same-origin mutation. Configure inserts a new ciphertext version and selects it; readiness returns counts/version/mode, no saved secrets. |
| `public.commerce_payment_service(p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=''` | Actual service-role-only dispatcher for private context/credentials, one provider-create lease, order attachment/unknown reconciliation, durable verified capture and leased webhook processing. Detailed state rules follow. |

Every new function explicitly revokes inherited PUBLIC/anon/authenticated/
service execution before its intended grants:

| Caller grant | Functions |
| --- | --- |
| anon, authenticated, service_role | `commerce_payment_availability(uuid)` only, returning safe availability/provider/mode. |
| authenticated | `commerce_payment_quote(uuid,jsonb,jsonb,text,text)`, `commerce_payment_readiness(uuid)`, `commerce_payment_status(uuid)`, `commerce_payment_start(uuid,jsonb,jsonb,text,uuid,text)`. Their verified/current-owner or own-buyer checks still apply. HTTP additionally verifies a trusted Auth response. |
| service_role | `commerce_payment_admin(uuid,text,jsonb)` and `commerce_payment_service(text,jsonb)` only. Both call the actual-role assertion. HTTP Admin and webhook signature/provider evidence remain required at their server call sites. |
| No API caller | All five `commerce_private` helper functions; callable only within their elevated implementation paths. |

All SECURITY DEFINER functions fix `search_path=''`; object references are
schema-qualified. The payment migration does not grant direct service DML on
private tables or let authenticated callers invoke the capture service.

## Durable state and provider adapter semantics

1. The strict HTTP schema accepts tenant, product/variant IDs, quantities,
   recipient/fulfillment, coupon and UUID cart key. It rejects submitted totals,
   prices, buyer identities and unknown fields. Auth supplies the buyer. The
   private intent stores the normalized original request and authoritative quote.
   Online quote works for a COD-disabled but separately enabled online merchant;
   COD never becomes enabled merely because online payments exist.
2. Provider creation is claimed once: `new -> creating` with `create_lease`.
   The fixed-origin Razorpay adapter creates an order using the stored amount,
   INR, deterministic receipt and tenant/intent notes. It validates those exact
   fields before attaching `provider_order_id` as `ready`. A timeout, malformed
   response or ambiguous attachment becomes `provider_unknown`; a crash can leave
   `creating`. Neither state automatically issues another create POST. A merchant
   must reconcile the existing provider order/receipt rather than start a new
   charge. The SQL create lease deliberately has no expiry/reclaim creating a
   second order.
3. Reconciliation reads the original order and payment from the same immutable
   credential version. Unknown-order attachment requires an exact matching
   provider order/receipt/notes/amount/currency. It never posts a replacement
   charge. Multiple captured provider results require explicit investigation.
4. Browser signature verification alone cannot mark payment paid. The server
   verifies the signature and fetches provider order/payment evidence; ID/order,
   amount, INR, `status='captured'`, `captured=true`, and no refunded amount must
   match. Authorized, failed, mismatched, uncaptured or refunded evidence rejects.
5. The service capture action validates original intent/version/order/amount/INR,
   inserts one immutable receipt and attempts fulfillment in a nested SQL block.
   If stock, quote, coupon, website/config or another invariant changed, only the
   order/stock/redemption work rolls back: captured evidence remains
   `captured_unfulfilled` with a safe reconciliation code. The browser retains
   the attempt and receipt, says not to pay again, and never labels it refunded.
   A later verified retry may fulfill the same receipt once. Duplicate capture
   returns the same order/receipt; cancelling an order does not erase the capture
   or manufacture a refund.
6. COD and online start use the same seed-0 cart-key advisory lock and check the
   other method before creating an order/intent. Existing original replay is
   returned; another payment method cannot reuse the same key to create a second
   order/charge. Distinct deliberate cart keys are distinct attempts; provider/
   operator acceptance must still verify buyer recovery across reloads/devices.
7. Webhooks require exact raw-body HMAC before durable claim/provider access.
   Accepted types are `payment.captured` and `order.paid`. Website/credential
   version are bound by the configured URL; event ID/body hash/order/payment
   identities are stored. A processed duplicate or unexpired processing lease
   is acknowledged without another provider call. A reused ID with different
   bytes rejects. Failed/expired claims may retry with a new 120-second lease;
   ACK requires its token/expiry. At 100 attempts reconciliation is required.
   The server fetches provider evidence again and shares the same capture path;
   payload capture flags are never trusted by themselves. No new cron or external
   retry scheduler is installed; real provider redelivery/manual recovery remains
   an operational acceptance requirement.

There is no stock reservation before external capture. This avoids pretending a
hold exists; it also means stock/quote drift can leave a real future capture
needing manual repair. There is no automatic refund, settlement reconciliation
or provider sandbox acceptance claim in this implementation.

An unresolved/unpaid intent deliberately keeps the cart and payment method
locked, even after closing Checkout. A safe abandonment/release workflow is not
implemented. The merchant may need to reconcile an unused attempt before the
buyer can continue; deleting local storage or switching to COD is not a safe
recovery because a delayed or unknown capture may still exist. This availability
limitation must be resolved or explicitly accepted before provider activation.

## Secrets, environment and callback configuration

- `COMMERCE_ONLINE_PAYMENTS_ENABLED` defaults false and gates new provider checkout.
- `COMMERCE_ONLINE_PAYMENTS_ALLOW_LIVE` defaults false and separately rejects live
  credentials/provider calls. Neither flag was enabled in hosted configuration.
- `COMMERCE_PAYMENT_ENCRYPTION_KEY` is a separately secured base64 encoding of
  exactly 32 random bytes. AES-256-GCM uses a random 12-byte IV and authenticated
  additional data `commerce-payments:<website UUID>:<credential-version UUID>`;
  copying ciphertext to another tenant/version cannot decrypt. The envelope
  retains IV/tag/ciphertext only. Never reuse restaurant, wallet or subscription
  keys and never expose this key via NEXT_PUBLIC, logs, Git or a browser response.
- Signed Admin saves merchant key ID, secret and webhook secret as a new immutable
  encrypted version. Raw form fields clear after a successful save. Existing
  attempts keep the original version; rotation does not rewrite capture evidence.
- Do **not** rotate the global encryption key in place. The current envelope has
  no key-version selector/keyring; replacing the environment value makes old
  immutable versions unreadable. A future encryption-key rotation needs a
  separately reviewed versioned key-management/recovery design. Retain secure
  access to the original encryption key and all required merchant versions.
- After separate sandbox/provider activation approval, configure the exact
  HTTPS webhook URL
  `/api/commerce/payments/webhook?website_id=<website UUID>&credential_version=<version UUID>`
  for that merchant/version and events `payment.captured` and `order.paid`. Keep
  prior webhook versions available for outstanding attempts. No webhook was
  registered by this task. The default app hostname needs no new payment DNS;
  custom-host DNS/TLS follows the separate domain review.
- Browser Checkout loads only the official Razorpay Checkout script after an
  enabled checkout action. Real script/device/redirect/webhook delivery and
  same-store account recovery require sandbox acceptance. No real provider
  request was made for these tests.

Disabling new checkout must preserve pending/captured recovery. The live-mode
flag also gates opening live credentials/provider reads; a future live shutdown
must include a reviewed reconciliation path rather than blindly making old live
receipts unreadable. No live attempt exists from this implementation.

## Exact installation and verification

Authorized target now: disposable loopback `commerce_test` only. Apply the five
explicit expansion files through the guarded coordinated runner, never a glob:

```sh
COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55447/commerce_test \
  node scripts/test-commerce-expansion-db.mjs
node tests/commerce-payments.test.mjs
npm test
npm run lint
npm run build
```

The runner destroys/recreates only its verified local synthetic database and
installs foundation solely there. The installed hosted foundation must not be
replayed. All hosted installation steps require a separately approved exact
target/file hash and follow [the consolidated five-file runbook](expansion-installation.md).
Do not apply the pending platform subscription ledger, run `supabase db push`,
repair hosted history or run SQL fixture/test files on application data.

Read-only inspection, only on an authorized target:

```sql
SELECT current_database(), inet_server_addr(), version();
SELECT c.relname,c.relrowsecurity,c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='commerce_private'
AND c.relname IN ('payment_credential_versions','payment_merchants',
 'payment_intents','payment_receipts','payment_webhooks');
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname='commerce_private';
SELECT p.oid::regprocedure,p.prosecdef,p.proconfig,p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='commerce_private' AND p.proname LIKE 'payment_%')
   OR (n.nspname='public' AND p.proname LIKE 'commerce_payment_%')
ORDER BY 1;
SELECT tgname,pg_get_triggerdef(oid) FROM pg_trigger
WHERE NOT tgisinternal AND tgname IN
 ('commerce_payment_credentials_immutable','commerce_payment_receipts_immutable');
SELECT indexname,indexdef FROM pg_indexes
WHERE schemaname='commerce_private' AND tablename IN
 ('payment_credential_versions','payment_merchants','payment_intents',
 'payment_receipts','payment_webhooks');
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='public.commerce_orders'::regclass
AND conname='commerce_orders_payment_method_check';
SELECT state,count(*) FROM commerce_private.payment_intents GROUP BY state;
SELECT state,count(*) FROM commerce_private.payment_receipts GROUP BY state;
SELECT state,count(*) FROM commerce_private.payment_webhooks GROUP BY state;
```

Expected metadata: five RLS-enabled private tables; no direct API grants or
new private table user policy; only the intended EXECUTE grants; two history
guards; named recovery and key indexes; commerce payment methods cod/razorpay.
Counts describe durable work, not settled balances. Never export ciphertext,
Auth/buyer/shipping details or real provider payloads into review artifacts.

## Rollback and recovery

A failed file rolls back atomically; prior completed expansion files remain.
After actual data exists, retain the private tables, encrypted versions,
encryption key, intents, immutable capture receipts, provider binding and
webhook hashes/leases. Do not DROP/TRUNCATE them, clear capture history, delete
an uncertain intent, change paid truth or replay a COD checkout as recovery.
No destructive down migration is supplied.

Disable only new creation through an approved operator workflow; retain the
ability to verify existing charges and reconcile the original receipt/order.
Old application source may ignore Razorpay commerce orders and cannot safely
undo captures. A reviewed forward fix is preferred to restoring an older
business-data snapshot. Refunds require a separate authoritative provider
workflow; an approved return/cancellation is not refund proof. Database restore
alone cannot reverse external charges/events. Preserve all existing business
modules, balances, order/payment history, RLS and cron definitions. The user’s
backup prerequisite waiver remains respected; no backup or restore is claimed.
