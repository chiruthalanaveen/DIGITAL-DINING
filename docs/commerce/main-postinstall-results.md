# Main installation verified — 31 October 2026

Target: **table-pay** (`wispidcdmunqzahjacws`), PostgreSQL 17.6. Branch:
`feature/client-websites-phase1`, draft [PR #3](https://github.com/chiruthalanaveen/DIGITAL-DINING/pull/3).

**PASS: foundation installation and local checks. PARTIAL PASS: overall release
verification.** The user reported running the reviewed SQL in the main SQL Editor.
Independent read-only inspection now verifies the installed objects. The earlier
27 October API write rejection is historical; installation is no longer blocked.
**Do not run the one-time foundation again.**

No SQL migration required. This update verifies the existing installation and
updates instructions; it adds no schema change. The canonical source remains
[20261022160000_commerce_foundation.sql](../../supabase/migrations/20261022160000_commerce_foundation.sql),
SHA-256 `dd2882f6329808783b1d4d97c4264f59989b7e834753aa06efe46d63855db1ca`.
No new production DDL/DML, business fixtures, live payments, deployment or merge
was performed by this verification. The backup prerequisite remains waived.

## Actual results

| Check | Result and evidence boundary |
| --- | --- |
| Main identity | **PASS**, exact reference/name `table-pay`, PostgreSQL 17.6, official HTTPS catalog queries HTTP 201 with `read_only:true`. |
| Installed tables and columns | **PASS**, nine tables, 103 columns. Types, order, nullability, defaults, RLS flags and role grants exactly match a fresh isolated installation of the canonical file. |
| Functions | **PASS**, all twelve signatures, argument defaults, languages, volatility, security-definer flags, empty search paths and execute grants match. All bodies match canonical hashes after CRLF-to-LF normalization; raw body hashes differ only because of line endings. No production function was replaced to normalize formatting. |
| Policies, indexes, constraints | **PASS**, all fifteen policy expressions/roles/commands, 25 index definitions and 81 validated constraints exactly match the fresh canonical fixture. Constraints comprise nine PK, ten UNIQUE, sixteen FK and 46 CHECK. PG 18-only NOT NULL constraint catalog entries are excluded; column nullability is compared separately. |
| FK triggers | **PASS**, 54 internal triggers on commerce tables and ten new Auth-side triggers exactly match canonical FK relationships. Existing Auth triggers were checked independently without broad exclusions. |
| Media bucket | **PASS**, public `commerce-media`, 5 MiB limit, JPEG/PNG/WebP only. Private schema permissions also match. |
| Existing definitions and jobs | **PASS**, all pre-existing saved catalog records, four previous bucket configurations and both cron definitions are unchanged. Only expected additions were found. |
| Main read-only invariants | **PASS**, no active website without a verified owner, negative stock or invalid order totals. Commerce websites, applications, products and orders are currently empty; this does not exercise a populated checkout. |
| Main PostgREST exposure/grants | **PASS, 11/11**, anonymous public-catalog RPC returns HTTP 200/null for a nonexistent site; all nine anonymous raw-table reads with `limit=0` return HTTP 401 / `42501`; service-role table metadata read returns HTTP 200/empty array. No private rows or authenticated tenant sessions were used. |
| `npm test` | **PASS, 82/82**, zero failures/skips, fresh synthetic development configuration. |
| `npm run test:commerce:db` | **PASS, 88 PostgreSQL assertions**, fresh isolated loopback PG 18.4 fixture; actual RLS, checkout/concurrency, permissions and reapplication preservation. This is not main Supabase Auth integration. |
| `npm run build` | **PASS, exit 0**, fresh compilation, TypeScript and 73 static pages with synthetic development configuration. |
| Real hosted owner/customer Auth and tenant workflows | **NOT RUN** on main. No live test users/orders or impersonated production JWT sessions were created. Catalog/grant matching is not a real authenticated tenant-isolation test. |
| Browser/mobile and Vercel Preview | **NOT RERUN / NO PREVIEW CREATED** for this database-verification update. The unchanged application's prior 64 screenshots/32 desktop-mobile pairs remain historical evidence. No new Preview URL is claimed. |
| Full lint | **Historical FAIL**, 169 inherited errors/179 warnings with zero introduced errors in the recorded baseline comparison; not rerun for this instruction/report update. |

## Permissions and preservation

Anonymous users cannot directly SELECT any commerce table. Authenticated users
can SELECT eight RLS-protected tables, have no direct INSERT/UPDATE/DELETE grants,
and cannot directly read audit logs. The Admin RPC is service-role-only; owner,
application and checkout RPCs are authenticated-only. Catalog RPC is public.
The public catalog smoke request is a stable read; the Admin management-view RPC
was deliberately not invoked because it writes audit data.

The before snapshot is the 27 October post-rejection state; the current snapshot
is 31 October after the user's SQL Editor installation. Exact comparison retains
every existing record in these metadata categories:

| Category | Existing records unchanged | Expected additions |
| --- | ---: | ---: |
| Relations | 131 | 9 |
| Columns | 1,602 | 103 |
| Constraints | 644 | 81 |
| Public/Auth/Storage/cron function fingerprints | 498 | 5 public functions |
| Indexes | 419 | 25 |
| Policies | 49 | 15 |
| Triggers | 754 | 64 |
| Default ACLs | 15 | 0 |
| Event triggers | 6 | 0 |

Seven private commerce functions are verified separately because the old shared
catalog snapshot did not include `commerce_private`. Existing trigger comparison
excludes only the exact 64 canonical FK additions, including ten Auth-side
triggers. Four old bucket settings and two full cron definitions match privately;
their names/commands and full snapshots are not published.

This proves metadata preservation within the captured scope. It does **not** prove
every restaurant/delivery/resort/customer/order row, wallet balance or payment
transaction is unchanged: those values were not exported or compared. No such
rows were modified by this verification. The reviewed migration does not rewrite
existing business rows; Auth deletion restrictions and shared Storage policies
remain the material compatibility effects described in
[migration-review.md](migration-review.md).

## Commands and evidence

Fresh local commands ran under `developmentEnvironment()` from
[commerce-fixture.mjs](../../tests/helpers/commerce-fixture.mjs), excluding all
injected main/staging/provider credentials:

```sh
npm test
COMMERCE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55442/commerce_test npm run test:commerce:db
npm run build
```

They were invoked by `node --input-type=module -` / `spawnSync('npm', args,
{env: developmentEnvironment(...)})`; the database command added only the explicit
loopback fixture URL. Exact local PG initialization/start/stop arguments are in
`local-db-checks-summary.json`. The new isolated cluster was stopped after metadata
capture. No destructive fixture script was run on a hosted database.

Main requests used fixed HTTPS origins, certificate verification, refused
redirects and existing main credentials without printing their values:

```text
POST https://api.supabase.com/v1/projects/wispidcdmunqzahjacws/database/query
JSON: {"query":"<SELECT-only catalog/invariant query>","read_only":true}
POST https://wispidcdmunqzahjacws.supabase.co/rest/v1/rpc/commerce_public_catalog
JSON: {"p_slug":"commerce-install-verification-only"}
GET https://wispidcdmunqzahjacws.supabase.co/rest/v1/<each commerce table>?select=<identifier>&limit=0
```

Catalog queries ran through Python stdin and the captured `read-main-catalog.py`;
the full single-SELECT comparison query is saved as `commerce-metadata.sql`.
`compare-preservation-postinstall.py` compares saved local files only. Evidence is
under `/workspace/commerce-validation-artifacts/main-postinstall-20261031/`:
`main-schema-verification-summary.json`, `preservationpostinstall-summary.json`,
`main-invariants-summary.json`, `main-rest-readonly-summary.json`,
`local-checks-summary.json`, `local-db-checks-summary.json`, `npm-test.log`,
`commerce-db.log` and `build.log`. Public evidence excludes credentials, raw
catalog/function/cron records and business data.

## Remaining limits and next steps

- The read-only ledger check found no
  `supabase_migrations.schema_migrations` table. Manual SQL Editor installation
  is verified through the actual catalog; no CLI migration-history entry is
  claimed or written. Establish a reviewed baseline before future CLI migration
  automation. Do not use `supabase db push` to replay this already-installed file.
- Successful PIN recovery remains unavailable, and complete restaurant/delivery/
  resort/wallet/returns/payment provider sandbox integration is still unverified.
  Passing offline guard tests do not establish live provider compatibility.
- Real hosted two-owner RLS/session tests, email verification, complete owner/
  customer workflows and a Preview require a separately authorized test setup.
  Staging remains stopped by user choice; no production fixtures were substituted.
- Application changes remain on draft PR #3. The Vercel feature-branch deployment
  guard remains enabled. No production deployment, merge or live payment is
  authorized by the SQL installation confirmation.

No additional environment variables or DNS changes are needed to verify the
installation. The new bucket/policies are present. Industry custom domains and
templates remain outside Phase 1. Existing Auth redirect/email configuration still
requires review for the application origin before a hosted workflow release.

Do not reapply the foundation or drop objects to undo it. A later application
rollback should preserve commerce history and media. Future database changes
need a new versioned migration and their own review/approval; see
[main-project-installation.md](main-project-installation.md) and
[backup-recovery.md](backup-recovery.md) for retained recovery considerations.
