import { authorizeRestaurantActor } from '@/lib/server/restaurantOwnerAccess'
import { getOrderingCapabilities, failOrdering, OrderingError } from '@/lib/server/restaurantOrdering'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RESTAURANT_COLUMNS = 'id,restaurant_id,order_number,table_number,customer_name,items,total_amount,payment_mode,status,order_type,created_at'
const DELIVERY_COLUMNS = 'id,restaurant_id,order_code,order_number,customer_name,items,total_amount,payment_method,payment_status,order_status,created_at'
function restaurantMode(value) {
  const mode = String(value || '').toLowerCase()
  return mode.includes('parcel') || mode.includes('takeaway') ? 'takeaway' : 'dine-in'
}
function sanitizeRestaurant(o, role) {
  return {
    id: o.id, source: 'restaurant', mode: restaurantMode(o.order_type || o.dining_mode || o.table_number),
    number: String(o.order_number || ''), table: String(o.table_number || ''),
    customer: role === 'waiter' || role === 'kitchen' ? '' : String(o.customer_name || ''),
    items: Array.isArray(o.items) ? o.items.map(x => ({ name: String(x.name || '').slice(0,120), quantity: Number(x.quantity || x.qty || 0) })) : [],
    amount: Number(o.total_amount || 0), status: String(o.status || 'pending'),
    paymentMethod: String(o.payment_mode || ''), createdAt: o.created_at,
  }
}
function sanitizeDelivery(o) {
  return {
    id: o.id, source: 'delivery', mode: 'delivery', number: String(o.order_code || o.order_number || ''),
    table: '', customer: String(o.customer_name || ''),
    items: Array.isArray(o.items) ? o.items.map(x => ({ name: String(x.name || x.product_name || '').slice(0,120), quantity: Number(x.quantity || x.qty || 0) })) : [],
    amount: Number(o.total_amount || 0), status: String(o.order_status || 'received'),
    paymentMethod: String(o.payment_method || ''), paymentStatus: String(o.payment_status || ''),
    createdAt: o.created_at,
  }
}
export async function GET(request) {
  try {
    const url = new URL(request.url)
    const restaurantId = String(url.searchParams.get('restaurantId') || '').trim()
    const actor = await authorizeRestaurantActor(request, restaurantId)
    const c = await getOrderingCapabilities(actor.admin, restaurantId)
    if (!c.restaurantEnabled && !c.deliveryEnabled) throw new OrderingError('FEATURE_DISABLED', 'Orders are unavailable for this subscription.', 403)
    let restaurantOrders = []
    if (c.restaurantEnabled) {
      if (actor.role === 'owner') {
        const { data, error } = await actor.client.rpc('owner_get_restaurant_orders_secure', {
          p_restaurant_id: restaurantId, p_limit: 100, p_offset: 0,
        })
        if (error || data?.success !== true || !Array.isArray(data.orders)) throw new OrderingError('RESTAURANT_ORDERS_UNAVAILABLE', 'Unable to load owner restaurant orders.', 503)
        restaurantOrders = data.orders
      } else {
        let q = actor.admin.from('orders').select(RESTAURANT_COLUMNS).eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(100)
        if (actor.role === 'waiter') q = q.eq('status', 'ready')
        if (actor.role === 'kitchen') q = q.not('status', 'in', '(completed,cancelled,served,delivered,delivered_by_waiter)')
        const { data, error } = await q
        if (error) throw error
        restaurantOrders = data || []
      }
    }
    let deliveryOrders = []
    const maySeeDelivery = ['owner', 'manager'].includes(actor.role) && c.deliveryEnabled &&
      (actor.role === 'owner' ? c.features?.owner_delivery_management_enabled !== false : c.features?.manager_delivery_management_enabled !== false)
    if (maySeeDelivery) {
      const { data, error } = await actor.admin.from('delivery_orders').select(DELIVERY_COLUMNS)
        .eq('restaurant_id', restaurantId)
        .or('payment_method.eq.cod,payment_status.eq.paid')
        .order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      deliveryOrders = data || []
    }
    const orders = [
      ...restaurantOrders.map(o => sanitizeRestaurant(o, actor.role)),
      ...deliveryOrders.map(sanitizeDelivery),
    ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    const report = Object.fromEntries(['dine-in', 'takeaway', 'delivery'].map(mode => {
      const list = orders.filter(o => o.mode === mode)
      return [mode, { count: list.length, orderValue: Math.round(list.reduce((sum, o) => sum + (Number.isFinite(o.amount) ? o.amount : 0), 0) * 100) / 100 }]
    }))
    return Response.json({ success: true, role: actor.role, orders, report,
      hasMore: restaurantOrders.length === 100 || deliveryOrders.length === 100,
      note: 'Order value is not settled revenue. COD and pending payments require reconciliation.' },
    { headers: { 'Cache-Control': 'no-store, private', Vary: 'Authorization' } })
  } catch (error) { return failOrdering(error) }
}
