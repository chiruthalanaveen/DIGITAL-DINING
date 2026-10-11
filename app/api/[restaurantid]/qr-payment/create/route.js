import { qrAdmin, qrRespond, qrError, qrSafeError, qrAssert, qrEligible,
  qrGateway, qrBuildVerifiedCart, qrRupees, QR_ID_RE } from '@/lib/server/qrPaymentServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const payload = await request.json().catch(() => ({}))
    const restaurantId = String(payload.restaurantId || '').trim()
    qrAssert(QR_ID_RE.test(restaurantId), 'INVALID_RESTAURANT', 'Invalid restaurant ID.')
    const name = String(payload.customerName || '').trim()
    const mobile = String(payload.customerMobile || '').trim()
    const tableNumber = String(payload.tableNumber || '1').trim()
    const orderType = String(payload.orderType || '').trim().toLowerCase()
    qrAssert(name.length >= 1 && name.length <= 100 && /^\d{10}$/.test(mobile),
      'INVALID_CUSTOMER', 'Enter your name and a valid 10-digit mobile number.')
    qrAssert(tableNumber.length > 0 && tableNumber.length <= 50,
      'INVALID_TABLE', 'Invalid table number.')
    qrAssert(['dine-in','parcel'].includes(orderType),
      'INVALID_CART', 'Select dine-in or takeaway.')

    const admin = qrAdmin()
    const { data: restaurant, error: restaurantError } = await admin
      .from('restaurants')
      .select('id,name,is_open,approval_status,sgst_rate,cgst_rate,packing_charge')
      .eq('id', restaurantId).maybeSingle()
    if (restaurantError) throw restaurantError
    qrAssert(restaurant?.approval_status === 'approved' && restaurant?.is_open === true,
      'RESTAURANT_UNAVAILABLE', 'Restaurant is not accepting orders now.')

    if (!(await qrEligible(admin, restaurantId))) {
      return qrError('This restaurant is temporarily unable to accept new orders.',
        409, 'WALLET_LOW_BALANCE')
    }

    const { data: feature, error: featureError } = await admin
      .from('tenant_feature_controls')
      .select('restaurant_enabled,qr_menu_enabled,restaurant_razorpay_enabled,dine_in_enabled,takeaway_enabled,gst_enabled,offers_enabled')
      .eq('restaurant_id', restaurantId).maybeSingle()
    if (featureError) throw featureError
    qrAssert(feature?.restaurant_enabled !== false && feature?.qr_menu_enabled !== false &&
      feature?.restaurant_razorpay_enabled !== false &&
      (orderType === 'dine-in' ? feature?.dine_in_enabled !== false : feature?.takeaway_enabled !== false),
      'FEATURE_DISABLED', 'Online ordering is disabled for this restaurant.')

    if (feature?.offers_enabled === false && Array.isArray(payload.items) &&
        payload.items.some((item) => item?.is_daily_offer === true)) {
      return qrError('Offers are disabled for this restaurant.', 403, 'FEATURE_DISABLED')
    }
    const { snapshot, subtotalPaise } = await qrBuildVerifiedCart(admin, restaurantId, payload.items)
    const subtotal = qrRupees(subtotalPaise / 100)
    const gstRate = feature?.gst_enabled === false ? 0 :
      Number(restaurant.sgst_rate ?? 2.5) + Number(restaurant.cgst_rate ?? 2.5)
    qrAssert(Number.isFinite(gstRate) && gstRate >= 0 && gstRate <= 100,
      'INVALID_ITEM_PRICE', 'Restaurant tax settings are invalid.')
    // Match the current QR menu: Math.round GST in rupees, not fractional paise.
    const tax = Math.round((subtotal * gstRate) / 100)
    const packing = orderType === 'parcel' ? Number(restaurant.packing_charge ?? 20) : 0
    qrAssert(Number.isFinite(packing) && packing >= 0 && packing <= 10000,
      'INVALID_ITEM_PRICE', 'Restaurant packing settings are invalid.')
    const finalPacking = qrRupees(packing)
    const total = qrRupees(subtotal + tax + finalPacking)
    const amountPaise = Math.round(total * 100)
    qrAssert(Number.isSafeInteger(amountPaise) && amountPaise >= 100 && amountPaise <= 100_000_000,
      'INVALID_ITEM_PRICE', 'The order total is invalid or below ₹1.')

    // Do not trust a client-supplied price, tax, subtotal or payment status.
    const clientTotal = Number(payload.totalAmount)
    qrAssert(Number.isFinite(clientTotal) && Math.abs(clientTotal - total) < 0.011,
      'PRICE_CHANGED', 'Your order total changed. Refresh the menu and try again.')

    const gateway = await qrGateway(admin, restaurant)
    const intentRecord = {
      restaurant_id: restaurantId,
      key_id: gateway.keyId,
      amount_paise: amountPaise,
      subtotal_rupees: subtotal,
      tax_rupees: tax,
      packing_rupees: finalPacking,
      total_rupees: total,
      customer_name: name,
      customer_mobile: mobile,
      table_number: tableNumber,
      order_type: orderType,
      items: snapshot,
      status: 'initialized',
    }
    const { data: intent, error: intentError } = await admin
      .from('qr_payment_intents')
      .insert(intentRecord).select('id').single()
    if (intentError) throw intentError

    let providerOrder
    try {
      providerOrder = await gateway.razorpay.orders.create({
        amount: amountPaise,
        currency: 'INR',
        receipt: `qr_${intent.id}`,
        notes: { module: 'restaurant_qr', intent_id: intent.id, restaurant_id: restaurantId },
      })
      if (!providerOrder?.id || Number(providerOrder.amount) !== amountPaise) {
        throw new Error('Razorpay returned an invalid order.')
      }
    } catch (providerError) {
      await admin.from('qr_payment_intents')
        .update({ status: 'failed', last_error: 'Unable to create Razorpay order', updated_at: new Date().toISOString() })
        .eq('id', intent.id)
      console.error('[QR PAYMENT CREATE] Razorpay order creation failed:', providerError?.message)
      return qrError('Unable to start Razorpay checkout. Please try again.', 503, 'RAZORPAY_ORDER_FAILED')
    }

    const { error: saveError } = await admin.from('qr_payment_intents')
      .update({ razorpay_order_id: providerOrder.id, status: 'checkout_ready',
        updated_at: new Date().toISOString() })
      .eq('id', intent.id).eq('status', 'initialized')
    if (saveError) throw saveError

    return qrRespond({
      success: true,
      intentId: intent.id,
      keyId: gateway.keyId,
      razorpayOrderId: providerOrder.id,
      amountPaise,
      currency: 'INR',
    })
  } catch (error) {
    return qrSafeError(error)
  }
}