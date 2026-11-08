/* Digital Dine-In safe integration patcher. Node.js only; no Python needed.
 * Run from the Next.js project root after extracting this release into it.
 * It refuses to overwrite source when expected anchors are missing.
 */
const fs = require('node:fs')
const path = require('node:path')
const root = process.cwd()
const updates = new Map()
const targets = [
  'app/menu/[id]/page.jsx',
  'app/api/[restaurantid]/qr-counter-order/route.js',
  'app/api/[restaurantid]/qr-payment/create/route.js',
  'app/app/owner/[restaurantId]/page.jsx',
  'app/app/manager/[restaurantId]/page.jsx',
  'app/app/kitchen/[restaurantId]/page.jsx',
  'app/app/waiter/[restaurantId]/page.jsx',
]
const MARKER = 'DD_ORDERING_MODES_20261108'
function replaceOnce(text, from, to, label) {
  const start = text.indexOf(from)
  if (start === -1) throw new Error(`Expected source anchor not found: ${label}`)
  if (text.indexOf(from, start + from.length) !== -1) throw new Error(`Ambiguous source anchor: ${label}`)
  return text.slice(0, start) + to + text.slice(start + from.length)
}
function replaceBetween(text, start, end, content, label) {
  const a = text.indexOf(start)
  if (a === -1) throw new Error(`Missing start anchor: ${label}`)
  const b = text.indexOf(end, a + start.length)
  if (b === -1) throw new Error(`Missing end anchor: ${label}`)
  return text.slice(0, a) + content + '\n\n' + text.slice(b)
}
function patchMenu(s) {
  s = replaceOnce(s,
    "import { useMobileViewportLock } from '@/lib/useMobileViewportLock'",
    "import { useMobileViewportLock } from '@/lib/useMobileViewportLock'\nimport RestaurantOrderingChooser from '@/app/components/RestaurantOrderingChooser'\nimport RestaurantDeliveryCheckout from '@/app/components/RestaurantDeliveryCheckout'\nimport { getFreshDineInProof } from '@/lib/client/restaurantLocation'",
    'menu imports')
  s = replaceOnce(s,
    "  const [orderType, setOrderType] = useState('dine-in')",
    `  const [orderType, setOrderType] = useState('dine-in')
  // ${MARKER}: additive restaurant / home delivery UI; no old workflows removed.
  const [orderingOptions, setOrderingOptions] = useState(null)
  const [deliveryCheckoutOpen, setDeliveryCheckoutOpen] = useState(false)
  const [locationIssue, setLocationIssue] = useState('')
  useEffect(() => {
    if (!restaurantId) return
    let active = true
    fetch('/api/restaurant/ordering-options?restaurantId=' + encodeURIComponent(restaurantId), { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (active && data?.success) setOrderingOptions(data) })
      .catch(() => {})
    return () => { active = false }
  }, [restaurantId])`, 'menu state')
  s = replaceOnce(s, '  const createPublicOrder = async ({',
    `  const getDineInProof = async () => {
    if (orderType !== 'dine-in' || !orderingOptions?.geofenceEnabled) return {}
    const position = await getFreshDineInProof()
    return { ...position, tableQrToken: searchParams.get('tableToken') || '' }
  }

  const createPublicOrder = async ({`, 'menu proof helper')
  s = replaceOnce(s, "    const response = await fetch('/api/restaurant/qr-counter-order', {",
    `    const dineInProof = await getDineInProof()
    const response = await fetch('/api/restaurant/qr-counter-order', {`, 'counter proof')
  s = replaceOnce(s, '        totalAmount: Number(totalAmount || 0),\n      }),',
    '        totalAmount: Number(totalAmount || 0),\n        ...dineInProof,\n      }),', 'counter body')
  s = replaceOnce(s, "      const createResponse = await fetch('/api/restaurant/qr-payment/create', {",
    `      const dineInProof = await getDineInProof()
      const createResponse = await fetch('/api/restaurant/qr-payment/create', {`, 'razorpay proof')
  s = replaceOnce(s, '          items: finalItems,\n          totalAmount\n        })',
    '          items: finalItems,\n          totalAmount,\n          ...dineInProof,\n        })', 'razorpay body')
  s = replaceOnce(s, "      console.error('Counter payment error:', error)",
    "      console.error('Counter payment error:', error)\n      setLocationIssue(error?.message || 'Unable to verify Dine-In checkout.')", 'counter error UI')
  s = replaceOnce(s, "      console.error('[QR MENU] Secure checkout error:', error)",
    "      console.error('[QR MENU] Secure checkout error:', error)\n      setLocationIssue(error?.message || 'Unable to verify Dine-In checkout.')", 'razorpay error UI')
  s = replaceOnce(s, '  if (loading) {\n    return (',
    `  if (deliveryCheckoutOpen && orderingOptions?.homeDeliveryAvailable) {
    return <RestaurantDeliveryCheckout restaurantCode={orderingOptions.restaurantCode} onBack={() => setDeliveryCheckoutOpen(false)} />
  }

  if (loading) {
    return (`, 'delivery unified view')
  const chooser = `          {/* ${MARKER}: unified mode selection */}
          <section className="px-3 min-[390px]:px-4 pt-4">
            <RestaurantOrderingChooser options={orderingOptions} orderType={orderType}
              issue={locationIssue} onRestaurantMode={mode => { setOrderType(mode); setLocationIssue('') }}
              onDelivery={() => setDeliveryCheckoutOpen(true)} />
          </section>`
  s = replaceBetween(s, '          {/* ORDER MODE */}', '          {/* OFFERS */}', chooser, 'main mode chooser')
  const cartStart = `                      <div className="mt-5">
                        <p className="mb-2 text-[9px] font-black uppercase tracking-wider text-neutral-400">
                          Order type`
  const cartEnd = '                      <div className="mt-5 rounded-[24px] bg-neutral-950 p-4 text-white">'
  s = replaceBetween(s, cartStart, cartEnd,
    `                      <div className="mt-5"><p className="mb-2 text-xs font-black">Order type</p>
                        <RestaurantOrderingChooser options={orderingOptions} orderType={orderType}
                          issue={locationIssue} onRestaurantMode={mode => { setOrderType(mode); setLocationIssue('') }}
                          onDelivery={() => setDeliveryCheckoutOpen(true)} />
                      </div>`, 'cart mode chooser')
  return s
}
function patchCheckout(s) {
  s = replaceOnce(s, "import { qrAdmin,", "import { assertDineInCheckout, OrderingError, failOrdering } from '@/lib/server/restaurantOrdering'\nimport { qrAdmin,", 'checkout import')
  s = replaceOnce(s, '    const { snapshot, subtotalPaise } = await qrBuildVerifiedCart(admin, restaurantId, payload.items)',
    '    await assertDineInCheckout(admin, restaurantId, tableNumber, payload)\n    const { snapshot, subtotalPaise } = await qrBuildVerifiedCart(admin, restaurantId, payload.items)', 'server validation')
  s = replaceOnce(s, '    return qrSafeError(error)',
    '    if (error instanceof OrderingError) return failOrdering(error)\n    return qrSafeError(error)', 'checkout error handling')
  return '// ' + MARKER + '\n' + s
}
function patchOwner(s) {
  const anchor = "        {dashboardMode === 'delivery' && deliveryModuleEnabled && ("
  const link = `        {/* ${MARKER}: secure combined restaurant order inbox */}
        {restaurantModuleEnabled && (
          <a href={\`/app/operations/\${encodeURIComponent(restaurantId)}\`}
            className="mx-3 my-3 block rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-center text-sm font-black text-indigo-800">
            🍽 Restaurant Orders · Dine-In / Takeaway / Delivery
          </a>
        )}
`
  return replaceOnce(s, anchor, link + anchor, 'owner operations link')
}
function patchManager(s) {
  const anchor = "        {dashboardMode === 'resort' && hasResortAccess && ("
  const link = `        {/* ${MARKER}: secured order inbox */}
        {restaurantModuleEnabled && (
          <a href={\`/app/operations/\${encodeURIComponent(restaurantId)}?role=staff\`}
            className="mx-3 my-3 block rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-center text-sm font-black text-indigo-800">
            🍽 Restaurant Orders · Dine-In / Takeaway / Delivery
          </a>
        )}
`
  return replaceOnce(s, anchor, link + anchor, 'manager operations link')
}
function patchStaff(s, role) {
  const anchor = `<nav aria-label="${role} mobile navigation"`
  const label = role === 'Kitchen' ? 'Kitchen orders' : 'Ready table orders'
  const link = `{/* ${MARKER}: role-scoped restaurant orders */}
      <a href={\`/app/operations/\${encodeURIComponent(restaurantId)}?role=staff\`}
        className="mb-24 mt-5 block rounded-xl border border-indigo-500 bg-indigo-950 px-4 py-3 text-center text-xs font-bold text-indigo-100">
        ${label} · Open secure order inbox
      </a>
      `
  return replaceOnce(s, anchor, link + anchor, `${role} operations link`)
}
const transformers = [patchMenu, patchCheckout, patchCheckout, patchOwner, patchManager,
  s => patchStaff(s, 'Kitchen'), s => patchStaff(s, 'Waiter')]
try {
  for (let i = 0; i < targets.length; i++) {
    const file = path.join(root, targets[i])
    if (!fs.existsSync(file)) throw new Error(`Missing file: ${targets[i]}. Run this script from the Next.js project root.`)
    const original = fs.readFileSync(file, 'utf8')
    if (original.includes(MARKER)) throw new Error(`Already patched: ${targets[i]}. Do not apply twice.`)
    const updated = transformers[i](original)
    updates.set(file, { original, updated })
  }
  // Preflight completed: no original file was changed before this point.
  const backupDir = path.join(root, 'dd-ordering-backups', '20261108')
  for (const [file, data] of updates) {
    const relative = path.relative(root, file)
    const backup = path.join(backupDir, relative)
    fs.mkdirSync(path.dirname(backup), { recursive: true })
    fs.writeFileSync(backup, data.original, { flag: 'wx' })
  }
  for (const [file, data] of updates) {
    fs.writeFileSync(file, data.updated)
    const relative = path.relative(root, file)
    const txt = path.join(root, 'dd-ordering-full-code-txt', relative + '.txt')
    fs.mkdirSync(path.dirname(txt), { recursive: true })
    fs.writeFileSync(txt, data.updated)
    console.log('Updated and exported full code:', relative)
  }
  console.log('\nSuccess. Original files backed up in dd-ordering-backups/20261108.')
  console.log('Full updated source TXT copies: dd-ordering-full-code-txt/')
  console.log('Run npm run build and authenticated staging tests before deployment.')
} catch (error) {
  console.error('No integration changes were applied unless backups had already completed:', error.message)
  process.exitCode = 1
}
