#!/usr/bin/env node
'use strict'
/*
 * Digital Dine-In: add per-tenant ordering configuration to the existing
 * Admin Dashboard. Supports both the uploaded Admin UI and the earlier
 * sidebar integration. No SQL or payment/backend changes.
 *
 * Run in project root: node tools/install-tenant-ordering.cjs
 * The script preflights every change, backs up originals and exports complete
 * JS/JSX files as TXT. Unknown edits are never overwritten silently.
 */
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const root = process.cwd()
const dashboardFile = 'app/admin/dashboard/page.jsx'
const controlsFile = 'app/components/AdminRestaurantOrderingControls.jsx'
const redirectFile = 'app/admin/restaurant-ordering/page.jsx'
const backupRoot = 'dd-tenant-ordering-backups'
const txtRoot = 'dd-tenant-ordering-full-code-txt'
const PREVIOUS_CONTROLS_HASH = '563ea462cfc88bc99ae0a3a75b9ba2d3e79cfb7f3d8b8f661a3dd3d43c4999a4'
const EXPECTED_CONTROLS_HASH = '91a591280ad408f455f2bdfa8fa94fe3da167980d408c65786ea57948e68e9d9'
const EXPECTED_REDIRECT_HASH = '7a1c5ebc38bcc40870fb6fe3fd412f2c05635467c820637870e5f98875cca467'
// Supports both the corrected flat ZIP and the older ZIP with an extra folder.
// Verify hashes so that an unrelated TXT_CODE folder cannot silently install
// outdated or mismatched JSX into the application.
const assetCandidates = [
  path.resolve(__dirname, '..'),
  path.join(root, 'DD_Admin_Tenant_Ordering_20261108'),
  path.join(root, 'DD_Tenant_Ordering_Fixed_20261108'),
  path.join(root, 'DigitalDine_Admin_Tenant_Restaurant_Ordering_20261108'),
]
function assetMatches(base, file, expectedHash) {
  const filename = path.join(base, 'TXT_CODE', file + '.txt')
  return fs.existsSync(filename) &&
    crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex') === expectedHash
}
const packageRoot = assetCandidates.find(base =>
  assetMatches(base, controlsFile, EXPECTED_CONTROLS_HASH) &&
  assetMatches(base, redirectFile, EXPECTED_REDIRECT_HASH))
const NEW_CONTROLS = packageRoot
  ? fs.readFileSync(path.join(packageRoot, 'TXT_CODE', controlsFile + '.txt'), 'utf8')
  : null
const NEW_REDIRECT = packageRoot
  ? fs.readFileSync(path.join(packageRoot, 'TXT_CODE', redirectFile + '.txt'), 'utf8')
  : null

function error(message) { throw new Error('[Tenant Ordering] ' + message) }
function read(relative) {
  const p = path.join(root, relative)
  if (!fs.existsSync(p)) error('Missing file: ' + relative)
  return fs.readFileSync(p, 'utf8')
}
function replaceOnce(text, oldText, newText, label) {
  const n = text.split(oldText).length - 1
  if (n !== 1) error(`${label}: expected one exact anchor, found ${n}. No files changed. Use the full TXT file or share the local code for a tailored patch.`)
  return text.replace(oldText, newText)
}
function insertIfMissing(text, marker, anchor, newText, label) {
  return text.includes(marker) ? text : replaceOnce(text, anchor, newText, label)
}
function hash(text) { return crypto.createHash('sha256').update(text).digest('hex') }
function write(relative, value) {
  const p = path.join(root, relative)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, value, 'utf8')
}

function patchDashboard(original) {
  const crlf = original.includes('\r\n')
  let output = original.replace(/\r\n/g, '\n')
  output = insertIfMissing(output,
    "import AdminRestaurantOrderingControls from '@/app/components/AdminRestaurantOrderingControls'",
    "import AdminErrorHistory from '@/app/components/AdminErrorHistory'",
    "import AdminErrorHistory from '@/app/components/AdminErrorHistory'\nimport AdminRestaurantOrderingControls from '@/app/components/AdminRestaurantOrderingControls'",
    'ordering component import')
  output = insertIfMissing(output,
    "['restaurant-ordering', 'Restaurant Ordering']",
    "  ['delivery-orders', 'Delivery Orders'],",
    "  ['delivery-orders', 'Delivery Orders'],\n  ['restaurant-ordering', 'Restaurant Ordering'],",
    'sidebar navigation')
  output = insertIfMissing(output,
    "items: ['operations', 'delivery-orders', 'restaurant-ordering', 'payments', 'inventory']",
    "items: ['operations', 'delivery-orders', 'payments', 'inventory']",
    "items: ['operations', 'delivery-orders', 'restaurant-ordering', 'payments', 'inventory']",
    'Commerce navigation group')
  output = insertIfMissing(output,
    "'restaurant-ordering': 'settings'",
    "'delivery-orders': 'package',",
    "'delivery-orders': 'package', 'restaurant-ordering': 'settings',",
    'sidebar icon')
  // Older sidebar patch may already have this key with another description.
  if (output.includes("'restaurant-ordering': 'Configure dine-in GPS, signed table QR, takeaway and combined ordering',")) {
    output = output.replace(
      "'restaurant-ordering': 'Configure dine-in GPS, signed table QR, takeaway and combined ordering',",
      "'restaurant-ordering': 'Configure per-tenant dine-in GPS, table QR and combined delivery',")
  } else {
    output = insertIfMissing(output,
      "'restaurant-ordering': 'Configure per-tenant dine-in GPS, table QR and combined delivery',",
      "  'delivery-orders': 'Delivery order history and reports',",
      "  'delivery-orders': 'Delivery order history and reports',\n  'restaurant-ordering': 'Configure per-tenant dine-in GPS, table QR and combined delivery',",
      'navigation description')
  }
  output = insertIfMissing(output,
    "{section === 'restaurant-ordering' && (",
    "          {section === 'delivery-orders' && (\n            <DeliveryOrdersReport />\n          )}",
    "          {section === 'delivery-orders' && (\n            <DeliveryOrdersReport />\n          )}\n\n          {section === 'restaurant-ordering' && (\n            <AdminRestaurantOrderingControls tenants={data?.tenants || []} />\n          )}",
    'dashboard ordering section')
  // If the old sidebar integration is present, replace only the component
  // invocation, not its surrounding sections.
  output = output.replace(
    '<AdminRestaurantOrderingControls />',
    '<AdminRestaurantOrderingControls tenants={data?.tenants || []} />',
  )
  output = insertIfMissing(output,
    "const requested = new URLSearchParams(window.location.search).get('section')",
    "  // Only the interface changes here; selecting a section never mutates tenant data.\n  const switchSection = (key) => {",
    "  // Support the old /admin/restaurant-ordering bookmark and dashboard deep links.\n  useEffect(() => {\n    const requested = new URLSearchParams(window.location.search).get('section')\n    if (requested && NAV.some(([key]) => key === requested)) setSection(requested)\n  }, [])\n\n  // Only the interface changes here; selecting a section never mutates tenant data.\n  const switchSection = (key) => {",
    'dashboard deep links')
  if (!output.includes('window.history.replaceState(window.history.state')) {
    output = replaceOnce(output,
      "    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })",
      "    if (typeof window !== 'undefined') {\n      const url = new URL(window.location.href)\n      if (key === 'overview') url.searchParams.delete('section')\n      else url.searchParams.set('section', key)\n      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)\n      window.scrollTo({ top: 0, behavior: 'smooth' })\n    }",
      'section URL synchronization')
  }
  output = insertIfMissing(output,
    'const [orderingEditorOpen, setOrderingEditorOpen] = useState(false)',
    "  const [\n    tenantEditor,\n    setTenantEditor,\n  ] =\n    useState(null)",
    "  const [\n    tenantEditor,\n    setTenantEditor,\n  ] =\n    useState(null)\n\n  const [orderingEditorOpen, setOrderingEditorOpen] = useState(false)",
    'per-tenant ordering accordion state')
  if (!output.includes('showOrdering = false')) {
    output = replaceOnce(output,
      "  const openTenantEditor =\n    (\n      tenant\n    ) => {\n      setTenantEditor({",
      "  const openTenantEditor =\n    (\n      tenant, showOrdering = false\n    ) => {\n      setOrderingEditorOpen(showOrdering)\n      setTenantEditor({",
      'tenant editor open function')
  }
  if (!output.includes('openTenantEditor(tenant, true)')) {
    const anchor = `                            >\n                              Manage Access\n                            </button>`
    const replacement = `                            >\n                              Manage Access\n                            </button>\n                            <button\n                              type="button"\n                              onClick={() => openTenantEditor(tenant, true)}\n                              className="ml-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-[9px] font-black text-red-300 hover:bg-red-500/20"\n                            >\n                              Ordering\n                            </button>`
    output = replaceOnce(output, anchor, replacement, 'per-tenant Ordering button')
  }
  output = insertIfMissing(output,
    'max-h-[94dvh] w-full max-w-2xl',
    'max-h-[94dvh] w-full max-w-lg',
    'max-h-[94dvh] w-full max-w-2xl',
    'widen tenant editor for ordering details')
  if (!output.includes('Per-Tenant Restaurant Ordering')) {
    const anchor = `              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">\n                <div>\n                  <p className="text-[10px] font-black uppercase tracking-wider text-white">\n                    Delivery Features`
    const panel = `              <section className="rounded-2xl border border-red-500/20 bg-neutral-900/70 p-4">\n                <div className="flex flex-wrap items-start justify-between gap-3">\n                  <div className="min-w-0 flex-1">\n                    <p className="text-[9px] font-black uppercase tracking-wider text-red-400">Per-Tenant Restaurant Ordering</p>\n                    <h3 className="mt-1 text-sm font-black text-white">Dine-In · Takeaway · Home Delivery · Table QR</h3>\n                    <p className="mt-2 text-[10px] leading-5 text-neutral-400">\n                      Configure the selected tenant's GPS boundary, signed QR tables, preparation time and home-delivery entry.\n                      Plan and feature switches above/below still determine access.\n                    </p>\n                  </div>\n                  <button type="button" aria-expanded={orderingEditorOpen} onClick={() => setOrderingEditorOpen((value) => !value)}\n                    className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[10px] font-black text-red-300 hover:bg-red-500/20">\n                    {orderingEditorOpen ? 'Hide Settings' : 'Configure Ordering'}\n                  </button>\n                </div>\n                <div className="mt-3 grid grid-cols-2 gap-2">\n                  {[\n                    ['Dine-In', ['restaurant_pro', 'restaurant_standard', 'restaurant_resort_pro', 'restaurant_resort_standard', 'restaurant_delivery', 'restaurant_resort_delivery'].includes(tenantEditor.planCode) && tenantEditor.features?.restaurant_enabled !== false && tenantEditor.features?.qr_menu_enabled !== false && tenantEditor.features?.dine_in_enabled !== false],\n                    ['Takeaway', ['restaurant_pro', 'restaurant_standard', 'restaurant_resort_pro', 'restaurant_resort_standard', 'restaurant_delivery', 'restaurant_resort_delivery'].includes(tenantEditor.planCode) && tenantEditor.features?.restaurant_enabled !== false && tenantEditor.features?.qr_menu_enabled !== false && tenantEditor.features?.takeaway_enabled !== false],\n                    ['Home Delivery', ['delivery', 'restaurant_delivery', 'restaurant_resort_delivery'].includes(tenantEditor.planCode) && tenantEditor.features?.delivery_enabled !== false && tenantEditor.features?.delivery_customer_ordering_enabled !== false],\n                    ['Table QR', ['restaurant_pro', 'restaurant_standard', 'restaurant_resort_pro', 'restaurant_resort_standard', 'restaurant_delivery', 'restaurant_resort_delivery'].includes(tenantEditor.planCode) && tenantEditor.features?.restaurant_enabled !== false && tenantEditor.features?.qr_menu_enabled !== false],\n                  ].map(([name, allowed]) => (\n                    <div key={name} className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-3">\n                      <p className="text-[10px] font-bold text-neutral-200">{name}</p>\n                      <p className={\`mt-1 text-[9px] font-black \${allowed ? 'text-emerald-400' : 'text-neutral-500'}\`}>\n                        {allowed ? 'Plan/feature eligible' : 'Not included / disabled'}\n                      </p>\n                    </div>\n                  ))}\n                </div>\n                <p className="mt-3 text-[10px] leading-5 text-amber-300/80">\n                  Unsaved plan/feature edits are previews only. Use “Save Access, Subscription & Features” below to apply them.\n                  Ordering policy has its own Save button.\n                </p>\n                {orderingEditorOpen && (\n                  <div className="mt-4 border-t border-neutral-800 pt-4">\n                    <AdminRestaurantOrderingControls key={tenantEditor.id} restaurantId={tenantEditor.id} tenant={tenantEditor} compact />\n                  </div>\n                )}\n              </section>\n\n`
    output = replaceOnce(output, anchor, panel + anchor, 'ordering controls inside Tenant Access')
  }
  return crlf ? output.replace(/\n/g, '\r\n') : output
}

function run() {
  if (!packageRoot) {
    error('Missing matching TXT_CODE files. Extract the corrected ZIP directly into the project root, or keep the original DD_Admin_Tenant_Ordering_20261108/TXT_CODE folder. Both JSX TXT assets must be present and match the release.')
  }
  const dashboard = read(dashboardFile)
  const currentControls = fs.existsSync(path.join(root, controlsFile)) ? read(controlsFile) : null
  const currentRedirect = fs.existsSync(path.join(root, redirectFile)) ? read(redirectFile) : null
  if (dashboard.includes('Per-Tenant Restaurant Ordering') && currentControls === NEW_CONTROLS) {
    error('Tenant ordering integration is already installed. No files changed.')
  }
  if (currentControls && hash(currentControls) !== PREVIOUS_CONTROLS_HASH && currentControls !== NEW_CONTROLS) {
    error('Existing AdminRestaurantOrderingControls.jsx has custom changes. No files changed. Use the supplied complete TXT files or share that component for a merge.')
  }
  if (currentRedirect && currentRedirect !== NEW_REDIRECT &&
      !currentRedirect.includes('RestaurantOrderingAdminPage') &&
      !currentRedirect.includes("redirect('/admin/dashboard?section=restaurant-ordering')")) {
    error('Existing restaurant-ordering/page.jsx has unexpected changes. No files changed.')
  }
  const updatedDashboard = patchDashboard(dashboard)
  const originals = [
    [dashboardFile, dashboard],
    ...(currentControls ? [[controlsFile, currentControls]] : []),
    ...(currentRedirect ? [[redirectFile, currentRedirect]] : []),
  ]
  // Every file has been validated and generated before any write.
  for (const [file, content] of originals) write(path.join(backupRoot, file), content)
  for (const [file, content] of [
    [dashboardFile, updatedDashboard],
    [controlsFile, NEW_CONTROLS],
    [redirectFile, NEW_REDIRECT],
  ]) {
    write(file, content)
    write(path.join(txtRoot, file + '.txt'), content)
  }
  console.log('PASS: Restaurant Ordering is in the Admin Dashboard Commerce sidebar.')
  console.log('PASS: Each tenant has an Ordering button and embedded policy/table settings.')
  console.log('PASS: Existing tenant access, approval, wallet, payment and delivery logic is preserved.')
  console.log(`Backups: ${backupRoot}/`)
  console.log(`Full code TXT: ${txtRoot}/`)
  console.log('Next: npm run build')
}

try { run() } catch (e) { console.error(e.message); process.exitCode = 1 }
