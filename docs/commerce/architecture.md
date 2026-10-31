# Client Websites: analysis and Phase 1 contract

## Existing application

Baseline commit: `4d036fb`. Next.js 16.3.4 App Router, React 19, Tailwind 4,
Supabase Auth/PostgREST, custom signed Super Admin cookies, and Capacitor Android.
The repository contains 50 page routes, 88 route handlers, and no checked-in SQL
migration history. Existing restaurant, delivery, resort, payment, wallet, and
settlement implementations remain separate and must not be refactored for this module.

Read-only PostgREST OpenAPI inspection identified 86 existing public table/view
definitions and 234 RPC paths. Restaurant ownership uses `restaurants`, existing
catalog/order features use `menu_items` and `orders`, and delivery has its own
customer, stock, order, wallet and settlement records. There are no existing
`commerce_*` tables. The API metadata does not expose actual RLS policies, auth
triggers, storage policies or cron definitions; these cannot be certified from the
repository. No production rows were inspected or changed during this analysis.

Reuse only the existing Super Admin session and same-origin request helpers.
Owner/customer access uses verified Supabase bearer tokens and a user-scoped
database client; a submitted website ID is only a selector. Separate browser
storage keys prevent commerce sessions from overwriting existing restaurant and
delivery sessions. Public catalog RPCs return explicit public fields instead of
exposing private base tables.

## Additive module

- `/commerce`: owner application and management entry point.
- `/commerce/auth`: dedicated signup, sign-in, verification and recovery.
- `/commerce/apply`: verified owner application form.
- `/commerce/dashboard`: owner website selector and management workspace.
- `/shops/[slug]`: local/preview storefront, catalog, cart and COD checkout.
- `/shops/[slug]/account`: tenant-scoped customer authentication and order history.
- Super Admin gains one **E-Commerce Website Management** navigation item and
  independent APIs; existing control-center queries are not expanded.
- API routes live under `/api/commerce`; server helpers under
  `lib/server/commerce`; shared UI under `app/components/commerce`.

Path-based routing works locally without wildcard DNS. No main domain, DNS record,
existing route or global maintenance behavior is changed. The root `vercel.json`
disables automatic Git deployments for `feature/client-websites-phase1` only;
other branches retain their existing behavior. Verified hostname/custom-domain
routing belongs to Phase 4.

## Phase 1 data contract

New tables are prefixed `commerce_`: `websites`, `memberships`, `applications`,
`categories`, `products`, `customers`, `orders`, `order_items`, and `audit_logs`.
Private tenant records carry `website_id`. Composite foreign keys prevent product,
category, customer and order references across websites. Records are archived or
status-transitioned, not deleted through application APIs.

Website fields: `id`, `slug`, `name`, `business_type`, `template` (`general`),
`status` (`setup`, `active`, `suspended`, `archived`), `branding` JSON,
`features` JSON, `fulfillment` JSON, `owner_permissions` JSON,
`subscription_plan`, `subscription_status`, `monthly_price_paise`, timestamps.
Supported business labels: general, sarees, fashion, grocery, food, toys,
electronics, beauty, pharmacy and footwear. Pharmacy cannot activate or sell in
Phase 1. Category-specific templates are Phase 2, not implied by a business label.

Branding keys: `primary_color`, `background_color`, `text_color`, `logo_url`,
`banner_url`, `headline`, `description`, `contact_email`, `contact_phone`.
Colors must be hex colors; text is rendered as text, never HTML or executable code.
Image uploads use a dedicated `commerce-media` bucket with owner-scoped writes,
JPEG/PNG/WebP MIME types, a 5 MB limit and website-prefixed object paths.

Feature keys: `catalog`, `inventory`, `cod` (default true). Fulfillment keys:
`pickup` (default true), `delivery` (default false), `delivery_fee_paise`,
`minimum_order_paise`, `pickup_address`. Owner permission keys: `products`,
`categories`, `inventory`, `orders`, `branding`, `customers`. All feature and
permission assignment is Super Admin only. Online payments remain disabled.
When `inventory` is false, stock is untracked: catalog availability and checkout
ignore stock quantities, and orders do not consume or restore inventory. When it
is true, checkout enforces stock under transaction locks. Each order snapshots
whether inventory was tracked so later setting changes do not affect restocking.

Application fields: `id`, `applicant_user_id`, `owner_name`, `business_name`,
`business_type`, `phone`, `email` (derived from verified Auth user), `address`,
`preferred_slug`, `description`, `required_features` string array,
`product_categories` string array, `fulfillment` JSON, `branding_preferences`,
`payment_requirements`, `status` (`submitted`, `under_review`, `approved`,
`rejected`), `review_note`, `website_id`, timestamps.

Membership fields: `website_id`, `user_id`, `role` (`owner`, extensible staff),
`active`. Only one active owner per website. Memberships are assigned by Admin.

Category fields: `id`, `website_id`, `name`, `slug`, `active`.
Product fields: `id`, `website_id`, nullable `category_id`, `name`, `slug`,
`description`, integer `price_paise`, integer `stock_quantity`, `image_url`,
`attributes` JSON, `active`, timestamps. Product edits do not overwrite stock;
stock changes use a separate locked adjustment action.

Orders contain `id`, `website_id`, `customer_user_id`, UUID `idempotency_key`,
normalized `request_payload`, `customer_details` JSON (`name`, `phone`, `address`),
`fulfillment_method`, `payment_method=cod`, `payment_status`, `status`, integer
`subtotal_paise`, `delivery_fee_paise`, `total_paise`, timestamps and
`inventory_released_at`. Items snapshot product names, quantity and integer prices.
Order statuses: placed → confirmed → preparing → ready → completed, with allowed
cancellation before completion. Cancellation restocks tracked inventory once. No existing wallet,
order, payment or cron procedure is called.

Checkout derives the buyer from `auth.uid()`, verifies website activation/COD/
fulfillment, locks products in deterministic order, recomputes prices from the
database, consumes tracked stock and inserts snapshots in one transaction. Duplicate
cart lines are aggregated. A tenant/buyer/idempotency-key lock prevents duplicate
orders; identical replay returns the original order, changed replay is rejected.

## RPC contract

- `commerce_public_catalog(p_slug text)` → `{website,categories,products}` or null;
  public fields only, active non-pharmacy websites only.
- `commerce_submit_application(p_payload jsonb)` → application row; verified user.
- `commerce_owner_action(p_website_id uuid,p_action text,p_payload jsonb)` → JSON;
  actions: `save_product`, `archive_product`, `save_category`, `archive_category`,
  `adjust_stock`, `update_branding`, `update_order_status`.
- `commerce_create_cod_order(p_website_id uuid,p_items jsonb,p_customer jsonb,
  p_fulfillment text,p_idempotency_key uuid)` → `{order,items}`.
- `commerce_admin_action(p_action text,p_payload jsonb,p_actor_email text)` → JSON;
  service-role-only actions: `create_website`, `save_website`, `assign_owner`,
  `review_application` (payload uses `application_id`). Owner assignment requires a verified Auth account.

RPCs use fixed search paths and minimal explicit EXECUTE grants. Owners/customers
have SELECT policies scoped to memberships or buyer identity; mutation RPCs enforce
permissions and state transitions. Anonymous callers cannot read private tables.
Direct authenticated writes to privileged settings, inventory or orders are denied.
Audit snapshots are administrative records readable only through the trusted
service-role workflow; owners and customers cannot read their private snapshots.

## HTTP contract

All responses: `{success:true,...payload}` or `{success:false,message}`. Mutations
require same-origin browser requests. Bearer users are verified with Auth `getUser`;
Admin uses the existing signed cookie. Never accept caller-supplied actor identities.

- `GET /api/commerce/catalog/[slug]` → public catalog.
- `GET /api/commerce/applications` → `{applications}` for current applicant.
- `POST /api/commerce/applications` → `{application}`.
- `GET /api/commerce/workspace` → `{websites}` for active owner memberships.
- `GET /api/commerce/workspace/[websiteId]` →
  `{website,membership,categories,products,orders,order_items,customers}`.
- `POST /api/commerce/workspace/[websiteId]` with `{action,payload}` → RPC result.
- `POST /api/commerce/checkout/[websiteId]` with
  `{items:[{product_id,quantity}],customer:{name,phone,address},fulfillment_method,
  idempotency_key,payment_method:'cod'}` → `{order,items}`.
- `GET /api/commerce/customer/orders?website_id=UUID` → `{orders,order_items}`;
  own customer rows only.
- `GET /api/commerce/admin` → `{websites,applications,memberships,audit_logs}`.
- `POST /api/commerce/admin` with `{action,payload}` → Admin RPC result.

## Development, verification and later phases

Phase 1 implements the foundation above. Phase 2 adds industry-specific layouts
and variants; Phase 3 adds promotions, feature requests, reports and billing;
Phase 4 adds verified domains, SEO expansion, sandbox payment integrations and
staging release checks. Recurring plan metadata is configuration, not automated
collection or merchant settlement.

Versioned SQL and RLS tests are required. There is no separate hosted staging
project, so tests run against isolated local PostgreSQL with explicit test Auth
and Storage scaffolding. Hosted Auth hooks, storage delivery and deployed policy
compatibility require staging verification before production activation. Document
exact install and verification commands, rollback considerations, all untested
integrations, and build results. Prepare a feature-branch PR; do not merge or deploy.
