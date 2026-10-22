# Hosted Supabase staging verification — blocked, not passed

The user confirmed that no separate Supabase development/staging project exists.
There are no `COMMERCE_STAGING_*` credentials in this execution environment.
The existing project `wispidcdmunqzahjacws` is production and is explicitly
forbidden by the staging preflight. **No hosted migration, hosted fixture setup,
hosted RLS/workflow test or staging-backed Vercel Preview test has run.** Local
PostgreSQL and protocol-fixture browser results are separate evidence, documented
in [testing.md](testing.md) and [review-test-results.md](review-test-results.md).

The existing deployment
`https://digital-dining-6kfz79na2-digital-dining.vercel.app` is a staged
**production-target build using production environment configuration**. It is not
a staging-database Preview and must not be used for staging test writes. See
[preview-and-environment.md](preview-and-environment.md) for its release state,
network limitation and the future Preview configuration.

## Read-only guard and actual results

The new [preflight](../../scripts/test-commerce-staging.mjs) consumes only these
explicit variables, supplied through secure development environment settings:

| Variable | Required value |
| --- | --- |
| `COMMERCE_STAGING_PROJECT_REF` | Independently verified reference of a separate development project. |
| `COMMERCE_STAGING_SUPABASE_URL` | Exactly `https://<that-reference>.supabase.co`. |
| `COMMERCE_STAGING_SUPABASE_ANON_KEY` | That project's publishable/anon key. |
| `COMMERCE_STAGING_SUPABASE_SERVICE_ROLE_KEY` | That project's server-only secret/service-role key. |
| `COMMERCE_STAGING_DATABASE_URL` | Direct `db.<reference>.supabase.co:5432/postgres` as `postgres`, or the session pooler on port 5432 as `postgres.<reference>`. |

It never falls back to `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_*` or `DATABASE_URL`.
It refuses the known production reference, mismatched API/database identities,
alternate API paths/hosts, transaction pooler port 6543, URL host/options
overrides and insecure TLS. Legacy JWT key claims must identify the expected
project and role. Opaque publishable/secret keys do not contain a project claim;
their validity still requires the real hosted service. Claim inspection alone is
not signature verification or proof that a project is development. The operator
must positively identify the project in its Supabase dashboard before configuring
these variables. Do not relabel a production project as staging.

The actual commands executed for this addition were:

```sh
node --test tests/commerce-staging-guard.test.mjs
npx --no-install eslint scripts/test-commerce-staging.mjs tests/commerce-staging-guard.test.mjs
node --check scripts/test-commerce-staging.mjs
node scripts/test-commerce-staging.mjs
```

The eight guard tests passed; ESLint and syntax checks passed. The real preflight
command exited **1 / blocked** before any connection, reporting all five missing
explicit staging variables. This is the expected refusal, not a successful hosted
test. It performed no production or staging network request.

Once a separate project is configured, the same preflight uses verified TLS and
an explicit database connection. It opens a read-only transaction, checks database
identity/version and the nine commerce table names/RLS-enabled flags, rolls back
the read-only transaction, then checks Auth settings reachability and PostgREST
schema metadata. It does not inspect business rows, upload media, run a mutation
RPC, apply SQL or create/delete test accounts. It accepts no mutation flags. Its
output always states `hostedWorkflowTestsCompleted: false`; table/RLS presence
does not establish correct policy behavior.

## Prepare and install only on a separate development project

These are future steps; they were not executed here.

1. Create/select a separate Supabase development project under an account and
   plan selected by the user. Do not create a paid resource automatically. Verify
   its dashboard reference differs from `wispidcdmunqzahjacws`, and securely add
   the five staging variables above. Keep service/database secrets server-only.
   Use `sslmode=verify-full` in the database URL. If certificate validation needs
   an explicit Supabase CA, install the project's documented CA securely and use
   the appropriate trust-store settings; never disable certificate verification.
2. Run the read-only preflight before installing anything:

   ```sh
   node scripts/test-commerce-staging.mjs
   ```

   Review its reference/host/database metadata against the development dashboard.
   A fresh project will report `schemaInstalled: false`, which is expected before
   the migration. Review the whole SQL and [preservation analysis](preservation-review.md).
   Take and rehearse the development backup according to
   [backup-recovery.md](backup-recovery.md). Do not copy raw production customer,
   wallet, payment or order data into staging; use synthetic or properly sanitized
   fixtures.
3. Check the positively identified target has standard Supabase Auth/Storage
   objects, and that none of the proposed commerce names/bucket already exist.
   Follow the read-only inventory commands in [database.md](database.md). Stop on
   any conflict; the migration intentionally fails rather than replacing data.
4. From that development-only session, apply only the versioned file and inspect
   its read-only verification output:

   ```sh
   psql "$COMMERCE_STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/migrations/20261022160000_commerce_foundation.sql
   psql "$COMMERCE_STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/tests/commerce_verify.sql
   node scripts/test-commerce-staging.mjs
   ```

   These explicit application commands are authorized for the separate staging
   project by the user's requested staging test. They do not authorize a future
   production migration. Record the filename/hash/application result in the
   project's existing release log; reconcile with its established Supabase CLI
   migration history rather than blindly running `supabase db push`.
5. Recompare existing development table data/constraints, policies, grants,
   triggers, Auth hooks and cron definitions with the before snapshots. The
   migration should leave existing definitions unchanged while adding its
   commerce objects and new commerce-only Storage policies.

**Never run `commerce_bootstrap.sql`, `commerce_rls_checkout.sql` or
`test-commerce-db.mjs` on a hosted/shared database.** They are destructive local
fixtures, not installation or staging scripts. The preflight is deliberately a
different script with no reset/application capability.

## Required real hosted workflow test matrix

Create four synthetic development users in separate browser profiles: owners A
and B, customers C and D, plus a separate development Super Admin session. Use
controlled test email inboxes. Create two websites with a unique test-run slug
prefix and visibly mark all products/addresses/orders as development fixtures.
Record exact website/user/product/order IDs privately with each test result.
Do not reuse production accounts, process payments, or call existing wallet or
settlement procedures. The preview must point exclusively at the verified staging
project before any test signup, upload or order.

| Scenario | Required observed result |
| --- | --- |
| Real signup, email verification and recovery | Owner/customer verification and password recovery complete through actual staging Auth email links. Unverified/expired sessions cannot submit applications, open private data or order. Redirects return to the same staging Preview origin. |
| Onboarding and approval | A submits `/commerce/apply`; only development Super Admin sees/reviews it. Approved application creates a setup website assigned to that verified applicant. A cannot assign an owner, activate a website or grant permissions. |
| Tenant reads | With A's real JWT, query B's products, categories, customers, orders, order items, website settings and memberships through actual PostgREST. No B-private records are returned. Public catalog fields are intentionally public and must not contain private configuration/customer data. Repeat B→A and with C/D customer histories. |
| Tenant mutations | With A's JWT, call owner actions using B's website ID and B product/category/order IDs; each is denied, with no B data/stock/configuration change. Browser-supplied owner/customer IDs do not establish authority. |
| Permission and revocation | Disable A's products/categories/inventory/orders/customers/branding permissions separately. Both direct REST/RPC and Preview API/UI access must honor the flags. Reassign the owner in Admin; the old owner loses access immediately, including a request waiting behind the reassignment lock. |
| Product/category management | Allowed owner creates/edits/archives own products/categories; editing a product does not reset stock. Other-tenant category/product IDs fail composite FK/authorization checks. Invalid prices/attributes/URLs and direct table writes are rejected. |
| Real Storage | Upload JPEG/PNG/WebP up to 5 MB into A's website UUID prefix; public bytes load on A's storefront. Invalid MIME/oversized uploads and B-prefix uploads fail. Owner UPDATE/DELETE fails even for A's objects because uploads are immutable. Broad pre-existing Storage policies cannot bypass commerce guards; existing unrelated-bucket workflows still work. |
| Cart and customer isolation | Desktop/mobile filters and product details work; carts persist within a website without leaking into the other website. Signing out/switching users clears private checkout fields/history and does not replace owner/restaurant sessions. |
| COD checkout and inventory | Prices/totals come from staging DB rows; pickup/delivery/minimum order rules apply. Last-unit concurrent orders cannot oversell. Invalid/cross-tenant lines, insufficient stock and disabled COD/website states leave orders/stock unchanged. Inventory-disabled stock-zero products remain orderable without stock consumption. |
| Retry and cancellation | Identical and lost-confirmation retries use one idempotency key and produce one order. Changed retries cannot create a duplicate and reconcile to the buyer's own history. Cancellation restores tracked inventory exactly once, including after inventory configuration changes. |
| Admin boundary | Missing/expired HMAC cookie fails; cross-origin mutations fail. Only development Super Admin configures features/permissions/owners, activates/suspends websites or opens an audited management view. Authenticated owner/customer JWTs cannot execute the administrative RPC. |
| Existing features | Use synthetic development fixtures to test restaurant/manager, `/delivery`, legacy store, resort, existing auth, wallet/order/return controls and scheduled-job definitions. Payment-provider integration stays sandbox-only; live wallet/payment/settlement operations remain out of scope. |

Run the same application at 1440×1000 desktop and 375×812 mobile, inspect screenshot
and keyboard/scroll behavior, and check no horizontal document overflow. Record
build/commit, Preview URL, project reference, fixture IDs, expected/actual results,
timestamps and failed requests in a secure staging report. Mask tokens and PII.
Archive/suspend synthetic websites when finished; retain test order/audit history
for review. Any fixture cleanup must be independently scoped to recorded IDs and
must not delete unrelated staging users/data.

If the network proxy blocks the Preview, this test matrix can be run by a reviewer
in a normal browser signed into the appropriate Vercel team, or by a trusted
staging-only CI runner with access to the Preview and staging services. Record the
same evidence. Local protocol-fixture tests cannot replace this hosted result.

Passing this future matrix and reviewing backup/recovery does not grant production
SQL, merge or live deployment permission. The user's separate explicit approval
is still required after reviewing the final results.
