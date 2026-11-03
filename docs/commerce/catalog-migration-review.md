# Catalog and fulfillment migration review

Every new table/column/function/index/policy/trigger is inventoried in
[expansion-schema-inventory.md](expansion-schema-inventory.md), alongside the
full versioned SQL. The final coordinated database run passes 531 assertions;
see [expansion-db-validation.md](expansion-db-validation.md).

`supabase/migrations/20261102160000_commerce_catalog_fulfillment.sql` is a new,
transactional, one-time migration. It is prepared for review; no hosted project
has received this file. Install only in the disposable loopback `commerce_test`
database during this implementation. Apply the existing foundation only when
creating a fresh isolated fixture, then catalog, customer, growth and domain
expansion files in timestamp order. Do not run `supabase db push` against the
installed main project or replay its foundation.

## Changes and preservation

Five new tables hold store settings, product profiles, ordered image records,
stock-bearing variants and PIN-code zones. Tenant references use composite
foreign keys. All new tables enable RLS, revoke direct public mutations, and
explicitly clear inherited function execution grants before allowing their
intended authenticated or service callers. Direct service-role mutations are
also revoked on all five new tables; the Admin template lookup has SELECT on
store settings and Admin changes use the validated SECURITY DEFINER RPC.
Function search paths are fixed.
The original foundation file, its existing policies, website template constraint,
legacy business tables, wallets, payments, Auth records, cron and Storage
configuration are untouched. There is no existing-row DML in the migration.

Existing orders receive zero-discount defaults and optional coupon/zone columns;
existing items receive optional variant columns and empty option snapshots.
The former one-line-per-product unique constraint becomes a unique
(order,product,variant) index with NULLS NOT DISTINCT, preserving simple-line
uniqueness while permitting two variants of the same product. The original total
constraint is replaced by `total = subtotal + delivery - discount`, with a
nonnegative bounded discount. All historical totals remain valid. Extension
profiles/settings/variants never use product attributes as hidden storage.

Two public functions intentionally change. The exact original implementations
are moved, without body edits, to `commerce_private.legacy_create_cod_order` and
`commerce_private.legacy_owner_action`, with API execution revoked. The public
`commerce_create_cod_order` name delegates to v2 so older clients cannot bypass
required variants or enabled PIN-code coverage. Existing simple checkout and
normalized request payloads retain their behavior and old replay compatibility.
`commerce_owner_action` delegates existing non-status actions to its preserved
implementation after locking and verifying the owner. Its status path retains
existing transitions and uses variant-aware inventory release. A cancellation
restores base stock only for base lines and variant stock only for variant lines,
including archived variants, once per order. Stock-capacity overflow rejects the
transaction with a corrective inventory error instead of losing units.

Template overrides live exclusively in store settings. The legacy website
column remains `general`. The v2 public catalog merges the assigned override;
the service-only admin RPC supports `save_template`, `get`, `get_settings` and
`get_workspace`. The last action returns the selected site's complete
settings/product_profiles/images/variants/delivery_zones workspace to the
already verified signed Admin HTTP handler. It does not grant authenticated
owners access to the Admin function.

## Exact optional configuration

Owner product options: `{product_id,variants_required,images}`. Images have
`{url,alt?,sort_order?}`; at most 12, URL at most 2048 characters, alt at most
300. Array order is canonical and supplied sort_order must equal its zero-based
position. URLs allow HTTPS and loopback HTTP for isolated tests.

Variants: `{id?,product_id,sku,name,options?,price_paise,active?}`. Required
trimmed SKU/name lengths are 1–80/1–180. Options permit at most eight string
keys of 1–40 characters and string values of 1–100. Price is integer paise
0–100000000. Variant creation starts stock at zero; inventory permission is
required for nonzero `adjust_variant_stock` deltas from -1000000 to 1000000.
All stock remains within 0–1000000000. Archival retains references/history.

Settings accept only policies, faq, sections, seo and delivery_zones_enabled.
Policies allow shipping/returns/privacy/terms plain text up to 10000 characters,
returns_enabled boolean and integer return_days 0–365; enabled returns require
nonempty written return terms and an explicit 1–365 day window. FAQ has at most 30 nonempty question/answer pairs
(maximum 300/3000). Up to 20 ordered sections use unique alphanumeric/underscore/
hyphen IDs of 1–80 characters, type hero/categories/featured_products/banner/
text/faq and required enabled boolean. Optional title/body limits are 180/3000,
image_url follows image URL rules, category_id is a tenant category UUID and
product_ids contains at most 50 tenant product UUIDs. SEO permits title (180),
description (500) and image_url. Unknown keys are rejected. Owners use their
existing branding permission; template assignment is service-only.

Zones have a name of 1–120, 1–500 six-digit PIN strings, integer delivery fee and
minimum order values of 0–100000000 paise, and optional active boolean. Active
zones cannot overlap. The owner website lock serializes overlap checks. Delivery
coverage is enforced only when explicitly enabled; pickup retains legacy rules.
The effective minimum is the greater of website and zone minimums.

## Transaction and security review

Final checkout normalizes duplicate product/variant lines, verifies the Auth
user, serializes an idempotency key with an advisory lock, then rechecks verified
identity. New orders lock the website and recheck identity after waiting. They
lock base products in UUID order, variants in UUID order, then the coupon.
Catalog configuration mutations take the website UPDATE lock before checking
current verified ownership/membership and permission, so checkout cannot observe
a partially changed configuration. Existing Admin revocation waits are respected.
Customer request decisions must take that same website UPDATE lock before
request/order locks, as the customer migration does.

Quotes do not insert customers/orders, change stock or record coupon uses.
Checkout computes prices/fees/minimums from database records, snapshots SKU,
variant name/options and unit price, and records coupons within the transaction.
Unknown submitted cart and customer fields (including prices and actor IDs) are
rejected. Item quantities must be JSON numbers containing integers from 1–999;
UUID identifiers must be canonical UUID JSON strings. Numeric, boolean, empty
and explicit null identifier coercion is rejected. Customer names are 2–180,
phones 7–30 with the same format as HTTP, and addresses at most 1,000 characters
(at least five for delivery). Optional address/PIN fields retain strict type
validation when a saved address is used. Coupon support
fails closed before the growth helper exists. Saved-address support similarly
fails closed until the customer helper exists, checks tenant+customer ownership,
and uses saved address/PIN plus explicitly submitted recipient name/phone.
An existing idempotency key is looked up before reloading a mutable saved
address. A retry with the same saved-address ID uses the first order's immutable
address/PIN snapshot, including after that saved address is edited or deleted.
Items, recipient instructions, fulfillment and coupon still must match the
original normalized request. Changing those fields rejects the replay; retries
do not update the order or consume more stock/coupon uses.

The order row serializes cancellation and its release timestamp prevents a
second stock increment. Product-then-variant lock order matches checkout. The
website UPDATE lock prevents competing owner cancellation/config edits from
introducing a stock/configuration race.

## Local application and read-only verification

Use an explicitly supplied loopback development URL whose database is
`commerce_test`. The root fixture runner resets only that database and runs
`commerce_bootstrap.sql`, the original foundation, baseline assertions and the
versioned expansions. Never use hosted credentials for these fixtures.

For the coordinated installation and regression run, use the reviewed guarded
runner described in [expansion-db-validation.md](expansion-db-validation.md):

```sh
COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55447/commerce_test \
  node scripts/test-commerce-expansion-db.mjs
```

This command resets only the verified disposable database. It runs the unchanged
88-assertion original runner, compares existing rows/policies/grants, installs
an explicit migration allowlist and rechecks all 72 original SQL cases after
the replacements in a rollback-only synthetic fixture transaction. It then
runs expansion fixtures, independent-session races and atomic reapplication
checks. No hosted target is involved.

Earlier module evidence: `supabase/tests/commerce_catalog_expansion.sql` uses synthetic separate fixtures;
33 catalog assertions passed on isolated loopback PostgreSQL 18.4 after the
foundation and customer fixtures. Five additional real multi-connection checks
passed on the root loopback fixture: final-variant-unit contention, identical
concurrent replay, simultaneous cancellation, owner revocation after a website
lock wait, and Auth verification revocation after a wait. The original runner
passed all 88 assertions before installation. Immediately after catalog
installation, all original columns/rows across 14 synthetic tables and all 18
existing policies matched the pre-migration snapshot. The customer fixture also
passed its original 72 SQL assertions with catalog installed. Evidence lives in
`/workspace/commerce-validation-artifacts/commerce-expansion-20261102/` as
`catalog-preservation.json`, `catalog-assertions-final.json` and
`catalog-concurrency.json` (with executable multi-session script). PostgreSQL
primitives do not prove hosted Supabase Auth, provider or Storage HTTP behavior.

Read-only inspection queries:

```sql
select relname,relrowsecurity from pg_class
where relname in ('commerce_store_settings','commerce_product_profiles',
'commerce_product_images','commerce_product_variants','commerce_delivery_zones');
select schemaname,tablename,policyname from pg_policies
where tablename in ('commerce_store_settings','commerce_product_profiles',
'commerce_product_images','commerce_product_variants','commerce_delivery_zones');
select website_id, count(*) from public.commerce_product_variants group by website_id;
select id from public.commerce_orders
where total_paise <> subtotal_paise+delivery_fee_paise-discount_paise;
select p.oid::regprocedure,p.prosecdef,p.proconfig,p.proacl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','commerce_private')
and p.proname in ('commerce_create_cod_order_v2','commerce_checkout_quote_v2',
'commerce_catalog_admin_action','legacy_create_cod_order','legacy_owner_action');
```

## Rollback

A failed installation rolls back atomically. After real extension records or
orders exist, do not drop tables, columns, snapshots, discounts or variants, and
do not restore the unguarded public checkout function. Disable new UI capability
exposure and place affected websites into setup/suspended state through reviewed
administration while retaining order/customer history. A forward repair is the
data-preserving recovery path. Restoring legacy order total/line constraints
would fail or lose meaning for discounted/multiple-variant orders; no destructive
reverse migration is supplied. A hosted installation/rollback needs separate
authorization and its own verified target/runbook.
