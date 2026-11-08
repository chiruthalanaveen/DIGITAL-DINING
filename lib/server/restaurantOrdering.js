import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const RESTAURANT_PLANS = new Set(['restaurant_pro', 'restaurant_standard', 'restaurant_resort_pro', 'restaurant_resort_standard', 'restaurant_delivery', 'restaurant_resort_delivery'])
const DELIVERY_PLANS = new Set(['delivery', 'restaurant_delivery', 'restaurant_resort_delivery'])
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class OrderingError extends Error {
  constructor(code, message, status = 403) {
    super(message)
    this.code = code
    this.httpStatus = status
  }
}
export function failOrdering(error) {
  if (error instanceof OrderingError) {
    return Response.json({ success: false, code: error.code, message: error.message }, { status: error.httpStatus, headers: { 'Cache-Control': 'no-store' } })
  }
  console.error('[RESTAURANT ORDERING]', error?.code || error?.message || 'unknown')
  return Response.json({ success: false, code: 'ORDERING_UNAVAILABLE', message: 'Ordering verification is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
}
export async function getOrderingPolicy(admin, restaurantId) {
  const { data, error } = await admin.from('restaurant_ordering_policies').select('*').eq('restaurant_id', restaurantId).maybeSingle()
  if (error) throw error
  return data || {
    restaurant_id: restaurantId, geofence_enabled: false,
    signed_table_qr_required: false, home_delivery_entry_enabled: false,
    radius_m: 40, max_accuracy_m: 50, estimated_prep_minutes: 20, origin_latitude: null, origin_longitude: null,
  }
}
export async function getOrderingCapabilities(admin, restaurantId) {
  if (!UUID.test(restaurantId)) throw new OrderingError('INVALID_RESTAURANT', 'Invalid restaurant ID.', 400)
  const [{ data: restaurant, error: re }, { data: features, error: fe }, policy] = await Promise.all([
    admin.from('restaurants').select('id,name,restaurant_code,plan_code,approval_status,is_open').eq('id', restaurantId).maybeSingle(),
    admin.from('tenant_feature_controls').select('restaurant_enabled,qr_menu_enabled,dine_in_enabled,takeaway_enabled,delivery_enabled,delivery_customer_ordering_enabled,owner_delivery_management_enabled,manager_delivery_management_enabled').eq('restaurant_id', restaurantId).maybeSingle(),
    getOrderingPolicy(admin, restaurantId),
  ])
  if (re || fe) throw re || fe
  if (!restaurant || restaurant.approval_status !== 'approved') throw new OrderingError('RESTAURANT_UNAVAILABLE', 'Restaurant is not approved.', 403)
  const restaurantPlan = RESTAURANT_PLANS.has(String(restaurant.plan_code || 'restaurant_pro'))
  const deliveryPlan = DELIVERY_PLANS.has(String(restaurant.plan_code || 'restaurant_pro'))
  const restaurantEnabled = restaurantPlan && features?.restaurant_enabled !== false && features?.qr_menu_enabled !== false
  const deliveryEnabled = deliveryPlan && features?.delivery_enabled !== false && features?.delivery_customer_ordering_enabled !== false
  return {
    restaurant, policy, features,
    restaurantEnabled,
    deliveryEnabled,
    dineInEnabled: restaurantEnabled && features?.dine_in_enabled !== false,
    takeawayEnabled: restaurantEnabled && features?.takeaway_enabled !== false,
    homeDeliveryAvailable: deliveryEnabled && policy.home_delivery_entry_enabled === true,
  }
}
function radians(value) { return value * Math.PI / 180 }
export function distanceMeters(lat1, lon1, lat2, lon2) {
  const a = Math.sin(radians(lat2 - lat1) / 2) ** 2 +
    Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lon2 - lon1) / 2) ** 2
  return 6371008.8 * 2 * Math.asin(Math.min(1, Math.sqrt(a)))
}
function qrSecret() {
  const secret = String(process.env.DINE_IN_QR_SIGNING_SECRET || '')
  if (Buffer.byteLength(secret, 'utf8') < 32) throw new OrderingError('QR_NOT_CONFIGURED', 'Secure table QR is not configured.', 503)
  return secret
}
function sign(payload) { return createHmac('sha256', qrSecret()).update(payload).digest('base64url') }
export function issueTableToken(restaurantId, tableLabel) {
  const payload = Buffer.from(JSON.stringify({ v: 1, rid: restaurantId, table: tableLabel,
    exp: Math.floor(Date.now() / 1000) + 600, nonce: randomBytes(12).toString('hex') })).toString('base64url')
  return `${payload}.${sign(payload)}`
}
export function verifyTableToken(token, restaurantId, tableLabel) {
  if (typeof token !== 'string' || token.length > 1000) return false
  const parts = token.split('.')
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return false
  const expected = Buffer.from(sign(parts[0]), 'utf8')
  const supplied = Buffer.from(parts[1], 'utf8')
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false
  let value
  try { value = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) } catch { return false }
  const now = Math.floor(Date.now() / 1000)
  return value?.v === 1 && value?.rid === restaurantId && value?.table === tableLabel &&
    Number.isInteger(value.exp) && value.exp > now && value.exp <= now + 610 &&
    /^[0-9a-f]{24}$/.test(value.nonce || '')
}
// Called by BOTH QR counter and Razorpay-intent creation. Never store raw GPS.
export async function assertDineInCheckout(admin, restaurantId, tableNumber, body) {
  const mode = String(body?.orderType || '').toLowerCase()
  const capabilities = await getOrderingCapabilities(admin, restaurantId)
  if (!capabilities.restaurantEnabled || (mode === 'dine-in' && !capabilities.dineInEnabled) ||
      (mode === 'parcel' && !capabilities.takeawayEnabled)) {
    throw new OrderingError('RESTAURANT_MODE_DISABLED', 'This order type is not included in the restaurant plan or feature controls.', 403)
  }
  if (mode !== 'dine-in') return
  const policy = capabilities.policy
  if (!policy.geofence_enabled && !policy.signed_table_qr_required) return // legacy tenant, until Super Admin enables policy
  if (!policy.geofence_enabled || policy.origin_latitude == null || policy.origin_longitude == null) {
    throw new OrderingError('DINE_IN_NOT_CONFIGURED', 'Dine-In location verification is not configured.', 503)
  }
  const { latitude, longitude, locationAccuracy, locationTimestamp } = body || {}
  if ([latitude, longitude, locationAccuracy, locationTimestamp].some(v => v === null || v === undefined || v === '')) {
    throw new OrderingError('DINE_IN_LOCATION_REQUIRED', 'Enable precise location and retry, or ask restaurant staff for assistance.', 403)
  }
  const lat = Number(latitude), lng = Number(longitude), accuracy = Number(locationAccuracy), timestamp = Number(locationTimestamp)
  if (![lat, lng, accuracy, timestamp].every(Number.isFinite) || lat < -90 || lat > 90 || lng < -180 || lng > 180 || accuracy < 0 ||
      accuracy > Number(policy.max_accuracy_m) || timestamp > Date.now() + 3000 || Date.now() - timestamp > 20000) {
    throw new OrderingError('DINE_IN_LOCATION_UNCERTAIN', 'A fresh accurate location is required. Retry GPS or ask staff for assistance.', 403)
  }
  const meters = distanceMeters(lat, lng, Number(policy.origin_latitude), Number(policy.origin_longitude))
  // Conservative: the whole reported accuracy circle must fit in the radius.
  if (meters + accuracy > Number(policy.radius_m)) {
    throw new OrderingError('DINE_IN_OUTSIDE', 'Dine-In is only available inside the restaurant. Choose Home Delivery or Takeaway.', 403)
  }
  if (policy.signed_table_qr_required) {
    if (!verifyTableToken(body?.tableQrToken, restaurantId, tableNumber)) {
      throw new OrderingError('TABLE_QR_REQUIRED', 'Scan the current signed QR code for your table.', 403)
    }
    const { data: table, error } = await admin.from('restaurant_ordering_tables').select('enabled')
      .eq('restaurant_id', restaurantId).eq('table_label', tableNumber).maybeSingle()
    if (error) throw error
    if (table?.enabled !== true) throw new OrderingError('TABLE_UNAVAILABLE', 'This table is not available for ordering.', 403)
  }
}
