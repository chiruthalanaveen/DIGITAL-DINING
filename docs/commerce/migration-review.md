# Complete review of the Phase 1 commerce migration

This document explains the SQL that is proposed for review. It does **not**
authorize or record application to production. Hosted Supabase development
verification is still a separate requirement; a local PostgreSQL pass is not a
hosted Supabase pass.

The **full, unabridged SQL** is
[`20261022160000_commerce_foundation.sql`](../../supabase/migrations/20261022160000_commerce_foundation.sql).
It is 472 lines; no statements are omitted from that file. Its reviewed SHA-256 is:

```text
dd2882f6329808783b1d4d97c4264f59989b7e834753aa06efe46d63855db1ca
```

For the code-review copy at the original feature commit, see
[the complete SQL on GitHub](https://github.com/chiruthalanaveen/DIGITAL-DINING/blob/aba881a0125f6595559e1713fb76d038d56a93b6/supabase/migrations/20261022160000_commerce_foundation.sql).
The versioned SQL file is authoritative if this explanatory document and a later
revision differ. Review a changed checksum again before any installation.

## Object inventory

| Object | Count and purpose |
| --- | --- |
| New schema | 1: `commerce_private`, for internal authorization/validation/audit helpers. |
| New tables | 9, all named `public.commerce_*`, containing 103 columns in total. |
| New functions | 12: 7 private helpers and 5 public RPC entry points. |
| Explicit indexes | 6: one partial unique owner index and five lookup indexes. |
| Constraint-backed indexes | 19: 9 primary-key indexes and 10 additional unique-constraint indexes. Total new indexes: 25. |
| Foreign keys | 16, including 5 references to the existing `auth.users` table. |
| Explicit application triggers | 0: there is no `CREATE TRIGGER` statement and no timestamp/audit trigger. |
| Internal FK constraint triggers | Local PostgreSQL catalog inspection found 64, including 10 referenced-side triggers on `auth.users`; see the trigger section. |
| New RLS policies | 15: 8 SELECT policies on new commerce tables and 7 policies on existing `storage.objects`. |
| New Storage bucket | 1: `commerce-media`, public image delivery, 5 MiB per file. |
| Existing business-table row updates/deletes during installation | 0. The only top-level data insert is the new Storage bucket metadata row. |

## Reading the column tables

`NN` means `NOT NULL`. A dash in the default column means no default expression.
All UUID `id` primary keys are NN and default to `gen_random_uuid()` unless a
table explicitly uses a composite primary key. Timestamp values use PostgreSQL
`timestamptz` and `now()`. Amounts are integer paise, not floating-point currency.
`updated_at` defaults apply at insertion; mutation RPCs explicitly update the
value. There is **no automatic timestamp trigger** for direct administrative SQL.

All foreign keys use PostgreSQL's default `NO ACTION` update/delete behavior and
are not declared deferrable. There is no `ON DELETE CASCADE` or `ON UPDATE CASCADE`.

## 1. `public.commerce_websites` — each client website

| Column | Type, nullability and default | Meaning and constraint |
| --- | --- | --- |
| `id` | UUID, NN, random UUID | Primary identity used to scope other commerce records. |
| `slug` | text, NN, — | Globally unique storefront identifier. Database regex permits 2–80 lowercase letters/digits/hyphens with an alphanumeric first/last character. The HTTP API applies a narrower input limit. |
| `name` | text, NN, — | Website display name, 1–180 characters. |
| `business_type` | text, NN, `general` | One of `general`, `sarees`, `fashion`, `grocery`, `food`, `toys`, `electronics`, `beauty`, `pharmacy`, `footwear`. |
| `template` | text, NN, `general` | Restricted to the one implemented general template. |
| `status` | text, NN, `setup` | `setup`, `active`, `suspended` or `archived`. A table CHECK forbids `pharmacy` with `active`. |
| `branding` | JSONB, NN, `{}` | Must be a JSON object. Its permitted fields are validated by RPCs, described below. |
| `features` | JSONB, NN, `{"catalog":true,"inventory":true,"cod":true}` | JSON object of enabled modules. RPC validation allows only boolean values for these keys. |
| `fulfillment` | JSONB, NN, pickup on/delivery off/zero fees/empty pickup address | JSON object; exact default: `{"pickup":true,"delivery":false,"delivery_fee_paise":0,"minimum_order_paise":0,"pickup_address":""}`. |
| `owner_permissions` | JSONB, NN, products/categories/inventory/orders on, branding/customers off | Exact default: `{"products":true,"categories":true,"inventory":true,"orders":true,"branding":false,"customers":false}`. These are owner permissions, assigned by Super Admin. |
| `subscription_plan` | text, NN, `basic` | Service-plan label, 1–80 characters. It does not initiate billing. |
| `subscription_status` | text, NN, `trial` | `trial`, `active`, `past_due` or `cancelled`; metadata only. |
| `monthly_price_paise` | bigint, NN, `0` | Configured price, from 0 to 1,000,000,000 paise. Does not debit a wallet or create a payment. |
| `created_at` | timestamptz, NN, `now()` | Insertion time. |
| `updated_at` | timestamptz, NN, `now()` | Last mutation time when changed through the RPCs. |

Owner membership is a separate table. The administrative RPC requires an active
owner before activating a website; this requirement is RPC logic, not a table
CHECK. Trusted direct SQL/service-role table writes can bypass RPC-only checks.

## 2. `public.commerce_memberships` — website access assignments

| Column | Type, nullability and default | Meaning and constraint |
| --- | --- | --- |
| `website_id` | UUID, NN, — | FK to `commerce_websites.id`; part of the primary key. |
| `user_id` | UUID, NN, — | FK to existing `auth.users.id`; other part of the primary key. |
| `role` | text, NN, `owner` | `owner` or `staff`. Phase 1 management checks require `owner`; `staff` is reserved for extension. |
| `active` | boolean, NN, `true` | Whether the assignment currently grants access. |
| `created_at` | timestamptz, NN, `now()` | Assignment insertion time. |
| `updated_at` | timestamptz, NN, `now()` | Assignment/revocation update time. |

The composite primary key prevents duplicate website/user assignments. A partial
unique index permits at most one active owner per website. Administrative
reassignment deactivates the former owner and inserts/reactivates the new owner;
it does not delete the old membership row.

## 3. `public.commerce_applications` — dedicated owner onboarding

| Column | Type, nullability and default | Meaning and constraint |
| --- | --- | --- |
| `id` | UUID, NN, random UUID | Application primary key. |
| `applicant_user_id` | UUID, NN, — | FK to `auth.users.id`; derived from verified Auth identity by the application RPC. |
| `owner_name` | text, NN, — | 1–180 characters. |
| `business_name` | text, NN, — | 1–180 characters. |
| `business_type` | text, NN, — | Same ten allowed business labels as websites. |
| `phone` | text, NN, — | 7–30 characters; HTTP validation is additional. |
| `email` | text, NN, — | Copied from the verified Auth record, not trusted from a submitted applicant identity. |
| `address` | text, NN, — | Business address, 1–1,500 characters. |
| `preferred_slug` | text, NN, — | Database slug regex as above; application submission also rejects reserved slugs. It is a preference, not a reserved globally unique website slug. |
| `description` | text, NN, empty string | At most 3,000 characters. |
| `required_features` | text array, NN, empty array | Requested modules. RPC permits at most 40 strings, each at most 100 characters. |
| `product_categories` | text array, NN, empty array | Requested categories, with the same RPC list limits. |
| `fulfillment` | JSONB, NN, `{}` | JSON object of requested pickup/delivery settings, validated by the fulfillment helper. |
| `branding_preferences` | text, NN, empty string | At most 3,000 characters. |
| `payment_requirements` | text, NN, empty string | At most 1,500 characters; does not enable online payments. |
| `status` | text, NN, `submitted` | `submitted`, `under_review`, `approved` or `rejected`. |
| `review_note` | text, NN, empty string | Administrative review explanation, at most 3,000 characters. |
| `website_id` | UUID, nullable, — | FK to the new website created/linked after approval. |
| `created_at` | timestamptz, NN, `now()` | Submission time. |
| `updated_at` | timestamptz, NN, `now()` | Review/link update time. |

## 4. `public.commerce_categories` — tenant catalog groupings

| Column | Type, nullability and default | Meaning and constraint |
| --- | --- | --- |
| `id` | UUID, NN, random UUID | Category primary key. |
| `website_id` | UUID, NN, — | FK to `commerce_websites.id`. |
| `name` | text, NN, — | 1–120 characters. |
| `slug` | text, NN, — | Database slug regex; unique within this website. |
| `active` | boolean, NN, `true` | Archiving sets false, preserving products and historic references. |
| `created_at` | timestamptz, NN, `now()` | Creation time. |
| `updated_at` | timestamptz, NN, `now()` | Edit/archive time. |

`UNIQUE(website_id,id)` provides a tenant-bearing FK target.
`UNIQUE(website_id,slug)` allows the same category slug in different websites.

## 5. `public.commerce_products` — tenant catalog and basic stock

| Column | Type, nullability and default | Meaning and constraint |
| --- | --- | --- |
| `id` | UUID, NN, random UUID | Product primary key. |
| `website_id` | UUID, NN, — | FK to `commerce_websites.id`. |
| `category_id` | UUID, nullable, — | Composite FK `(website_id,category_id)` to the same website's category; NULL permits an uncategorized product. |
| `name` | text, NN, — | 1–180 characters. |
| `slug` | text, NN, — | Database slug regex; unique per website. |
| `description` | text, NN, empty string | At most 3,000 characters. |
| `price_paise` | bigint, NN, — | Server-authoritative price, 0–100,000,000 paise. |
| `stock_quantity` | integer, NN, `0` | 0–1,000,000,000. Product edits do not overwrite it; stock uses a separate locked adjustment. |
| `image_url` | text, NN, empty string | Empty, whitespace/angle-bracket-free HTTPS URL, or explicit loopback HTTP URL. No arbitrary HTML/image markup. API URL checks also apply. |
| `attributes` | JSONB, NN, `{}` | Must be an object. Owner RPC limits encoded size to 12,000 bytes and permits simple scalar values or arrays of strings. |
| `active` | boolean, NN, `true` | False archives the product without deleting its order history. |
| `created_at` | timestamptz, NN, `now()` | Creation time. |
| `updated_at` | timestamptz, NN, `now()` | Edit/stock/archive time through RPCs. |

`UNIQUE(website_id,id)` supports cross-tenant-safe order-item references;
`UNIQUE(website_id,slug)` isolates product slugs. A category may not be assigned
from another website even when its UUID is known.

## 6. `public.commerce_customers` — tenant customer profile

| Column | Type, nullability and default | Meaning and constraint |
| --- | --- | --- |
| `id` | UUID, NN, random UUID | Tenant customer profile primary key. |
| `website_id` | UUID, NN, — | FK to `commerce_websites.id`. |
| `user_id` | UUID, NN, — | FK to `auth.users.id`; derived from the authenticated checkout buyer. |
| `name` | text, NN, — | Latest checkout customer name. Checkout RPC validates non-empty/length limits. |
| `phone` | text, NN, — | Latest checkout phone, validated by checkout. |
| `address` | text, NN, empty string | Latest checkout address; required for delivery by checkout logic. |
| `created_at` | timestamptz, NN, `now()` | First customer insertion time. |
| `updated_at` | timestamptz, NN, `now()` | Most recent successful profile upsert during checkout. |

`UNIQUE(website_id,user_id)` permits a separate profile for the same Auth person
at each website and forms the order/customer FK target. `UNIQUE(website_id,id)`
supports a tenant-bearing profile identity. Existing delivery/customer tables are
not reused or rewritten. Orders retain their own customer snapshot when this
profile later changes.

## 7. `public.commerce_orders` — private COD order snapshots

| Column | Type, nullability and default | Meaning and constraint |
| --- | --- | --- |
| `id` | UUID, NN, random UUID | Order primary key. |
| `website_id` | UUID, NN, — | FK to `commerce_websites.id`. |
| `customer_user_id` | UUID, NN, — | FK to `auth.users.id` and composite FK `(website_id,customer_user_id)` to `commerce_customers(website_id,user_id)`. |
| `idempotency_key` | UUID, NN, — | Client attempt UUID scoped by website and authenticated buyer. |
| `request_payload` | JSONB, NN, — | Normalized items/customer/fulfillment used to compare retries; contains private checkout details. |
| `customer_details` | JSONB, NN, — | Checkout name/phone/address snapshot; the owner status RPC does not rewrite it. |
| `fulfillment_method` | text, NN, — | `pickup` or `delivery`. Website configuration is checked inside checkout. |
| `payment_method` | text, NN, `cod` | CHECK allows only `cod`. No new gateway or settlement path exists. |
| `payment_status` | text, NN, `unpaid` | Schema allows `unpaid`, `paid`, `refunded` for extension. This migration/RPC does not process a real payment or refund; order completion does not collect money. |
| `status` | text, NN, `placed` | `placed`, `confirmed`, `preparing`, `ready`, `completed`, `cancelled`; permitted transitions are enforced by owner RPC. |
| `subtotal_paise` | bigint, NN, — | Non-negative sum computed from database prices. |
| `delivery_fee_paise` | bigint, NN, — | Non-negative configured delivery fee; zero for pickup. |
| `total_paise` | bigint, NN, — | 0–1,000,000,000,000; CHECK requires `subtotal_paise + delivery_fee_paise`. |
| `inventory_tracked` | boolean, NN, `true` | Checkout snapshots whether inventory was enabled, so later setting changes do not change cancellation restocking. |
| `inventory_released_at` | timestamptz, nullable, — | Cancellation marker used with the locked order to avoid restoring stock twice. |
| `created_at` | timestamptz, NN, `now()` | Order placement time. |
| `updated_at` | timestamptz, NN, `now()` | Order-status update time. |

`UNIQUE(website_id,id)` is the tenant-bearing item FK target.
`UNIQUE(website_id,customer_user_id,idempotency_key)` is the final uniqueness
backstop against a duplicate checkout. Existing restaurant/delivery `orders`,
wallet balances, platform fees and payment transaction records are not involved.

## 8. `public.commerce_order_items` — durable purchased-product snapshots

| Column | Type, nullability and default | Meaning and constraint |
| --- | --- | --- |
| `id` | UUID, NN, random UUID | Item primary key. |
| `website_id` | UUID, NN, — | Included in both item foreign keys to prevent mixed-tenant links. |
| `order_id` | UUID, NN, — | Composite FK `(website_id,order_id)` to `commerce_orders(website_id,id)`. |
| `product_id` | UUID, NN, — | Composite FK `(website_id,product_id)` to `commerce_products(website_id,id)`. |
| `product_name` | text, NN, — | Product-name snapshot at checkout, preserved when the catalog name changes. |
| `quantity` | integer, NN, — | Table CHECK permits 1–1,000,000; checkout imposes a narrower 1–999 per aggregated product. |
| `unit_price_paise` | bigint, NN, — | Price snapshot, 0–100,000,000 paise. |
| `line_total_paise` | bigint, NN, — | CHECK requires `quantity::bigint * unit_price_paise`. |

`UNIQUE(order_id,product_id)` prevents duplicate item rows for the same purchased
product after duplicate cart lines are normalized. This table has no timestamps;
the containing order supplies its placement/status times.

## 9. `public.commerce_audit_logs` — administrative/mutation audit records

| Column | Type, nullability and default | Meaning and constraint |
| --- | --- | --- |
| `id` | UUID, NN, random UUID | Audit event primary key. |
| `website_id` | UUID, nullable, — | FK to `commerce_websites.id`; may be NULL for an unlinked application event. |
| `actor_user_id` | UUID, nullable, — | FK to `auth.users.id`; the helper obtains `auth.uid()` for owner events. Service-role admin events may have no Auth subject. |
| `actor_email` | text, nullable, — | Administrator identity supplied by the trusted API from its signed admin session; not a public client identity field. |
| `action` | text, NN, — | Action identifier, such as `save_product` or `open_management_view`. |
| `entity_id` | UUID, nullable, — | Affected entity UUID; intentionally not constrained to one heterogeneous entity table. |
| `before_data` | JSONB, nullable, — | Previous record snapshot where applicable. May contain private operational/customer details. |
| `after_data` | JSONB, nullable, — | Result snapshot or bounded administrative metadata. Opening a management view logs only its website ID, not a duplicate full customer/order report. |
| `created_at` | timestamptz, NN, `now()` | Audit insertion time. |

Authenticated owners/customers cannot SELECT this table or write it directly.
Application workflows append records through the helper, but this is not a
cryptographically tamper-proof or database-owner-immutable log: trusted
`service_role` retains ALL privileges on these new tables.

## Every new index

All are ordinary B-tree indexes. The following six have explicit `CREATE INDEX`
statements:

| Index | Keys/predicate | Purpose |
| --- | --- | --- |
| `commerce_one_active_owner` | UNIQUE `commerce_memberships(website_id)` WHERE `active AND role='owner'` | Prevent two simultaneous active owners. |
| `commerce_memberships_user` | `commerce_memberships(user_id,website_id)` WHERE `active` | Find a user's active website assignments. |
| `commerce_applications_applicant` | `commerce_applications(applicant_user_id,created_at DESC)` | Applicant history in date order. |
| `commerce_products_catalog` | `commerce_products(website_id,active,category_id)` | Tenant catalog/category filtering. |
| `commerce_orders_customer` | `commerce_orders(website_id,customer_user_id,created_at DESC)` | Tenant-scoped buyer order history. |
| `commerce_audit_site` | `commerce_audit_logs(website_id,created_at DESC)` | Website audit timeline. |

The other 19 are created automatically by PRIMARY KEY/UNIQUE constraints:

| Table | Index names and keys |
| --- | --- |
| `commerce_websites` | `commerce_websites_pkey(id)`; `commerce_websites_slug_key(slug)`. |
| `commerce_memberships` | `commerce_memberships_pkey(website_id,user_id)`. |
| `commerce_applications` | `commerce_applications_pkey(id)`. |
| `commerce_categories` | `commerce_categories_pkey(id)`; `commerce_categories_website_id_id_key(website_id,id)`; `commerce_categories_website_id_slug_key(website_id,slug)`. |
| `commerce_products` | `commerce_products_pkey(id)`; `commerce_products_website_id_id_key(website_id,id)`; `commerce_products_website_id_slug_key(website_id,slug)`. |
| `commerce_customers` | `commerce_customers_pkey(id)`; `commerce_customers_website_id_user_id_key(website_id,user_id)`; `commerce_customers_website_id_id_key(website_id,id)`. |
| `commerce_orders` | `commerce_orders_pkey(id)`; `commerce_orders_website_id_id_key(website_id,id)`; `commerce_orders_website_id_customer_user_id_idempotency_key_key(website_id,customer_user_id,idempotency_key)`. |
| `commerce_order_items` | `commerce_order_items_pkey(id)`; `commerce_order_items_order_id_product_id_key(order_id,product_id)`. |
| `commerce_audit_logs` | `commerce_audit_logs_pkey(id)`. |

These names and the 25-index count were confirmed by read-only inspection of the
isolated local test database. No index on a legacy business table is replaced.

## Every new function

All 12 functions set `search_path=''` and refer to database objects explicitly.
`SECURITY DEFINER` runs with the function owner's database authority; the
authorization inside such functions and their EXECUTE grants are therefore part
of the security boundary. The migration does not FORCE RLS against the table
owner and does not remove the trusted Supabase service role's RLS bypass.

### Private helper functions (7)

| Signature and return | Execution/security | Exact responsibility |
| --- | --- | --- |
| `commerce_private.is_member(p_website_id uuid,p_permission text DEFAULT NULL) RETURNS boolean` | SQL, STABLE, SECURITY DEFINER. EXECUTE granted to `authenticated`. | Requires current `auth.uid()` to be an active `owner` member of the selected website. If a permission name is supplied, that website permission must equal JSON boolean `true`. Staff membership or a caller-supplied owner UUID does not satisfy it. Used by RLS/RPC/media authorization. |
| `commerce_private.valid_slug(p_value text) RETURNS boolean` | SQL, IMMUTABLE, SECURITY INVOKER. No direct API-role EXECUTE grant. | Applies the slug regex and rejects reserved names `admin`, `api`, `commerce`, `shops`, `www`, `app`, `delivery`, `auth`, `login`, `support`. |
| `commerce_private.validate_branding(p_value jsonb) RETURNS jsonb` | PL/pgSQL, IMMUTABLE, SECURITY INVOKER. No direct API-role EXECUTE grant. | Requires an object of at most 12,000 encoded bytes. Allows only string fields `primary_color`, `background_color`, `text_color`, `logo_url`, `banner_url`, `headline`, `description`, `contact_email`, `contact_phone`; each value at most 3,000 characters. Colors are 3/6-digit hex. Image URLs must be empty, HTTPS, or explicit loopback HTTP. Returns the validated object, raises `22023` on invalid input. |
| `commerce_private.validate_flags(p_value jsonb,p_allowed text[]) RETURNS jsonb` | PL/pgSQL, IMMUTABLE, SECURITY INVOKER. No direct API-role EXECUTE grant. | Requires a JSON object, boolean values, and keys drawn from the supplied whitelist. Used for feature flags and owner permissions. |
| `commerce_private.validate_fulfillment(p_value jsonb) RETURNS jsonb` | PL/pgSQL, IMMUTABLE, SECURITY INVOKER. No direct API-role EXECUTE grant. | Allows only boolean `pickup`/`delivery`, integer `delivery_fee_paise`/`minimum_order_paise` from 0 through 100,000,000, and string `pickup_address` of at most 1,500 characters. Unknown keys fail. |
| `commerce_private.audit(p_website uuid,p_action text,p_entity uuid,p_before jsonb,p_after jsonb,p_actor_email text DEFAULT NULL) RETURNS void` | SQL, VOLATILE by default, SECURITY DEFINER. No direct API-role EXECUTE grant. | Inserts only into `commerce_audit_logs`, derives `actor_user_id` from `auth.uid()`, and stores supplied snapshots/administrative email. Called inside authorized mutation transactions. |
| `commerce_private.media_access(p_name text) RETURNS boolean` | PL/pgSQL, STABLE, SECURITY DEFINER. EXECUTE granted to `authenticated`. | Requires an object name beginning with a UUID website ID plus `/`, rejects path-traversal `..` segments, requires website status `setup`/`active`, and requires active owner `products` or `branding` permission for that same website. |

The private schema revokes all privileges from `PUBLIC`, `anon`, `authenticated`
and `service_role`, then grants only schema USAGE to `authenticated`. Each helper
explicitly revokes EXECUTE from those four roles; only `is_member` and
`media_access` are regranted to authenticated users for policy evaluation. The
function/schema owner retains PostgreSQL ownership privileges. Public definer
RPCs can invoke their internal helpers under that owner's authority. No helper
is intended as an exposed PostgREST RPC; the hosted exposed-schema configuration
must also be inspected during staging verification.

### Public RPC entry points (5)

| Signature | Allowed API roles | Behavior |
| --- | --- | --- |
| `public.commerce_public_catalog(p_slug text) RETURNS jsonb` | `anon`, `authenticated`, `service_role` | PL/pgSQL, STABLE, SECURITY DEFINER. Finds an active, non-pharmacy, catalog-enabled website. Returns an explicit public DTO with website identity/branding/features/fulfillment, active categories and active products whose category is active. Returns NULL when unavailable. Omits memberships, billing, applications, customer/order data and audit snapshots. |
| `public.commerce_submit_application(p_payload jsonb) RETURNS jsonb` | `authenticated` only | PL/pgSQL, VOLATILE, SECURITY DEFINER. Reads the caller's verified Auth record. Derives applicant ID/email from that record; validates object/slug/requirement arrays/fulfillment; inserts one `commerce_applications` row and returns it. Does not grant membership or create a restaurant/website. |
| `public.commerce_owner_action(p_website_id uuid,p_action text,p_payload jsonb) RETURNS jsonb` | `authenticated` only | PL/pgSQL, VOLATILE, SECURITY DEFINER. Locks the website row, then checks current membership/permission after waiting, preventing an administrative revocation race. Rejects unknown actions and writes outside `setup`/`active`. Uses tenant predicates and row locks; successful mutations append an audit event in the same transaction. Actions are detailed below. |
| `public.commerce_create_cod_order(p_website_id uuid,p_items jsonb,p_customer jsonb,p_fulfillment text,p_idempotency_key uuid) RETURNS jsonb` | `authenticated` only | PL/pgSQL, VOLATILE, SECURITY DEFINER. Verified-buyer transactional checkout, described below. No payment provider is invoked. |
| `public.commerce_admin_action(p_action text,p_payload jsonb,p_actor_email text) RETURNS jsonb` | `service_role` only | PL/pgSQL, VOLATILE, SECURITY DEFINER. Creates/configures sites, assigns verified owners, reviews applications and opens audited management views. The HTTP server must authenticate its existing signed Super Admin session and derive `p_actor_email`; a service role is trusted infrastructure, not a browser role. |

Every public RPC first revokes EXECUTE from `PUBLIC`, `anon`, `authenticated` and
`service_role`, then grants only the roles shown. An ordinary user cannot call
the administrative RPC by supplying an administrator email. The SQL does not
replace or grant EXECUTE on any existing restaurant/payment/wallet RPC.

### Owner action details

| Action | Required permission and additional checks | Mutation |
| --- | --- | --- |
| `save_product` | `products`; catalog enabled; valid slug/price/attributes; category must be active and belong to this website. | Inserts a product at default stock zero, or locks/updates the selected same-website product. Edits do not change stock. Attributes allow string/number/boolean/text-array values; keys at most 80 characters. |
| `archive_product` | `products`; catalog enabled; same-website product exists. | Locks it and sets `active=false`; no deletion. |
| `save_category` | `categories`; catalog enabled; valid slug; same-website ID for edits. | Inserts or locks/updates a category. |
| `archive_category` | `categories`; catalog enabled; same-website category exists. | Sets `active=false`; products/history remain. Products in inactive categories disappear from the public catalog. |
| `adjust_stock` | `inventory`; inventory feature enabled; existing same-website product; nonzero integer delta within ±1,000,000; final stock 0–1,000,000,000. | Locks the product and increments/decrements stock. |
| `update_branding` | `branding`; validated branding object. | Merges permitted branding keys into the owner's website only. Does not change feature flags, owner permissions, billing, status or fulfillment. |
| `update_order_status` | `orders`; same-website order, locked before mutation. | Permits `placed → confirmed → preparing → ready → completed`; each nonterminal state may instead move to `cancelled`. Same-status retry returns the saved order. Completed/cancelled orders cannot reopen. Cancellation locks products in deterministic ID order and restores tracked stock once. |

The owner RPC does not check confirmed email independently on each action;
membership assignment requires a verified Auth account, and the HTTP owner API
also verifies current Auth identity/email. Tenant RLS and RPC membership checks
still protect direct authenticated database calls. Do not confuse those layers.

### Checkout transaction details

1. Derives the buyer from `auth.uid()` and requires an existing verified-email
   Auth record. Rejects missing attempt UUID, malformed customer/fulfillment, and
   carts outside 1–50 input lines.
2. Requires UUID product IDs and integer quantities 1–999. Aggregates duplicate
   product lines, rejects aggregated quantities above 999, and sorts them.
3. Builds the canonical request snapshot from normalized items, trimmed customer
   name/phone/address and fulfillment method. A transaction-scoped advisory lock
   serializes the website/buyer/attempt UUID combination.
4. An existing identical attempt returns its saved order/items. A changed replay
   rejects the request instead of creating another order. This replay check
   precedes current website/stock checks, so an already-committed order can still
   be retrieved as an identical retry after later configuration changes.
5. Locks the website and requires it to be active, non-pharmacy, catalog/COD
   enabled and configured for the requested pickup/delivery method.
6. Locks only that website's selected products in deterministic UUID order,
   checks product/category availability, rejects foreign/missing products and
   calculates amounts using database prices. It enforces the configured minimum
   and delivery fee. It checks stock only when inventory tracking is enabled.
7. Upserts the buyer's tenant profile, inserts the order and price/name item
   snapshots, and decrements tracked stock. The order records whether tracking
   was active. Any failure rolls back all of these writes together.

Only new `commerce_*` rows are written. No existing stock/reservation, wallet,
settlement, Razorpay, payment transaction, refund or cron function is called.

### Administrative action details

| Action | Checks and writes |
| --- | --- |
| `create_website` | Validates slug/branding/feature flags/fulfillment/permissions; inserts a new website with full safe defaults. Optional owner must be a verified Auth account. Optional application must already be approved and unlinked or linked to this site. Creates/reactivates the owner membership and links the application. Active status requires an owner; pharmacy activation fails the table CHECK. |
| `save_website` | Locks the existing website; accepts a partial configuration and preserves unspecified values; validates supplied configuration. May update identity, status, branding, flags, fulfillment, permissions and subscription metadata. Optional owner/application linking has the same checks. It updates only the chosen commerce website and its memberships/application. |
| `assign_owner` | Locks the selected website; requires an existing verified Auth user; deactivates its former active owner and inserts/reactivates the new owner membership. Records the before/result audit snapshots. |
| `review_application` | Locks the application; allows `under_review`, `approved`, `rejected`; prevents changing a final approved/rejected decision to a different status. Optional website link requires approval, a valid/nonconflicting site and verified applicant; creates/reactivates that site's owner membership. Saves status/note/link and audits the result. |
| `open_management_view` | Reads only the selected tenant's website/categories/products/orders/items/customers and aggregate report. Logs the access with bounded website-ID metadata. Does not create an owner session or impersonate an owner. |

Unknown actions and malformed administrative requests fail. All branches require
the service-only entry point; caller-provided tenant IDs are selectors, not proof
of administrative authorization.

## Every RLS policy and grant

RLS is enabled on all nine new tables. No anonymous SELECT grant exists on them.
Authenticated users receive SELECT on eight tables; the initially listed audit
grant is explicitly revoked. Direct INSERT/UPDATE/DELETE privileges are revoked
from `PUBLIC`, `anon` and `authenticated`. Their writes must use the restricted
RPCs. `service_role` receives ALL on these nine new tables; its credentials must
remain server-side. Existing business-table grants are not changed.

### New-table policies (8, all SELECT to `authenticated`)

| Policy | Table | Row visibility condition |
| --- | --- | --- |
| `commerce_websites_owner_read` | `commerce_websites` | Current user is an active owner of this website. |
| `commerce_memberships_owner_read` | `commerce_memberships` | The membership belongs to the current user, or the user owns that website. A user may see their own inactive/staff assignment without gaining owner powers. |
| `commerce_applications_self_read` | `commerce_applications` | `applicant_user_id = auth.uid()`. An applicant cannot review another applicant's submission. |
| `commerce_categories_owner_read` | `commerce_categories` | Owns this website with `categories` **or** `products` permission, supporting category selection while editing products. |
| `commerce_products_owner_read` | `commerce_products` | Owns this website with `products` **or** `inventory` permission, supporting permitted stock work. |
| `commerce_customers_scoped_read` | `commerce_customers` | The row is this user's own customer profile, or the user owns this website with `customers` permission. |
| `commerce_orders_scoped_read` | `commerce_orders` | The user is this order's buyer, or owns this website with `orders` permission. |
| `commerce_order_items_scoped_read` | `commerce_order_items` | A matching same-website order exists and is readable because this user is its buyer or permitted owner. |

`commerce_audit_logs` deliberately has no authenticated SELECT policy and no
authenticated SELECT grant. It cannot become a route around revoked customer or
order permissions through copied audit snapshots.

Suspension prevents new public catalog access, checkout and owner/media writes;
it does not revoke an owner's permitted read access to their retained history.
An owner may browse another website's intentionally public catalog, as any
customer can. If that person buys from another site, their own buyer rights allow
their own order/profile there; those rights do not grant the other site's owner
workspace, private catalog, settings or other customers' records.

### Storage bucket and policies (7)

The migration checks whether `storage.buckets.id='commerce-media'` already exists
and fails the entire migration if it does; it does not reuse/reconfigure an
existing bucket. Otherwise it inserts exactly one bucket metadata row:

- ID/name `commerce-media`; public delivery enabled.
- Maximum object size 5,242,880 bytes (5 MiB).
- Allowed MIME types `image/jpeg`, `image/png`, `image/webp`.
- Owner upload paths begin `<website UUID>/<new UUID>.<extension>` in the UI.
  Policies validate the website UUID prefix; the exact generated filename is a
  UI convention, not a SQL UUID-filename constraint.

| Policy | Kind/operation/role | Effective rule |
| --- | --- | --- |
| `commerce_media_owner_access` | PERMISSIVE, ALL, `authenticated` | USING and WITH CHECK require the commerce bucket plus `media_access(name)`. This supplies a positive owner policy; restrictive policies below further limit writes. |
| `commerce_media_insert_guard` | RESTRICTIVE, INSERT, `authenticated` | Other buckets pass unchanged; commerce inserts also require `media_access(name)`. Existing broad permissive policies cannot grant a different tenant's commerce upload. |
| `commerce_media_update_guard` | RESTRICTIVE, UPDATE, `authenticated` | USING and WITH CHECK require a bucket other than commerce. Thus owners cannot overwrite, move or upsert an existing commerce object, even if another permissive policy would allow it. |
| `commerce_media_delete_guard` | RESTRICTIVE, DELETE, `authenticated` | USING requires another bucket; commerce owners cannot delete existing commerce images. |
| `commerce_media_anon_insert_guard` | RESTRICTIVE, INSERT, `anon` | WITH CHECK requires another bucket; anonymous commerce uploads are denied. |
| `commerce_media_anon_update_guard` | RESTRICTIVE, UPDATE, `anon` | USING and WITH CHECK require another bucket; anonymous commerce updates/moves are denied. |
| `commerce_media_anon_delete_guard` | RESTRICTIVE, DELETE, `anon` | USING requires another bucket; anonymous commerce deletes are denied. |

Within PostgreSQL policy evaluation, applicable permissive policies are ORed and
restrictive policies are ANDed with their result. For every existing non-commerce
bucket, each new restrictive predicate evaluates TRUE and the new permissive
policy evaluates FALSE, so this migration does not widen or narrow its existing
authorization decision. It does not replace/drop any existing Storage policy.
Actual hosted Storage HTTP/upload behavior and custom existing policies still
require separate staging tests.

Public bucket delivery means published images are not private customer documents.
Do not upload prescriptions, identity documents or other confidential material.
Because `products` and `branding` can both upload new objects, existing commerce
objects are immutable to owner roles; a product-only owner cannot replace bytes
already referenced by a branding URL, and vice versa. Save a new URL instead.
Unused-object retention/cleanup requires a separately reviewed administrative
process; there is no automatic destructive cleanup job in this migration.

## Triggers: explicit versus automatically generated

No custom application trigger is defined. Auditing, timestamps, stock changes,
restocking, approval and activation checks occur explicitly in the RPC bodies.
There is no trigger attached to existing restaurant/delivery/resort/wallet/payment
tables, and no existing trigger is dropped/replaced.

Foreign-key constraints nevertheless create PostgreSQL **internal constraint
triggers**. On the local PostgreSQL 18.4 validation database, the 16 FKs produced
64 such triggers: referencing-side insert/update checks and referenced-side
delete/update checks. Generated names include OIDs and should be inspected from
the target catalog rather than copied as stable migration names.

Five FKs point to existing `auth.users`:

| New referencing column | Referenced key | Consequence |
| --- | --- | --- |
| `commerce_memberships.user_id` | `auth.users.id` | Membership identity must exist; deleting it while referenced is prevented. |
| `commerce_applications.applicant_user_id` | `auth.users.id` | Submitted application retains its applicant identity. |
| `commerce_customers.user_id` | `auth.users.id` | Commerce profile retains its Auth identity. |
| `commerce_orders.customer_user_id` | `auth.users.id` | Order history retains its buyer identity. |
| `commerce_audit_logs.actor_user_id` | `auth.users.id` | Non-null actor references retain the Auth identity. |

These create ten referenced-side internal triggers on `auth.users` in the tested
local schema. This is a new dependency on an existing technical table even though
no existing Auth row is edited. A later Auth-account deletion may fail while
commerce rows refer to it. That is a remaining lifecycle/retention integration
risk, not permission to cascade-delete history. The existing privacy deletion
preflight currently requires manual review and does not execute Auth deletion;
it does not yet inventory commerce dependencies. The restaurant registration
rollback has a `deleteUser` call for a just-created failed-registration account.
Verify these lifecycle paths with hosted development fixtures before release.

The other eleven FKs reference only new commerce tables:

- Seven `website_id` references from memberships, applications, categories,
  products, customers, orders and audit logs to `commerce_websites.id`.
- Product `(website_id,category_id)` to category `(website_id,id)`.
- Order `(website_id,customer_user_id)` to customer `(website_id,user_id)`.
- Item `(website_id,order_id)` to order `(website_id,id)`.
- Item `(website_id,product_id)` to product `(website_id,id)`.

The composite keys enforce tenant consistency even for direct trusted writes;
an ID from another website cannot satisfy them.

This read-only inspection identifies actual target-generated FK triggers:

```sql
SELECT c.conname,
       c.conrelid::regclass AS referencing_table,
       c.confrelid::regclass AS referenced_table,
       t.tgrelid::regclass AS trigger_table,
       t.tgname,
       t.tgisinternal,
       pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_constraint c
JOIN pg_trigger t ON t.tgconstraint = c.oid
JOIN pg_class source_table ON source_table.oid = c.conrelid
JOIN pg_namespace source_schema ON source_schema.oid = source_table.relnamespace
WHERE c.contype = 'f'
  AND source_schema.nspname = 'public'
  AND source_table.relname LIKE 'commerce\_%' ESCAPE '\'
ORDER BY c.conname, trigger_table, t.tgname;
```

## What installation executes, and what it does not

The migration runs `BEGIN`/`COMMIT`. It creates new names without `IF NOT EXISTS`
or `CREATE OR REPLACE`, so a name collision fails rather than overwriting an
existing object. The collision check also rejects a pre-existing commerce bucket.
Any pre-commit failure rolls back this migration's created objects and bucket
metadata; it does not authorize deleting a conflicting object to force success.

At installation, it creates the new schema/tables/constraints/indexes/functions,
enables RLS **only on the nine new tables**, adjusts grants **only on the new
schema/tables/functions**, adds the seven named Storage policies and inserts the
one new bucket. Function definitions containing INSERT/UPDATE are not calls to
those functions: no owner application, product, customer or order is seeded by
this migration. The final transactional `NOTIFY pgrst,'reload schema'` asks
PostgREST to refresh schema metadata after commit; it is not a cron/job command.

There is no `DELETE FROM`, `TRUNCATE` or `DROP` statement, destructive down migration, existing
business-table column alteration, existing policy replacement, Auth-user update,
wallet/payment function call or scheduled-job creation/change. Existing
restaurant/delivery/resort/customer/order/payment/wallet rows are neither copied,
renamed, migrated nor recalculated. RPC runtime writes are limited to the new
`commerce_*` tables. None edits a legacy business table.

This establishes a source-level preservation result, **not** certification of all
hosted behavior. Storage policies on an existing technical table, internal Auth
FK triggers and installation DDL locks are intentional integration effects. DDL
locks can temporarily contend with Storage/Auth activity. Existing custom
policies, Auth hooks, deletion/retention workflows and deployed service behavior
must be checked in a separate Supabase development project. Local fixtures and
definition snapshots do not prove that production's unknown custom hooks or
policies are compatible.

See [database.md](database.md) for installation/read-only verification and
data-preserving rollback considerations. Production execution remains prohibited
until the user separately approves the reviewed migration and the verified
production target after reviewing all required results.
