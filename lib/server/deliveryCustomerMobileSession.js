// lib/server/deliveryCustomerMobileSession.js
// Server-only validation for store-scoped mobile/PIN customer sessions.
// Never accept customer IDs or tokens from browser JSON/query parameters.
import 'server-only'
import { createHash } from 'node:crypto'

export const DELIVERY_MOBILE_SESSION_COOKIE = 'digitaldine_delivery_customer_session'
export const DELIVERY_MOBILE_SESSION_TTL = 30 * 24 * 60 * 60
const TOKEN_PATTERN = /^[a-f0-9]{64}$/i

export async function readDeliveryMobileSession(admin, request, restaurantId) {
  const rawToken = request.cookies.get(DELIVERY_MOBILE_SESSION_COOKIE)?.value || ''
  if (!TOKEN_PATTERN.test(rawToken) || !restaurantId) return null
  const tokenHash = createHash('sha256').update(rawToken).digest('hex')
  const { data: session, error: sessionError } = await admin
    .from('delivery_customer_sessions')
    .select('customer_id,restaurant_id,expires_at')
    .eq('token_hash', tokenHash)
    .eq('restaurant_id', restaurantId)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (sessionError) throw sessionError
  if (!session?.customer_id) return null
  // Verify this session's customer actually belongs to the same restaurant.
  const { data: customer, error: customerError } = await admin
    .from('delivery_customers')
    .select('id,restaurant_id,name,mobile,email')
    .eq('id', session.customer_id)
    .eq('restaurant_id', restaurantId)
    .maybeSingle()
  if (customerError) throw customerError
  if (!customer?.id) return null
  return {
    id: customer.id,
    restaurantId: customer.restaurant_id,
    name: String(customer.name || ''),
    mobile: String(customer.mobile || ''),
    email: String(customer.email || ''),
  }
}
