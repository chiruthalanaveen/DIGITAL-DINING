import { getAdminSupabase } from '@/lib/server/adminSupabase'
import { getOrderingCapabilities, failOrdering } from '@/lib/server/restaurantOrdering'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request) {
  try {
    const restaurantId = new URL(request.url).searchParams.get('restaurantId') || ''
    const c = await getOrderingCapabilities(getAdminSupabase(), restaurantId)
    return Response.json({
      success: true, restaurantName: c.restaurant.name, restaurantCode: c.restaurant.restaurant_code,
      restaurantEnabled: c.restaurantEnabled, dineInEnabled: c.dineInEnabled,
      takeawayEnabled: c.takeawayEnabled, homeDeliveryAvailable: c.homeDeliveryAvailable,
      geofenceEnabled: c.policy.geofence_enabled === true,
      signedTableQrRequired: c.policy.signed_table_qr_required === true,
      radiusMeters: c.policy.radius_m, maxAccuracyMeters: c.policy.max_accuracy_m,
      estimatedPrepMinutes: c.policy.estimated_prep_minutes,
      // Public restaurant address point for a user-visible approximate location check.
      originLatitude: c.policy.geofence_enabled ? c.policy.origin_latitude : null,
      originLongitude: c.policy.geofence_enabled ? c.policy.origin_longitude : null,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return failOrdering(error) }
}
