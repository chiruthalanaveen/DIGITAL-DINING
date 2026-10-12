// STEP 21 - Secure owner order/report API.
// Install at app/api/owner/restaurant-orders/route.js
// Requires the Step21_01_Secure_Owner_Orders_RPC_SQL.txt migration.
// Uses Supabase user JWT + owner-scoped SECURITY DEFINER RPCs.
// No service-role key is needed by this API.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const STATUSES = new Set(['pending', 'received', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled', 'served', 'delivered_by_waiter'])

function respond(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store, private',
      Vary: 'Authorization',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
function fail(code, message, status = 400) {
  return respond({ success: false, code, message }, status)
}

async function ownerClient(request) {
  const authorization = request.headers.get('authorization') || ''
  const token = /^Bearer\s+([^\s]+)$/i.exec(authorization)?.[1]
  if (!token) return { failure: fail('LOGIN_REQUIRED', 'Please sign in again to load owner reports.', 401) }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    console.error('[OWNER ORDERS] Missing Supabase URL or ANON key in server environment')
    return { failure: fail('SERVER_CONFIG_MISSING', 'Owner reports are not configured on the server. Check Supabase URL and anon key.', 503) }
  }
  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user?.id) return { failure: fail('LOGIN_EXPIRED', 'Your owner session expired. Please log in again.', 401) }
  return { supabase }
}

function rpcFailure(error) {
  console.error('[OWNER ORDERS RPC]', error?.code, error?.message)
  const msg = String(error?.message || '')
  if (error?.code === 'PGRST202' || error?.code === '42883' || msg.includes('Could not find the function')) {
    return fail('RPC_NOT_INSTALLED', 'Secure owner reports SQL is not installed. Run Step 21 migration in Supabase.', 503)
  }
  if (/owner access denied|not authorized|not approved/i.test(msg)) {
    return fail('OWNER_ACCESS_DENIED', 'This account cannot access orders for the selected restaurant.', 403)
  }
  return fail('ORDERS_QUERY_FAILED', 'Unable to load restaurant reports. Check server logs and Step 21 SQL setup.', 503)
}

// GET /api/owner/restaurant-orders?restaurantId=UUID&limit=900&offset=0
export async function GET(request) {
  try {
    const url = new URL(request.url)
    const restaurantId = String(url.searchParams.get('restaurantId') || '').trim()
    if (!UUID_RE.test(restaurantId)) return fail('INVALID_RESTAURANT', 'Invalid restaurant ID.')
    const limit = Number(url.searchParams.get('limit') ?? '900')
    const offset = Number(url.searchParams.get('offset') ?? '0')
    if (!Number.isInteger(limit) || limit < 1 || limit > 900 ||
        !Number.isInteger(offset) || offset < 0 || offset > 100000) {
      return fail('INVALID_PAGINATION', 'Invalid report pagination.')
    }
    const client = await ownerClient(request)
    if (client.failure) return client.failure
    const { data, error } = await client.supabase.rpc('owner_get_restaurant_orders_secure', {
      p_restaurant_id: restaurantId,
      p_limit: limit,
      p_offset: offset,
    })
    if (error) return rpcFailure(error)
    if (!data || data.success !== true || !Array.isArray(data.orders)) {
      return fail('INVALID_RESPONSE', 'Unable to verify owner report response.', 503)
    }
    return respond({
      success: true,
      orders: data.orders,
      hasMore: Boolean(data.hasMore),
      nextOffset: data.hasMore ? offset + data.orders.length : null,
    })
  } catch (error) {
    console.error('[OWNER ORDERS GET]', error)
    return fail('ORDER_SERVICE_ERROR', 'Could not load owner reports. Try refreshing.', 503)
  }
}

// PATCH only modifies operational status, not payment information or totals.
export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('INVALID_BODY', 'Invalid request body.')
    const restaurantId = String(body.restaurantId || '').trim()
    const orderId = String(body.orderId || '').trim()
    const newStatus = String(body.newStatus || '').trim().toLowerCase()
    if (!UUID_RE.test(restaurantId) || !UUID_RE.test(orderId)) return fail('INVALID_ID', 'Invalid restaurant or order ID.')
    if (!STATUSES.has(newStatus)) return fail('INVALID_STATUS', 'Order status is not permitted.')
    const client = await ownerClient(request)
    if (client.failure) return client.failure
    const { data, error } = await client.supabase.rpc('owner_update_restaurant_order_status_secure', {
      p_restaurant_id: restaurantId,
      p_order_id: orderId,
      p_new_status: newStatus,
    })
    if (error) return rpcFailure(error)
    if (!data || data.success !== true || !data.order) return fail('UPDATE_NOT_CONFIRMED', 'Order status update was not confirmed.', 409)
    return respond({ success: true, order: data.order })
  } catch (error) {
    console.error('[OWNER ORDERS PATCH]', error)
    return fail('ORDER_UPDATE_FAILED', 'Could not update restaurant order status.', 503)
  }
}
