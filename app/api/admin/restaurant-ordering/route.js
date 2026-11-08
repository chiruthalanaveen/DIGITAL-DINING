import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'
import { UUID, getOrderingPolicy, OrderingError, failOrdering } from '@/lib/server/restaurantOrdering'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
function adminOnly(request) { if (!requireAdmin(request)) throw new OrderingError('ADMIN_LOGIN_REQUIRED', 'Super Admin login required.', 401) }
export async function GET(request) {
  try {
    adminOnly(request)
    const restaurantId = new URL(request.url).searchParams.get('restaurantId') || ''
    if (!UUID.test(restaurantId)) throw new OrderingError('INVALID_RESTAURANT', 'Invalid restaurant ID.', 400)
    const admin = getAdminSupabase()
    const [policy, { data: tables, error }] = await Promise.all([
      getOrderingPolicy(admin, restaurantId),
      admin.from('restaurant_ordering_tables').select('table_label,enabled').eq('restaurant_id', restaurantId).order('table_label'),
    ])
    if (error) throw error
    return Response.json({ success: true, policy, tables }, { headers: { 'Cache-Control': 'no-store, private' } })
  } catch (error) { return failOrdering(error) }
}
export async function PATCH(request) {
  try {
    adminOnly(request)
    const body = await request.json().catch(() => ({}))
    const restaurantId = String(body.restaurantId || '').trim()
    if (!UUID.test(restaurantId)) throw new OrderingError('INVALID_RESTAURANT', 'Invalid restaurant ID.', 400)
    const admin = getAdminSupabase()
    if (body.action === 'table') {
      const label = String(body.table || '').trim()
      if (!label || label.length > 50) throw new OrderingError('INVALID_TABLE', 'Table label must be 1–50 characters.', 400)
      if (typeof body.enabled !== 'boolean') throw new OrderingError('INVALID_TABLE', 'Enabled must be true or false.', 400)
      const { error } = await admin.from('restaurant_ordering_tables').upsert({ restaurant_id: restaurantId, table_label: label, enabled: body.enabled }, { onConflict: 'restaurant_id,table_label' })
      if (error) throw error
      return Response.json({ success: true })
    }
    if (body.action !== 'policy') throw new OrderingError('INVALID_ACTION', 'Choose a valid policy action.', 400)
    const current = await getOrderingPolicy(admin, restaurantId)
    const coordinate = value => value === null || value === '' ? null : Number(value)
    const policy = {
      restaurant_id: restaurantId,
      origin_latitude: body.latitude === undefined ? current.origin_latitude : coordinate(body.latitude),
      origin_longitude: body.longitude === undefined ? current.origin_longitude : coordinate(body.longitude),
      geofence_enabled: body.geofenceEnabled === undefined ? current.geofence_enabled : body.geofenceEnabled,
      signed_table_qr_required: body.signedQrRequired === undefined ? current.signed_table_qr_required : body.signedQrRequired,
      home_delivery_entry_enabled: body.homeDeliveryEnabled === undefined ? current.home_delivery_entry_enabled : body.homeDeliveryEnabled,
      radius_m: body.radiusMeters === undefined ? current.radius_m : Number(body.radiusMeters),
      max_accuracy_m: body.maxAccuracyMeters === undefined ? current.max_accuracy_m : Number(body.maxAccuracyMeters),
      estimated_prep_minutes: body.estimatedPrepMinutes === undefined ? current.estimated_prep_minutes : Number(body.estimatedPrepMinutes),
      updated_at: new Date().toISOString(),
      ...(body.approveRequested === true ? { requested_origin_latitude: null, requested_origin_longitude: null, origin_change_requested_at: null } : {}),
    }
    if (['geofence_enabled', 'signed_table_qr_required', 'home_delivery_entry_enabled'].some(k => typeof policy[k] !== 'boolean') ||
      !Number.isInteger(policy.radius_m) || policy.radius_m < 20 || policy.radius_m > 200 ||
      !Number.isInteger(policy.max_accuracy_m) || policy.max_accuracy_m < 10 || policy.max_accuracy_m > 100 ||
      !Number.isInteger(policy.estimated_prep_minutes) || policy.estimated_prep_minutes < 5 || policy.estimated_prep_minutes > 180 ||
      (policy.origin_latitude !== null && (!Number.isFinite(policy.origin_latitude) || policy.origin_latitude < -90 || policy.origin_latitude > 90)) ||
      (policy.origin_longitude !== null && (!Number.isFinite(policy.origin_longitude) || policy.origin_longitude < -180 || policy.origin_longitude > 180)) ||
      (policy.geofence_enabled && (policy.origin_latitude === null || policy.origin_longitude === null)) ||
      (policy.signed_table_qr_required && !policy.geofence_enabled)) {
      throw new OrderingError('INVALID_POLICY', 'Invalid policy. Configure coordinates before enabling location checks.', 400)
    }
    const { data, error } = await admin.from('restaurant_ordering_policies').upsert(policy, { onConflict: 'restaurant_id' }).select('*').single()
    if (error) throw error
    return Response.json({ success: true, policy: data }, { headers: { 'Cache-Control': 'no-store, private' } })
  } catch (error) { return failOrdering(error) }
}
