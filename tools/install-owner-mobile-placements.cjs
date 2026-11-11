
'use strict'

// DD_OWNER_MOBILE_PLACEMENTS_20261111
// Run from the Next.js project root:
//   node tools/install-owner-mobile-placements.cjs
// The script backs up files, preserves the existing parent page and patches
// only the OwnerPremiumMobileHub props. It does not touch APIs, SQL or RLS.

const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const inputDir = path.join(root, 'dd-owner-mobile-update')
const parentPaths = [
  'app/dashboard/[id]/page.jsx',
  'app/app/owner/[restaurantId]/page.jsx',
]
const hubPath = 'app/components/OwnerPremiumMobileHub.jsx'
const billingPath = 'app/components/OwnerMobileBillingOrders.jsx'
const sources = [
  ['OwnerPremiumMobileHub.jsx.txt', hubPath],
  ['OwnerMobileBillingOrders.jsx.txt', billingPath],
]

function readFile(file) {
  return fs.readFileSync(file, 'utf8')
}
function fail(message) {
  throw new Error(`Owner mobile installer: ${message}`)
}
function requireFile(file) {
  if (!fs.existsSync(file)) fail(`Missing ${file}`)
  return readFile(file)
}

function patchOwnerPage(original, name) {
  const anchor = '<OwnerPremiumMobileHub'
  const start = original.indexOf(anchor)
  if (start < 0 || original.indexOf(anchor, start + anchor.length) >= 0) {
    fail(`${name}: expected exactly one <OwnerPremiumMobileHub`)
  }
  const end = original.indexOf('/>', start)
  if (end < 0) fail(`${name}: mobile hub opening tag has no closing />`)
  let tag = original.slice(start, end + 2)

  const required = [
    ['restaurantId', 'restaurantId'],
    ['onGenerateBill', 'handlePrintBill'],
    ['onRefresh', 'setOrdersRefreshTick'],
    ['onLogout', 'handleLogout'],
  ]
  for (const [prop, identifier] of required) {
    if (!original.includes(identifier)) {
      fail(`${name}: ${identifier} was not found. Parent may have changed; update manually.`)
    }
    if (new RegExp(`\\b${prop}\\s*=`).test(tag)) continue
    const value = prop === 'onRefresh'
      ? '{() => setOrdersRefreshTick(value => value + 1)}'
      : `{${identifier}}`
    tag = tag.replace(/\s*\/>$/, `\n          ${prop}=${value}\n        />`)
  }
  return original.slice(0, start) + tag + original.slice(end + 2)
}

function main() {
  const planned = []
  for (const [sourceName, destName] of sources) {
    const sourcePath = path.join(inputDir, sourceName)
    const content = requireFile(sourcePath)
    if (!content.includes("'use client'")) fail(`${sourceName} is not the expected client component`)
    const destination = path.join(root, destName)
    // Preserve an existing billing component. The update is navigation-only.
    if (destName === billingPath && fs.existsSync(destination)) {
      if (!readFile(destination).includes('export default function OwnerMobileBillingOrders')) {
        fail(`${billingPath} exists but is not the expected component`)
      }
      continue
    }
    planned.push({ destination, content })
  }

  const existingParents = parentPaths.filter(relative => fs.existsSync(path.join(root, relative)))
  if (!existingParents.length) {
    fail(`No owner dashboard found. Expected one of: ${parentPaths.join(', ')}`)
  }
  for (const relative of existingParents) {
    const destination = path.join(root, relative)
    const content = patchOwnerPage(readFile(destination), relative)
    planned.push({ destination, content })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupRoot = path.join(root, 'dd-owner-mobile-backups', timestamp)
  for (const item of planned) {
    if (!fs.existsSync(item.destination)) continue
    const relative = path.relative(root, item.destination)
    const backupPath = path.join(backupRoot, relative)
    fs.mkdirSync(path.dirname(backupPath), { recursive: true })
    fs.copyFileSync(item.destination, backupPath)
  }
  for (const item of planned) {
    fs.mkdirSync(path.dirname(item.destination), { recursive: true })
    fs.writeFileSync(item.destination, item.content, 'utf8')
    console.log(`Updated: ${path.relative(root, item.destination)}`)
  }
  console.log(`Backups: ${path.relative(root, backupRoot)}`)
  console.log('Next: npm run build')
}

try {
  main()
} catch (error) {
  console.error(error?.message || error)
  process.exitCode = 1
}
