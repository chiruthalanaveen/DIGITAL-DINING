/**
 * DIGITAL DINE-IN — owner dashboard polling fix
 *
 * Destination in VS Code: tools/fix-owner-dashboard-polling.cjs
 * Run at project root: node tools/fix-owner-dashboard-polling.cjs
 *
 * Affects:
 *   app/dashboard/[id]/page.jsx
 *   app/components/OwnerDeliveryManagement.jsx
 *
 * Changes:
 * - Dashboard metadata: every 2s -> every 60s, pause while tab hidden.
 * - Owner Delivery Management orders/proofs: every 1s -> every 15s.
 *   Existing Supabase Realtime order subscription remains active.
 * - Restaurant order history: preserves 5s active-tab refresh/alarm,
 *   but pauses requests in hidden tabs and catches up on return.
 *
 * Does not change database/RLS, platform wallet rules, saving,
 * order-status transitions, admin approval or checkout logic.
 */
'use strict'
const fs = require('node:fs')
const path = require('node:path')

const dashboardPath = path.join(process.cwd(), 'app', 'dashboard', '[id]', 'page.jsx')
const deliveryPath = path.join(process.cwd(), 'app', 'components', 'OwnerDeliveryManagement.jsx')

function replaceExactlyOnce(source, pattern, installedMarker, buildReplacement, label) {
  if (source.includes(installedMarker)) return { source, changed: false }
  const matches = [...source.matchAll(pattern)]
  if (matches.length !== 1) {
    throw new Error(`${label}: expected one matching block, found ${matches.length}. Nothing was written. Check your local file version.`)
  }
  return {
    source: source.replace(pattern, (...args) => buildReplacement(args[0], args[1])),
    changed: true,
  }
}

function indent(block, prefix) {
  return block.split('\n').map(line => line ? prefix + line : '').join('\n')
}

function stageDashboard(source) {
  let changed = false
  const metadataPattern = /^([ \t]*)fetchDashboard\(\)\n(?:[ \t]*\n)*[ \t]*const interval = setInterval\(fetchDashboard, 2000\)\n(?:[ \t]*\n)*[ \t]*return \(\) => clearInterval\(interval\)/gm
  const metadataReplacement = `// Refresh large owner metadata only once a minute. Never overlap requests,
// and don't waste database work in a background tab. Recheck when returning.
let dashboardActive = true
let dashboardRefreshBusy = false
const refreshDashboardSafely = async () => {
  if (!dashboardActive || document.hidden || dashboardRefreshBusy) return
  dashboardRefreshBusy = true
  try {
    await fetchDashboard()
  } catch (refreshError) {
    console.error('[OWNER DASHBOARD REFRESH]', refreshError)
  } finally {
    dashboardRefreshBusy = false
  }
}
void refreshDashboardSafely()
const interval = window.setInterval(() => void refreshDashboardSafely(), 60000)
const refreshWhenVisible = () => {
  if (!document.hidden) void refreshDashboardSafely()
}
document.addEventListener('visibilitychange', refreshWhenVisible)
return () => {
  dashboardActive = false
  window.clearInterval(interval)
  document.removeEventListener('visibilitychange', refreshWhenVisible)
}`
  let result = replaceExactlyOnce(
    source, metadataPattern, 'const refreshDashboardSafely = async () => {',
    (_found, prefix) => indent(metadataReplacement, prefix),
    'Owner dashboard metadata 2-second polling'
  )
  source = result.source
  changed ||= result.changed

  // Preserve the near-realtime restaurant order/alarm interval at five seconds.
  // Its large, paginated queries should not run in background tabs.
  const orderGuardPattern = /^([ \t]*)if \(busy \|\| cancelled\) return\n([ \t]*)busy = true/gm
  result = replaceExactlyOnce(
    source, orderGuardPattern, 'if (busy || cancelled || document.hidden) return',
    (_found, prefix, _ignored) => `${prefix}if (busy || cancelled || document.hidden) return\n${prefix}busy = true`,
    'Restaurant order background-tab guard'
  )
  source = result.source
  changed ||= result.changed

  const orderCleanupPattern = /^([ \t]*)const interval = window\.setInterval\(refreshOrders, 5000\)\n[ \t]*return \(\) => \{\n[ \t]*cancelled = true\n[ \t]*window\.clearInterval\(interval\)\n[ \t]*\}/gm
  const orderCleanupReplacement = `const interval = window.setInterval(refreshOrders, 5000)
const refreshOrdersWhenVisible = () => {
  if (!document.hidden) void refreshOrders()
}
document.addEventListener('visibilitychange', refreshOrdersWhenVisible)
return () => {
  cancelled = true
  window.clearInterval(interval)
  document.removeEventListener('visibilitychange', refreshOrdersWhenVisible)
}`
  result = replaceExactlyOnce(
    source, orderCleanupPattern, "document.addEventListener('visibilitychange', refreshOrdersWhenVisible)",
    (_found, prefix) => indent(orderCleanupReplacement, prefix),
    'Restaurant orders resume-on-visible'
  )
  source = result.source
  changed ||= result.changed
  return { source, changed }
}

function stageOwnerDelivery(source) {
  const oldHook = /^([ \t]*)useLiveDeliveryRefresh\(\n[ \t]*\(\) => refreshOrdersOnly\(true\),\n[ \t]*Boolean\(restaurantId\),\n[ \t]*1000\n[ \t]*\)/gm
  const newHook = `// Realtime subscription above handles changes immediately.
// The 15-second fallback catches missed events; the shared hook pauses
// its polling while this tab is hidden.
useLiveDeliveryRefresh(
  () => refreshOrdersOnly(true),
  Boolean(restaurantId),
  60000
)`
  return replaceExactlyOnce(
    source, oldHook, 'The 15-second fallback catches missed events',
    (_found, prefix) => indent(newHook, prefix),
    'Owner Delivery Management 1-second polling'
  )
}

function main() {
  const rawDashboard = fs.readFileSync(dashboardPath, 'utf8')
  const rawDelivery = fs.readFileSync(deliveryPath, 'utf8')
  const sourceDashboard = rawDashboard.replace(/\r\n/g, '\n')
  const sourceDelivery = rawDelivery.replace(/\r\n/g, '\n')
  // IMPORTANT: stage and validate both transformations before writing either.
  const nextDashboard = stageDashboard(sourceDashboard)
  const nextDelivery = stageOwnerDelivery(sourceDelivery)
  const changes = [
    { path: dashboardPath, before: rawDashboard, next: nextDashboard },
    { path: deliveryPath, before: rawDelivery, next: nextDelivery },
  ]
  let count = 0
  for (const file of changes) {
    if (!file.next.changed) {
      console.log(`Already patched: ${path.relative(process.cwd(), file.path)}`)
      continue
    }
    const backup = `${file.path}.before-owner-polling-fix.bak`
    if (!fs.existsSync(backup)) fs.writeFileSync(backup, file.before, 'utf8')
    const originalNewline = file.before.includes('\r\n') ? '\r\n' : '\n'
    fs.writeFileSync(file.path, file.next.source.replace(/\n/g, originalNewline), 'utf8')
    console.log(`Patched: ${path.relative(process.cwd(), file.path)} (backup: ${path.basename(backup)})`)
    count++
  }
  console.log(count ? 'Owner refresh fix applied. Run npm run build.' : 'No changes needed; fix is already installed.')
}

try { main() } catch (error) { console.error('Owner polling patch stopped:', error.message); process.exitCode = 1 }
