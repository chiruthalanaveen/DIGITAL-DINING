# Remaining commerce implementation contract

Updated 4 November 2026. Branch `feature/commerce-expansion`, base `f9dd674`.
New work is not deployed. No hosted SQL, live fixture/payment, merge, domain
provisioning or notification send is authorized by this implementation request.

## Ownership and compatibility

Keep the original foundation migration and storefront.css byte-for-byte intact.
Use new commerce-only versioned migrations; preserve existing policies and all
legacy restaurant/delivery/resort/wallet/payment/customer/cron data. Do not
reapply foundation outside isolated development. New features remain optional
and old simple-product/COD behavior must pass the existing SQL/API/browser suite.

New tables use website_id and composite tenant foreign keys. Revoke implicit
PUBLIC/anon/authenticated DML; user SELECT is RLS-scoped, mutation RPCs check
verified identity, current membership, website status and existing permissions.
Admin operations are service-only behind the existing signed Admin session.
Never trust a submitted owner/customer identity, price, stock or discount.

## Integration seams

Core catalog migration: `20261102160000_commerce_catalog_fulfillment.sql`.
Customer migration: `20261102161000_commerce_customer_experience.sql`.
Growth migration: `20261102162000_commerce_growth_notifications.sql`.
Domain migration: `20261103090000_commerce_verified_domains.sql`.
Online merchant payment migration: `20261103091000_commerce_online_payments.sql`.
Read-only payment recovery queue: `20261104090000_commerce_payment_recovery_queue.sql`.
Stop an existing never-dispatched payment: `20261104120000_commerce_stop_unstarted_payment.sql`.
Apply in that order only to an isolated development database; production files
are review-only until separately approved. Explain any intentionally replaced
commerce RPC and preserve baseline behavior with compatibility tests.

Core RPC contracts:

- `commerce_public_catalog_v2(p_slug text)` returns the existing public catalog
  with optional website.settings, website.template, delivery_zones, and product
  images[], variants[], variants_required. No private settings/credentials.
- `commerce_catalog_workspace(p_website_id uuid)` returns settings,
  product_profiles, images, variants and delivery_zones for an authorized owner.
- `commerce_catalog_owner_action(p_website_id uuid,p_action text,p_payload jsonb)`
  supports save_product_options, save_variant, archive_variant,
  adjust_variant_stock, save_delivery_zone, archive_delivery_zone, save_settings.
- `commerce_catalog_admin_action(p_website_id uuid,p_action text,p_payload jsonb)`
  supports save_template (general/sarees/grocery/fashion/food), get_settings and
  get_workspace, service-only behind signed Admin HTTP authorization.
- `commerce_checkout_quote_v2(p_website_id uuid,p_items jsonb,p_customer jsonb,
  p_fulfillment text,p_coupon_code text default '')` is verified-user/read-only.
- `commerce_create_cod_order_v2(p_website_id uuid,p_items jsonb,p_customer jsonb,
  p_fulfillment text,p_idempotency_key uuid,p_coupon_code text default '')`
  returns {order,items}; server owns pricing/stock/fees/coupons and idempotency.

Items are {product_id,quantity,variant_id?}; customer retains {name,phone,address}
plus optional pincode and saved_address_id. Preserve old cart storage keys and
import existing product-id/quantity carts. Variant cart lines can use composite
product:variant keys. Order item option snapshots must retain original SKU/price
after later catalog edits. Cancelling restores tracked base/variant stock once.
Never allow the old public checkout RPC to bypass enabled variant/coverage rules.

Core settings are a separate commerce_store_settings record with template,
policies object, faq array, sections array, seo object and delivery_zones_enabled.
Template is Admin-assigned; owner settings use existing branding permission.
Policies are optional plain text (shipping/returns/privacy/terms), not raw HTML;
return_days and returns_enabled require explicit valid configuration. FAQ entries
are {question,answer}. Sections are allowlisted hero/categories/featured_products/
banner/text/faq, have stable id, enabled, title/body/image_url/category_id/product_ids
as applicable. No arbitrary code or fabricated content. Core SQL/API validators
must agree on exact limits and announce changes to the UI agents.

HTTP routes (normal commerceFetch Auth/same-origin rules):

- GET/POST `/api/commerce/workspace/[websiteId]/catalog` for catalog extensions.
- POST `/api/commerce/admin/catalog` with {website_id,action,payload}.
- POST `/api/commerce/quote/[websiteId]` for authoritative checkout preview.
- Existing checkout keeps old payload compatibility and uses v2 only when
  available/needed; missing optional capability cannot silently bypass a rule.
- GET/POST `/api/commerce/customer/experience` (GET website_id; POST
  {website_id,action,payload}) for wishlist, addresses, reviews and order requests.
- GET/POST `/api/commerce/workspace/[websiteId]/engagement` for review moderation
  and customer request decisions, permission-scoped.
- GET/POST `/api/commerce/workspace/[websiteId]/growth` for coupons, analytics and
  notification status. Provider sends remain disabled without verified config.
- GET/POST `/api/commerce/workspace/[websiteId]/domains` and an Admin-only domain
  endpoint. No automatic provider/domain mutations during implementation/tests.

Customer module owns commerce_saved_addresses, commerce_wishlist_items,
commerce_reviews, commerce_order_requests, commerce_order_status_events and
`commerce_customer_experience` / `commerce_owner_engagement` RPCs. Wishlist and
address ownership include website+user. Review requires a completed own order
containing the product; editing resets moderation, owner cannot fabricate/edit
customer ratings. Request workflows retain order/payment history and do not
claim a refund from a status checkbox. Export CustomerProductActions for the
storefront and CustomerExperience for the account page, with website/client/
session props; do not modify Storefront.jsx from this module.

Growth module owns commerce_coupons, commerce_coupon_redemptions and
commerce_notification_outbox plus analytics. Its private quote helper is
`commerce_private.quote_coupon(website_id uuid,user_id uuid,code text,
subtotal bigint,delivery bigint,lock_coupon boolean default false) returns jsonb`
with {coupon_id,discount_paise,code}. Checkout locks during the final quote, then
records redemption after order insertion in the same transaction. Quote must
not redeem. Respect caps, dates, per-user/overall use and integer-paise bounds.
Never expose coupon records publicly or let caller-submitted totals decide it.
Owner UI component CommerceGrowthPanel takes website/client/readOnly props.
Notification outbox uses deduplication, leases/retries and service-only worker
actions; no new cron or live email is installed/enabled. Counts distinguish order
value/completed COD value from actual captured/settled money.

Domain module owns commerce_domains, owner/admin RPC/API, CommerceDomainsPanel
(website/client/readOnly), and feature-gated host routing. Activate only after
provider ownership+deployment verification; reserve platform/system/local names,
protect other tenants' claims, do not trust forwarded-host headers, and preserve
current primary hosts/auth/maintenance. No provider secrets in browser/catalog.

Merchant online payments are separate from platform subscriptions and existing
restaurant, delivery, resort and wallet integrations. New private credential
versions, intents, immutable capture receipts and webhook leases bind the tenant,
buyer, original cart/quote, credential version and provider order. Both
COMMERCE_ONLINE_PAYMENTS_ENABLED and COMMERCE_ONLINE_PAYMENTS_ALLOW_LIVE default
off. A captured payment with an unfulfilled order retains its receipt and requires
reconciliation; it must never be represented as a completed refund or invite a
new charge. Public readiness exposes only availability/provider/mode. COD and
online creation share the same cart-key lock to prevent cross-method duplication.

The 4 November recovery follow-up adds
`commerce_payment_reconciliation_queue(p_website_id uuid)`: a STABLE,
service-only SECURITY DEFINER read RPC with fixed empty search path and the
existing actual-role guard. It returns only the selected website's open states
`new`, `creating`, `provider_unknown`, `ready`, `captured_unfulfilled`, with an
exact total count and a maximum of 100 references. Captured/unfulfilled entries
come first, then unknown/creating, then ready/new; each bucket is oldest-first
by creation timestamp and UUID. It includes original credential mode and safe
intent/cart/provider-order/receipt references, not buyer IDs, addresses, email,
encrypted credentials, original requests or full provider events. Read access
does not mutate or lock payment state, even for archived websites or disabled/
rotated merchants. Signed Admin HTTP authorization precedes the service call;
missing capability is reported unavailable while denial/malformed results fail.

Owner GET `/api/commerce/workspace/[websiteId]/payments` reuses the existing
owner JWT/membership/orders permission and `commerce_payment_readiness` RPC.
It projects configuration/mode/rollout status only; it cannot activate or prove
provider connectivity/capture. This owner portion requires no new SQL. Buyers
see their existing intent reference, or cart key before an intent is confirmed,
so merchant support can find the same attempt. Neither the queue nor references
implement unpaid abandonment, cancel an intent, release the cart, create a new
charge or mark a refund; provider proof and separate authorization remain needed.

The later stop-unstarted increment is deliberately separate from that queue.
`commerce_payment_attempt_control(p_website_id uuid,p_cart_key uuid,p_action text
default 'inspect',p_expected_intent_id uuid default null)` is authenticated-only.
It binds verified Auth buyer, website and original cart, with optional intent
binding. Inspection returns `{website_id,cart_key,intent_id,found,payment,
cancellation,can_cancel_unstarted}`; the HTTP layer adds capability/response
fields and strips private metadata. A missing row returns no proof and can
never authorize release, because the original request could still arrive.

Cancellation is permitted only for existing `new`, NULL provider order, NULL
creation lease and no receipt, checked under Auth SHARE then intent FOR UPDATE.
It adds immutable `payment_unstarted_cancellations` proof and changes only that
intent to terminal `cancelled_unstarted`. No cart advisory lock is added. The
terminal guard prevents reopening/modifying the stopped intent, and the existing
COD old-key guard continues to reject reuse. Claiming provider creation wins or
loses against the same row lock, before any provider POST can occur.

`POST /api/commerce/payments/attempt` requires verified same-origin buyer context
and the website/cart/action/optional expected intent, never caller buyer/role or
totals. Browser/server must reject stale/foreign/malformed proof. Only matching
terminal state plus explicit `{id,intent_id,cancelled_at,reason:'never_dispatched'}`
proof clears the pointer; the parent keeps the bag and generates a fresh UUID.
Cancelled replay skips credential decryption and provider creation. This does
not close an already-dispatched provider order, infer expiry, release unknown
or missing attempts, change stock/orders/receipts/coupon usage/wallets, or mark
paid/refunded. Store/gateway/rollout disablement does not block own-record recovery.

All cooperating browser tabs serialize shared payment-pointer creation, writes,
checks before a mutation, and removal through an exclusive Web Locks lock scoped
to the account/store storage key. There is no compare-then-write fallback. Online
start, stop and receipt/proof-based pointer release require a secure browser
context exposing `navigator.locks.request`; unsupported locking fails closed and
keeps the saved attempt/bag locked. Check payment can still fetch and display
status, but cannot release the pointer without that lock. COD without a saved
online pointer remains available. Stale-tab/storage changes invalidate old work;
an older response cannot replace or remove a newer cart/intent pointer.

A recovered known-`new` intent does not acquire a new provider-resume path.
Continue is disabled with “Stop this request to restart checkout” guidance;
the existing proof-checked stop is required before beginning a fresh checkout.

Core/API integration is owned by the parent agent. Frontend ownership is split:
OwnerDashboard/AdminClientWebsites versus Storefront/Bag/Gallery/templates;
customer module owns StoreAccount and its own components, growth/domains own
their panels. New mutation payloads must pass explicit Zod and SQL validation.
Missing-migration fallback can show existing functionality; never treat a failed
new mutation as success or leak private data via public capability responses.

## Required evidence

Run original SQL preservation/RLS/replay/concurrency tests plus new cross-owner,
cross-customer, tampering, variants/coverage/coupon/return tests. Use real local
PostgreSQL and simulated Auth/provider protocols, state their limits. Run npm
test, npm run lint, npm run build, and mobile/desktop browser flows. Keep native
images/accessibility and CSS concerns honest. Do not claim full completion while
remaining online payment/domain/provider/hosted acceptance gates are unresolved.

The 4 November stop-unstarted source passes the local 628-assertion PostgreSQL
suite, 327/327 full unit tests, lint with zero errors/166 warnings, and the full
repository `npm run build`. Browser checks pass 13 expansion groups/112 screenshots
and 118 original compatibility screenshots (230 total, four widths). These use
synthetic Auth/Storage/provider protocols and actual local RLS; the overall
checklist remains PARTIAL PASS for hosted/provider/domain/notification acceptance.
Keep the preceding 561-SQL/296-unit/198-screenshot record dated as historical.
