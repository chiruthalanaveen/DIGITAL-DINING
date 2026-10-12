// Destination: app/api/restaurant/qr-counter-order/route.js
// Browser submits items and displayed total; server verifies all prices,
// ERP customer fee, GST, wallet/order eligibility and feature permissions.
// The privileged SQL RPC is granted ONLY to service_role.
import { qrAdmin, qrRespond, qrError, qrSafeError, qrAssert,
  qrEligible, qrBuildVerifiedCart, qrRupees,
  qrRestaurantCustomerFee, QR_ID_RE } from '@/lib/server/qrPaymentServer'

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
    qrAssert(['dine-in', 'parcel'].includes(orderType), 'INVALID_CART',
      'Select dine-in or takeaway.')

    const admin = qrAdmin()
    const { data: restaurant, error: restaurantError } = await admin
      .from('restaurants')
      .select('id,name,is_open,approval_status,sgst_rate,cgst_rate,packing_charge')
      .eq('id', restaurantId).maybeSingle()
    if (restaurantError) throw restaurantError
    qrAssert(restaurant?.approval_status === 'approved' && restaurant?.is_open === true,
      'RESTAURANT_UNAVAILABLE', 'Restaurant is not accepting orders now.')
    if (!(await qrEligible(admin, restaurantId))) {
      return qrError('Restaurant wallet balance is below the order threshold.',
        409, 'WALLET_LOW_BALANCE')
    }
    const { data: feature, error: featureError } = await admin
      .from('tenant_feature_controls')
      .select('restaurant_enabled,qr_menu_enabled,pay_at_counter_enabled,dine_in_enabled,takeaway_enabled,gst_enabled,offers_enabled')
      .eq('restaurant_id', restaurantId).maybeSingle()
    if (featureError) throw featureError
    qrAssert(feature?.restaurant_enabled !== false && feature?.qr_menu_enabled !== false &&
      feature?.pay_at_counter_enabled !== false &&
      (orderType === 'dine-in' ? feature?.dine_in_enabled !== false : feature?.takeaway_enabled !== false),
      'FEATURE_DISABLED', 'Pay at Counter is not available for this restaurant.')

    if (feature?.offers_enabled === false && Array.isArray(payload.items) &&
      payload.items.some(item => item?.is_daily_offer === true)) {
      return qrError('Offers are disabled for this restaurant.', 403, 'FEATURE_DISABLED')
    }

    const { snapshot, subtotalPaise } = await qrBuildVerifiedCart(admin, restaurantId, payload.items)
    const subtotal = qrRupees(subtotalPaise / 100)
    const gstRate = feature?.gst_enabled === false ? 0 :
      Number(restaurant.sgst_rate ?? 2.5) + Number(restaurant.cgst_rate ?? 2.5)
    qrAssert(Number.isFinite(gstRate) && gstRate >= 0 && gstRate <= 100,
      'INVALID_ITEM_PRICE', 'Restaurant GST settings are invalid.')
    // Match original QR menu: GST rounded to the nearest rupee.
    const tax = Math.round(subtotal * gstRate / 100)
    const packing = orderType === 'parcel' ? Number(restaurant.packing_charge ?? 20) : 0
    qrAssert(Number.isFinite(packing) && packing >= 0 && packing <= 10000,
      'INVALID_ITEM_PRICE', 'Restaurant packing settings are invalid.')
    const finalPacking = qrRupees(packing)
    const fee = await qrRestaurantCustomerFee(admin, restaurantId)
    const total = qrRupees(subtotal + tax + finalPacking + fee.customerAmount)
    qrAssert(Number.isFinite(total) && total >= 0 && total <= 1000000,
      'INVALID_ITEM_PRICE', 'Invalid order total.')
    const clientTotal = Number(payload.totalAmount)
    qrAssert(Number.isFinite(clientTotal) && Math.abs(clientTotal - total) < 0.011,
      'PRICE_CHANGED', 'Your order total changed. Please review and retry checkout.')

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
    if (error) {
      const isQuoteChange = /RESTAURANT_PLATFORM_FEE_QUOTE_CHANGED|QR_COUNTER_TOTAL_MISMATCH/.test(error.message || '')
      if (isQuoteChange) return qrError('The restaurant platform fee changed. Review the bill and retry.', 409, 'PRICE_CHANGED')
      if (/RESTAURANT_WALLET_LOW_BALANCE|WALLET_NOT_CONFIGURED|STORE_NOT_APPROVED/.test(error.message || '')) {
        return qrError('Restaurant wallet is unable to accept new orders.', 409, 'WALLET_LOW_BALANCE')
      }
      throw error
    }
    qrAssert(data?.success === true && data?.order?.id, 'ORDER_FAILED',
      'Unable to place the order.')
    return qrRespond({ success: true, order: data.order,
      orderNumber: data.order_number,
      platformFeePaise: data.order.platform_fee_paise,
      platformFeeCustomerAmount: data.order.platform_fee_customer_amount })
  } catch (error) {
    return qrSafeError(error)
  }
}
