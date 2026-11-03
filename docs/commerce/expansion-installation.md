# Commerce expansion installation, verification and recovery

3 November 2026. This is a review/runbook, not permission to install on a hosted
database, enable providers or deploy. Current authorized testing uses a disposable
loopback `commerce_test` database. The user withdrew staging/backup prerequisites;
do not substitute production for testing or ask for those prerequisites again.

## Complete SQL and exact order

Database changes are required for this expansion. Each file is transactional,
versioned and intentionally one-time. Open the complete linked SQL, then its
object/permission review; the table is an index, not a substitute for full SQL.

The [generated core/customer/growth object inventory](expansion-schema-inventory.md)
explains all 13 new tables and 127 columns, eight added order/item columns,
34 functions, ten explicit indexes, four triggers and twelve SELECT policies.
It also lists implicit key indexes, intentional constraint/function replacements,
the identity sequence and exact privilege boundaries. Domain/payment inventories
are in their respective reviews. A source inventory does not establish that the
latest edit has been executed or passed tests.

| Order | Complete migration | Review and purpose |
| --- | --- | --- |
| 1 | [20261102160000_commerce_catalog_fulfillment.sql](../../supabase/migrations/20261102160000_commerce_catalog_fulfillment.sql) | [Catalog review](catalog-migration-review.md): five tables for settings, profiles, images, variants and delivery zones; optional order/item snapshots; validated checkout/owner wrappers and service-only template assignment. |
| 2 | [20261102161000_commerce_customer_experience.sql](../../supabase/migrations/20261102161000_commerce_customer_experience.sql) | [Customer review](customer-migration-review.md): five tables for addresses, wishlists, reviews, requests and immutable order events; scope/eligibility/moderation RPCs and event triggers. |
| 3 | [20261102162000_commerce_growth_notifications.sql](../../supabase/migrations/20261102162000_commerce_growth_notifications.sql) | [Growth review](growth-migration-review.md): coupons, immutable redemptions and notification outbox; authoritative discount/redemption/analytics, leased workers and new-order/status event trigger. |
| 4 | [20261103090000_commerce_verified_domains.sql](../../supabase/migrations/20261103090000_commerce_verified_domains.sql) | [Domain review](domain-migration-review.md): private tenant domain claim/proof state, reservation/index/RLS, scoped claims/Admin verification and public safe resolution. No DNS is changed by SQL. |
| 5 | [20261103091000_commerce_online_payments.sql](../../supabase/migrations/20261103091000_commerce_online_payments.sql) | [Payment object/permission/recovery review](online-payment-migration-review.md): five private tables/50 columns, twelve functions, two guards, recovery/key indexes, scoped quote/service RPCs and commerce payment-method constraint widening. |

The canonical `20261022160000_commerce_foundation.sql` is **already installed on
the hosted project**. Never reapply it there, run a blanket `supabase db push`,
repair migration history to hide that manual installation, or run fixture SQL
against an existing application database. The pending
`20261101123000_subscription_payment_ledger.sql` is a separate platform feature;
it is excluded from this chain and remains unapplied/off.

The expansion does not delete/backfill existing business records, replace legacy
RLS policies, change wallet balances/payment transactions or install cron jobs.
It does deliberately add commerce order/item columns, replace the commerce
total/item uniqueness contracts, wrap two commerce functions while retaining
their original bodies privately, add commerce triggers and widen the commerce
payment-method constraint. Review those compatibility effects before approval.

## Reproduce the isolated development checks

Requirements: repository dependencies installed with the committed lockfile,
Node supported by this checkout, and PostgreSQL reachable only on loopback.
The recorded run used PostgreSQL 18.4 on `127.0.0.1:55447`, not managed Supabase.
An empty disposable database named `commerce_test` is required; the runner
destroys/recreates that database. Do not point it at any database with data to
retain. It verifies the supplied host/database and the connected server address.

From the repository root, with only synthetic/development credentials loaded:

```sh
npm ci
export COMMERCE_TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55447/commerce_test'
node scripts/test-commerce-expansion-db.mjs
npm test
npm run lint
npm run build
```

The recorded URL contains no password and identifies only this local synthetic
cluster. On another machine, substitute its verified local test identity/port
securely. The runner installs the bootstrap/foundation **only while creating that
fresh fixture**, runs the original checks, applies the explicit five-file chain,
and tests preservation, RLS, tampering, concurrency and atomic reapplication.
It never infers main/staging URLs, globs the migrations folder or calls a hosted
migration CLI. See [531-assertion database evidence](expansion-db-validation.md).

Browser commands, after preparing that disposable database, are:

```sh
COMMERCE_BROWSER_SKIP_DB=1 node tests/commerce-expansion.browser.mjs
COMMERCE_BROWSER_SKIP_DB=1 node tests/commerce.browser.mjs
```

Run them sequentially to avoid fixture collisions. The expansion suite uses its
own app/fixture ports; the original suite uses ports 4320/4319. Their default
standalone workflow builds the application. Reuse a build only when it was made
from the exact final source with matching synthetic public environment values.
The original runner can create the expanded database itself by setting
`COMMERCE_BROWSER_USE_EXPANSION=1` instead of skipping database preparation.
The final report identifies the commands actually executed. Verification uses
the full repository `npm run build` and the actual full application.

Local PostgreSQL roles enforce real SQL RLS and transactional locks, while the
fixture models Auth/REST/Storage/email/provider protocols. These checks do not
establish Supabase 17/17.6, hosted Auth hooks, real PostgREST JWT/role handling,
Storage HTTP or provider acceptance. No hosted test credential is borrowed from
production. A network denial must be recorded with the exact blocked operation;
it is not evidence of a bad password or a passing integration.

## Future hosted installation — only after separate approval

No hosted target is currently approved for these files. The steps below become
actionable only after approval identifies the exact target and reviewed hashes.
Do not run the destructive test runner, bootstrap or SQL test fixtures there.

1. Review all five full files and object inventories. Record their SHA-256 values,
   the application commit, the exact target project/database/version, and the
   existing installed foundation state. Read-only checks must first confirm the
   foundation prerequisites and absence of the new objects; existing objects
   require investigation, not blind replay or manual partial installation.
2. Record a private before-state of existing schema/policy/grant/cron definitions
   and aggregate business invariants without exporting customer/financial rows
   into Git or public artifacts. The user waived the prior backup prerequisite;
   no backup is claimed to exist or requested again. Apply the recovery plan
   below only within separately authorized access.
3. Keep `COMMERCE_ONLINE_PAYMENTS_ENABLED`,
   `COMMERCE_ONLINE_PAYMENTS_ALLOW_LIVE`, `COMMERCE_NOTIFICATIONS_ENABLED`,
   `COMMERCE_CUSTOM_DOMAINS_ENABLED` and
   `COMMERCE_DOMAIN_PROVISIONING_ENABLED` off. Do not copy Production secrets to
   a Preview or use main for fixture checkout.
4. In the explicitly approved target’s SQL Editor, paste and execute the complete
   first file once, including its `BEGIN`/`COMMIT`. Confirm success and the
   corresponding read-only checks. Repeat with files 2–5 in the listed order.
   If a file fails, stop, issue `ROLLBACK` if its session remains aborted, and
   inspect the error; do not continue with fragments or reapply the foundation.
   CLI installation, if separately chosen and approved, must enumerate those
   exact five files with `psql -X -v ON_ERROR_STOP=1 -f <file>`; no wildcard or
   `db push` is part of this runbook.
5. Run only read-only verification and compare the before-state. Use separately
   authorized non-production Auth/browser/provider acceptance before feature
   activation. Migration installation alone does not authorize merchant charges,
   DNS, email, deployment, a PR merge or main push.

Each migration review includes object-specific queries. The following common
checks inspect metadata and inconsistencies without publishing private records:

```sql
SELECT current_database(), inet_server_addr(), version();

SELECT n.nspname AS schema_name, c.relname, c.relrowsecurity, c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE (n.nspname='public' AND c.relname IN
 ('commerce_store_settings','commerce_product_profiles','commerce_product_images',
  'commerce_product_variants','commerce_delivery_zones','commerce_saved_addresses',
  'commerce_wishlist_items','commerce_reviews','commerce_order_requests',
  'commerce_order_status_events','commerce_coupons','commerce_coupon_redemptions',
  'commerce_notification_outbox','commerce_domains'))
 OR (n.nspname='commerce_private' AND c.relname IN
 ('payment_credential_versions','payment_merchants','payment_intents',
  'payment_receipts','payment_webhooks'))
ORDER BY 1,2;

SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname IN ('public','storage')
ORDER BY schemaname,tablename,policyname;

SELECT p.oid::regprocedure,p.prosecdef,p.proconfig,p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname IN ('public','commerce_private')
 AND (p.proname LIKE 'commerce_%' OR n.nspname='commerce_private')
ORDER BY 1;

SELECT count(*) AS inconsistent_totals FROM public.commerce_orders
WHERE total_paise <> subtotal_paise + delivery_fee_paise - discount_paise;

SELECT count(*) AS inconsistent_redemptions
FROM public.commerce_coupon_redemptions r
JOIN public.commerce_orders o ON o.website_id=r.website_id AND o.id=r.order_id
WHERE r.user_id<>o.customer_user_id OR r.coupon_id IS DISTINCT FROM o.coupon_id
   OR r.discount_paise<>o.discount_paise;

SELECT count(*) AS inconsistent_capture_orders
FROM commerce_private.payment_receipts r
JOIN public.commerce_orders o ON o.website_id=r.website_id AND o.id=r.order_id
WHERE r.state='fulfilled' AND
 (o.customer_user_id IS DISTINCT FROM
   (SELECT i.buyer_id FROM commerce_private.payment_intents i WHERE i.id=r.intent_id)
  OR o.total_paise<>r.amount_paise OR o.payment_method<>'razorpay');

SELECT state,count(*) FROM commerce_private.payment_receipts GROUP BY state;
SELECT status,count(*) FROM public.commerce_notification_outbox GROUP BY status;
```

The inconsistency counts should be zero for valid fixtures. Counts are not a
substitute for owner/customer Auth RLS tests or payment-provider evidence.
Do not print credential ciphertexts, shipping details, provider secrets, private
TXT proofs, Auth tokens or real customer rows into an issue/report.

## Environment, DNS, Auth and Storage requirements

Existing Supabase URL/anon key/service-role and signed Admin settings remain in
their established scopes. New values below are **server-only** and optional
until separately approved activation. None was added to hosted environments.

| Feature | Additional environment/configuration |
| --- | --- |
| Merchant payments | `COMMERCE_ONLINE_PAYMENTS_ENABLED=false` and `COMMERCE_ONLINE_PAYMENTS_ALLOW_LIVE=false` by default; `COMMERCE_PAYMENT_ENCRYPTION_KEY` is a separately secured base64 32-byte AES key, retained for all historical credential versions. Merchant key ID/secret and webhook secret are saved only through signed Admin and encrypted per website/version; never reuse restaurant/wallet/subscription keys. |
| Payment callbacks | After separate sandbox activation, configure the versioned webhook URL `/api/commerce/payments/webhook?website_id=<website UUID>&credential_version=<version UUID>` for the selected merchant. Verify raw-byte signatures plus server-fetched capture/amount/currency/order evidence. Keep old credential/webhook versions available for unresolved attempts. A browser callback alone is insufficient. |
| Notifications | `COMMERCE_NOTIFICATIONS_ENABLED=false` by default; approved sender setup requires `COMMERCE_NOTIFICATION_PROVIDER=resend`, `COMMERCE_NOTIFICATION_SENDER_VERIFIED=true`, `COMMERCE_NOTIFICATION_FROM` and `COMMERCE_NOTIFICATION_API_KEY`. No cron is installed. Worker invocation/scheduling and real delivery acceptance require separate operator action. |
| Custom domains | `COMMERCE_CUSTOM_DOMAINS_ENABLED=false` and `COMMERCE_DOMAIN_PROVISIONING_ENABLED=false` by default; explicit `COMMERCE_VERCEL_PROJECT_ID`, `COMMERCE_VERCEL_TEAM_ID` and least-privilege `COMMERCE_VERCEL_API_TOKEN`. Domain registration/checking is bound to that configured project. |
| Generated names | Optional `COMMERCE_DOMAIN_BASE_HOSTNAME` is not proof of readiness. Actual wildcard project/DNS configuration and a certificate covering `*.base` are required, followed by each claim’s verification and Admin activation. |
| DNS/TLS | Apply only official provider instructions for a tenant-controlled host after approval. Preserve existing mail and other DNS records. Verify ownership, alias to the approved deployment, DNS and current TLS before activation. No DNS/provider records were created by implementation. |
| Auth origins | Add each approved Preview/custom origin’s exact `/auth/callback/commerce` return prefix to the Supabase redirect allowlist and verify email/PKCE flows. Do not assume the primary origin’s allowlist covers a new hostname. No real verification email was sent. |
| Storage | Reuse the existing `commerce-media` bucket and website-ID object paths, MIME/5MB upload bounds and owner RLS. The expansion installs **no new bucket or Storage policy**. Confirm the existing bucket/policies and test upload isolation before hosted activation; do not reapply foundation policies or grant global uploads. |

No new environment value should use a `NEXT_PUBLIC_` prefix for secrets. Safe
catalog payment readiness exposes only availability/provider/mode; private
merchant credentials, domain proofs and notification recipients are not public
catalog data.

## Manual acceptance on the isolated app

Use only the synthetic identities from `tests/helpers/commerce-fixture.mjs` and
the local fixture server. The production site is not a test destination.

1. Open `/commerce/auth`, exercise signup/verification/recovery with the fixture’s
   PKCE email links, submit an owner application, then use `/admin` to review it,
   create/assign the website and configure permitted features. Confirm pending,
   rejected, suspended and unassigned identities cannot mutate another store.
2. In `/commerce/dashboard`, create a category/product, upload gallery images,
   add two variants with distinct SKUs/prices and adjust their stock separately.
   Enable required selection; inspect archive/edit behaviour without overwriting
   stock. Have the other synthetic owner attempt the same record IDs and confirm
   denial, including direct RPC/table access tests.
3. Assign each of the five templates through signed Admin, configure optional
   FAQ/policies/sections/SEO and PIN zones, then visit its `/shops/<slug>` page.
   Check 360/390/768/1440 widths, document overflow, touch targets, keyboard focus,
   gallery/zoom closing, empty/broken media and disabled sections. Inspect actual
   metadata rather than inferring SEO from the visual page.
4. Sign in as a buyer scoped to that store. Save/remove a wishlist entry, add and
   change a default address, preserve manually typed checkout fields and switch
   accounts. Another buyer/website must never see the first buyer’s addresses,
   orders, requests or saved items. A failed wishlist read must offer retry
   rather than pretending an item is unsaved.
5. Mix simple and variant lines, combine filters, test supported/unsupported PINs,
   fee/minimums and coupon dates/caps/usage. Check authoritative quotes and reject
   injected totals, prices and buyer IDs. Place COD, replay the same attempt,
   simulate a lost response/reload and confirm one order/stock decrement. Edit or
   delete the chosen saved address, retry identically and confirm the original
   shipping snapshot; a changed cart/recipient must conflict.
6. Advance the merchant order through stored states and inspect the buyer timeline.
   Request cancellation and approve twice; stock restores once. Complete another
   order, submit/edit a review and moderate it; only approved reviews appear
   publicly without buyer identity. Exercise eligible/expired/disabled return
   requests. Return approval must not fabricate collection, restock or refund.
7. Verify analytics permissions and exact period/order-value labels, private
   coupon counts and safe notification counts. Keep external sends off. Test
   worker lease/retry behaviour with injected local stubs, not real email.
8. Verify signed Admin domain/payment panels show disabled readiness. Domain
   ownership/DNS/TLS/provider and real sandbox Checkout/webhooks are separate
   approved acceptance steps; local mocks cannot mark those passed. For a local
   payment stub, exercise unknown creation, duplicate callbacks/events,
   cross-method cart races and captured/unfulfilled receipts. Keep the original
   attempt/receipt and prevent a new charge until reconciliation; do not report
   a refund from an order/request status.

## Recovery and rollback considerations

A failed single migration rolls back atomically; completed earlier files remain
installed. Stop at the failing file and use a reviewed forward repair after
diagnosing prerequisites or drift. Each file is intentionally non-idempotent;
its second application must fail without partial changes.

After records exist, application rollback should retain new tables, order/item
snapshots, immutable events/receipts, coupon redemptions, customer requests and
verified ownership history. Old source may not understand variant, discounted
or online-paid orders, so deploying older source is not automatically a safe
operational rollback. Prefer a forward fix while new creation/provider features
are disabled. Do not drop/truncate tables, clear receipts, rewrite paid truth,
refund by status checkbox, reset balances, replay foundation or restore an old
business-data snapshot over newer transactions.

Keep notification sends and domain provisioning off; deactivate individual
claims through signed Admin where applicable. A registered external domain or
DNS record can survive application rollback; removal is a separate approved
operation. For payments, keep the encryption key and historical credential
versions securely available for receipt/webhook reconciliation. Disabling new
checkout does not authorize discarding an unresolved capture. Retain immutable
provider evidence and record captured/unfulfilled states until verified repair;
no refund is considered complete without its own authoritative provider proof.

Recovery planning remains distinct from an existing backup. The historical
[backup/recovery guide](backup-recovery.md) contains detailed backup categories,
but its older staging/backup prerequisites are superseded by the user’s waiver.
No new backup or restore was executed or claimed. If separately authorized
later, capture consistent database/Auth/Storage exports and secure encryption
key/provider configuration references, record hashes/target/time, and rehearse
restore only into an isolated recovery target. Validate RLS, tenant isolation,
order/receipt totals, unresolved captures and object-byte access there before
considering cutover. Reconcile later transactions/provider events; a database
restore alone does not reverse external charges, email or DNS. Preserve all
unrelated business modules and cron definitions during any recovery.
