'use strict'

// Digital Dine-In: mobile-only Tables & QR redesign.
// Run from the Next.js project root:
//   node tools/install-mobile-tables-qr.cjs
// Requires: dd-owner-tables-update/OwnerMobileTablesQR.jsx.txt
// Existing desktop Tables, signed QR page, data access, RLS and plan guards
// are deliberately left untouched.

const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const sourceFile = path.join(root, 'dd-owner-tables-update', 'OwnerMobileTablesQR.jsx.txt')
const componentRelative = 'app/components/OwnerMobileTablesQR.jsx'
const dashboardCandidates = [
  'app/dashboard/[id]/page.jsx',
  'app/app/owner/[restaurantId]/page.jsx',
]

function fail(message) {
  throw new Error(`DD Tables & QR: ${message}`)
}

function read(file) {
  if (!fs.existsSync(file)) fail(`Missing ${path.relative(root, file)}`)
  return fs.readFileSync(file, 'utf8')
}

function replaceExactlyOnce(source, before, after, label) {
  const count = source.split(before).length - 1
  if (count !== 1) fail(`${label}: expected one anchor, found ${count}; no files changed`)
  return source.replace(before, after)
}

function patchDashboard(original, relative) {
  const newline = original.includes('\r\n') ? '\r\n' : '\n'
  let code = original.replace(/\r\n/g, '\n')
  const importLine = "import OwnerMobileTablesQR from '@/app/components/OwnerMobileTablesQR'"

  // An existing patch is safe to rerun; never duplicate the mobile section.
  if (code.includes('<OwnerMobileTablesQR')) {
    if (!code.includes(importLine)) fail(`${relative}: component is mounted but import is missing`)
    return original
  }

  const required = [
    'OwnerMobileWorkspaceLayer',
    'configuredTableNumbers',
    'occupiedTableNumbers',
    'activeTableOrders',
    'ordersHaveLoaded',
    'ordersLoadError',
    'restaurantModuleEnabled',
    'router.push(`/dashboard/${restaurantId}/qr`)',
  ]
  for (const token of required) {
    if (!code.includes(token)) fail(`${relative}: required existing feature missing: ${token}`)
  }

  if (!code.includes(importLine)) {
    const anchors = [
      "import OwnerMobileSalesReports from '@/app/components/OwnerMobileSalesReports'",
      "import OwnerPremiumMobileHub from '@/app/components/OwnerPremiumMobileHub'",
    ]
    const anchor = anchors.find(value => code.includes(value))
    if (!anchor) fail(`${relative}: expected owner mobile import not found`)
    code = replaceExactlyOnce(code, anchor, `${anchor}\n${importLine}`, 'component import')
  }

  const beforeOpen = `        {activeTab === 'tables' && (\n          <div className="space-y-6">`
  const afterOpen = `        {activeTab === 'tables' && (\n          <>\n            {/* Mobile-only Tables & QR screen; original desktop block below is preserved. */}\n            <div className="lg:hidden">\n              <OwnerMobileTablesQR\n                restaurantName={restaurant.name}\n                tableNumbers={configuredTableNumbers}\n                occupiedTableNumbers={occupiedTableNumbers}\n                activeOrders={activeTableOrders}\n                ordersLoaded={ordersHaveLoaded}\n                ordersError={ordersLoadError}\n                onManageQR={() => router.push(\`/dashboard/\${restaurantId}/qr\`)}\n              />\n            </div>\n            <div className="hidden lg:block space-y-6">`

  const beforeClose = `          </div>\n        )}\n\n        {/* TAB 2: MENU CATALOG */}`
  const afterClose = `            </div>\n          </>\n        )}\n\n        {/* TAB 2: MENU CATALOG */}`

  // Both anchors must match before either is changed.
  if (code.split(beforeOpen).length - 1 !== 1 || code.split(beforeClose).length - 1 !== 1) {
    fail(`${relative}: existing Tables & QR JSX differs from the expected version; no files changed`)
  }
  code = replaceExactlyOnce(code, beforeOpen, afterOpen, 'Tables & QR opening')
  code = replaceExactlyOnce(code, beforeClose, afterClose, 'Tables & QR closing')

  return newline === '\r\n' ? code.replace(/\n/g, '\r\n') : code
}

function main() {
  const component = read(sourceFile)
  if (!component.includes("'use client'") ||
      !component.includes('export default function OwnerMobileTablesQR') ||
      !component.includes('onManageQR') ||
      !component.includes('occupiedTableNumbers')) {
    fail('Unexpected mobile Tables & QR component; no files changed')
  }

  const dashboards = dashboardCandidates.filter(relative => fs.existsSync(path.join(root, relative)))
  if (!dashboards.length) fail('Owner Dashboard not found; no files changed')

  const changes = [{ destination: path.join(root, componentRelative), content: component }]
  for (const relative of dashboards) {
    const destination = path.join(root, relative)
    changes.push({ destination, content: patchDashboard(read(destination), relative) })
  }

  const changed = changes.filter(item => !fs.existsSync(item.destination) || read(item.destination) !== item.content)
  if (!changed.length) {
    console.log('Tables & QR mobile UI is already up to date.')
    return
  }

  const backupRoot = path.join(root, 'dd-owner-tables-backups', new Date().toISOString().replace(/[:.]/g, '-'))
  // Preflight is complete. Back up every existing target before writing anything.
  for (const item of changed) {
    if (!fs.existsSync(item.destination)) continue
    const relative = path.relative(root, item.destination)
    const backup = path.join(backupRoot, relative)
    fs.mkdirSync(path.dirname(backup), { recursive: true })
    fs.copyFileSync(item.destination, backup)
  }
  for (const item of changed) {
    fs.mkdirSync(path.dirname(item.destination), { recursive: true })
    fs.writeFileSync(item.destination, item.content, 'utf8')
    console.log('Updated:', path.relative(root, item.destination))
  }
  console.log('Backups:', path.relative(root, backupRoot))
  console.log('Next: npm run build')
}

try {
  main()
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}