
'use strict'

// Digital Dine-In QR checkout performance fix.
// Run from the project root: node tools/fix-qr-checkout-speed.cjs
// This patches only app/menu/[id]/page.jsx and keeps a timestamped backup.

const fs = require('node:fs')
const path = require('node:path')

const TARGET = 'app/menu/[id]/page.jsx'
const MARKER = 'DD_QR_CHECKOUT_SPEED_20261111'

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before)
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Unexpected ${label} source. No files changed.`)
  }
  return source.slice(0, first) + after + source.slice(first + before.length)
}

function replaceBlock(source, start, end, replacement, label) {
  const first = source.indexOf(start)
  const second = source.indexOf(end, first + start.length)
  if (first < 0 || second < 0 || source.indexOf(start, first + start.length) >= 0) {
    throw new Error(`Cannot locate ${label}. No files changed.`)
  }
  return source.slice(0, first) + replacement + source.slice(second)
}

function patch(input) {
  if (input.includes(MARKER)) throw new Error('Speed fix already installed. No files changed.')
  let s = input.replace(/\r\n/g, '\n')

  s = replaceOnce(s,
    "  const [paymentLoading, setPaymentLoading] = useState(false)\n",
    "  const [paymentLoading, setPaymentLoading] = useState(false)\n" +
    "  // " + MARKER + ": prevents duplicate counter orders and parallel payment starts.\n" +
    "  const counterOrderInFlightRef = useRef(false)\n" +
    "  const razorpayStartInFlightRef = useRef(false)\n",
    'checkout locks')

  s = replaceBlock(s,
    '  const incrementOrderedItems = async items => {\n',
    '  const getDineInProof = async () => {\n',
`  // Update analytics concurrently (up to four requests per batch), not one round trip per item.
  const incrementOrderedItems = async items => {
    if (!items?.length) return
    const validItems = items.filter(item =>
      item?.id && Number(item.quantity || item.qty || 1) > 0
    )
    for (let i = 0; i < validItems.length; i += 4) {
      await Promise.all(validItems.slice(i, i + 4).map(async item => {
        try {
          const { error } = await supabase.rpc('increment_menu_item_order', {
            p_menu_item_id: item.id,
            p_quantity: Number(item.quantity || item.qty || 1)
          })
          if (error) console.error('Order count update failed:', error)
        } catch (error) {
          console.error('Order count update failed:', error)
        }
      }))
    }
  }

`, 'item analytics')

  s = replaceOnce(s,
`  const getDineInProof = async () => {
    if (orderType !== 'dine-in' || !orderingOptions?.geofenceEnabled) return {}
    const position = await getFreshDineInProof()
    return { ...position, tableQrToken: searchParams.get('tableToken') || '' }
  }
`,
`  const getDineInProof = async () => {
    if (orderType !== 'dine-in') return {}
    // Signed table QR is independent of the Super Admin GPS ON/OFF setting.
    const tableQrToken = searchParams.get('tableToken') || ''
    if (!orderingOptions?.geofenceEnabled) return { tableQrToken }
    const position = await getFreshDineInProof()
    return { ...position, tableQrToken }
  }
`, 'signed QR proof')

  s = replaceOnce(s,
`    const accessAllowed = await fetchQrAccess()

    if (!accessAllowed) {
      throw new Error(
        'Online ordering is currently disabled for this restaurant.'
      )
    }

    const cleanName =`,
`    // Checked once by the counter handler; the secure server API rechecks
    // wallet, entitlements, signed QR, GPS (if enabled), and all prices.
    const cleanName =`, 'duplicate counter access check')

  s = replaceOnce(s,
`  const handlePayAtCounter = async () => {
    if (pendingQrVerification) {`,
`  const handlePayAtCounter = async () => {
    if (paymentLoading || counterOrderInFlightRef.current) return
    if (pendingQrVerification) {`, 'counter double-click guard')

  s = replaceOnce(s,
`    // Check before submitting a counter order OR opening paid checkout.
    // createPublicOrder checks again; the database trigger is authoritative.
    if (!(await fetchQrAccess())) {
      appNotice('New orders are temporarily unavailable. Please contact the restaurant staff.')
      return
    }

    setPaymentLoading(true)

    try {
      const freshQuote = await refreshRestaurantFeeQuote()`,
`    counterOrderInFlightRef.current = true
    setPaymentLoading(true)

    try {
      // Independent checks run together; server validates again at commit.
      const [accessAllowed, freshQuote] = await Promise.all([
        fetchQrAccess(),
        refreshRestaurantFeeQuote()
      ])
      if (!accessAllowed) {
        throw new Error('New orders are temporarily unavailable. Please contact the restaurant staff.')
      }`, 'counter parallel preflight')

  s = replaceOnce(s,
`      await incrementOrderedItems(cartItemsArray)

      setConfirmedBillSummary({`,
`      setConfirmedBillSummary({`, 'counter blocking analytics')

  s = replaceOnce(s,
`      setOrderPlaced(true)
      await fetchCustomerOrders(finalMobile)
    } catch (error) {`,
`      setOrderPlaced(true)
      // The order already exists: show success before optional analytics.
      // Customer history loads when the guest opens Track My Order.
      await incrementOrderedItems(itemsSnapshot)
    } catch (error) {`, 'counter confirmation')

  s = replaceOnce(s,
`    } finally {
      setPaymentLoading(false)
    }
  }

  // Recover verification details`,
`    } finally {
      counterOrderInFlightRef.current = false
      setPaymentLoading(false)
    }
  }

  // Recover verification details`, 'counter lock release')

  s = replaceOnce(s,
`      if (!result.alreadyFinalized && Array.isArray(attempt.itemsSnapshot)) {
        await incrementOrderedItems(attempt.itemsSnapshot)
      }
      setConfirmedBillSummary({`,
`      setConfirmedBillSummary({`, 'paid order blocking analytics')

  s = replaceOnce(s,
`      // Refresh order status without hiding a successfully verified order if
      // an optional customer-history read fails.
      try {
        await fetchCustomerOrders(summary.customerMobile || customerMobile.trim())
      } catch (historyError) {
        console.error('[QR MENU] Order history refresh failed:', historyError)
      }`,
`      // The paid order is already verified and visible. Analytics are optional.
      // History refresh happens when the customer opens Track My Order.
      if (!result.alreadyFinalized && Array.isArray(attempt.itemsSnapshot)) {
        await incrementOrderedItems(attempt.itemsSnapshot)
      }`, 'paid confirmation')

  s = replaceOnce(s,
`  const handleRazorpayCheckout = async () => {
    if (paymentLoading || pendingQrVerification) {`,
`  const handleRazorpayCheckout = async () => {
    if (paymentLoading || razorpayStartInFlightRef.current || pendingQrVerification) {`, 'Razorpay double-click guard')

  s = replaceOnce(s,
`    // The server will check the wallet and recalculate every line item and
    // total from the database. The client price is only a mismatch check.
    if (!(await fetchQrAccess())) {
      appNotice('New orders are temporarily unavailable. Please contact the restaurant staff.')
      return
    }

    setPaymentLoading(true)`,
`    // The secure create API checks wallet, feature controls and item prices.
    // A fresh wallet/access check is retained immediately before Razorpay opens.
    razorpayStartInFlightRef.current = true
    setPaymentLoading(true)`, 'Razorpay redundant preflight')

  s = replaceOnce(s,
`      const freshQuote = await refreshRestaurantFeeQuote()
      const refreshedTotal = Math.round((subtotalAmount + gstAmount + packingFee +
        Number(freshQuote.customerAmountPaise || 0) / 100) * 100) / 100
      if (Math.abs(refreshedTotal - totalAmount) >= 0.011) {
        throw new Error('The platform fee changed. Review the updated bill and retry payment.')
      }
      const sdkLoaded = await loadRazorpayScript()`,
`      // Fee validation and SDK loading are independent, so start both together.
      const [freshQuote, sdkLoaded] = await Promise.all([
        refreshRestaurantFeeQuote(),
        loadRazorpayScript()
      ])
      const refreshedTotal = Math.round((subtotalAmount + gstAmount + packingFee +
        Number(freshQuote.customerAmountPaise || 0) / 100) / 100
      if (Math.abs(refreshedTotal - totalAmount) >= 0.011) {
        throw new Error('The platform fee changed. Review the updated bill and retry payment.')
      }`, 'Razorpay parallel preflight')

  s = replaceOnce(s,
`          ondismiss: () => {
            if (!paymentHandlerStarted) setPaymentLoading(false)
          }`,
`          ondismiss: () => {
            if (!paymentHandlerStarted) setPaymentLoading(false)
            razorpayStartInFlightRef.current = false
          }`, 'Razorpay dismiss lock')

  s = replaceOnce(s,
`      rzp.open()
      setPaymentLoading(false)
    } catch (error) {`,
`      // Keep the synchronous guard until the payment modal closes or finishes.
      rzp.open()
      setPaymentLoading(false)
    } catch (error) {`, 'Razorpay opened lock')

  s = replaceOnce(s,
`          await verifyQrPaymentAttempt(attempt)
        },`,
`          try {
            await verifyQrPaymentAttempt(attempt)
          } finally {
            razorpayStartInFlightRef.current = false
          }
        },`, 'Razorpay callback lock')

  s = replaceOnce(s,
`            appNotice('Payment confirmation data is missing. If you were charged, do not pay again. Contact restaurant support.')
            setPaymentLoading(false)
            return`,
`            appNotice('Payment confirmation data is missing. If you were charged, do not pay again. Contact restaurant support.')
            razorpayStartInFlightRef.current = false
            setPaymentLoading(false)
            return`, 'Razorpay incomplete callback')

  s = replaceOnce(s,
`      rzp.on('payment.failed', response => {
        appNotice(\`Payment Failed: \${response?.error?.description || 'Please try again.'}\`)
        setPaymentLoading(false)
      })`,
`      rzp.on('payment.failed', response => {
        appNotice(\`Payment Failed: \${response?.error?.description || 'Please try again.'}\`)
        razorpayStartInFlightRef.current = false
        setPaymentLoading(false)
      })`, 'Razorpay failed callback lock')

  s = replaceOnce(s,
`      appNotice('Checkout Error: ' + (error?.message || 'Please try again.'))
      setPaymentLoading(false)
    }
  }`,
`      appNotice('Checkout Error: ' + (error?.message || 'Please try again.'))
      razorpayStartInFlightRef.current = false
      setPaymentLoading(false)
    }
  }`, 'Razorpay error lock')

  for (const mustKeep of [
    'deliveryCheckoutOpen', 'RestaurantOrderingChooser', 'RestaurantDeliveryCheckout',
    'pendingQrVerification', 'digitaldine_pending_qr_payment_',
    'getFreshDineInProof()', 'tableQrToken', 'digital_dine_wallet_is_orderable',
    'qr-payment/verify', 'qr-counter-order', 'qr-payment/create',
    'mergePlacedOrderIntoCustomerOrders', 'increment_menu_item_order',
    'setOrderPlaced(true)', 'fetchCustomerOrders', 'Pay at Counter'
  ]) {
    if (!s.includes(mustKeep)) throw new Error(`Safety check failed: ${mustKeep}`)
  }
  if (input.includes('\r\n')) s = s.replace(/\n/g, '\r\n')
  return s
}

function install(root = process.cwd()) {
  const target = path.join(root, TARGET)
  if (!fs.existsSync(target)) throw new Error(`Missing ${TARGET}. Run from table-pay root.`)
  const original = fs.readFileSync(target, 'utf8')
  const updated = patch(original)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = path.join(root, 'dd-qr-speed-backups', stamp, TARGET)
  const txt = path.join(root, 'dd-qr-speed-full-code-txt', TARGET + '.txt')
  fs.mkdirSync(path.dirname(backup), { recursive: true })
  fs.mkdirSync(path.dirname(txt), { recursive: true })
  fs.writeFileSync(backup, original, { flag: 'wx' })
  try {
    fs.writeFileSync(target, updated)
    fs.writeFileSync(txt, updated)
  } catch (error) {
    fs.writeFileSync(target, original)
    throw error
  }
  console.log('PASS: QR checkout speed patch installed')
  console.log('Updated:', TARGET)
  console.log('Backup:', path.relative(root, backup))
  console.log('Full JSX as TXT:', path.relative(root, txt))
  console.log('Next: npm run build')
}

if (require.main === module) {
  try { install() } catch (error) {
    console.error('INSTALL STOPPED:', error.message)
    process.exitCode = 1
  }
}
module.exports = { patch, install, TARGET }
