/**
 * DIGITAL DINE-IN — Patch tracking back-arrow to My Orders.
 * Keep this script outside your app: tools/fix-tracking-back-to-orders.cjs
 * Run: node tools/fix-tracking-back-to-orders.cjs
 * Makes a .bak copy before modifying. No backend changes.
 */
const fs = require('node:fs')
const path = require('node:path')
const target = path.join(process.cwd(), 'app', 'delivery', '[restaurantCode]', 'track', '[orderCode]', 'page.jsx')

if (!fs.existsSync(target)) {
  console.error('Missing tracking page: ' + target)
  process.exit(1)
}
let text = fs.readFileSync(target, 'utf8')
const start = text.indexOf('function DeliveryHomeNavigation(')
if (start < 0) {
  console.error('Could not locate DeliveryHomeNavigation. Your tracking page may use a different component. No changes made.')
  process.exit(1)
}
// Replace ONLY the first anchor href inside the back-navigation component.
const end = text.indexOf('\nfunction ', start + 9)
if (end < 0) {
  console.error('Cannot identify end of navigation component. No changes made.')
  process.exit(1)
}
const originalNav = text.slice(start, end)
const anchor = /(<a\b[^>]*\bhref=)["']([^"']+)["']/s
const match = originalNav.match(anchor)
if (!match) {
  console.error('Navigation does not use an anchor href. No changes made.')
  process.exit(1)
}
const oldHref = match[2]
if (oldHref === '/delivery?view=orders') {
  console.log('Back arrow already points to My Orders. No change needed.')
  process.exit(0)
}
if (!oldHref.startsWith('/delivery')) {
  console.error('Unexpected back-arrow URL: ' + oldHref + '. No changes made.')
  process.exit(1)
}
let newNav = originalNav.replace(anchor, '$1"/delivery?view=orders"')
newNav = newNav.replace(/aria-label=["'][^"']*["']/, 'aria-label="Back to My Orders"')
newNav = newNav.replace(/title=["'][^"']*["']/, 'title="Back to My Orders"')
text = text.slice(0, start) + newNav + text.slice(end)
fs.copyFileSync(target, target + '.bak')
fs.writeFileSync(target, text, 'utf8')
console.log('Updated back arrow: ' + oldHref + ' -> /delivery?view=orders')
console.log('Backup: ' + target + '.bak')
