// STEP 18A: SECURED STAFF RESTAURANT ORDERS API
// Paste this entire TXT into: app/api/staff/restaurant-orders/route.js
//
// This is ADDITIVE. It does not change existing kitchen/waiter/manager pages.
// Existing public orders RLS policies must NOT be removed until the
// current portals have been migrated to this API or equivalent secure RPCs.
//
// Requires your existing lib/server/adminSupabase.js and Supabase RPC:
// validate_staff_app_session(p_session_token text, p_required_role text).
// Requires service_role EXECUTE on that RPC (prior manager-session fix).

import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const VALID_ROLES = new Set(['manager', 'kitchen', 'waiter'])
const RETURN_COLUMNS = [
  'id', 'restaurant_id', 'order_number', 'table_number',
  'customer_name', 'customer_mobile', 'items', 'total_amount',
  'tax_amount', 'packing_fee', 'payment_mode', 'status',
  'order_type', 'waiter_name', 'created_at',
].join(',')

function response(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store, private',
      'Vary': 'Authorization',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function fail(code, message, status = 400) {
  return response({ success: false, code, message }, status)
}

function istDayUtcBounds(date = new Date()) {
  const offset = 5.5 * 60 * 60 * 1000
  const istDate = new Date(date.getTime() + offset).toISOString().slice(0, 10)
  const start = new Date(`${istDate}T00:00:00+05:30`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start: start.toISOString(), end: end.toISOString(), istDate }
}

async function authorize(request, restaurantId) {
  if (!UUID.test(restaurantId)) {
    return { error: fail('INVALID_RESTAURANT_ID', 'A valid restaurant ID is required.', 400) }
  }

  const header = String(request.headers.get('authorization') || '')
  const bearer = /^Bearer\s+([^\s]+)$/i.exec(header)
  const token = String(bearer?.[1] || '')
  if (!token || token.length > 2048) {
    return { error: fail('STAFF_LOGIN_REQUIRED', 'Please sign in to your staff portal.', 401) }
  }

  const admin = getAdminSupabase()

  // Trust ONLY the database session RPC, not a caller-supplied role or JWT payload.
  const { data: session, error: sessionError } = await admin.rpc(
    'validate_staff_app_session',
    { p_session_token: token, p_required_role: null }
  )

  if (sessionError) {
    console.error('[SECURE STAFF ORDERS] Session validation RPC:', sessionError.code, sessionError.message)
    return { error: fail('SESSION_VALIDATION_UNAVAILABLE', 'Staff session verification is unavailable.', 503) }
  }
  if (session?.success !== true) {
    return { error: fail('STAFF_SESSION_EXPIRED', 'Please sign in again.', 401) }
  }
  const role = String(session.role || '').trim().toLowerCase()
  if (!VALID_ROLES.has(role) || String(session.restaurantId || '').toLowerCase() !== restaurantId.toLowerCase()) {
    return { error: fail('STAFF_ACCESS_DENIED', 'This staff session cannot access this restaurant.', 403) }
  }

  // The admin client can bypass RLS, so repeat the tenant approval check.
  const { data: restaurant, error: restaurantError } = await admin
    .from('restaurants')
    .select('id,approval_status')
    .eq('id', restaurantId)
    .maybeSingle()
  if (restaurantError) throw restaurantError
  if (!restaurant || restaurant.approval_status !== 'approved') {
    return { error: fail('RESTAURANT_UNAVAILABLE', 'This restaurant is not approved.', 403) }
  }

  return { admin, session, role }
}

// GET /api/staff/restaurant-orders?restaurantId=<uuid>&view=active|today|ready|recent&limit=100&offset=0
// Staff session token: Authorization: Bearer <staff_app_session_token>
export async function GET(request) {
  try {
    const url = new URL(request.url)
    const restaurantId = String(url.searchParams.get('restaurantId') || '').trim()
    const access = await authorize(request, restaurantId)
    if (access.error) return access.error

    const { admin, role } = access
    const view = String(url.searchParams.get('view') || (role === 'waiter' ? 'ready' : 'active')).trim()
    if (!['active', 'today', 'ready', 'recent'].includes(view)) {
      return fail('INVALID_VIEW', 'Unknown order view.', 400)
    }

    // A waiter should not be able to enumerate all guests' order histories.
    if (role === 'waiter' && view !== 'ready') {
      return fail('VIEW_NOT_ALLOWED', 'Waiters can view ready orders only.', 403)
    }

    const requestedLimit = Number(url.searchParams.get('limit') ?? 100)
    const requestedOffset = Number(url.searchParams.get('offset') ?? 0)
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 200 ||
        !Number.isInteger(requestedOffset) || requestedOffset < 0 || requestedOffset > 10000) {
      return fail('INVALID_PAGINATION', 'Limit must be 1–200 and offset 0–10000.', 400)
    }

    let query = admin.from('orders')
      .select(RETURN_COLUMNS)
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(requestedOffset, requestedOffset + requestedLimit)

    if (view === 'today') {
      const { start, end } = istDayUtcBounds()
      query = query.gte('created_at', start).lt('created_at', end)
    } else if (view === 'ready') {
      query = query.eq('status', 'ready')
    } else if (view === 'active') {
      query = query.not('status', 'in', '(completed,cancelled,served,delivered,delivered_by_waiter)')
    }

    const { data, error } = await query
    if (error) throw error

    const orders = Array.isArray(data) ? data : []
    return response({
      success: true,
      restaurantId,
      role,
      view,
      orders: orders.slice(0, requestedLimit),
      hasMore: orders.length > requestedLimit,
      nextOffset: orders.length > requestedLimit ? requestedOffset + requestedLimit : null,
    })
  } catch (error) {
    console.error('[SECURE STAFF ORDERS GET]', error?.code, error?.message)
    return fail('ORDERS_LOAD_FAILED', 'Unable to load restaurant orders.', 500)
  }
}

// PATCH /api/staff/restaurant-orders
// body: { restaurantId: <uuid>, orderId: <uuid>, newStatus: 'preparing' | 'ready' | 'completed' | ... }
// Never accepts changes to totals, payment status, line items, guest data or tenant ID.
export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return fail('INVALID_BODY', 'A JSON request is required.', 400)
    }

    const restaurantId = String(body.restaurantId || '').trim()
    const orderId = String(body.orderId || '').trim()
    const newStatus = String(body.newStatus || '').trim().toLowerCase()
    if (!UUID.test(orderId)) {
      return fail('INVALID_ORDER_ID', 'A valid order ID is required.', 400)
    }

    const access = await authorize(request, restaurantId)
    if (access.error) return access.error
    const { admin, role, session } = access

    // Staff may change operational statuses only. Paid/not-paid is a payment
    // fact that can only be changed by a verified payment flow.
    const managerStatuses = new Set(['pending', 'preparing', 'ready', 'completed', 'cancelled'])
    const kitchenStatuses = new Set(['preparing', 'ready'])
    if (role === 'waiter' ? newStatus !== 'completed' :
        role === 'kitchen' ? !kitchenStatuses.has(newStatus) :
        !managerStatuses.has(newStatus)) {
      return fail('STATUS_NOT_ALLOWED', 'Your role cannot set that order status.', 403)
    }

    const { data: current, error: getError } = await admin
      .from('orders')
      .select('id,restaurant_id,status,waiter_name')
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle()
    if (getError) throw getError
    if (!current) return fail('ORDER_NOT_FOUND', 'Order not found for this restaurant.', 404)

    const oldStatus = String(current.status || '').trim().toLowerCase()
    const finalStatuses = new Set(['completed', 'cancelled', 'served', 'delivered', 'delivered_by_waiter'])
    if (finalStatuses.has(oldStatus)) {
      return fail('ORDER_ALREADY_CLOSED', 'This order is already closed.', 409)
    }
    if (role === 'waiter' && oldStatus !== 'ready') {
      return fail('ORDER_NOT_READY', 'The waiter can complete ready orders only.', 409)
    }
    if (role === 'kitchen') {
      const kitchenTransitionAllowed =
        (newStatus === 'preparing' && ['pending', 'paid', 'received', 'ready'].includes(oldStatus)) ||
        (newStatus === 'ready' && oldStatus === 'preparing')
      if (!kitchenTransitionAllowed) {
        return fail('INVALID_KITCHEN_TRANSITION', 'This kitchen status change is not allowed.', 409)
      }
    }

    const updates = { status: newStatus }
    if (role === 'waiter') {
      const userId = String(session.userId || '').trim()
      const { data: staff, error: staffError } = await admin
        .from('staff_users')
        .select('name')
        .eq('restaurant_id', restaurantId)
        .eq('role', 'waiter')
        .eq('user_id', userId)
        .maybeSingle()
      if (staffError) throw staffError
      if (!staff) return fail('STAFF_NOT_FOUND', 'Waiter profile not found.', 403)
      updates.waiter_name = String(staff.name || userId).slice(0, 120)
    }

    // Compare original status to avoid overwriting a simultaneous status update.
    let query = admin.from('orders')
      .update(updates)
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)
    query = oldStatus ? query.eq('status', current.status) : query.is('status', null)

    const { data: updated, error: updateError } = await query
      .select(RETURN_COLUMNS)
      .maybeSingle()
    if (updateError) throw updateError
    if (!updated) {
      return fail('ORDER_CHANGED', 'The order changed. Refresh and try again.', 409)
    }

    return response({ success: true, order: updated, role })
  } catch (error) {
    console.error('[SECURE STAFF ORDERS PATCH]', error?.code, error?.message)
    return fail('ORDER_UPDATE_FAILED', 'Unable to update order status.', 500)
  }
}
