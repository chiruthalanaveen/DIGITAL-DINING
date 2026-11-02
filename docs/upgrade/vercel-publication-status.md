# Vercel publication status — 2 November 2026

**Published to Production**, following the user's explicit instruction after
reviewing the test report. Live site: https://www.digitaldine-in.online/.

- Deployed source: `84188e385d0286fc7d40cec03a179a68a905a167` from draft PR #6.
- Deployment: `dpl_GfDtcTFMBixnAKawp8XiGuBnANro`, target Production, READY.
- Remote `npm run build`: PASS.
- All six existing live aliases point to the new deployment; existing redirects,
  protection and cron settings were preserved.
- Primary HTTP checks: 12/12 PASS. Live home/admin browser checks: 4/4 PASS at
  mobile/desktop widths. Normal public pages return 200; maintenance was not toggled.
- Paid subscription checkout remains disabled by explicit deployment build/runtime
  overrides and the source's fail-closed default. Project secrets were not changed.

**No SQL migration required.** No production SQL, live payment, fixture, PR/main
merge or automatic Git deployment guard change occurred. The pending ledger
migration remains unapplied to hosted databases. Later record-only commits do
not change the exact deployed application source.

The earlier Preview/default and pending-production holds have been satisfied
for this approved publication only. Future source releases and SQL/merge/payment
changes require their own applicable authorization. No Preview was created and
Production settings were never copied into Preview.

Hosted Auth/RLS and real-provider/device behavior remain unverified. The cloud
proxy blocks direct secondary `.store` and unique-deployment requests, although
Vercel alias mappings are verified. Primary browser access succeeded through
that existing proxy without TLS/protection changes.

See [the complete release record](production-release-20261102.md) for exact
commands, evidence, limitations and the preserved rollback target. The
[lint cleanup report](lint-cleanup-report.md) retains pre-release validation.
