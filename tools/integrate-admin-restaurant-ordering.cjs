#!/usr/bin/env node
'use strict'
/**
 * Digital Dine-In: embed existing Restaurant Ordering Controls in Admin Dashboard.
 * Safe local patch: validates every anchor BEFORE writing; backs up originals.
 * Run from the project root: node tools/integrate-admin-restaurant-ordering.cjs
 * Does not change APIs, Supabase, payments, tenant rules, or /dd-delivery.
 */
const fs = require('node:fs')
const path = require('node:path')
const root = process.cwd()
const dashboardPath = 'app/admin/dashboard/page.jsx'
const pagePath = 'app/admin/restaurant-ordering/page.jsx'
const componentPath = 'app/components/AdminRestaurantOrderingControls.jsx'
const backupRoot = 'dd-admin-ordering-backups'
const exportRoot = 'dd-admin-ordering-full-code-txt'

function fail(message) { throw new Error(`[Admin Ordering Integration] ${message}`) }
function read(relative) {
  const absolute = path.join(root, relative)
  if (!fs.existsSync(absolute)) fail(`Missing file: ${relative}`)
  return fs.readFileSync(absolute, 'utf8')
}
function replaceExactlyOnce(source, oldText, newText, label) {
  const count = source.split(oldText).length - 1
  if (count !== 1) fail(`${label}: expected 1 exact anchor, found ${count}. No files changed. Upload your current dashboard/page.jsx for a tailored patch.`)
  return source.replace(oldText, newText)
}
function ensureNoPriorIntegration(dashboard, page) {
  if (dashboard.includes("['restaurant-ordering', 'Restaurant Ordering']") ||
      page.includes("redirect('/admin/dashboard?section=restaurant-ordering')")) {
    fail('This update appears to be installed already. No files changed.')
  }
  if (fs.existsSync(path.join(root, componentPath))) {
    fail(`${componentPath} already exists. No files changed to avoid overwriting your work.`)
  }
}

function updateDashboard(source) {
  let output = source
  output = replaceExactlyOnce(output,
    "import AdminErrorHistory from '@/app/components/AdminErrorHistory'",
    "import AdminErrorHistory from '@/app/components/AdminErrorHistory'\nimport AdminRestaurantOrderingControls from '@/app/components/AdminRestaurantOrderingControls'",
    'dashboard import')
  output = replaceExactlyOnce(output,
    "  ['delivery-orders', 'Delivery Orders'],",
    "  ['delivery-orders', 'Delivery Orders'],\n  ['restaurant-ordering', 'Restaurant Ordering'],",
    'navigation item')
  output = replaceExactlyOnce(output,
    "items: ['operations', 'delivery-orders', 'payments', 'inventory']",
    "items: ['operations', 'delivery-orders', 'restaurant-ordering', 'payments', 'inventory']",
    'Commerce navigation group')
  output = replaceExactlyOnce(output,
    "'delivery-orders': 'package',",
    "'delivery-orders': 'package', 'restaurant-ordering': 'settings',",
    'navigation icon')
  output = replaceExactlyOnce(output,
    "  'delivery-orders': 'Delivery order history and reports',",
    "  'delivery-orders': 'Delivery order history and reports',\n  'restaurant-ordering': 'Configure dine-in GPS, signed table QR, takeaway and combined ordering',",
    'navigation description')
  output = replaceExactlyOnce(output,
    "          {section === 'delivery-orders' && (\n            <DeliveryOrdersReport />\n          )}",
    "          {section === 'delivery-orders' && (\n            <DeliveryOrdersReport />\n          )}\n\n          {section === 'restaurant-ordering' && (\n            <AdminRestaurantOrderingControls />\n          )}",
    'dashboard content section')
  const navigationMarker = `  // Only the interface changes here; selecting a section never mutates tenant data.\n  const switchSection = (key) => {`
  output = replaceExactlyOnce(output, navigationMarker,
    `  // A legacy /admin/restaurant-ordering link redirects here; select its dashboard tab.\n  useEffect(() => {\n    const requested = new URLSearchParams(window.location.search).get('section')\n    if (requested && NAV.some(([key]) => key === requested)) setSection(requested)\n  }, [])\n\n${navigationMarker}`,
    'deep link handling')
  output = replaceExactlyOnce(output,
    `    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })`,
    `    if (typeof window !== 'undefined') {\n      const url = new URL(window.location.href)\n      if (key === 'overview') url.searchParams.delete('section')\n      else url.searchParams.set('section', key)\n      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)\n      window.scrollTo({ top: 0, behavior: 'smooth' })\n    }`,
    'section URL synchronization')
  return output
}

function extractControls(source) {
  if (!source.includes("'use client'") || !source.includes('export default function RestaurantOrderingAdminPage()')) {
    fail('Restaurant Ordering page does not match expected client component. No files changed.')
  }
  let output = replaceExactlyOnce(source,
    'return <main className="min-h-dvh bg-slate-50 p-4 text-slate-900">',
    'return <div className="min-w-0 rounded-2xl bg-slate-50 p-4 text-slate-900 sm:p-6">',
    'embedded ordering controls wrapper')
  output = replaceExactlyOnce(output,
    '<div className="mx-auto max-w-xl space-y-5">',
    '<div className="mx-auto max-w-3xl space-y-5">',
    'embedded controls content width')
  output = replaceExactlyOnce(output,
    '</div></main>',
    '</div></div>',
    'embedded controls closing tag')
  return output
}

const redirectPage = `import { redirect } from 'next/navigation'\n\n// Old bookmarks remain valid. Ordering settings now live inside Admin Dashboard.\nexport default function RestaurantOrderingLegacyRedirect() {\n  redirect('/admin/dashboard?section=restaurant-ordering')\n}\n`

function write(relative, content) {
  const absolute = path.join(root, relative)
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  fs.writeFileSync(absolute, content, 'utf8')
}
function run() {
  const dashboard = read(dashboardPath)
  const page = read(pagePath)
  ensureNoPriorIntegration(dashboard, page)
  // Validate and generate every new file in memory before any disk changes.
  const newDashboard = updateDashboard(dashboard)
  const newControls = extractControls(page)
  const originals = [[dashboardPath, dashboard], [pagePath, page]]
  for (const [relative, content] of originals) write(path.join(backupRoot, relative), content)
  write(componentPath, newControls)
  write(pagePath, redirectPage)
  write(dashboardPath, newDashboard)
  for (const [relative, content] of [
    [dashboardPath, newDashboard], [pagePath, redirectPage], [componentPath, newControls]
  ]) write(path.join(exportRoot, relative + '.txt'), content)
  console.log('PASS: Restaurant Ordering is now a tab in Admin Dashboard → Commerce.')
  console.log('PASS: Old /admin/restaurant-ordering URL redirects into the dashboard tab.')
  console.log('PASS: Existing ordering API and Supabase policies unchanged.')
  console.log(`Backups: ${backupRoot}/`)
  console.log(`Complete updated JSX TXT files: ${exportRoot}/`)
  console.log('Next: npm run build')
}
try { run() } catch (error) { console.error(error.message); process.exitCode = 1 }
