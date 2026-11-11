
'use strict'

// Mobile-only Sales Reports installer.
// Run from your Next.js project root.

const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()

const inputPath = path.join(
  root,
  'dd-owner-sales-update',
  'OwnerMobileSalesReports.jsx.txt'
)

const componentRelative =
  'app/components/OwnerMobileSalesReports.jsx'

const parentCandidates = [
  'app/dashboard/[id]/page.jsx',
  'app/app/owner/[restaurantId]/page.jsx',
]

function fail(message) {
  throw new Error(`Owner Sales UI: ${message}`)
}

function read(file) {
  if (!fs.existsSync(file)) {
    fail(`Missing: ${file}`)
  }

  return fs.readFileSync(file, 'utf8')
}

function replaceOne(source, before, after, label) {
  if (source.includes(after)) {
    return source
  }

  const count = source.split(before).length - 1

  if (count !== 1) {
    fail(
      `${label}: expected one matching block, ` +
      `found ${count}. Nothing was changed.`
    )
  }

  return source.replace(before, after)
}

function patchParent(original, filename) {
  const newline = original.includes('\r\n')
    ? '\r\n'
    : '\n'

  let source = original.replace(/\r\n/g, '\n')

  const importLine =
    "import OwnerMobileSalesReports from '@/app/components/OwnerMobileSalesReports'"

  if (!source.includes(importLine)) {
    const anchor =
      "import OwnerPremiumMobileHub from '@/app/components/OwnerPremiumMobileHub'"

    source = replaceOne(
      source,
      anchor,
      `${anchor}\n${importLine}`,
      `${filename}: import`
    )
  }

  const advancedStart =
    `        {activeTab === 'settlements' && (\n` +
    `          hasAdvancedAnalytics ? (\n` +
    `          <div className="space-y-6">`

  const advancedReplacement =
    `        {activeTab === 'settlements' && (\n` +
    `          hasAdvancedAnalytics ? (\n` +
    `          <>\n` +
    `            {/* Compact mobile reports; existing desktop reports stay unchanged. */}\n` +
    `            <div className="lg:hidden">\n` +
    `              <OwnerMobileSalesReports\n` +
    `                timeframes={REPORT_TIMEFRAMES}\n` +
    `                timeframe={reportTimeframe}\n` +
    `                onTimeframeChange={handleReportTimeframeChange}\n` +
    `                ordersLoaded={ordersHaveLoaded}\n` +
    `                ordersError={ordersLoadError}\n` +
    `                ordersLastSynced={ordersLastSynced}\n` +
    `                loadedOrderCount={orders.length}\n` +
    `                allTimeOrderCount={allTimeValidOrders.length}\n` +
    `                allTimeRevenue={allTimeRevenue}\n` +
    `                periodOrderCount={reportOrderCount}\n` +
    `                periodRevenue={reportRevenue}\n` +
    `                averageOrderValue={reportAverageOrderValue}\n` +
    `                graphData={salesGraphData}\n` +
    `                hourlyReport={hourlyReport}\n` +
    `                peakHour={peakHour}\n` +
    `                formatCurrency={formatCurrency}\n` +
    `                onRefresh={() => setOrdersRefreshTick(value => value + 1)}\n` +
    `                onExport={handleGenerateAnalyticsReport}\n` +
    `                onPrint={() => window.print()}\n` +
    `              />\n` +
    `            </div>\n` +
    `            <div className="hidden lg:block space-y-6">`

  source = replaceOne(
    source,
    advancedStart,
    advancedReplacement,
    `${filename}: advanced report start`
  )

  const advancedEnd =
    `          </div>\n` +
    `          ) : (\n` +
    `            <div className="space-y-6">`

  const advancedEndReplacement =
    `            </div>\n` +
    `          </>\n` +
    `          ) : (\n` +
    `            <div className="space-y-6">`

  source = replaceOne(
    source,
    advancedEnd,
    advancedEndReplacement,
    `${filename}: advanced report end`
  )

  const required = [
    'hasAdvancedAnalytics ? (',
    'handleGenerateAnalyticsReport',
    'hourlyReport',
    'reportAverageOrderValue',
    'OwnerMobileWorkspaceLayer',
    'OwnerMobileSalesReports',
  ]

  for (const token of required) {
    if (!source.includes(token)) {
      fail(
        `${filename}: missing required hook: ${token}`
      )
    }
  }

  return newline === '\r\n'
    ? source.replace(/\n/g, '\r\n')
    : source
}

function main() {
  const component = read(inputPath)

  if (
    !component.includes("'use client'") ||
    !component.includes(
      'export default function OwnerMobileSalesReports'
    )
  ) {
    fail('Unexpected mobile reports component.')
  }

  const foundParents = parentCandidates.filter(
    relative =>
      fs.existsSync(path.join(root, relative))
  )

  if (!foundParents.length) {
    fail('Owner Dashboard was not found.')
  }

  const planned = [
    {
      destination: path.join(
        root,
        componentRelative
      ),
      content: component,
    },
  ]

  for (const relative of foundParents) {
    const destination = path.join(root, relative)

    planned.push({
      destination,
      content: patchParent(
        read(destination),
        relative
      ),
    })
  }

  const changed = planned.filter(
    item =>
      !fs.existsSync(item.destination) ||
      read(item.destination) !== item.content
  )

  if (!changed.length) {
    console.log('Sales Reports already updated.')
    return
  }

  const backupRoot = path.join(
    root,
    'dd-owner-sales-backups',
    new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
  )

  for (const item of changed) {
    if (!fs.existsSync(item.destination)) {
      continue
    }

    const relative = path.relative(
      root,
      item.destination
    )

    const backup = path.join(
      backupRoot,
      relative
    )

    fs.mkdirSync(path.dirname(backup), {
      recursive: true,
    })

    fs.copyFileSync(
      item.destination,
      backup
    )
  }

  for (const item of changed) {
    fs.mkdirSync(
      path.dirname(item.destination),
      { recursive: true }
    )

    fs.writeFileSync(
      item.destination,
      item.content,
      'utf8'
    )

    console.log(
      'Updated:',
      path.relative(
        root,
        item.destination
      )
    )
  }

  console.log(
    'Backups:',
    path.relative(root, backupRoot)
  )

  console.log('Next: npm run build')
}

try {
  main()
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
