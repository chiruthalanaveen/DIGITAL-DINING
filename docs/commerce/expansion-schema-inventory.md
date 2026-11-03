# Core, customer and growth SQL object inventory

3 November 2026. Generated from the three linked migration source files, with
explicit explanations for each new table column, constraint/index, function,
trigger and policy. This is a source inventory, not evidence that a hosted
database has these objects. Full SQL files remain authoritative. The domain and
merchant-payment modules have separate full reviews linked in the consolidated
[installation runbook](expansion-installation.md).

All three files are one-time transactional migrations. They add no legacy-row
UPDATE/DELETE/backfill and no cron job. New records are mutated through validated
functions; their policies are SELECT-only. SECURITY DEFINER functions use the
fixed empty search path shown in their source. Private helpers and public RPCs
explicitly revoke inherited API/PUBLIC execution before granting only their
intended callers. Existing RLS policies and financial/business records remain
unchanged; intentional commerce compatibility DDL is listed separately below.

## Catalog and fulfillment

Complete SQL: [20261102160000_commerce_catalog_fulfillment.sql](../../supabase/migrations/20261102160000_commerce_catalog_fulfillment.sql).
Behaviour/authorization/rollback review: [catalog-migration-review.md](catalog-migration-review.md).

### New tables and every column

#### `public.commerce_store_settings`

One optional configuration record per website; defaults preserve existing simple-store behaviour.

| Column | Exact type/default/check declaration | Meaning |
| --- | --- | --- |
| `website_id` | `uuid primary key references public.commerce_websites(id)` | Tenant boundary: the selected commerce website. Composite foreign keys keep related records in this same tenant. |
| `template` | `text not null default 'general' check(template in ('general','sarees','grocery','fashion','food'))` | Admin-assigned general/sarees/grocery/fashion/food layout override; the legacy website template column is not rewritten. |
| `policies` | `jsonb not null default '{}'` | Validated plain-text shipping/returns/privacy/terms plus explicit return enablement/window; no invented terms. |
| `faq` | `jsonb not null default '[]'` | Validated question/answer entries rendered only from configured store content. |
| `sections` | `jsonb not null default '[]'` | Allowlisted ordered homepage sections and their configured content/product/category references. |
| `seo` | `jsonb not null default '{}'` | Optional validated title, description and image metadata for this store. |
| `delivery_zones_enabled` | `boolean not null default false` | Turns on server-enforced PIN-zone coverage; default false preserves flat-fee delivery. |
| `created_at` | `timestamptz not null default now()` | Record creation time; existing records are not fabricated or backfilled by installation. |
| `updated_at` | `timestamptz not null default now()` | Last validated change time; it is not used as proof of order completion or a fresh return window. |

Table-level constraints (inline column PK/UNIQUE/FK/CHECK declarations also apply):

No additional table-level declaration; column-level declarations above enforce its key and checks.

#### `public.commerce_product_profiles`

One extension profile per tenant/product without modifying base product attributes.

| Column | Exact type/default/check declaration | Meaning |
| --- | --- | --- |
| `website_id` | `uuid not null` | Tenant boundary: the selected commerce website. Composite foreign keys keep related records in this same tenant. |
| `product_id` | `uuid not null` | The product in this website; composite tenant foreign keys reject links to another website’s product. |
| `variants_required` | `boolean not null default false` | Requires a valid selectable variant for this product; false preserves simple-product checkout. |
| `created_at` | `timestamptz not null default now()` | Record creation time; existing records are not fabricated or backfilled by installation. |
| `updated_at` | `timestamptz not null default now()` | Last validated change time; it is not used as proof of order completion or a fresh return window. |

Table-level constraints (inline column PK/UNIQUE/FK/CHECK declarations also apply):

- `primary key(website_id,product_id)` — Identifies one record at the stated composite scope; its backing primary-key index is created automatically.
- `foreign key(website_id,product_id) references public.commerce_products(website_id,id)` — Composite related-record ownership must match this website; invalid/cross-tenant references reject.

#### `public.commerce_product_images`

Up to twelve ordered gallery references per tenant/product.

| Column | Exact type/default/check declaration | Meaning |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | Stable identifier for this record; referenced history must retain it. |
| `website_id` | `uuid not null` | Tenant boundary: the selected commerce website. Composite foreign keys keep related records in this same tenant. |
| `product_id` | `uuid not null` | The product in this website; composite tenant foreign keys reject links to another website’s product. |
| `url` | `text not null check(char_length(url)<=2048 and (url ~ '^https://[^[:space:]<>]+$' or url ~ '^http://(127\.0\.0\.1\|localhost)(:[0-9]{1,5})?/[^[:space:]<>]*$'))` | Gallery image URL, restricted by SQL/API URL checks; no image bytes are stored in this column. |
| `alt` | `text not null default '' check(char_length(alt)<=300)` | Image description for accessible product inspection. |
| `sort_order` | `integer not null check(sort_order between 0 and 11)` | Zero-based gallery position, restricted to 0–11; tenant/product position uniqueness prevents duplicates. |

Table-level constraints (inline column PK/UNIQUE/FK/CHECK declarations also apply):

- `foreign key(website_id,product_id) references public.commerce_products(website_id,id)` — Composite related-record ownership must match this website; invalid/cross-tenant references reject.
- `unique(website_id,id)` — Enforces the exact uniqueness scope shown; the constraint automatically creates its backing unique index.
- `unique(website_id,product_id,sort_order)` — Enforces the exact uniqueness scope shown; the constraint automatically creates its backing unique index.

#### `public.commerce_product_variants`

Independent SKU, option, price and stock records for a base product.

| Column | Exact type/default/check declaration | Meaning |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | Stable identifier for this record; referenced history must retain it. |
| `website_id` | `uuid not null` | Tenant boundary: the selected commerce website. Composite foreign keys keep related records in this same tenant. |
| `product_id` | `uuid not null` | The product in this website; composite tenant foreign keys reject links to another website’s product. |
| `sku` | `text not null check(char_length(sku) between 1 and 80)` | Store-specific stock-keeping identifier; variant SKU is unique within the website. |
| `name` | `text not null check(char_length(name) between 1 and 180)` | Human-readable recipient, variant or zone name, according to its table; SQL bounds are shown exactly. |
| `options` | `jsonb not null default '{}' check(jsonb_typeof(options)='object')` | Validated option-name/value object for a variant; independent of base product attributes. |
| `price_paise` | `bigint not null check(price_paise between 0 and 100000000)` | Variant unit price as an exact integer number of paise; checkout ignores caller prices. |
| `stock_quantity` | `integer not null default 0 check(stock_quantity between 0 and 1000000000)` | Available variant units, adjusted transactionally; editing variant details does not overwrite consumed stock. |
| `active` | `boolean not null default true` | Availability/archive flag. Archiving retains the record and historical references. |
| `created_at` | `timestamptz not null default now()` | Record creation time; existing records are not fabricated or backfilled by installation. |
| `updated_at` | `timestamptz not null default now()` | Last validated change time; it is not used as proof of order completion or a fresh return window. |

Table-level constraints (inline column PK/UNIQUE/FK/CHECK declarations also apply):

- `foreign key(website_id,product_id) references public.commerce_products(website_id,id)` — Composite related-record ownership must match this website; invalid/cross-tenant references reject.
- `unique(website_id,id)` — Enforces the exact uniqueness scope shown; the constraint automatically creates its backing unique index.
- `unique(website_id,product_id,id)` — Enforces the exact uniqueness scope shown; the constraint automatically creates its backing unique index.
- `unique(website_id,sku)` — Enforces the exact uniqueness scope shown; the constraint automatically creates its backing unique index.

#### `public.commerce_delivery_zones`

PIN-code coverage, fee and minimum rules for a website.

| Column | Exact type/default/check declaration | Meaning |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | Stable identifier for this record; referenced history must retain it. |
| `website_id` | `uuid not null references public.commerce_websites(id)` | Tenant boundary: the selected commerce website. Composite foreign keys keep related records in this same tenant. |
| `name` | `text not null check(char_length(name) between 1 and 120)` | Human-readable recipient, variant or zone name, according to its table; SQL bounds are shown exactly. |
| `pincodes` | `text[] not null check(cardinality(pincodes) between 1 and 500)` | The zone’s six-digit delivery PIN list; matching is server-side and bounded. |
| `delivery_fee_paise` | `bigint not null check(delivery_fee_paise between 0 and 100000000)` | Authoritative delivery charge for this PIN zone, in integer paise. |
| `minimum_order_paise` | `bigint not null default 0 check(minimum_order_paise between 0 and 100000000)` | Minimum product order value required for this zone, in integer paise. |
| `active` | `boolean not null default true` | Availability/archive flag. Archiving retains the record and historical references. |
| `created_at` | `timestamptz not null default now()` | Record creation time; existing records are not fabricated or backfilled by installation. |
| `updated_at` | `timestamptz not null default now()` | Last validated change time; it is not used as proof of order completion or a fresh return window. |

Table-level constraints (inline column PK/UNIQUE/FK/CHECK declarations also apply):

- `unique(website_id,id)` — Enforces the exact uniqueness scope shown; the constraint automatically creates its backing unique index.

### Explicit indexes

| Index and exact declaration | Purpose |
| --- | --- |
| `create index commerce_variants_catalog on public.commerce_product_variants(website_id,product_id,active);` | Supports tenant/product active-variant catalog reads. |
| `create unique index commerce_order_items_line on public.commerce_order_items(order_id,product_id,variant_id) nulls not distinct;` | One line per order/product/variant, with NULLS NOT DISTINCT retaining simple-product uniqueness while allowing different variants. |

Each inline PRIMARY KEY/UNIQUE declaration above additionally creates its
own unique backing index. Foreign keys and CHECK constraints do not implicitly
create extra referencing-side indexes. No unrelated legacy index is rebuilt.

### Every new RLS policy

| Policy and exact SELECT rule | Explanation |
| --- | --- |
| `create policy commerce_store_settings_owner_read on public.commerce_store_settings for select to authenticated using(commerce_private.is_member(website_id));` | Current tenant membership permits settings read; mutation still requires its validated permission-checked RPC. |
| `create policy commerce_product_profiles_owner_read on public.commerce_product_profiles for select to authenticated using(commerce_private.is_member(website_id,'products') or commerce_private.is_member(website_id,'inventory'));` | Current tenant membership with products or inventory permission permits this collection read. |
| `create policy commerce_product_images_owner_read on public.commerce_product_images for select to authenticated using(commerce_private.is_member(website_id,'products'));` | Current tenant products permission permits gallery read. |
| `create policy commerce_product_variants_owner_read on public.commerce_product_variants for select to authenticated using(commerce_private.is_member(website_id,'products') or commerce_private.is_member(website_id,'inventory'));` | Current tenant membership with products or inventory permission permits this collection read. |
| `create policy commerce_delivery_zones_owner_read on public.commerce_delivery_zones for select to authenticated using(commerce_private.is_member(website_id,'branding'));` | Current tenant branding permission permits coverage read. |

### Every new or replaced function

| Function and exact signature | Purpose |
| --- | --- |
| `commerce_private.valid_image_url(p_url text) returns boolean language sql immutable set search_path=''` | Checks the bounded permitted URL forms; used by validated settings and gallery input. |
| `commerce_private.validate_store_settings(p_value jsonb) returns jsonb language plpgsql immutable set search_path=''` | Validates exact allowlisted settings keys, JSON types, limits, plain-text policies, return configuration, FAQ, ordered sections and SEO. |
| `commerce_private.catalog_owner(p_website_id uuid,p_permission text) returns public.commerce_websites language plpgsql security definer set search_path=''` | Locks the website, then rechecks and SHARE-locks verified Auth/current membership and the required permission after waiting. Only setup/active writes pass. |
| `public.commerce_catalog_owner_action(p_website_id uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=''` | Dispatches validated product/gallery/variant/inventory/zone/settings mutations with the existing permission and feature gates; server-generated audit evidence is retained. |
| `commerce_private.catalog_settings(p_website_id uuid) returns jsonb language sql stable security definer set search_path=''` | Returns that website’s stored settings or safe legacy-compatible defaults without inserting a record. |
| `public.commerce_catalog_admin_action(p_website_id uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=''` | Service-only get/get_settings/get_workspace/save_template dispatch. HTTP callers must first pass signed Admin authorization; no owner impersonation. |
| `public.commerce_catalog_workspace(p_website_id uuid) returns jsonb language plpgsql stable security definer set search_path=''` | Verified member read projection, omitting products/inventory/branding collections lacking their permissions. |
| `public.commerce_public_catalog_v2(p_slug text) returns jsonb language plpgsql stable security definer set search_path=''` | Safe active-store catalog projection with the template override, settings, available gallery/variants and enabled zones, retaining legacy catalog visibility rules. |
| `commerce_private.checkout_request(p_website_id uuid,p_items jsonb,p_customer jsonb,p_fulfillment text,p_coupon_code text) returns jsonb language plpgsql security definer set search_path=''` | Strictly validates and normalizes cart, recipient, fulfillment and coupon instructions; uses an own tenant saved address when supplied. |
| `commerce_private.price_checkout(p_website_id uuid,p_request jsonb,p_lock boolean) returns jsonb language plpgsql security definer set search_path=''` | Authoritative active product/variant pricing, stock, fulfillment/PIN-zone fee/minimum and coupon calculation, with deterministic locks for final creation. |
| `public.commerce_checkout_quote_v2(p_website_id uuid,p_items jsonb,p_customer jsonb,p_fulfillment text,p_coupon_code text default '') returns jsonb language plpgsql security definer set search_path=''` | Verified customer preview of authoritative totals. It does not consume inventory, create an order or redeem a coupon; private helper fields are removed. |
| `public.commerce_create_cod_order_v2(p_website_id uuid,p_items jsonb,p_customer jsonb,p_fulfillment text,p_idempotency_key uuid,p_coupon_code text default '') returns jsonb language plpgsql security definer set search_path=''` | Locks tenant/buyer/cart key and website/Auth, returns matching original retries, blocks cross-method attempts, then atomically creates snapshots, inventory consumption and coupon redemption. |
| `public.commerce_create_cod_order(p_website_id uuid,p_items jsonb,p_customer jsonb,p_fulfillment text,p_idempotency_key uuid) returns jsonb language sql security definer set search_path=''` | Compatibility name delegates to v2 so old clients cannot bypass enabled variants or coverage rules. |
| `commerce_private.release_order_inventory(p_website_id uuid,p_order_id uuid) returns void language plpgsql security definer set search_path=''` | Locks order/product/variant rows, restores the original tracked quantities once, includes archived variants, and rejects capacity overflow atomically. |
| `public.commerce_owner_action(p_website_id uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=''` | Preserves legacy non-status actions behind current owner locks; validates transitions, restores base/variant stock once on cancellation and audits the change. |

### Every new trigger

| Trigger and exact binding | Effect |
| --- | --- |
| None | This migration adds no trigger. |

## Customer experience

Complete SQL: [20261102161000_commerce_customer_experience.sql](../../supabase/migrations/20261102161000_commerce_customer_experience.sql).
Behaviour/authorization/rollback review: [customer-migration-review.md](customer-migration-review.md).

### New tables and every column

#### `public.commerce_saved_addresses`

Customer-owned, tenant-scoped delivery address book.

| Column | Exact type/default/check declaration | Meaning |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | Stable identifier for this record; referenced history must retain it. |
| `website_id` | `uuid not null references public.commerce_websites(id)` | Tenant boundary: the selected commerce website. Composite foreign keys keep related records in this same tenant. |
| `user_id` | `uuid not null references auth.users(id)` | Verified Auth user owning this address/wishlist or using this coupon; identity is derived from Auth rather than caller input. |
| `label` | `text not null check (char_length(label) between 1 and 60)` | Customer-provided short address-book label. |
| `name` | `text not null check (char_length(name) between 2 and 180)` | Human-readable recipient, variant or zone name, according to its table; SQL bounds are shown exactly. |
| `phone` | `text not null check (char_length(phone) between 7 and 30 and phone ~ '^\+?[0-9][0-9 ()-]+$')` | Recipient contact number; trimmed string format/length checks are enforced. |
| `address` | `text not null check (char_length(address) between 5 and 1000)` | Delivery street address; private to the owning customer and original order snapshot. |
| `pincode` | `text not null check (pincode ~ '^[0-9]{6}$')` | Stored six-digit shipping PIN; saved-address checkout uses it as authoritative coverage input. |
| `is_default` | `boolean not null default false` | Default address within one website/customer; a partial unique index allows only one true row. |
| `created_at` | `timestamptz not null default now()` | Record creation time; existing records are not fabricated or backfilled by installation. |
| `updated_at` | `timestamptz not null default now()` | Last validated change time; it is not used as proof of order completion or a fresh return window. |

Table-level constraints (inline column PK/UNIQUE/FK/CHECK declarations also apply):

- `unique (website_id,id)` — Enforces the exact uniqueness scope shown; the constraint automatically creates its backing unique index.

#### `public.commerce_wishlist_items`

Customer-owned, tenant-scoped saved-product relation.

| Column | Exact type/default/check declaration | Meaning |
| --- | --- | --- |
| `website_id` | `uuid not null references public.commerce_websites(id)` | Tenant boundary: the selected commerce website. Composite foreign keys keep related records in this same tenant. |
| `user_id` | `uuid not null references auth.users(id)` | Verified Auth user owning this address/wishlist or using this coupon; identity is derived from Auth rather than caller input. |
| `product_id` | `uuid not null` | The product in this website; composite tenant foreign keys reject links to another website’s product. |
| `created_at` | `timestamptz not null default now()` | Record creation time; existing records are not fabricated or backfilled by installation. |

Table-level constraints (inline column PK/UNIQUE/FK/CHECK declarations also apply):

- `primary key (website_id,user_id,product_id)` — Identifies one record at the stated composite scope; its backing primary-key index is created automatically.
- `foreign key (website_id,product_id) references public.commerce_products(website_id,id)` — Composite related-record ownership must match this website; invalid/cross-tenant references reject.

#### `public.commerce_reviews`

Own verified completed-purchase reviews with merchant moderation.

| Column | Exact type/default/check declaration | Meaning |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | Stable identifier for this record; referenced history must retain it. |
| `website_id` | `uuid not null references public.commerce_websites(id)` | Tenant boundary: the selected commerce website. Composite foreign keys keep related records in this same tenant. |
| `customer_user_id` | `uuid not null references auth.users(id)` | Verified customer identity attached to an own order/review/request/event; never a caller-selected buyer. |
| `order_id` | `uuid not null` | The order within the same website; composite foreign keys preserve tenant/order binding. |
| `product_id` | `uuid not null` | The product in this website; composite tenant foreign keys reject links to another website’s product. |
| `rating` | `integer not null check (rating between 1 and 5)` | Verified-purchase integer score from 1 through 5; only the customer submits it. |
| `title` | `text not null default '' check (char_length(title) <= 120)` | Optional bounded review title, rendered as text. |
| `body` | `text not null check (char_length(body) between 1 and 3000)` | Bounded review text; public output requires merchant approval. |
| `status` | `text not null default 'pending' check (status in ('pending','approved','rejected'))` | Validated lifecycle/moderation state for this table; exact allowed values/default are shown in SQL below. |
| `moderated_at` | `timestamptz` | Time of the current merchant review decision; customer edits clear moderation. |
| `moderated_by` | `uuid references auth.users(id)` | Verified Auth owner who made the review moderation decision. |
| `created_at` | `timestamptz not null default now()` | Record creation time; existing records are not fabricated or backfilled by installation. |
| `updated_at` | `timestamptz not null default now()` | Last validated change time; it is not used as proof of order completion or a fresh return window. |

Table-level constraints (inline column PK/UNIQUE/FK/CHECK declarations also apply):

- `unique (website_id,id)` — Enforces the exact uniqueness scope shown; the constraint automatically creates its backing unique index.
- `constraint commerce_reviews_customer_product unique (website_id,customer_user_id,product_id)` — Enforces the exact uniqueness scope shown; the constraint automatically creates its backing unique index.
- `foreign key (website_id,order_id) references public.commerce_orders(website_id,id)` — Composite related-record ownership must match this website; invalid/cross-tenant references reject.
- `foreign key (website_id,product_id) references public.commerce_products(website_id,id)` — Composite related-record ownership must match this website; invalid/cross-tenant references reject.

#### `public.commerce_order_requests`

Customer cancellation/return requests with retained policy/decision history.

| Column | Exact type/default/check declaration | Meaning |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | Stable identifier for this record; referenced history must retain it. |
| `website_id` | `uuid not null references public.commerce_websites(id)` | Tenant boundary: the selected commerce website. Composite foreign keys keep related records in this same tenant. |
| `customer_user_id` | `uuid not null references auth.users(id)` | Verified customer identity attached to an own order/review/request/event; never a caller-selected buyer. |
| `order_id` | `uuid not null` | The order within the same website; composite foreign keys preserve tenant/order binding. |
| `type` | `text not null check (type in ('cancellation','return'))` | Customer request kind: cancellation or return; distinct kinds have separate unique request slots. |
| `reason` | `text not null check (char_length(reason) between 5 and 2000)` | Customer’s bounded explanation for a cancellation/return request. |
| `status` | `text not null default 'pending' check (status in ('pending','approved','rejected'))` | Validated lifecycle/moderation state for this table; exact allowed values/default are shown in SQL below. |
| `decision_note` | `text not null default '' check (char_length(decision_note) <= 2000)` | Merchant’s bounded response to the request; it does not establish a refund. |
| `decided_at` | `timestamptz` | Time of the recorded owner decision; decided requests cannot flip to the opposite decision. |
| `decided_by` | `uuid references auth.users(id)` | Verified owner Auth identity responsible for the decision. |
| `policy_snapshot` | `jsonb not null default '{}' check (jsonb_typeof(policy_snapshot)='object')` | The return policy/window used when the request was created, retained even if settings later change. |
| `created_at` | `timestamptz not null default now()` | Record creation time; existing records are not fabricated or backfilled by installation. |
| `updated_at` | `timestamptz not null default now()` | Last validated change time; it is not used as proof of order completion or a fresh return window. |

Table-level constraints (inline column PK/UNIQUE/FK/CHECK declarations also apply):

- `unique (website_id,id)` — Enforces the exact uniqueness scope shown; the constraint automatically creates its backing unique index.
- `unique (website_id,order_id,type)` — Enforces the exact uniqueness scope shown; the constraint automatically creates its backing unique index.
- `foreign key (website_id,order_id) references public.commerce_orders(website_id,id)` — Composite related-record ownership must match this website; invalid/cross-tenant references reject.

#### `public.commerce_order_status_events`

Append-only facts about actual stored order/payment transitions, without invented backfill.

| Column | Exact type/default/check declaration | Meaning |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | Stable identifier for this record; referenced history must retain it. |
| `event_sequence` | `bigint generated always as identity unique` | Identity sequence giving deterministic timeline ordering, including multiple facts in one transaction. Rollback gaps are valid. |
| `website_id` | `uuid not null references public.commerce_websites(id)` | Tenant boundary: the selected commerce website. Composite foreign keys keep related records in this same tenant. |
| `order_id` | `uuid not null` | The order within the same website; composite foreign keys preserve tenant/order binding. |
| `customer_user_id` | `uuid not null references auth.users(id)` | Verified customer identity attached to an own order/review/request/event; never a caller-selected buyer. |
| `status` | `text not null check (status in ('placed','confirmed','preparing','ready','completed','cancelled'))` | Validated lifecycle/moderation state for this table; exact allowed values/default are shown in SQL below. |
| `payment_status` | `text not null check (payment_status in ('unpaid','paid','refunded'))` | The actual stored unpaid/paid/refunded order fact at event time; capture is not inferred from a visual status. |
| `event_type` | `text not null check (event_type in ('created','status_changed','payment_changed'))` | Distinguishes initial creation, an actual stored order-status change or an actual payment-status change. |
| `created_at` | `timestamptz not null default clock_timestamp()` | Record creation time; existing records are not fabricated or backfilled by installation. |

Table-level constraints (inline column PK/UNIQUE/FK/CHECK declarations also apply):

- `unique (website_id,id)` — Enforces the exact uniqueness scope shown; the constraint automatically creates its backing unique index.
- `foreign key (website_id,order_id) references public.commerce_orders(website_id,id)` — Composite related-record ownership must match this website; invalid/cross-tenant references reject.

### Explicit indexes

| Index and exact declaration | Purpose |
| --- | --- |
| `create index commerce_saved_addresses_customer on public.commerce_saved_addresses(website_id,user_id,created_at);` | Supports website/customer address ordering. |
| `create unique index commerce_saved_addresses_one_default on public.commerce_saved_addresses(website_id,user_id) where is_default;` | Partial uniqueness allows at most one default address for each website/customer. |
| `create index commerce_reviews_moderation on public.commerce_reviews(website_id,status,created_at desc);` | Supports tenant moderation queues by status and newest creation. |
| `create index commerce_reviews_public on public.commerce_reviews(website_id,product_id,created_at desc) where status='approved';` | Partial approved-only tenant/product review lookup. |
| `create index commerce_order_requests_queue on public.commerce_order_requests(website_id,status,created_at desc);` | Supports tenant pending/decided request queues ordered by creation. |
| `create index commerce_order_status_events_timeline on public.commerce_order_status_events(website_id,order_id,event_sequence);` | Supports deterministic website/order event-sequence reads. |

Each inline PRIMARY KEY/UNIQUE declaration above additionally creates its
own unique backing index. Foreign keys and CHECK constraints do not implicitly
create extra referencing-side indexes. No unrelated legacy index is rebuilt.

### Every new RLS policy

| Policy and exact SELECT rule | Explanation |
| --- | --- |
| `create policy commerce_saved_addresses_self_read on public.commerce_saved_addresses for select to authenticated using(user_id=auth.uid());` | Only the Auth user owning the record may read it; tenant IDs remain part of record/FK scope. Website owners do not gain another customer’s private address/review via membership. |
| `create policy commerce_wishlist_items_self_read on public.commerce_wishlist_items for select to authenticated using(user_id=auth.uid());` | Only the Auth user owning the record may read it; tenant IDs remain part of record/FK scope. Website owners do not gain another customer’s private address/review via membership. |
| `create policy commerce_reviews_self_read on public.commerce_reviews for select to authenticated using(customer_user_id=auth.uid());` | Only the Auth user owning the record may read it; tenant IDs remain part of record/FK scope. Website owners do not gain another customer’s private address/review via membership. |
| `create policy commerce_order_requests_scoped_read on public.commerce_order_requests for select to authenticated using(customer_user_id=auth.uid() or commerce_private.is_member(website_id,'orders'));` | The own customer or a current website owner with orders permission may read order request/timeline facts. |
| `create policy commerce_order_status_events_scoped_read on public.commerce_order_status_events for select to authenticated using(customer_user_id=auth.uid() or commerce_private.is_member(website_id,'orders'));` | The own customer or a current website owner with orders permission may read order request/timeline facts. |

### Every new or replaced function

| Function and exact signature | Purpose |
| --- | --- |
| `commerce_private.customer_payload(p_value jsonb,p_allowed text[]) returns void language plpgsql immutable set search_path=''` | Rejects nonobjects, oversized JSON and unknown customer-action keys, including submitted identities/financial flags. |
| `commerce_private.customer_identifier(p_value jsonb) returns uuid language plpgsql immutable set search_path=''` | Requires a canonical UUID JSON string; rejects numeric/null/coerced identifiers before a UUID cast. |
| `commerce_private.saved_address(p_website_id uuid,p_user_id uuid,p_address_id uuid) returns jsonb language plpgsql stable security definer set search_path=''` | Private lookup requiring verified current Auth and exact website/user/address ownership; supplies the stored shipping fields. |
| `commerce_private.customer_snapshot(p_website_id uuid,p_user_id uuid) returns jsonb language sql stable security definer set search_path=''` | Builds one customer’s wishlist/names, addresses, reviews, requests, timelines and authoritative review/request eligibility for the selected website. |
| `commerce_private.record_order_status_event() returns trigger language plpgsql security definer set search_path=''` | Elevated trigger appends only creation or actual stored status/payment changes with deterministic ordering; initial creation time is the order’s stored timestamp. |
| `commerce_private.reject_event_mutation() returns trigger language plpgsql set search_path=''` | Rejects UPDATE/DELETE of immutable order facts, including ordinary privileged SQL. |
| `public.commerce_customer_experience(p_website_id uuid,p_action text default 'get',p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=''` | Verified Auth customer action/read dispatcher. It locks and rechecks identity, scopes every record to website/user, and restricts mutations to active eligible stores. |
| `commerce_private.owner_engagement_snapshot(p_website_id uuid) returns jsonb language sql stable security definer set search_path=''` | Builds permission-filtered merchant review/request/event data; product moderation does not reveal customer/order identities. |
| `public.commerce_owner_engagement(p_website_id uuid,p_action text default 'get',p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=''` | Current verified owner dispatcher for review moderation and request decisions; required permission and website-before-order lock hierarchy are enforced. |
| `public.commerce_public_product_reviews(p_website_id uuid,p_product_id uuid) returns jsonb language sql stable security definer set search_path=''` | Returns only approved reviews, count and average for a visible active tenant/product, excluding customer/order/moderator identities. |

### Every new trigger

| Trigger and exact binding | Effect |
| --- | --- |
| `create trigger commerce_order_status_event_record after insert or update of status,payment_status on public.commerce_orders for each row execute function commerce_private.record_order_status_event();` | After actual order creation or stored status/payment update, append a corresponding immutable fact; failure aborts the originating transaction. |
| `create trigger commerce_order_status_event_immutable before update or delete on public.commerce_order_status_events for each row execute function commerce_private.reject_event_mutation();` | Before event UPDATE/DELETE, reject history rewriting. |

## Growth and notifications

Complete SQL: [20261102162000_commerce_growth_notifications.sql](../../supabase/migrations/20261102162000_commerce_growth_notifications.sql).
Behaviour/authorization/rollback review: [growth-migration-review.md](growth-migration-review.md).

### New tables and every column

#### `public.commerce_coupons`

Private tenant promotion configuration, with exact-paise and basis-point validation.

| Column | Exact type/default/check declaration | Meaning |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | Stable identifier for this record; referenced history must retain it. |
| `website_id` | `uuid not null references public.commerce_websites(id)` | Tenant boundary: the selected commerce website. Composite foreign keys keep related records in this same tenant. |
| `code` | `text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$')` | Website-specific normalized promotion code; it is not exposed as a public coupon listing. |
| `kind` | `text not null check (kind in ('fixed','percentage'))` | Fixed-paise or percentage-basis-point discount interpretation. |
| `discount_value` | `bigint not null` | Fixed discount in paise, or integer basis points for percentage; 1000 basis points = 10%. |
| `maximum_discount_paise` | `bigint check (maximum_discount_paise between 1 and 100000000)` | Optional upper bound on the calculated product-subtotal discount; delivery is not discounted. |
| `minimum_subtotal_paise` | `bigint not null default 0 check (minimum_subtotal_paise between 0 and 1000000000000)` | Minimum product subtotal for coupon eligibility, before delivery and discount. |
| `starts_at` | `timestamptz` | Optional inclusive eligibility start time. |
| `ends_at` | `timestamptz` | Optional exclusive eligibility end time; when both are set it must follow the start. |
| `usage_limit` | `integer check (usage_limit between 1 and 1000000)` | Optional overall immutable placed-order redemption limit; cancellations do not restore uses. |
| `per_customer_limit` | `integer not null default 1 check (per_customer_limit between 1 and 1000000)` | Required per-customer immutable placed-order redemption limit. |
| `active` | `boolean not null default true` | Availability/archive flag. Archiving retains the record and historical references. |
| `created_at` | `timestamptz not null default now()` | Record creation time; existing records are not fabricated or backfilled by installation. |
| `updated_at` | `timestamptz not null default now()` | Last validated change time; it is not used as proof of order completion or a fresh return window. |

Table-level constraints (inline column PK/UNIQUE/FK/CHECK declarations also apply):

- `unique (website_id,id)` — Enforces the exact uniqueness scope shown; the constraint automatically creates its backing unique index.
- `unique (website_id,code)` — Enforces the exact uniqueness scope shown; the constraint automatically creates its backing unique index.
- `check ((kind='fixed' and discount_value between 1 and 100000000) or (kind='percentage' and discount_value between 1 and 10000))` — Enforces the stated data/lifecycle invariant directly in PostgreSQL; invalid rows reject atomically.
- `check (starts_at is null or ends_at is null or ends_at > starts_at)` — Enforces the stated data/lifecycle invariant directly in PostgreSQL; invalid rows reject atomically.

#### `public.commerce_coupon_redemptions`

Immutable history of actual order discounts; usage remains consumed after cancellation.

| Column | Exact type/default/check declaration | Meaning |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | Stable identifier for this record; referenced history must retain it. |
| `website_id` | `uuid not null` | Tenant boundary: the selected commerce website. Composite foreign keys keep related records in this same tenant. |
| `coupon_id` | `uuid not null` | Coupon within this website, linked by composite foreign key. |
| `order_id` | `uuid not null` | The order within the same website; composite foreign keys preserve tenant/order binding. |
| `user_id` | `uuid not null` | Verified Auth user owning this address/wishlist or using this coupon; identity is derived from Auth rather than caller input. |
| `discount_paise` | `bigint not null check (discount_paise between 1 and 100000000)` | Exact applied discount snapshot, checked against authoritative coupon/order totals. |
| `created_at` | `timestamptz not null default now()` | Record creation time; existing records are not fabricated or backfilled by installation. |

Table-level constraints (inline column PK/UNIQUE/FK/CHECK declarations also apply):

- `unique (website_id,order_id)` — Enforces the exact uniqueness scope shown; the constraint automatically creates its backing unique index.
- `foreign key (website_id,coupon_id) references public.commerce_coupons(website_id,id)` — Composite related-record ownership must match this website; invalid/cross-tenant references reject.
- `foreign key (website_id,order_id) references public.commerce_orders(website_id,id)` — Composite related-record ownership must match this website; invalid/cross-tenant references reject.
- `foreign key (website_id,user_id) references public.commerce_customers(website_id,user_id)` — Composite related-record ownership must match this website; invalid/cross-tenant references reject.

#### `public.commerce_notification_outbox`

Private transactional order/status delivery queue with leases/retries and deduplication.

| Column | Exact type/default/check declaration | Meaning |
| --- | --- | --- |
| `id` | `uuid primary key default gen_random_uuid()` | Stable identifier for this record; referenced history must retain it. |
| `website_id` | `uuid not null` | Tenant boundary: the selected commerce website. Composite foreign keys keep related records in this same tenant. |
| `order_id` | `uuid not null` | The order within the same website; composite foreign keys preserve tenant/order binding. |
| `recipient_user_id` | `uuid not null` | Recipient Auth/customer identifier resolved to a verified email only by a service worker; persistent payload contains no email address. |
| `event_type` | `text not null check (event_type in ('order_placed','order_confirmed','order_preparing','order_ready','order_completed','order_cancelled'))` | Distinguishes initial creation, an actual stored order-status change or an actual payment-status change. |
| `dedup_key` | `text not null check(char_length(dedup_key) between 1 and 150)` | Website-scoped order/event identity preventing duplicate outbox events. |
| `payload` | `jsonb not null default '{}' check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=4000)` | Bounded safe order metadata for notification rendering; no credential or recipient-email storage. |
| `status` | `text not null default 'pending' check(status in ('pending','processing','sent','failed'))` | Validated lifecycle/moderation state for this table; exact allowed values/default are shown in SQL below. |
| `attempts` | `integer not null default 0 check(attempts between 0 and 5)` | Delivery attempts, bounded at five before terminal failure. |
| `available_at` | `timestamptz not null default now()` | Earliest retry time, including bounded backoff after a failure. |
| `lease_token` | `uuid` | Random service-worker claim token; ACK must match the active unexpired lease. |
| `lease_expires_at` | `timestamptz` | End of the worker’s bounded lease; expired work can be recovered. |
| `last_error_code` | `text not null default '' check(last_error_code in ('','provider_unavailable','provider_rejected','recipient_unverified'))` | Allowlisted safe failure classification, not a raw provider error or customer address. |
| `provider_message_id` | `text check(char_length(provider_message_id)<=200)` | Bounded provider receipt ID after an accepted notification send. |
| `created_at` | `timestamptz not null default now()` | Record creation time; existing records are not fabricated or backfilled by installation. |
| `sent_at` | `timestamptz` | Time at which a valid leased ACK records the event as sent. |

Table-level constraints (inline column PK/UNIQUE/FK/CHECK declarations also apply):

- `unique(website_id,dedup_key)` — Enforces the exact uniqueness scope shown; the constraint automatically creates its backing unique index.
- `foreign key(website_id,order_id) references public.commerce_orders(website_id,id)` — Composite related-record ownership must match this website; invalid/cross-tenant references reject.
- `foreign key(website_id,recipient_user_id) references public.commerce_customers(website_id,user_id)` — Composite related-record ownership must match this website; invalid/cross-tenant references reject.
- `check ((status='processing')=(lease_token is not null and lease_expires_at is not null))` — Enforces the stated data/lifecycle invariant directly in PostgreSQL; invalid rows reject atomically.

### Explicit indexes

| Index and exact declaration | Purpose |
| --- | --- |
| `create index commerce_coupon_usage on public.commerce_coupon_redemptions(website_id,coupon_id,user_id);` | Supports overall and per-customer coupon redemption counting under the same coupon lock. |
| `create index commerce_notification_ready on public.commerce_notification_outbox(status,available_at,lease_expires_at) where status in ('pending','processing');` | Partial pending/processing scheduling/lease index for worker claim/recovery. |

Each inline PRIMARY KEY/UNIQUE declaration above additionally creates its
own unique backing index. Foreign keys and CHECK constraints do not implicitly
create extra referencing-side indexes. No unrelated legacy index is rebuilt.

### Every new RLS policy

| Policy and exact SELECT rule | Explanation |
| --- | --- |
| `create policy commerce_coupons_owner_read on public.commerce_coupons for select to authenticated using(commerce_private.is_member(website_id,'orders'));` | Current tenant orders permission permits private coupon/redemption reads; no customer/anonymous coupon listing. |
| `create policy commerce_coupon_redemptions_owner_read on public.commerce_coupon_redemptions for select to authenticated using(commerce_private.is_member(website_id,'orders'));` | Current tenant orders permission permits private coupon/redemption reads; no customer/anonymous coupon listing. |

`commerce_notification_outbox` deliberately has **no** user SELECT/mutation policy
or direct API-role table grant; only service worker RPCs read/mutate its payloads.
Owners/Admin receive safe status counts instead of recipient records.

### Every new or replaced function

| Function and exact signature | Purpose |
| --- | --- |
| `commerce_private.quote_coupon(p_website_id uuid,p_user_id uuid,p_code text,p_subtotal bigint,p_delivery bigint,p_lock_coupon boolean default false) returns jsonb language plpgsql security definer set search_path=''` | Checks website/code/date/minimum/limits and exact-paise discount; optional coupon row lock serializes the final use. No preview redemption is inserted. |
| `commerce_private.guard_coupon_redemption() returns trigger language plpgsql security definer set search_path=''` | INSERT trigger revalidates tenant, buyer, coupon and exact order discount under the coupon lock; UPDATE/DELETE are denied. |
| `commerce_private.enqueue_order_notification() returns trigger language plpgsql security definer set search_path=''` | Appends a deduplicated safe outbox event in the same transaction as an order/status change. Existing orders are not backfilled. |
| `public.commerce_growth_analytics(p_website_id uuid,p_days integer default 30) returns jsonb language plpgsql stable security definer set search_path=''` | Permission-scoped 7/30/90-day UTC daily completed-order trends, ten top product snapshots and fifty inventory-permitted low-stock signals. Only created/status_changed completion facts establish completion time; payment-only facts cannot invent a legacy date. The final integrated suite includes 34 analytics assertions. |
| `public.commerce_growth_workspace(p_website_id uuid) returns jsonb language plpgsql stable security definer set search_path=''` | Verified orders-permission owner read of private coupon usage, bounded analytics and notification counts; no recipient payload or secrets. |
| `public.commerce_growth_owner_action(p_website_id uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=''` | Verified current owner coupon save/archive dispatcher with exact fields/types/money/dates/limits and after-lock membership checks. |
| `public.commerce_notification_claim(p_limit integer default 10,p_lease_seconds integer default 120) returns jsonb language plpgsql security definer set search_path=''` | Service-only SKIP LOCKED batch claims with independent bounded leases; resolves recipients only from verified Auth and recovers exhausted/expired work. |
| `public.commerce_notification_ack(p_id uuid,p_lease_token uuid,p_sent boolean,p_error_code text default '',p_provider_message_id text default null) returns jsonb language plpgsql security definer set search_path=''` | Service-only acknowledgement requiring matching unexpired lease; records safe sent evidence or bounded retry/backoff/terminal failure. |
| `public.commerce_notification_admin(p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=''` | Service-only bounded status/count and explicit failed-item retry; signed Admin HTTP authorization is still required. |

### Every new trigger

| Trigger and exact binding | Effect |
| --- | --- |
| `create trigger commerce_coupon_redemption_guard before insert or update or delete on public.commerce_coupon_redemptions for each row execute function commerce_private.guard_coupon_redemption();` | Before redemption INSERT/UPDATE/DELETE, validate the new bound discount or reject edits/deletes. |
| `create trigger commerce_order_notification_events after insert or update of status on public.commerce_orders for each row execute function commerce_private.enqueue_order_notification();` | After order insertion or actual status change, append a deduplicated outbox event transactionally. |

## Columns added to existing commerce tables

| Existing table / new column | Exact declaration | Meaning |
| --- | --- | --- |
| `public.commerce_order_items.variant_id` | `uuid` | Optional order-line variant reference scoped to the same website/product; null retains simple-product lines. |
| `public.commerce_order_items.variant_name` | `text` | Immutable display-name snapshot for the chosen order-line variant. |
| `public.commerce_order_items.sku` | `text` | Immutable chosen-variant SKU snapshot; later catalog edits do not rewrite this order line. |
| `public.commerce_order_items.option_snapshot` | `jsonb not null default '{}'` | Immutable chosen option-name/value snapshot so later catalog edits cannot rewrite the order. |
| `public.commerce_orders.discount_paise` | `bigint not null default 0 check(discount_paise between 0 and 1000000000000)` | Exact applied discount snapshot, checked against authoritative coupon/order totals. |
| `public.commerce_orders.coupon_id` | `uuid` | Coupon within this website, linked by composite foreign key. |
| `public.commerce_orders.coupon_code` | `text not null default ''` | Original normalized coupon code snapshot for the order, empty for old/no-coupon orders. |
| `public.commerce_orders.delivery_zone_id` | `uuid` | Optional selected delivery-zone reference within the order’s website. |

All old rows satisfy the new nullable/default declarations: old discount is zero,
coupon code is empty and option snapshots are empty objects. Existing order
totals and line prices are not recalculated. No UPDATE is used as a backfill.

## Intentional changes to existing constraints/functions

- `commerce_order_items_variant_tenant_fk` binds the new optional variant to the same website/product.
- `commerce_order_items_order_id_product_id_key` is replaced by the explicitly listed `commerce_order_items_line` unique index; NULLS NOT DISTINCT preserves old simple-line uniqueness while separate variants become valid.
- `commerce_orders_check` is replaced by `commerce_orders_total_check`: the original subtotal/delivery total is extended by an explicit nonnegative discount snapshot.
- `commerce_orders_zone_tenant_fk` binds optional delivery coverage to the order website.
- `commerce_orders_coupon_tenant_fk` binds optional coupons to the order website.
- Original public checkout/owner implementations are moved without body edits to `commerce_private.legacy_create_cod_order(uuid,jsonb,jsonb,text,uuid)` and `commerce_private.legacy_owner_action(uuid,text,jsonb)`. They are not API-callable; the public names become validated compatible wrappers described above.
- `commerce_order_status_events_event_sequence_seq` is a new private identity sequence backing event order. All PUBLIC/anon/authenticated/service grants are revoked; the elevated trigger assigns sequence values.
- `NOTIFY pgrst, 'reload schema'` requests a PostgREST schema refresh after installation; it creates no scheduled job.

## Grants, testing and rollback interpretation

Core grants authenticated SELECT on its five tables and service SELECT only on
store settings for bounded Admin template lookup. Customer grants authenticated/
service SELECT on its five tables, retaining customer/owner RLS for authenticated
reads. Growth grants authenticated/service SELECT on coupons/redemptions and no
direct API access to outbox. All thirteen tables revoke direct API-role DML;
service Admin actions use their validated functions rather than table DML.
The explicit function GRANT/REVOKE statements in each linked full migration are
the exact callable-role inventory; private helpers remain non-callable.

This inventory does not turn an unexecuted latest edit into a passing test. Use
the final [implementation report](expansion-report.md) and
[database evidence](expansion-db-validation.md) for actual tested hashes/counts.
A source rollback must retain collected images/options/variants, requests,
immutable events, coupon redemptions and outbox history. Do not drop/truncate
these records or replay the foundation. Existing discounted/variant orders may
need a forward repair rather than an older application that cannot interpret them.
