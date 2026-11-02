# Subscription ledger installation and recovery runbook

2 November 2026. **Review and local testing only. No hosted SQL, configuration
change or deployment is authorized by this document.** Read the
[implementation plan](subscription-ledger-plan.md) and the full
[versioned migration](../../supabase/migrations/20261101123000_subscription_payment_ledger.sql)
together with the application changes.

## Scope and prerequisites

This is a new additive migration, not a replay of the commerce foundation.
`20261022160000_commerce_foundation.sql` was already installed and verified.
Never reapply it, run blanket pending migrations, use `supabase db push`, or
create migration-history records merely to make a CLI report look complete.
The missing migration-history baseline remains an operator review gate.

The new migration creates private checkout intents and immutable activation
receipts, supporting helpers/triggers and three service-role-only public RPCs.
It checks the existing restaurant column/type and unique-ID contract before
creating objects. Installation does not backfill business records, activate a
subscription, change legacy RLS/policies/triggers, or modify wallets, orders,
payment references, customer data or cron jobs. Runtime activation is a separate
authenticated action after authoritative provider verification.

Recorded schema metadata supports the expected restaurant types; it does not
establish complete compatibility with every installed legacy constraint or
trigger. Review those definitions and the migration's installer/table-owner
privileges against an authorized representative target before any hosted use.
The private tables deliberately use RLS without FORCE so their installer-owned
SECURITY DEFINER functions can operate. Ordinary roles receive neither private
schema/table access nor public RPC execution; only `service_role` may execute
the public entry points.

## Local verification — permitted target only

Use a fresh isolated loopback PostgreSQL instance. From the repository root:

```sh
SUBSCRIPTION_TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55446/subscription_test' node scripts/test-subscription-db.mjs
```

Port `55446` was used by this increment's isolated test instance, which is now
stopped. Start a fresh disposable local instance before repeating this command.
Use its actual port, and add a development-only password securely if
your local instance requires one. Never substitute a hosted/main URL or inherit
production credentials. The runner permits only loopback and the database name
`subscription_test`, verifies the server address, then **recreates that disposable
database**. It installs representative legacy fixtures and the exact migration,
tests roles/replay/concurrency/preservation, and checks safe rejection of a
second application. These fixtures are not a complete installed Supabase schema.

The available embedded engine is PostgreSQL 18.4. Official local Supabase
PostgreSQL 17 image selection was blocked before any pull/start: the Docker Hub
metadata request to
`https://hub.docker.com/v2/repositories/supabase/postgres/tags?page_size=100&name=17.6`
failed with **`Tunnel connection failed: 403 Forbidden`**. Docker itself was
available locally; no image tag was guessed, container started or SQL executed
by that setup attempt. Evidence is outside Git at
`/workspace/commerce-validation-artifacts/subscription-ledger-20261101/local-supabase/registry-error.json`
and `readiness-summary.json` in the same directory.

An authorized operator on a permitted network can repeat compatibility testing
with a verified official Supabase PostgreSQL 17 image or separate development
project. Do not bypass network controls. Do not weaken the local runner's guards
or point its destructive bootstrap at a hosted project. Hosted testing needs
its own reviewed, non-destructive fixture procedure; real Auth/SMTP/provider
behavior is not established by the local SQL harness.

## Future hosted installation — separate approval required

These are reviewable installation steps, **not instructions to run SQL now**:

1. Record the exact intended project reference/database, commit and migration
   SHA-256. Review the complete file, current legacy column/constraint/trigger
   contract, privileges and migration-history baseline. Confirm no existing
   `subscription_private` objects conflict. Do not infer production permission
   from previous foundation approval or local test success.
2. Obtain explicit approval for this migration and that target. Keep paid
   checkout disabled and hosted application/configuration unchanged during
   review. No production SQL, including verification queries, is currently
   authorized.
3. After approval, apply **only this exact self-transactional file once**, using
   the approved project's SQL Editor or an approved secure connection:

   ```sh
   psql "${SUBSCRIPTION_APPROVED_DATABASE_URL:?Set only after explicit target and migration approval}" -X -v ON_ERROR_STOP=1 --file supabase/migrations/20261101123000_subscription_payment_ledger.sql
   ```

   `SUBSCRIPTION_APPROVED_DATABASE_URL` is an operator-supplied secure value for the explicitly
   approved target, not an instruction to reuse an existing main environment
   variable. Do not paste credentials into chat, source control or command logs.
   The file contains its own `BEGIN`/`COMMIT`; do not wrap it in a conflicting
   installation transaction. An error must roll back; do not edit around it,
   switch roles or rerun unrelated migrations to force success.
4. Under separately authorized verification scope, execute the included
   [read-only verification file](../../supabase/tests/subscription_ledger_verify.sql)
   using the approved installer/read-only administrative context:

   ```sh
   psql "${SUBSCRIPTION_APPROVED_DATABASE_URL:?Set only after explicit target and verification approval}" -X -v ON_ERROR_STOP=1 --file supabase/tests/subscription_ledger_verify.sql
   ```

   It reports catalog definitions, privileges, constraints, trigger state and
   aggregate binding/duplicate checks, without returning payment/customer rows
   or calling mutating runtime RPCs. Confirm two private RLS-enabled tables,
   denied direct ordinary/service access, public RPC execution for service only,
   enabled immutable-receipt triggers and zero binding/duplicate anomalies.
   Confirm the new public RPCs are recognized through the normal authorized
   Supabase/PostgREST review path; never fall back to the unsafe legacy update.
5. Review application deployment and operator configuration separately. Do not
   deploy, promote, merge or enable payment checkout merely because SQL passed.
   Retain all feature-branch automatic-deployment guards. Never deploy a build
   compiled with loopback fixture credentials using `--prebuilt`.

## Operator flag and existing configuration

`SUBSCRIPTION_PAID_CHECKOUT_ENABLED` is a **server-only operator flag**, disabled
unless its value is exactly `true`. An ordinary business owner cannot enable it.
Set it true only after separate migration, target, configuration and deployment
approval plus the required verification. Local tests may use synthetic `true`;
that does not authorize a hosted change. Never prefix it with `NEXT_PUBLIC_`.

The secure code fails closed when the flag is off or the ledger/RPC is missing.
It must not restore the replayable direct restaurant update. Existing active
subscriptions and the separately authorized coupon path are preserved. No other
new runtime variable, provider key, DNS record or storage policy is required.
Existing server Auth/provider settings remain unchanged; real provider test-mode
verification is still required before any payment activation approval.

## Historical payments and cutover

An empty receipt table cannot tell whether an old captured payment was already
used. Only newly server-recorded, provider-bound checkout intents enter the new
automatic activation flow. Missing, unbound or inconsistent historical payment
references require support reconciliation. **Tell customers who already paid
not to pay again.** Do not import old captures automatically, guess entitlements,
edit provider notes, or fabricate successful receipts.

Any historical reconciliation must verify provider records, original tenant and
owner, prior activation evidence and the approved business decision, with an
audit trail. A reconciliation/backfill tool or SQL change would require its own
review, isolated tests and explicit target authorization; none is implied here.

## Rollback, backup waiver and recovery

Retain checkout intents and consumed-payment receipts. Do not drop/truncate the
ledger, disable immutability, remove unique constraints or deploy the unsafe old
activation fallback. If a problem occurs, a separately approved operator can
keep/set the paid-checkout flag false while retaining secure code and evidence,
then deploy a reviewed corrective version. Flag changes themselves are hosted
configuration changes and are not authorized now. Do not undo existing active
subscriptions or unrelated coupon/customer/order/wallet data as a rollback.

The earlier backup waiver remains; this runbook does not request a new backup
or claim a backup/recovery rehearsal exists. If any database restore occurs,
pause paid paths and reconcile authoritative provider payments since the restore
cutoff against retained consumption receipts **before resuming**. A restore can
lose receipts for payments already processed, making an apparently unused
payment unsafe to consume again. Preserve the original activation/expiry proof;
do not invent it from capture status alone. If evidence is missing, keep the
affected path unavailable pending an audited decision. Successful recovery,
idempotency across a restore, hosted compatibility and live provider outcomes
must not be claimed without their own executed evidence.
