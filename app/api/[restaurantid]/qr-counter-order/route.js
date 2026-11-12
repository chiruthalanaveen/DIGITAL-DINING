// Digital Dine-In — optimized Pay-at-Counter QR checkout.
// Destination: app/api/restaurant/qr-counter-order/route.js
// Read-only checks run concurrently. All original validation and the
// authoritative, transactional Supabase RPC are retained.
import {
  assertDineInCheckout,
  OrderingError,
  failOrdering,
} from '@/lib/server/restaurantOrdering'
import {
  qrAdmin,
  qrRespond,
  qrError,
  qrSafeError,
  qrAssert,
  qrEligible,
  qrBuildVerifiedCart,
  qrRupees,
  qrRestaurantCustomerFee,
  QR_ID_RE,
} from '@/lib/server/qrPaymentServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  const timings = { start: performance.now() }
  const mark = (name) => { timings[name] = performance.now() }

  // In development, report precise phases without logging customer data.
  // In production, set DD_QR_TIMING=1 temporarily to enable diagnostics.
  const finish = (response) => {
    if (process.env.NODE_ENV !== 'production' || process.env.DD_QR_TIMING === '1') {
      const now = performance.now()
      const duration = (from, to) =>
        timings[from] != null && timings[to] != null
          ? Math.round((timings[to] - timings[from]) * 10) / 10
          : null

      const phases = {
        parseMs: duration('start', 'parsed'),
        restaurantMs: duration('parsed', 'restaurant'),
        accessChecksMs: duration('restaurant', 'access'),
        cartAndQrMs: duration('access', 'verified'),
        createOrderMs: duration('verified', 'created'),
      }
      const totalMs = Math.round((now - timings.start) * 10) / 10

      console.info('[DD QR COUNTER PERFORMANCE]', {
        status: response.status,
        totalMs,
        ...phases,
      })

      const serverTiming = [
        `total;dur=${totalMs}`,
        ...Object.entries(phases)
          .filter(([, value]) => value != null)
          .map(([key, value]) => `${key.replace(/Ms$/, '')};dur=${value}`),
      ].join(', ')
      response.headers.set('Server-Timing', serverTiming)
    }
    return response
  }

  try {
    const payload = await request.json().catch(() => ({}))
    const restaurantId = String(payload.restaurantId || '').trim()
    qrAssert(QR_ID_RE.test(restaurantId), 'INVALID_RESTAURANT', 'Invalid restaurant ID.')

    const name = String(payload.customerName || '').trim()
    const mobile = String(payload.customerMobile || '').trim()
    const tableNumber = String(payload.tableNumber || '1').trim()
    const orderType = String(payload.orderType || '').trim().toLowerCase()

    qrAssert(
      name.length >= 1 && name.length <= 100 && /^\d{10}$/.test(mobile),
      'INVALID_CUSTOMER',
      'Enter your name and a valid 10-digit mobile number.'
    )
    qrAssert(
      tableNumber.length > 0 && tableNumber.length <= 50,
      'INVALID_TABLE',
      'Invalid table number.'
    )
    qrAssert(
      ['dine-in', 'parcel'].includes(orderType),
      'INVALID_CART',
      'Select dine-in or takeaway.'
    )
    mark('parsed')

    const admin = qrAdmin()
    const { data: restaurant, error: restaurantError } = await admin
      .from('restaurants')
      .select('id,name,is_open,approval_status,sgst_rate,cgst_rate,packing_charge')
      .eq('id', restaurantId)
      .maybeSingle()

    if (restaurantError) throw restaurantError
    qrAssert(
      restaurant?.approval_status === 'approved' && restaurant?.is_open === true,
      'RESTAURANT_UNAVAILABLE',
      'Restaurant is not accepting orders now.'
    )
    mark('restaurant')

    // Independent, read-only requests. The wallet and feature checks are
    // still mandatory; a failure cannot create an order.
    const [walletEligible, featureResult] = await Promise.all([
      qrEligible(admin, restaurantId),
      admin
        .from('tenant_feature_controls')
        .select(
          'restaurant_enabled,qr_menu_enabled,pay_at_counter_enabled,' +
          'dine_in_enabled,takeaway_enabled,gst_enabled,offers_enabled'
        )
        .eq('restaurant_id', restaurantId)
        .maybeSingle(),
    ])

    if (!walletEligible) {
      return finish(qrError(
        'Restaurant wallet balance is below the order threshold.',
        409,
        'WALLET_LOW_BALANCE'
      ))
    }

    const { data: feature, error: featureError } = featureResult
    if (featureError) throw featureError
    qrAssert(
      feature?.restaurant_enabled !== false &&
      feature?.qr_menu_enabled !== false &&
      feature?.pay_at_counter_enabled !== false &&
      (orderType === 'dine-in'
        ? feature?.dine_in_enabled !== false
        : feature?.takeaway_enabled !== false),
      'FEATURE_DISABLED',
      'Pay at Counter is not available for this restaurant.'
    )

    if (
      feature?.offers_enabled === false &&
      Array.isArray(payload.items) &&
      payload.items.some((item) => item?.is_daily_offer === true)
    ) {
      return finish(qrError(
        'Offers are disabled for this restaurant.',
        403,
        'FEATURE_DISABLED'
      ))
    }
    mark('access')

    // These are independent reads/validations. Signed table QR, location
    // policy, server-side menu pricing and fee rollout are ALL still checked.
    const [, cart, fee] = await Promise.all([
      assertDineInCheckout(admin, restaurantId, tableNumber, payload),
      qrBuildVerifiedCart(admin, restaurantId, payload.items),
      qrRestaurantCustomerFee(admin, restaurantId),
    ])
    mark('verified')

    const { snapshot, subtotalPaise } = cart
    const subtotal = qrRupees(subtotalPaise / 100)
    const gstRate = feature?.gst_enabled === false
      ? 0
      : Number(restaurant.sgst_rate ?? 2.5) + Number(restaurant.cgst_rate ?? 2.5)

    qrAssert(
      Number.isFinite(gstRate) && gstRate >= 0 && gstRate <= 100,
      'INVALID_ITEM_PRICE',
      'Restaurant GST settings are invalid.'
    )

    // Match the existing QR menu: GST rounded to the nearest rupee.
    const tax = Math.round(subtotal * gstRate / 100)
    const packing = orderType === 'parcel'
      ? Number(restaurant.packing_charge ?? 20)
      : 0

    qrAssert(
      Number.isFinite(packing) && packing >= 0 && packing <= 10000,
      'INVALID_ITEM_PRICE',
      'Restaurant packing settings are invalid.'
    )

    const finalPacking = qrRupees(packing)
    const total = qrRupees(subtotal + tax + finalPacking + fee.customerAmount)
    qrAssert(
      Number.isFinite(total) && total >= 0 && total <= 1000000,
      'INVALID_ITEM_PRICE',
      'Invalid order total.'
    )

    // The server remains authoritative for every rupee, including ERP fees.
    const clientTotal = Number(payload.totalAmount)
    qrAssert(
      Number.isFinite(clientTotal) && Math.abs(clientTotal - total) < 0.011,
      'PRICE_CHANGED',
      'Your order total changed. Please review and retry checkout.'
    )

    // Keep this RPC awaited and atomic: do NOT fire-and-forget order creation.
    const { data, error } = await admin.rpc('qr_create_counter_order_server', {
      p_restaurant_id: restaurantId,
      p_table_number: tableNumber,
      p_customer_name: name,
      p_customer_mobile: mobile,
      p_items: snapshot,
      p_subtotal: subtotal,
      p_tax_amount: tax,
      p_packing_fee: finalPacking,
      p_total_amount: total,
      p_order_type: orderType,
      p_customer_platform_fee: fee.customerAmount,
    })
    mark('created')

    if (error) {
      const isQuoteChange = /RESTAURANT_PLATFORM_FEE_QUOTE_CHANGED|QR_COUNTER_TOTAL_MISMATCH/
        .test(error.message || '')
      if (isQuoteChange) {
        return finish(qrError(
          'The restaurant platform fee changed. Review the bill and retry.',
          409,
          'PRICE_CHANGED'
        ))
      }
      if (/RESTAURANT_WALLET_LOW_BALANCE|WALLET_NOT_CONFIGURED|STORE_NOT_APPROVED/
        .test(error.message || '')) {
        return finish(qrError(
          'Restaurant wallet is unable to accept new orders.',
          409,
          'WALLET_LOW_BALANCE'
        ))
      }
      throw error
    }

    qrAssert(
      data?.success === true && data?.order?.id,
      'ORDER_FAILED',
      'Unable to place the order.'
    )

    return finish(qrRespond({
      success: true,
      order: data.order,
      orderNumber: data.order_number,
      platformFeePaise: data.order.platform_fee_paise,
      platformFeeCustomerAmount: data.order.platform_fee_customer_amount,
    }))
  } catch (error) {
    if (error instanceof OrderingError) return finish(failOrdering(error))
    return finish(qrSafeError(error))
  }
}