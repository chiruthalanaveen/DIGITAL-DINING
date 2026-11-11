
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const MARKER = 'DD_OWNER_MOBILE_BILLING_ORDERS_20261111'
const MOBILE = 'app/components/OwnerPremiumMobileHub.jsx'
const NEW_COMPONENT =
  'app/components/OwnerMobileBillingOrders.jsx'

const PARENTS = [
  'app/app/owner/[restaurantId]/page.jsx',
  'app/dashboard/[id]/page.jsx',
]

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before)

  if (
    first < 0 ||
    text.indexOf(before, first + before.length) !== -1
  ) {
    throw new Error(
      `Expected exactly one ${label}. No files changed.`
    )
  }

  return (
    text.slice(0, first) +
    after +
    text.slice(first + before.length)
  )
}

function patchMobile(input) {
  let source = input.replace(/\r\n/g, '\n')

  if (source.includes(MARKER)) {
    throw new Error(
      'Mobile billing orders are already installed.'
    )
  }

  source = replaceOnce(
    source,
    "import ThemeToggle from '@/app/components/ThemeToggle'\n",
    "import ThemeToggle from '@/app/components/ThemeToggle'\n" +
      "import OwnerMobileBillingOrders from '@/app/components/OwnerMobileBillingOrders'\n" +
      `// ${MARKER}\n`,
    'mobile billing component import'
  )

  source = replaceOnce(
    source,
    '  graphData=[],onRefresh,\n',
    '  graphData=[],onRefresh,onGenerateBill,\n',
    'mobile Generate Bill callback prop'
  )

  source = replaceOnce(
    source,
    "  const recent=useMemo(()=>[...safeOrders].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,25),[orders])\n",
    '',
    'old 25-order limit'
  )

  const lines = source.split('\n')

  const indexes = lines
    .map((line, i) =>
      line.startsWith("    {screen==='orders'&&<section ")
        ? i
        : -1
    )
    .filter(i => i !== -1)

  if (
    indexes.length !== 1 ||
    !lines[indexes[0]].endsWith('</section>}')
  ) {
    throw new Error(
      'Mobile Orders tab layout differs. No files changed.'
    )
  }

  const oldOrders = lines[indexes[0]]

  for (const required of [
    "mode!=='restaurant'",
    'ordersError',
    'ordersLoaded',
    'setSelectedOrder(o)',
    'recent.map',
    'Open management',
  ]) {
    if (!oldOrders.includes(required)) {
      throw new Error(
        `Existing Orders screen missing ${required}. No files changed.`
      )
    }
  }

  lines[indexes[0]] = `    {screen === 'orders' && (
      mode !== 'restaurant' ? (
        <section className="ddp-fade space-y-3">
          <h2 className="text-xl font-extrabold">Orders</h2>
          <div className="ddp-surface p-5">
            <p className="ddp-muted text-sm">Open {section?.label} Management below to view and update your orders securely.</p>
            <button type="button" className="mt-3 rounded-xl bg-orange-500 px-4 py-3 text-xs font-bold text-white" onClick={() => openBusinessTool(mode, mode === 'delivery' ? 'orders' : 'overview')}>Open management</button>
          </div>
        </section>
      ) : (
        <OwnerMobileBillingOrders
          orders={safeOrders}
          ordersLoaded={ordersLoaded}
          ordersError={ordersError}
          onGenerateBill={onGenerateBill}
          onViewDetails={setSelectedOrder}
          onRefresh={onRefresh}
        />
      )
    )}`

  source = lines.join('\n')

  if (
    !source.includes('OwnerMobileBillingOrders') ||
    !source.includes('setSelectedOrder(null)')
  ) {
    throw new Error(
      'Mobile order details preservation check failed.'
    )
  }

  return input.includes('\r\n')
    ? source.replace(/\n/g, '\r\n')
    : source
}

function patchParent(input, relativePath) {
  let source = input.replace(/\r\n/g, '\n')

  if (source.includes('onGenerateBill={handlePrintBill}')) {
    throw new Error(
      `${relativePath} is already updated.`
    )
  }

  if (
    !source.includes(
      'const handlePrintBill = (order) => {'
    ) ||
    !source.includes(
      'const [ordersRefreshTick, setOrdersRefreshTick] = useState(0)'
    )
  ) {
    throw new Error(
      `${relativePath}: required existing billing/refresh code not found.`
    )
  }

  source = replaceOnce(
    source,
    '          ordersError={ordersLoadError}\n',
    '          ordersError={ordersLoadError}\n' +
      '          onGenerateBill={handlePrintBill}\n' +
      '          onRefresh={() => setOrdersRefreshTick(value => value + 1)}\n',
    `${relativePath} mobile billing callback`
  )

  if (!source.includes('onGenerateBill={handlePrintBill}')) {
    throw new Error(
      `${relativePath}: Generate Bill callback missing.`
    )
  }

  return input.includes('\r\n')
    ? source.replace(/\n/g, '\r\n')
    : source
}

function install(root = process.cwd()) {
  const componentPath = path.join(root, NEW_COMPONENT)

  if (!fs.existsSync(componentPath)) {
    throw new Error(
      `Missing ${NEW_COMPONENT}. First paste the complete provided component there.`
    )
  }

  const component = fs.readFileSync(
    componentPath,
    'utf8'
  )

  if (
    !component.includes(
      'export default function OwnerMobileBillingOrders'
    ) ||
    !component.includes('onGenerateBill?.(order)') ||
    !component.includes('BILL-')
  ) {
    throw new Error(
      `${NEW_COMPONENT} does not match the supplied component.`
    )
  }

  if (!fs.existsSync(path.join(root, MOBILE))) {
    throw new Error(
      `Missing ${MOBILE}. Run this from the project root.`
    )
  }

  const presentParents = PARENTS.filter(relative =>
    fs.existsSync(path.join(root, relative))
  )

  if (!presentParents.length) {
    throw new Error(
      'No recognized owner dashboard page was found.'
    )
  }

  // Validate all files before modifying any.
  const edits = [MOBILE, ...presentParents].map(
    relative => {
      const absolute = path.join(root, relative)
      const original = fs.readFileSync(
        absolute,
        'utf8'
      )

      const updated =
        relative === MOBILE
          ? patchMobile(original)
          : patchParent(original, relative)

      return {
        relative,
        absolute,
        original,
        updated,
      }
    }
  )

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')

  const backupRoot = path.join(
    root,
    'dd-mobile-billing-backups',
    timestamp
  )

  const fullCodeRoot = path.join(
    root,
    'dd-mobile-billing-full-code-txt'
  )

  for (const edit of edits) {
    const backup = path.join(
      backupRoot,
      edit.relative
    )

    fs.mkdirSync(path.dirname(backup), {
      recursive: true,
    })

    fs.writeFileSync(
      backup,
      edit.original,
      { flag: 'wx' }
    )
  }

  try {
    for (const edit of edits) {
      fs.writeFileSync(
        edit.absolute,
        edit.updated
      )

      const txt = path.join(
        fullCodeRoot,
        edit.relative + '.txt'
      )

      fs.mkdirSync(path.dirname(txt), {
        recursive: true,
      })

      fs.writeFileSync(txt, edit.updated)

      console.log('Updated:', edit.relative)
      console.log(
        'Complete updated code:',
        path.relative(root, txt)
      )
    }
  } catch (error) {
    for (const edit of edits) {
      try {
        fs.writeFileSync(
          edit.absolute,
          edit.original
        )
      } catch {}
    }

    throw new Error(
      `Write failed; original files restored where possible: ${error.message}`
    )
  }

  console.log(
    'PASS: Billing-style mobile Orders tab installed.'
  )

  console.log(
    'Original file backups:',
    path.relative(root, backupRoot)
  )

  console.log('Next: npm run build')
}

if (require.main === module) {
  try {
    install()
  } catch (error) {
    console.error(
      'INSTALL STOPPED:',
      error.message
    )

    process.exitCode = 1
  }
}

module.exports = {
  patchMobile,
  patchParent,
  install,
}
