# Phase 0 — durable subscription activation plan

Prepared 1 November; updated 2 November 2026. Baseline: `727be8e` from draft PR #4, itself stacked on
draft commerce PR #3. Work is isolated on `feature/phase0-subscription-ledger`.
All existing release holds remain; no production SQL, deployment, live payment,
secret/configuration change or merge is authorized.

## Reproduced issue and preservation

The current subscription handler verifies provider signature, owner approval,
amount/order/currency and capture, then computes a new expiry and updates the
restaurant on every valid callback. It has no durable consumed-payment record.
An identical captured callback can therefore repeat activation or reset expiry.
The preceding audit reproduced repeated writes with synthetic provider effects.

Preserve existing plan prices and flags, approved-owner checks, signature and
capture validation, coupon RPC behavior and delivery settings defaults. Do not
change wallets, order histories, restaurant data during installation, cron jobs,
existing RLS or the already-installed commerce foundation.

## Smallest safe design

1. Add a private checkout-intent table and append-only activation receipt table.
   Store only bounded identity/payment references and authoritative term snapshots;
   do not store tokens, card data, secrets or provider payload dumps. Existing
   restaurant/Auth IDs are identity snapshots, not new deletion-blocking foreign
   keys. Only the new tables reference each other.
2. Add service-role-only open, bind and activation RPCs. Open an approved-owner
   intent before provider order creation; include its UUID in server-created
   provider notes. Bind the returned order before exposing checkout to the browser.
3. After all existing signature/provider checks, activate in one database
   transaction. Lock the restaurant then the intent, recheck owner/approval,
   compare the stored order/key/tenant/plan/cycle/amount/currency, enforce unique
   order/payment/checkout consumption, update the subscription and append its
   receipt atomically. Identical retries return the original stored result,
   without updating expiry or undoing a later subscription.
4. Compute and record expiry once. Preserve existing UTC JavaScript calendar
   rollover behavior, including month-end/leap-year cases. Keep delivery-settings
   initialization as its existing safe, non-overwriting best-effort upsert.
5. Never let an empty ledger accept unregistered historical captured payments.
   Old orders without the new recorded checkout intent require reconciliation;
   do not guess whether they were already used or tell paid customers to pay again.
6. If the migration/RPC is unavailable, fail closed before opening payment
   checkout. Do not fall back to the old replayable update. A lost database
   response after commit must be recoverable with the same verified payment.
7. Paid checkout is disabled unless the server-only
   `SUBSCRIPTION_PAID_CHECKOUT_ENABLED` setting is exactly `true`. This is an
   operator-controlled rollout/stop switch, not an owner-facing dashboard toggle.
   Existing approved coupon and active-account behavior remain separate.

## Database and verification boundary

**A new SQL migration is required.** Create a unique additive migration under
`supabase/migrations/`; never modify/reapply the commerce foundation. No existing
table/policy/trigger/index is replaced, and no business rows are backfilled or
updated by migration installation. Runtime activation remains an explicit,
authenticated action after provider verification.

Previously recorded OpenAPI metadata confirms relevant restaurant UUID,
text, boolean and timestamptz column types. It is existing local evidence, not a
new production query or complete legacy trigger/RLS verification. Use a new
isolated loopback `subscription_test` database with representative legacy
fixtures; do not silently substitute main credentials for missing staging.

Test all fifteen plan/cycle terms, role denial, cross-tenant/owner tampering,
capture/signature validation, concurrent identical callbacks, conflicting
payment/order reuse, approval withdrawal while waiting, transaction failure,
lost-response retry, a later-plan replay, historical-order denial and immutable
receipts. Verify migration installation/reapplication preserves existing schema,
rows, RLS, wallet/order/cron fixtures. Run unit tests, build, lint delta and
relevant local browser regressions. Do not claim hosted Supabase/provider proof.

## Review and release gates

Deliver the full migration with an object-by-object explanation, verification
queries, exact local/hosted installation order and rollback considerations.
Migration/code must be reviewed together. No migration will be applied to any
hosted database and no deployment will be created by this increment. The missing
migration-history baseline and unreviewed legacy constraints/triggers remain
installation gates. Retain automatic-deployment guards on every stacked branch.

Rollback must retain consumed-payment receipts. Never delete/truncate the ledger
or restore the unsafe activation fallback to make checkout available. If a
rollback is needed, stop new paid checkouts and retain evidence while deploying
a separately verified corrective version. Existing subscriptions remain intact.
