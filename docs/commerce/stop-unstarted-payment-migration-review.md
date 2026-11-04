# Stop an unstarted payment request — migration review

4 November 2026. Complete SQL:
[`20261104120000_commerce_stop_unstarted_payment.sql`](../../supabase/migrations/20261104120000_commerce_stop_unstarted_payment.sql).

This seventh commerce migration is prepared for review and isolated development
testing. No hosted target is approved for it. It does not authorize production
SQL, a deployment, a provider request or activation. The six preceding migration
files remain unchanged; the installed foundation and separate pending platform
subscription ledger must not be replayed.

## Behavior and its limit

A verified buyer can stop an **existing** checkout attempt only while its stored
state is `new`, its provider order and creation lease are both NULL, and no
capture receipt exists. The RPC rechecks these conditions while holding the
same intent row lock used by provider-order creation. The original request,
quote, amount, currency, buyer, website, credential version and cart key remain
in history. The result includes immutable proof of the stop.

The provider adapter first claims creation by changing `new` to `creating` under
that row lock, and only then can it send a provider POST. If creation wins the
race, stopping rejects. If stopping wins, creation cannot subsequently claim
the terminal row. No elapsed-time, provider outage, popup dismissal or absence
of a callback is treated as evidence that payment is safe to cancel.

`creating`, `provider_unknown`, `ready`, `captured_unfulfilled` and `fulfilled`
remain outside this workflow. General unpaid-provider cancellation, refunds and
expiry are not implemented by this migration. Unexpected external/orphan capture
evidence remains a reconciliation incident; it must not revive a stopped intent
or be presented as a completed refund.

An absent intent also cannot be stopped: the original create request could still
arrive. Inspection returns `found:false`, NULL payment/proof/intent and
`can_cancel_unstarted:false`. Cancellation of an absent record raises SQLSTATE
`23505`; it does not create a tombstone or release the browser pointer.

The old cart UUID stays reserved by its retained intent and the existing COD
guard. After verified cancellation, a new checkout must use a fresh UUID. The
browser must validate website, cart and intent binding plus the proof before
unlocking; it must preserve bag contents. Terminal state alone is insufficient.

## Every new table and column

`commerce_private.payment_unstarted_cancellations` stores immutable evidence.
It has seven columns:

| Column | Definition and purpose |
| --- | --- |
| `id` | UUID primary key, generated with `gen_random_uuid()`. Stable proof reference. |
| `website_id` | Required UUID. Tenant component of the composite intent foreign key and buyer/cart uniqueness. |
| `intent_id` | Required, unique UUID. Identifies the one original intent; only one proof may exist for it. |
| `buyer_id` | Required UUID referencing `auth.users(id)`. The cancelling identity is taken from verified `auth.uid()`, never from a caller-supplied buyer field. |
| `cart_key` | Required UUID. Retains the original browser checkout key and binds cart-only recovery to the same attempt. |
| `reason` | Required text, default and CHECK fixed to `never_dispatched`. This is not a free-text provider-failure or refund assertion. |
| `cancelled_at` | Required timestamptz with database `now()` default. Records the original transaction timestamp; retries do not replace it. |

The composite foreign key `(website_id,intent_id)` references
`commerce_private.payment_intents(website_id,id)`, preventing a proof from
pointing at another tenant's intent. The separate buyer foreign key and all
foreign keys use the default retained-history behavior; no cascading deletion
is introduced. The validated RPC also binds buyer and cart to the original row.

The primary key, unique `intent_id`, and unique
`(website_id,buyer_id,cart_key)` constraints create three backing unique indexes.
There is no additional explicit index or sequence. Existing financial/history
tables and their indexes are not removed or rebuilt by this file.

## Existing constraint changes

On `commerce_private.payment_intents` only:

1. `payment_intents_state_check` is replaced with the same six existing states
   plus the new terminal `cancelled_unstarted` state. No existing row is updated
   or backfilled during installation.
2. `commerce_unstarted_terminal_shape` requires a stopped row to have both
   `provider_order_id IS NULL` and `create_lease IS NULL`.

The trigger and RPC provide the additional proof, no-receipt, original-state
and unchanged-snapshot checks that a row CHECK alone cannot establish.

## Every new function and trigger

All functions pin `search_path=''`, and all inherited execution privileges are
explicitly revoked from PUBLIC, anon, authenticated and service_role before the
one public RPC is granted to authenticated.

| Function | Security and purpose |
| --- | --- |
| `commerce_private.payment_unstarted_proof_guard()` | PL/pgSQL trigger function, ordinary invoker security. Always raises `42501` on a proof rewrite or deletion. No direct API-role execution is granted. |
| `commerce_private.payment_cancelled_intent_guard()` | PL/pgSQL SECURITY DEFINER trigger function. Rejects insertion directly into the terminal state, every subsequent update of a stopped row, and unsupported transitions into that state. The only permitted transition is original `new` to terminal with a matching stored proof, NULL provider/lease, no receipt and no change to any original field except `state`/`updated_at`. |
| `commerce_private.payment_attempt_view(uuid,uuid,uuid)` | SQL STABLE SECURITY DEFINER helper. Reads intent, existing safe `payment_view`, proof and eligibility in one statement snapshot. It joins website, buyer and cart together and exposes no credentials. It does not lock or mutate the intent. It is not executable directly by API roles. |
| `public.commerce_payment_attempt_control(uuid,uuid,text,uuid)` | PL/pgSQL SECURITY DEFINER RPC. Parameters are website, cart key, action (default `inspect`) and optional expected intent UUID. Only authenticated has EXECUTE. It derives the buyer from `auth.uid()`, verifies current email confirmation under an Auth-row `FOR SHARE` lock, and implements inspection or the narrow stop. Admin/service is not granted a buyer-impersonation path. |

Two triggers are added:

- `commerce_payment_unstarted_proof_immutable`, BEFORE UPDATE OR DELETE on the
  new proof table, calls the proof guard.
- `commerce_payment_cancelled_intent_guard`, BEFORE INSERT OR UPDATE on payment
  intents, calls the terminal-intent guard. Unrelated existing states continue
  through the existing workflow.

Existing function bodies and existing triggers are not replaced. A transactional
`NOTIFY pgrst,'reload schema'` announces the public RPC to PostgREST. It is not a
cron job, provider notification or customer message.

## Locking, authorization and idempotency

The RPC takes the verified Auth-row SHARE lock before looking up the original
intent. Cancellation then selects the own website/buyer/cart intent `FOR UPDATE`
and checks the expected UUID, if supplied. It rechecks eligibility after waiting
for the lock. Inspection uses the STABLE helper without an intent write lock.

There is deliberately no cart advisory lock in cancellation. Existing
fulfillment takes an intent lock followed by its cart lock; adding the inverse
order could create a deadlock. Cancellation does not insert or reuse a cart,
reserve stock or place an order, so it needs only the shared intent-row
serialization with `claim_create`.

The first successful stop inserts the proof and changes only the own intent's
`state` and `updated_at` in the same transaction. An identical retry returns the
original proof and timestamp without another write. A foreign buyer, website,
cart or mismatched expected intent cannot acquire a matching record. Missing or
withdrawn email verification rejects. Store archival, merchant disablement,
credential rotation or a disabled checkout rollout do not prevent recovery of
this owned, provably unstarted record; none of those reads activates checkout.

## RLS and privilege effects

The new private table has RLS enabled and **no direct-read RLS policy**. All
table privileges, including SELECT and mutation/TRUNCATE privileges, are revoked
from PUBLIC, anon, authenticated and service_role. The three private helpers
have no direct API-role EXECUTE. Only the public controlled RPC receives
authenticated EXECUTE; anon and service_role cannot use it to stop a buyer's
checkout.

No existing RLS policy, grant, default grant, wallet, payment receipt, order,
customer row or cron definition is altered during installation. The migration
adds one table, four functions and two triggers, widens one state constraint and
adds one terminal-shape constraint. Runtime stopping deliberately appends a
proof and changes the one eligible intent; it does not change stock, coupon use,
orders, receipts, settlements or wallet balances.

## Public result contract

The RPC returns `{website_id,cart_key,intent_id,found,payment,cancellation,
can_cancel_unstarted}`. The API adds its capability/response envelope.

`payment` is NULL or the existing safe payment view. `cancellation` is NULL or
`{id,intent_id,cancelled_at,reason:'never_dispatched'}`. Buyer identities,
credential versions/ciphertext, original request/quote and raw provider payloads
are not added to this control result. A discovered original intent ID can repair
a browser pointer that previously retained only the cart key. `can_cancel_unstarted`
is a current eligibility snapshot, not confirmation that cancellation occurred.

The API/browser must fail closed on missing capability, denied access, timeout,
malformed success, stale or foreign proof and missing records. Only a bound
terminal payment plus its explicit immutable proof may release the local
pointer. Existing state/API validators need to understand the new terminal
state; cancelled replay must not decrypt merchant credentials or call a provider.

## Exact installation steps and target

This task's authorized target is an isolated loopback database named
`commerce_test`, using synthetic development identity only. No hosted database
is an installation/test target. The guarded runner requires the URL explicitly,
checks both supplied hostname/name and connected server address, and resets only
that disposable fixture.

```sh
export COMMERCE_TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55447/commerce_test'
node scripts/test-commerce-expansion-db.mjs
npm test
npm run lint
npm run build
```

The runner's explicit commerce order is:

1. `20261102160000_commerce_catalog_fulfillment.sql`
2. `20261102161000_commerce_customer_experience.sql`
3. `20261102162000_commerce_growth_notifications.sql`
4. `20261103090000_commerce_verified_domains.sql`
5. `20261103091000_commerce_online_payments.sql`
6. `20261104090000_commerce_payment_recovery_queue.sql`
7. `20261104120000_commerce_stop_unstarted_payment.sql`

The runner constructs the canonical foundation only in its fresh isolated
fixture. **Never reapply the foundation to the hosted project**, run the
destructive runner/bootstrap/test SQL there, use blanket `supabase db push`, or
repair hosted migration history to hide manual installation. The separate
`20261101123000_subscription_payment_ledger.sql` remains excluded and off.

Future hosted installation requires a separate explicit approval naming the
target and reviewed hashes. Verify which prefix is already installed without
mutating it. Apply only the approved absent files, once, in the order above. For
a target that already has the approved first six, the seventh-file operation is:

```sh
# FUTURE APPROVED TARGET ONLY; not a command executed by this task.
psql "$COMMERCE_APPROVED_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20261104120000_commerce_stop_unstarted_payment.sql
```

Supply an approved URL securely in that operator environment; never paste it
into chat or Git. Keep all provider rollout/live flags disabled. This migration
needs no new environment variable, DNS setting, Storage policy or cron job.
Use the existing installation/recovery runbook together with this seventh-file
review. The user's withdrawn staging/backup prerequisites are not reintroduced;
no production backup or hosted validation is claimed.

## Read-only verification queries

Run these only on the isolated test target or a separately approved read target.
They inspect metadata/aggregate invariants, not customer request contents.

```sql
-- Seven columns; RLS is enabled. No new private direct-read policy exists.
select column_name,data_type,is_nullable,column_default
from information_schema.columns
where table_schema='commerce_private'
  and table_name='payment_unstarted_cancellations'
order by ordinal_position;
select relrowsecurity,relforcerowsecurity
from pg_class
where oid='commerce_private.payment_unstarted_cancellations'::regclass;
select * from pg_policies
where schemaname='commerce_private'
  and tablename='payment_unstarted_cancellations';

-- Verify the new table keys/FKs and both intent CHECK definitions.
select conrelid::regclass as relation,conname,pg_get_constraintdef(oid)
from pg_constraint
where conrelid in (
  'commerce_private.payment_unstarted_cancellations'::regclass,
  'commerce_private.payment_intents'::regclass)
order by conrelid::regclass::text,conname;

-- Direct role privileges must all be false; only authenticated RPC execution.
select role_name,
  has_table_privilege(role_name,
    'commerce_private.payment_unstarted_cancellations',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as any_direct_table_privilege,
  has_function_privilege(role_name,
    'public.commerce_payment_attempt_control(uuid,uuid,text,uuid)',
    'EXECUTE') as public_rpc_execute
from (values ('anon'),('authenticated'),('service_role')) roles(role_name);

-- Four functions with pinned empty search_path; only view helper is STABLE.
select n.nspname,p.proname,p.prosecdef,p.provolatile,p.proconfig,p.proacl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='commerce_private' and p.proname in (
  'payment_unstarted_proof_guard','payment_cancelled_intent_guard',
  'payment_attempt_view'))
  or (n.nspname='public' and p.proname='commerce_payment_attempt_control')
order by n.nspname,p.proname;

-- Expected zero: stopped intent without a matching immutable proof.
select count(*) as invalid_stopped_intents
from commerce_private.payment_intents intent
left join commerce_private.payment_unstarted_cancellations proof
  on proof.website_id=intent.website_id and proof.intent_id=intent.id
  and proof.buyer_id=intent.buyer_id and proof.cart_key=intent.cart_key
where intent.state='cancelled_unstarted'
  and (proof.id is null or intent.provider_order_id is not null
    or intent.create_lease is not null
    or exists(select 1 from commerce_private.payment_receipts receipt
      where receipt.website_id=intent.website_id
        and receipt.intent_id=intent.id));

-- Expected zero: proof attached to a row that was reopened or rebound.
select count(*) as invalid_cancellation_proofs
from commerce_private.payment_unstarted_cancellations proof
join commerce_private.payment_intents intent
  on intent.website_id=proof.website_id and intent.id=proof.intent_id
where intent.state<>'cancelled_unstarted'
  or intent.buyer_id<>proof.buyer_id or intent.cart_key<>proof.cart_key;
```

Compare pre/post definitions for all existing RLS policies, grants, table rows,
financial aggregates and cron jobs using the isolated runner's preservation
evidence. A metadata count alone does not prove those definitions or rows are
unchanged. These queries do not authorize or demonstrate a real provider charge,
refund, hosted Auth policy or production installation.

## Rollback and recovery considerations

A failed installation rolls back transactionally, including its DDL/NOTIFY. After
successful installation and any recorded stop, retain the new terminal state,
proof table, original intent and immutability guards. Never delete proofs,
change stopped rows back to `new`, or narrow the state CHECK to the old six values
to make a downgrade pass. That would discard evidence or make an old request
chargeable again. No destructive down migration is supplied.

An application rollback can leave the additive objects in place, but older
clients may not understand `cancelled_unstarted`; they can display an error and
retain the pointer. They still must not revive the request or reuse its old key.
Prefer a reviewed forward fix preserving the proof and original references.
If the feature must be paused, a separately approved revocation of the new
authenticated RPC can block further stops, but it also disables self-service
inspection through that RPC. It is not a way to erase existing cancellations.

Continue recovering already-dispatched/captured/provider-unknown payments with
their original credential versions, provider evidence and immutable receipts.
No automatic refund, provider cancellation or financial repair is created here.
The existing recovery plan still applies to unrelated business rows, wallets,
orders and cron definitions; no new backup or restore was performed or claimed.

## Verification status

The seven-file isolated run passes **628 PostgreSQL assertions** on verified
`127.0.0.1:55447/commerce_test`, PostgreSQL **18.4**, using synthetic credentials.
A multiset comparison confirms that every predecessor assertion remains present:
the prior **561** assertions plus **58** new module assertions and **9** new
integration/preservation/reapplication checks. The new concurrency cases prove
both creation-versus-stop race winners, identical concurrent stop proofs,
verification withdrawal while waiting, and the still-in-flight missing original
that must never be interpreted as cancelled.

```sh
COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55447/commerce_test \
  node scripts/test-commerce-expansion-db.mjs
node --check scripts/test-commerce-expansion-db.mjs
npx eslint scripts/test-commerce-expansion-db.mjs
```

Runner syntax, focused ESLint, and five invalid-target guards pass. The initial
local attempts identified two fixture/check omissions: the preservation check
needed to account for the two new foreign keys' eight internal RI triggers while
still comparing every old trigger exactly, and a synthetic receipt needed its
required `INR` currency. Both were corrected in tests; the new migration itself
needed no SQL source change.

Evidence is under
`/workspace/commerce-validation-artifacts/commerce-unstarted-20261104/`:
`integrated-sql.log`, `integrated-sql-summary.json` and `runner-target-guards.log`.
The summary records all 628 labels, first-six hash preservation and zero
inconsistent order totals, redemptions, captured receipts or cancellation proofs.
Application metadata changes from 33 to **34 tables** and 65 to **69 functions**;
the existing **31 policies** and one synthetic cron definition remain unchanged.
The fixture Auth/Storage helpers add three functions outside the application
schemas and are counted separately. The migration SHA-256 is
`a53667d6003885e4ec972ba63859d7e3047b0fbe29344ffca5aa8463a7a6a754`.

Application unit/build/browser checks remain the parent agent's separate
validation and are not claimed by this SQL review.

Local PostgreSQL roles and transactional tests do not establish hosted Supabase
17/Auth/PostgREST/Storage behavior. Provider acceptance remains unperformed;
tests must use synthetic credentials and must not process a live payment.
