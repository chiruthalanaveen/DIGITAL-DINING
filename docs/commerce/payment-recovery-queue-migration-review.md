# Read-only Admin payment recovery queue migration review

4 November 2026. Migration:
[20261104090000_commerce_payment_recovery_queue.sql](../../supabase/migrations/20261104090000_commerce_payment_recovery_queue.sql).
This is a sixth, additive, review-only commerce migration. The five preceding
commerce expansion files remain byte-for-byte unchanged. No hosted SQL,
provider lookup, charge, capture, refund, deployment or merchant configuration
change was performed by this database work. The separate platform subscription
ledger remains excluded and unapplied.

## Problem and resulting behavior

Existing Admin readiness exposes recovery counts but cannot identify the
attempts behind them. A buyer who loses their local intent reference can leave
an open attempt that Admin cannot discover through the supported application.
The new function lists safe references for the selected website. Listing does
not resolve, close, retry or change an attempt, and a displayed row is not proof
of a failed payment or a new permission to charge it.

All five unfulfilled states are included: `new`, `creating`, `provider_unknown`,
`ready`, `captured_unfulfilled`. `fulfilled` is excluded. New/ready attempts are
open checkout activity; creating attempts may still be in progress. No timeout,
expiry or automatic closure is inferred or introduced.

Results prioritize captured-unfulfilled work, then provider-unknown/creating
attempts, then ready/new attempts. Each priority bucket sorts by oldest
`created_at`, then UUID. At most 100 rows are returned, so critical work cannot
be hidden behind a large backlog of ordinary ready attempts. `total_count` is
the exact count of matching attempts for this website, without a count cap;
`has_more` is true exactly when that count exceeds 100. No global count or
another tenant's data contributes to the result.

Recovery reads remain available for setup, suspended or archived stores and
disabled/rotated merchants. They do not depend on new-checkout rollout flags or
merchant activation. The server still must verify the signed Admin session
before using its service client; this function does not make an Admin browser
or a website owner a service principal.

## Every SQL object and privilege

The migration adds exactly one function:

`public.commerce_payment_reconciliation_queue(p_website_id uuid) RETURNS jsonb`

It is PL/pgSQL, `STABLE`, `SECURITY DEFINER`, with `search_path=''`. It first
calls the existing private `commerce_private.payment_assert_service()` guard,
which checks the actual PostgreSQL `SET ROLE` context. Neither SECURITY DEFINER
ownership nor a forged JWT role string authorizes a call. NULL/nonexistent
website identifiers reject with SQLSTATE `22023` after service authorization.

The function explicitly revokes all inherited execution from PUBLIC, anon,
authenticated and service_role, then grants only service_role `EXECUTE`.
No private-table SELECT or mutation privileges are added. Existing functions,
including the private service guard, are not replaced or modified.

No table, column, constraint, index, trigger, sequence, RLS policy, default grant
or cron job is created or changed. There is no row INSERT/UPDATE/DELETE/backfill,
financial transition, advisory lock, worker lease or provider action. Existing
website-prefixed intent/receipt/credential unique indexes support its tenant
lookups; the bounded result is ordered without introducing a new index. A
transactional `NOTIFY pgrst,'reload schema'` announces the new public function.

Mode joins the intent's original website-bound immutable credential version,
not the current merchant version. Receipts join by both website and intent ID;
their unique key prevents duplicate projected intent rows.

## Exact output and excluded private data

The envelope is `{website_id,intents,total_count,has_more}`. Every intent uses
this explicit projection; no private row or existing `payment_view` result is
returned:

| Field | Meaning |
| --- | --- |
| `id` | Stable intent UUID used by the existing recovery workflow. |
| `website_id` | Selected tenant UUID. |
| `cart_key` | Original website/buyer cart-attempt reference. |
| `state` | Current stored state; queue listing does not change it. |
| `amount_paise` | Original bound integer-paise amount. |
| `currency` | Original stored currency, currently INR. |
| `mode` | Test/live mode of the original credential version. |
| `provider_order_id` | Existing provider-order reference, or JSON null. |
| `created_at` | Stored attempt creation timestamp. |
| `receipt` | JSON null, or the safe receipt projection below. |

A receipt contains exactly `{id,state,order_id,reconciliation_code}`. It does
not expand the order, customer details, item history or provider payment record.
Buyer UUID, name, email, phone, address, actor email, credential version/ciphertext,
provider keys, request/quote payloads, create leases and webhook bodies are
excluded. The function constructs every object with an allowlist.

## Actual local checks

The guarded runner now explicitly applies the six commerce files in order;
it never discovers migrations with a glob or includes the platform ledger:

```sh
COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55447/commerce_test \
  node scripts/test-commerce-expansion-db.mjs
```

This command resets only the verified disposable `commerce_test` database.
The actual run used loopback PostgreSQL 18.4 with synthetic Auth/Storage roles
and development credentials. **561 PostgreSQL assertions pass**: all 531
previous assertions remain present, plus 27 queue SQL assertions and three
independent queue-installation preservation, READ ONLY transaction and atomic
reapplication assertions. The first five migration hashes still match the
3 November evidence.

Tests cover all open states, fulfilled exclusion, critical priority over more
than 100 ready attempts, exact105/100/zero counts, UUID tie-breaking, safe object
keys, original credential mode after rotation, archived/disabled recovery,
tenant/receipt isolation, owner/buyer/anonymous denial and forged JWT roles.
The queue executes successfully in a PostgreSQL `BEGIN READ ONLY` transaction.
Snapshots prove queue calls preserve all payment/private/business rows, wallet
fixtures, policies, grants, stock, Auth, Storage and cron. An additional snapshot
immediately before this sixth migration proves all already-installed five-file
definitions, indexes, constraints, triggers, grants, policies and rows remain
unchanged, excluding exactly this newly added function.

Second application rejects the existing function with `42723`, leaves the
transaction aborted until explicit rollback, and preserves all definitions and
rows. The local object count changes only from 64 to 65 public/private application
functions; 33 inspected tables, 31 policies and the single existing cron fixture
remain. Consistency queries find no inconsistent order totals, coupon
redemptions or linked captured receipts.

Evidence:
`/workspace/commerce-validation-artifacts/commerce-recovery-20261104/integrated-sql.log`
and `integrated-sql-summary.json`. Migration SHA-256:
`71b549ed8d1e011511e5ca9e27d21aaa9dd87f676c59b955cba70f2bce053d77`.
Historical 3 November 531-assertion artifacts are retained separately.

PostgreSQL 18.4 with simulated Auth/Storage does not establish Supabase 17/17.6,
hosted Auth/PostgREST role behavior, real provider acceptance, captured money or
settlement. No hosted query or external request was made for these checks.
Application build/browser/API results are recorded by the coordinated report.

## Future installation and read-only verification

No hosted target is approved for this migration. After separate approval names
the exact target and migration files, verify the installed state and required
five expansion dependencies first. Apply the exact reviewed sixth file once,
in its complete transaction. Do not replay the installed foundation, use
`supabase db push`, repair migration history, or silently apply other pending
files. If the five expansions are also absent, each requires applicable approval
and must be installed in the reviewed six-file order. The loopback command above
is for disposable development fixtures only and must not use hosted credentials.

Read-only metadata verification on an explicitly authorized target:

```sql
SELECT current_database(), inet_server_addr(), version();
SELECT p.oid::regprocedure, p.prosecdef, p.provolatile, p.proconfig, p.proacl,
       pg_get_functiondef(p.oid)
FROM pg_proc p
WHERE p.oid='public.commerce_payment_reconciliation_queue(uuid)'::regprocedure;
SELECT
 has_function_privilege('anon',
  'public.commerce_payment_reconciliation_queue(uuid)','EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',
  'public.commerce_payment_reconciliation_queue(uuid)','EXECUTE') AS owner_execute,
 has_function_privilege('service_role',
  'public.commerce_payment_reconciliation_queue(uuid)','EXECUTE') AS service_execute;
```

Expected volatility is `s`, SECURITY DEFINER is true, search path is empty,
and execution privileges are false/false/true. Invoke the queue only through
the verified Admin server's real service client; a SQL Editor owner call or
forged JWT is deliberately rejected. Compare existing policy/grant and retained
history checks with the pre-application snapshot without exporting customer or
credential data into reports.

## Rollback

Revert the new Admin queue UI/API while retaining the function and every payment,
receipt, credential, order and webhook record. The function is read-only and
existing checkout/recovery code ignores its presence. If disabling database
access is necessary, a separately reviewed follow-up migration can revoke its
service execution; it must not delete or alter financial history. There is no
destructive data rollback, intent close/expiry action or provider compensation
in this increment.
