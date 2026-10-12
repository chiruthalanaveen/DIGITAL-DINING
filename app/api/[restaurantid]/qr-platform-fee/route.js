// Destination: app/api/restaurant/qr-platform-fee/route.js
import { qrAdmin, qrRespond, qrError, qrRestaurantCustomerFee, QR_ID_RE } from '@/lib/server/qrPaymentServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const restaurantId = new URL(request.url).searchParams.get('restaurantId') || ''
    if (!QR_ID_RE.test(restaurantId)) {
      return qrError('Invalid restaurant ID.', 400, 'INVALID_RESTAURANT')
    }
    const admin = qrAdmin()
    const { data: restaurant, error } = await admin
      .from('restaurants').select('id').eq('id', restaurantId).maybeSingle()
    if (error) throw error
    if (!restaurant) return qrError('Restaurant not found.', 404, 'RESTAURANT_UNAVAILABLE')
    const fee = await qrRestaurantCustomerFee(admin, restaurantId)
    return qrRespond({ success: true, ...fee })
  } catch (error) {
    console.error('[QR FEE QUOTE]', error?.code || error?.message || error)
    return qrError('Unable to verify platform-fee settings. Please retry.', 503, 'FEE_QUOTE_UNAVAILABLE')
  }
}
