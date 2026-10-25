<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Digital Dine-In update requirements

For every update:

1. Assess whether Supabase database changes are necessary. When none are needed,
   explicitly state **"No SQL migration required."** in the completion report.
2. When database changes are required, create a versioned SQL migration in
   `supabase/migrations/`, using a unique timestamp and descriptive name such as
   `YYYYMMDDHHMMSS_description.sql`. Do not rely on undocumented manual SQL changes.
3. Preserve existing data, RLS policies, wallet balances, payment transactions,
   order histories, and cron jobs. Review migration effects on all of these before
   running it; use changes that preserve existing application functionality.
4. Test required migrations against a verified development database using
   development credentials. Report the actual results. Mocked storage tests do
   not establish migration compatibility with Supabase. If a development database
   is unavailable, report that validation is blocked instead of claiming success.
5. Never execute a migration on production without the user's explicit approval
   for that migration and target. Do not treat development approval as production
   approval.
6. For database changes, include the migration file path, rollback considerations,
   read-only verification queries, and exact installation/application steps with
   the target environment identified. Explain any rollback that cannot safely
   preserve data rather than supplying a destructive shortcut.
7. Run `npm run build` for every update and report its result. Run relevant tests
   using development credentials and isolated fixtures where appropriate. Do not
   process live payments or modify production data while validating changes.

Keep these requirements outside the generated Next.js instruction block above.

## Client Websites main-project scope and release hold

On 26 October 2026 the user withdrew staging and selected the existing main
Supabase project `wispidcdmunqzahjacws` used by the `table-pay` application. In
direct response to the explicit migration-approval question, the user replied
"continue". The reviewed `20261022160000_commerce_foundation.sql` is authorized
for that exact main project only after backup and compatibility checks succeed.
Do not ask for the same approval again. This does not authorize other migrations,
a main-branch merge, production deployment/promotion or live payments.

No production SQL has been executed by this work. Main API metadata is reachable;
main SQL credentials, a verified SQL route and a usable backup are unavailable.
`COMMERCE_MAIN_DATABASE_URL` is a new name-only environment requirement awaiting
secure entry/publication. Do not put main credentials in `COMMERCE_STAGING_*`,
bypass the staging runner's production rejection, or run destructive local test
fixtures on any hosted database. Do not create live test orders/users or alter
wallet/payment/customer data as a substitute for compatibility verification.

Stop staging work and retain its historical evidence/private fixtures without
mutating them. Local development checks may use only their isolated fixtures.
Follow `docs/commerce/main-project-installation.md` for the pending main-only
backup, read-only inventory, exact migration and recovery steps. Retain the
Vercel branch deployment guard and PR #3 draft status. Existing financial data,
RLS, histories and cron jobs must be preserved.
