/*
 * Targeted Digital Dine-In owner dashboard patch.
 * Run from the Next.js project root:
 *   node tools/swap-delivery-wallet-and-overview.cjs
 * Uses only Node built-ins; no database or other app changes.
 */
const fs = require('node:fs')
const path = require('node:path')
const base = process.cwd()
const component = path.join(base, 'app/components/OwnerDeliveryManagement.jsx')
const dashboard = path.join(base, 'app/dashboard/[id]/page.jsx')
for (const file of [component, dashboard]) {
  if (!fs.existsSync(file)) {
    throw new Error(`Expected file not found: ${file}`)
  }
}
const oldComponent = fs.readFileSync(component, 'utf8')
const oldDashboard = fs.readFileSync(dashboard, 'utf8')
const eol = (text) => text.includes('\r\n') ? '\r\n' : '\n'
const newline = (text) => text.replace(/\n/g, eol(text))

function patchComponent(source) {
  let next = source
  // Default to Wallet when opening the Delivery dashboard.
  if (/const \[tab, setTab\] = useState\('overview'\)/.test(next)) {
    next = next.replace("const [tab, setTab] = useState('overview')", "const [tab, setTab] = useState('wallet')")
  } else if (!next.includes("const [tab, setTab] = useState('wallet')")) {
    throw new Error('Cannot locate initial Delivery tab. No changes were saved.')
  }

  // Move the wallet to the first position and put Overview in the old wallet slot.
  // Match tab entries only, not the view content.
  const tabsStart = next.indexOf('const tabs = [')
  const tabsEnd = next.indexOf('  // Only one settings destination', tabsStart)
  if (tabsStart < 0 || tabsEnd < 0) {
    throw new Error('Cannot locate Delivery sidebar items; no changes were saved.')
  }
  const before = next.slice(0, tabsStart)
  let section = next.slice(tabsStart, tabsEnd)
  const after = next.slice(tabsEnd)
  const first = /\['overview', 'Overview'\],/g
  const wallet = /\['wallet', 'Delivery Wallet'\],/g
  const firstMatches = section.match(first) || []
  const walletMatches = section.match(wallet) || []
  if (firstMatches.length !== 1 || walletMatches.length !== 1) {
    throw new Error('Expected exactly one Wallet and Overview sidebar item; no changes were saved.')
  }
  const firstIndex = section.indexOf("['overview', 'Overview']")
  const walletIndex = section.indexOf("['wallet', 'Delivery Wallet']")
  if (firstIndex < walletIndex) {
    section = section
      .replace("['overview', 'Overview']", "['__temp_wallet__', 'Delivery Wallet']")
      .replace("['wallet', 'Delivery Wallet']", "['overview', 'Overview']")
      .replace("['__temp_wallet__', 'Delivery Wallet']", "['wallet', 'Delivery Wallet']")
  }
  next = before + section + after
  if (!next.includes("{tab === 'wallet' && (") || !next.includes('OwnerDeliveryWallet restaurantId={restaurantId}')) {
    throw new Error('Wallet view missing; no changes were saved.')
  }
  return next
}

function patchDashboard(source) {
  const unconditional = /^(\s*)<OwnerDeliveryWallet restaurantId=\{restaurantId\} \/>/m
  const hasNewGuard = /\{!deliveryModuleEnabled\s*&&\s*\(\s*<OwnerDeliveryWallet restaurantId=\{restaurantId\} \/>/m.test(source)
  if (hasNewGuard) return source
  if (!unconditional.test(source)) {
    throw new Error('Cannot locate existing main-page wallet; no changes were saved.')
  }
  return source.replace(unconditional, (_line, indent) => {
    return `${indent}{!deliveryModuleEnabled && (\n${indent}  <OwnerDeliveryWallet restaurantId={restaurantId} />\n${indent})}`
  })
}

const nextComponent = patchComponent(oldComponent)
const nextDashboard = patchDashboard(oldDashboard)

let changed = false
for (const [file, oldText, newText] of [
  [component, oldComponent, nextComponent],
  [dashboard, oldDashboard, nextDashboard],
]) {
  if (oldText === newText) continue
  const backup = `${file}.before-wallet-sidebar-swap.bak`
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup)
  fs.writeFileSync(file, newText)
  console.log('Updated:', path.relative(base, file))
  changed = true
}
if (!changed) console.log('Already installed; no changes.')
console.log('Delivery opens with Wallet; Overview moved to the Wallet sidebar position.')
