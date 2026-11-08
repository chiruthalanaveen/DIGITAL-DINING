import { authorizeRestaurantActor } from '@/lib/server/restaurantOwnerAccess'
import { getOrderingPolicy, OrderingError, failOrdering } from '@/lib/server/restaurantOrdering'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function PUT(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const restaurantId = String(body.restaurantId || '').trim()
    const { admin } = await authorizeRestaurantActor(request, restaurantId, ['owner'])
    const lat = Number(body.latitude), lng = Number(body.longitude)
    if ([body.latitude, body.longitude].some(v => v === null || v === undefined || String(v).trim() === '') ||
      !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new OrderingError('INVALID_COORDINATES', 'Enter valid restaurant coordinates.', 400)
    }
    const current = await getOrderingPolicy(admin, restaurantId)
    const pending = { requested_origin_latitude: lat, requested_origin_longitude: lng, origin_change_requested_at: new Date().toISOString() }
    let result
    if (current?.origin_latitude == null && current?.origin_longitude == null && !current?.updated_at) {
      result = await admin.from('restaurant_ordering_policies').insert({ restaurant_id: restaurantId, ...pending }).select('requested_origin_latitude,requested_origin_longitude').single()
    } else {
      result = await admin.from('restaurant_ordering_policies').update({ ...pending, updated_at: new Date().toISOString() }).eq('restaurant_id', restaurantId).select('requested_origin_latitude,requested_origin_longitude').single()
    }
    if (result.error) throw result.error
    return Response.json({ success: true, pendingReview: true, requestedLocation: result.data }, { headers: { 'Cache-Control': 'no-store, private' } })
  } catch (error) { return failOrdering(error) }
}
