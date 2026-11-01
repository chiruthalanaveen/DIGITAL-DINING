# Storefront roadmap — first shopping increment

Updated 1 November 2026. Branch: `feature/client-websites-phase1`, PR #3.
This plan implements the uploaded luxury editorial brief incrementally. It does
not claim all seventeen requested features are complete.

## Audit and preservation boundary

The current checkout contains
[Storefront.jsx](../../app/components/commerce/Storefront.jsx) and
[storefront.css](../../app/components/commerce/storefront.css).
`storefront-modern.css` is **not present in this checkout**. Preserve the existing
stylesheet and any later supplied modern stylesheet; use a separate, scoped
additive layer instead of overwriting either. The uncommitted commerce email
callback repair, its tests and fixtures are existing work to retain.

The storefront already derives its name, slug, branding, logo, banner, categories,
products and fulfillment from the selected tenant. Search, category selection,
name/price sorting, single-image product details, per-website persistent bags,
stock limits, verified customer access, pickup, flat-fee delivery and COD work.
Checkout retains an idempotency key through failed/reconciled retries and sends
product IDs/quantities to server-authoritative pricing and stock logic. These
behaviors, approval/assignment/activation checks and owner permissions are not
being replaced by the visual refresh.

The foundation is already installed and verified. **Do not reapply it.** This
increment performs no production SQL, production configuration change, deployment,
payment activation or merge. No SQL migration required.

## Capability audit against the seventeen requests

| # | Requested capability | Current implementation and gap | Planned dependency |
| --- | --- | --- | --- |
| 1 | Image gallery and zoom | One `image_url` per product and a detail dialog; no zoom or persisted image collection. | First increment: accessible zoom of the existing image, honest missing-image fallback. Multiple images later need an approved media model. |
| 2 | Advanced filters | Search, category and name/price sort exist. No price bounds or availability filter. | First increment: combine all filters, explain invalid bounds, accurate counts and full reset. No schema change. |
| 3 | Premium bag and checkout | Quantity controls, totals/fees, pickup/delivery, verified-account gate, COD, retry protection and confirmation exist. | First increment: clearer shopping steps, fee/review hierarchy, autofill, error recovery and mobile controls. Preserve checkout payload and server calculations. |
| 4 | SEO and performance | Tenant metadata/canonical/OpenGraph exist; unavailable/account pages are noindex; inactive stores do not return a public catalog. Images are partly lazy-loaded. | Later focused pass: supported image sizing/loading, validated structured data and measured performance. Field p75 metrics require real traffic telemetry. |
| 5 | Order tracking | Customer-scoped order history, persisted status, details and refresh exist. | Later display-only timeline using the exact stored state; do not invent GPS, delivery estimates or statuses. |
| 6 | Delivery PIN codes/fees | Pickup and a configured flat delivery fee exist; no coverage rules or PIN-code selection. | Additive tenant coverage/fee model and server checkout enforcement; reviewed migration and denial/replay tests. |
| 7 | Variants | A base product has price, stock and display attributes; no selectable stock-bearing variants/SKU model. | Additive variant/SKU inventory model, then transactional checkout/owner controls. Existing simple products must remain valid. |
| 8 | Policies/trust | Configured contact details and pickup address exist; no policy/FAQ configuration. | Validated optional store policy configuration with owner/admin permission checks. Migration/config contract must be reviewed; no invented terms. |
| 9 | Wishlist | No persisted wishlist. | Tenant/user/product-scoped relation, API/RLS and private page; migration approval. |
| 10 | Ratings/reviews | No review, moderation or eligibility model. | Verified completed-order eligibility, tenant-scoped review/moderation records, abuse controls and RLS; migration approval. No fabricated reviews. |
| 11 | Coupons/promotions | No commerce coupon or discount calculation. | Server-authoritative rules/redemption ledger, concurrency and replay protection; migration approval before UI activation. |
| 12 | Saved addresses | Checkout supports manual name, phone and address. No address book. | User-owned tenant-scoped address relation/API/RLS; preserve manual entry and privacy; migration approval. |
| 13 | Cancellation/returns | Owner status transitions include cancellation with tracked-stock restocking; customer history remains. No customer request/return workflow. | Policy dependency plus request/decision/audit model and transition rules. No automatic refund or silent completed-order rewrite. |
| 14 | Owner analytics | Product/order counts, stock view and completed COD order value exist; UI explicitly distinguishes order value from settlement. | Scoped reporting/permissions first; product/date trends and low-stock alerts later. Add indexes or aggregation only after measured need/review. |
| 15 | Homepage builder | Configured logo, banner, headline, description and colors exist; no ordered section/collection model. | Optional validated layout/collection configuration and admin-governed owner permissions; no empty/fake sections. |
| 16 | Order notifications | No commerce transactional-email outbox/provider integration. | Verified sender/provider plus event/outbox delivery and retry/deduplication model; secrets server-only, no unsolicited live sends. |
| 17 | Razorpay commerce payments | Commerce checkout is COD only. Other business modules' payment code must remain untouched. | Separate reviewed commerce payment ledger/webhook/reconciliation design, disabled-by-default admin gate and sandbox evidence; live activation requires explicit approval. |

## First increment: three related shopping improvements

The first delivery is deliberately limited to requests **1, 2 and 3**. The image
work is **single-image zoom**, not a claim of a finished multi-image gallery.
There is no new image storage, array hidden in product attributes, variant model,
payment integration or invented catalog content in this increment.

| Experience | Before | After this increment |
| --- | --- | --- |
| Browse | Existing category/search/sort controls and a basic product count. | A coherent search/filter area with price and availability controls, compatible sorting, meaningful result counts and clear reset/empty states. |
| Inspect a product | One image in the existing product dialog. | Existing image can be inspected at a larger scale with keyboard/touch controls, clear close behavior and a truthful fallback when no photo exists. A one-image product needs no fabricated thumbnails. |
| Shop and check out | Functional bag with controls and one long checkout panel. | Premium, clearly ordered bag/details/review presentation, legible totals/fees and mobile-friendly actions while retaining verified-account requirements, pickup, COD and safe retries. |
| Visual system | Existing tenant-driven storefront and baseline stylesheet. | Additive luxury editorial styling: serif/sans hierarchy, calm spacing, neutral surfaces, restrained tenant accents and actual configured photography. No hardcoded sample store or generic stock photos. |

Planned implementation seams (final handoff must list the actual changed files):

- [Storefront.jsx](../../app/components/commerce/Storefront.jsx): integrate filter
  state, product inspection and bag presentation. Keep pricing, quantity and
  checkout/idempotency behavior intact.
- New small storefront helper/component files under `lib/commerce/` and
  `app/components/commerce/`: isolate pure filtering and accessible image/bag UI
  where it reduces the risk of changing existing logic.
- A new scoped stylesheet such as `storefront-editorial.css`, imported after the
  baseline through [shops/layout.jsx](../../app/shops/layout.jsx). Original styles
  remain in place. Do not rename an absent file to imply it was preserved.
- Regression coverage in `tests/` and the existing isolated browser harness;
  docs record the tested behavior and deployment hold.

No SQL migration required. All new controls use existing public catalog data and
the existing checkout API. They must still work for stores with missing photos,
no categories, disabled inventory, pickup only, delivery only or COD disabled.

## Subsequent phases and ordering

1. **Public storefront completion:** measured image/SEO work (#4), persisted-state
   tracking timeline (#5), policy/trust configuration (#8) and homepage sections
   (#15). Review each configuration contract before adding fields; optional
   sections render only when valid tenant data exists.
2. **Catalog and fulfillment foundations:** approved multi-image model (#1
   remainder), PIN-code coverage/fees (#6), variants/SKUs (#7). These precede
   promotions, returns and precise analytics because checkout and inventory must
   share one authoritative model.
3. **Customer retention and service:** wishlists (#9), saved addresses (#12),
   verified-order reviews/moderation (#10), policy-aware requests (#13). Each
   persisted feature needs tenant/user foreign keys, least-privilege APIs/RLS,
   pagination and horizontal-access tests; none is activated through a UI-only
   implementation.
4. **Operations and growth:** expanded analytics (#14), transactional outbox/email
   (#16), then coupons/redemption rules (#11) after checkout foundations. Separate
   placed-order value, completed COD value and actual collected/settled money.
5. **Separately gated online payments:** commerce-only Razorpay (#17), with
   server-created orders, verified signatures/webhooks, durable idempotency,
   reconciliation and COD fallback. No real charges until explicit approval.

For every required future schema change: create a distinct versioned additive SQL
file under `supabase/migrations/`; explain tables/columns/functions/indexes/RLS,
preservation effects, verification queries and rollback limits; test only on an
isolated authorized development target; obtain explicit approval before any
hosted application. Do not run `supabase db push`, production SQL or the already
installed foundation as a shortcut. New persisted features remain optional and
must preserve legacy rows and stores that do not enable them.

## Acceptance and handoff

- Check approximately **360, 390, 768 and 1440 px** widths: no horizontal document
  overflow; usable search/navigation/account/bag access and touch-sized controls.
- Combine search, category, price bounds, availability and sorting; check zero
  price, missing/invalid bounds, empty results and inventory-disabled products.
- Inspect real-image and missing-image products; test keyboard entry, focus
  trapping/return, Escape/backdrop close and reduced-motion preference. Nested
  image inspection must not accidentally close the underlying product dialog.
- Repeat quantity/stock limits, pickup/delivery fees, minimum order, unverified
  account denial, COD confirmation, network/retry reconciliation and customer
  session isolation using isolated fixtures. Keep existing owner/admin approval,
  activation and permission checks in the regression matrix.
- Run the available unit/SQL/browser checks and **`npm run build`** with clean
  development configuration; report exact commands, actual counts and failures.
  Screenshot passes are not proof of real hosted Auth, SMTP, RLS or payments.
- Measure any available lab performance results with the tool/environment stated.
  **LCP ≤ 2.5 s, INP ≤ 200 ms and CLS ≤ 0.1 at field p75 are targets, not achieved
  claims.** A local/synthetic result cannot establish production field p75.
- Supply screenshots, a manual acceptance checklist and a clear changed-file
  list. Export **complete changed JS/JSX files as downloadable `.txt` artifacts**,
  with their exact repository/VS Code destination paths; provide stylesheet/test
  instructions as well. Do not distribute secrets, partial replacement snippets
  or production data in the handoff.
- Stop before database deployment, live payments, production changes, merging or
  direct pushes to main. Keep PR #3 and its feature-branch deployment guard.

This roadmap is an audit/plan, not a claim that implementation, measurements or
acceptance checks have already completed. Actual results belong in the delivery
report after the first increment is finished.
