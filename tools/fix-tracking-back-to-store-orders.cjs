/**
 * DIGITAL DINE-IN — BACK TO STORE MY ORDERS POPUP
 * Destination: tools/fix-tracking-back-to-store-orders.cjs
 * Run at project root: node tools/fix-tracking-back-to-store-orders.cjs
 *
 * Only adjusts DeliveryHomeNavigation and its prop, leaving auth, tracking,
 * status, map, payment, and order data untouched.
 * Makes a .bak copy on first change. Safe to rerun.
 */
const fs = require('node:fs')
const path = require('node:path')

const target = path.join(
  process.cwd(), 'app', 'delivery', '[restaurantCode]',
  'track', '[orderCode]', 'page.jsx'
)

if (!fs.existsSync(target)) {
  console.error('Tracking file not found: ' + target)
  process.exit(1)
}

const source = fs.readFileSync(target, 'utf8')
const start = source.indexOf('function DeliveryHomeNavigation(')
const end = source.indexOf('\nfunction money(', start)

if (start < 0 || end < 0 || end <= start) {
  console.error('Could not safely identify the existing back-navigation component. No change made.')
  process.exit(1)
}

let nav = source.slice(start, end)
const hasOrdersHref = /href=\{ordersHref\}/.test(nav)
const alreadyFixed = hasOrdersHref &&
  nav.includes('/delivery/${encodeURIComponent(restaurantCode)}?view=orders') &&
  source.includes('<DeliveryHomeNavigation restaurantCode={restaurantCode} />')
if (alreadyFixed) {
  console.log('Already configured: tracking arrow returns to the store My Orders popup.')
  process.exit(0)
}

// Only accept a normal anchor inside the named navigation component.
if (!/<a\s[\s\S]*?href=/.test(nav)) {
  console.error('Back navigation no longer uses the expected anchor. No change made.')
  process.exit(1)
}

const anchorPattern = /href=(?:"[^"]*"|'[^']*'|\{storeHome\}|\{ordersHref\})/
if (!anchorPattern.test(nav)) {
  console.error('Unexpected back-navigation href. No change made.')
  process.exit(1)
}

const ordersHrefDefinition = `  // Return to the current restaurant's My Orders POPUP, not the global page.
  const ordersHref = /^[A-Za-z0-9_-]{1,80}$/.test(String(restaurantCode || ''))
    ? \`/delivery/\${encodeURIComponent(restaurantCode)}?view=orders\`
    : '/delivery?view=orders'
`

nav = nav.replace(
  /function DeliveryHomeNavigation\([^)]*\)\s*\{/,
  'function DeliveryHomeNavigation({ restaurantCode }) {'
)

// Remove the old storeHome variable where present, so ESLint won't flag it.
nav = nav.replace(
  /\n  const storeHome\s*=\s*[\s\S]*?\n  return\s*\(/,
  '\n  return ('
)

if (!nav.includes('const ordersHref =')) {
  nav = nav.replace(
    /function DeliveryHomeNavigation\(\{ restaurantCode \}\)\s*\{/,
    'function DeliveryHomeNavigation({ restaurantCode }) {\n' + ordersHrefDefinition
  )
} else {
  nav = nav.replace(
    /  const ordersHref\s*=\s*[\s\S]*?\n  return\s*\(/,
    ordersHrefDefinition + '\n  return ('
  )
}

nav = nav.replace(anchorPattern, 'href={ordersHref}')
nav = nav.replace(/(<a\b[\s\S]*?)aria-label="[^"]*"/, '$1aria-label="Back to store My Orders"')
nav = nav.replace(/(<a\b[\s\S]*?)title="[^"]*"/, '$1title="Back to store My Orders"')

let updated = source.slice(0, start) + nav + source.slice(end)
updated = updated.replace(
  /<DeliveryHomeNavigation\s*\/>/g,
  '<DeliveryHomeNavigation restaurantCode={restaurantCode} />'
)
if (!updated.includes('<DeliveryHomeNavigation restaurantCode={restaurantCode} />') ||
    !updated.includes('/delivery/${encodeURIComponent(restaurantCode)}?view=orders')) {
  console.error('Safety validation failed. No change made.')
  process.exit(1)
}
if (updated === source) {
  console.log('No change needed.')
  process.exit(0)
}
fs.copyFileSync(target, target + '.bak')
fs.writeFileSync(target, updated, 'utf8')
console.log('Fixed tracking arrow: /delivery/STORE_CODE?view=orders')
console.log('Backup created: ' + target + '.bak')
