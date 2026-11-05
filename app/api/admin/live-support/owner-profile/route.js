import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ACTIVE_RESTAURANT = ['received', 'confirmed', 'preparing', 'ready', 'pending', 'in_progress']
const ACTIVE_DELIVERY = ['received', 'confirmed', 'preparing', 'packed', 'out_for_delivery']
const ACTIVE_RESORT = ['pending', 'confirmed', 'checked_in']

const respond = (payload, status = 200) => NextResponse.json(payload, {
  status,
  headers: { 'Cache-Control': 'private, no-store, max-age=0' },
})

const text = (value, max = 160) => String(value ?? '').trim().slice(0, max)

function profileName(user, restaurant) {
  const metadata = user?.user_metadata || {}
  return text(metadata.full_name || metadata.name || metadata.display_name ||
    restaurant.owner_name || restaurant.contact_name || user?.email || 'Owner')
}

function readableOrder(row, module) {
  const value = row.total_amount ?? row.grand_total ?? row.total ?? null
  const amount = value == null ? null : Number(value)
  return {
    id: text(row.id, 80),
    code: text(row.order_code || row.booking_code || row.order_number || row.order_id || row.id, 100),
    module,
    status: text(row.order_status || row.booking_status || row.status || 'Unknown', 80),
    paymentStatus: text(row.payment_status || '', 80),
    customer: text(row.guest_name || row.customer_name || '', 120),
    total: Number.isFinite(amount) ? amount : null,
    createdAt: row.created_at || row.booked_at || null,
    checkIn: module === 'resort' ? row.check_in || null : null,
    checkOut: module === 'resort' ? row.check_out || null : null,
  }
}

async function moduleReport(admin, restaurantId, { table, statusColumn, active, module }) {
  const base = () => admin.from(table).select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId)
  const [totalResult, activeResult, latestResult] = await Promise.all([
    base(),
    admin.from(table).select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId).in(statusColumn, active),
    admin.from(table).select('*').eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false }).limit(12),
  ])
  // Report unavailable values explicitly rather than silently presenting zeroes.
  if (totalResult.error) throw totalResult.error
  if (activeResult.error) throw activeResult.error
  if (latestResult.error) throw latestResult.error
  return {
    module,
    total: totalResult.count,
    active: activeResult.count,
    recent: (latestResult.data || []).map(row => readableOrder(row, module)),
  }
}

export async function GET(request) {
  // Admin-only resource. No service-role queries occur for unauthenticated calls.
  const actor = requireAdmin(request)
  if (!actor) return respond({ success: false, message: 'Admin authentication required.' }, 401)

  const url = new URL(request.url)
  const restaurantId = text(url.searchParams.get('restaurantId'), 90)
  if (!UUID.test(restaurantId)) return respond({ success: false, message: 'Valid business ID required.' }, 400)

  try {
    const admin = getAdminSupabase()
    const lookup = await admin.from('restaurants').select('*').eq('id', restaurantId).maybeSingle()
    if (lookup.error) throw lookup.error
    if (!lookup.data) return respond({ success: false, message: 'Business not found.' }, 404)

    const restaurant = lookup.data
    const ownerId = String(restaurant.owner_id || restaurant.id || '').trim()
    let ownerUser = null
    let ownerWarning = ''
    if (UUID.test(ownerId)) {
      const auth = await admin.auth.admin.getUserById(ownerId)
      if (auth.error) ownerWarning = 'Owner Auth profile is unavailable.'
      else ownerUser = auth.data?.user || null
    }

    const configs = [
      { module: 'restaurant', table: 'orders', statusColumn: 'status', active: ACTIVE_RESTAURANT },
      { module: 'delivery', table: 'delivery_orders', statusColumn: 'order_status', active: ACTIVE_DELIVERY },
      { module: 'resort', table: 'room_bookings', statusColumn: 'booking_status', active: ACTIVE_RESORT },
    ]
    const outcomes = await Promise.allSettled(
      configs.map(config => moduleReport(admin, restaurantId, config))
    )
    const moduleReports = {}
    const warnings = ownerWarning ? [ownerWarning] : []
    for (let i = 0; i < configs.length; i++) {
      const outcome = outcomes[i]
      const module = configs[i].module
      if (outcome.status === 'fulfilled') {
        moduleReports[module] = outcome.value
      } else {
        console.warn('[SUPPORT OWNER PROFILE METRIC]', module, outcome.reason?.code || outcome.reason?.message)
        moduleReports[module] = { module, total: null, active: null, recent: [] }
        warnings.push(`${module} order statistics unavailable.`)
      }
    }

    const fullName = profileName(ownerUser, restaurant)
    return respond({
      success: true,
      owner: {
        id: ownerId,
        name: fullName,
        email: text(ownerUser?.email || restaurant.email, 180),
        phone: text(restaurant.phone || ownerUser?.phone || ownerUser?.user_metadata?.phone, 40),
        registeredAt: ownerUser?.created_at || restaurant.created_at || null,
        lastLoginAt: ownerUser?.last_sign_in_at || null,
      },
      business: {
        id: text(restaurant.id, 90),
        name: text(restaurant.name, 180),
        code: text(restaurant.restaurant_code, 35),
        type: text(restaurant.business_type || '', 60),
        address: text(restaurant.address || '', 400),
        city: text(restaurant.city || '', 80),
        state: text(restaurant.state || '', 80),
        plan: text(restaurant.plan_code || restaurant.plan || '', 90),
        approval: text(restaurant.approval_status || '', 40),
        subscription: text(restaurant.subscription_status || '', 40),
        createdAt: restaurant.created_at || null,
        deliveryEnabled: Boolean(restaurant.delivery_enabled),
        resortEnabled: Boolean(restaurant.resort_enabled),
      },
      modules: moduleReports,
      // A count is exact for each table. Status "active" is defined by statuses above.
      // Null means not available; do not turn it into a fake zero.
      counts: {
        all: Object.values(moduleReports).every(item => item.total != null)
          ? Object.values(moduleReports).reduce((s, row) => s + row.total, 0) : null,
        active: Object.values(moduleReports).every(item => item.active != null)
          ? Object.values(moduleReports).reduce((s, row) => s + row.active, 0) : null,
      },
      warnings,
    })
  } catch (error) {
    console.error('[SUPPORT OWNER PROFILE]', error.code || '', error.message || error)
    return respond({ success: false, message: 'Unable to load this business profile.' }, 503)
  }
}