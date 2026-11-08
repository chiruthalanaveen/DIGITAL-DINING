import { createClient } from '@supabase/supabase-js'
import { getAdminSupabase } from '@/lib/server/adminSupabase'
import { OrderingError, UUID } from '@/lib/server/restaurantOrdering'

// The owner RPC enforces the project's existing approved-ownership mapping.
// Staff sessions are verified by the existing server-side validation RPC.
export async function authorizeRestaurantActor(request, restaurantId, allowed = ['owner', 'manager', 'kitchen', 'waiter']) {
  if (!UUID.test(restaurantId)) throw new OrderingError('INVALID_RESTAURANT', 'Invalid restaurant ID.', 400)
  const header = request.headers.get('authorization') || ''
  const token = /^Bearer\s+([^\s]+)$/i.exec(header)?.[1]
  if (!token || token.length > 4096) throw new OrderingError('LOGIN_REQUIRED', 'Sign in to your owner or staff portal.', 401)
  const admin = getAdminSupabase()
  // Verify actual Supabase JWT, not a caller-supplied role field.
  const { data: userResult } = await admin.auth.getUser(token)
  if (userResult?.user?.id) {
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!anon || !url) throw new OrderingError('AUTH_UNAVAILABLE', 'Owner verification is not configured.', 503)
    const client = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await client.rpc('owner_get_restaurant_orders_secure', {
      p_restaurant_id: restaurantId, p_limit: 1, p_offset: 0,
    })
    if (error || data?.success !== true) throw new OrderingError('OWNER_ACCESS_DENIED', 'Owner access is not approved for this restaurant.', 403)
    if (!allowed.includes('owner')) throw new OrderingError('ROLE_NOT_ALLOWED', 'Your role cannot perform this action.', 403)
    return { role: 'owner', admin, client }
  }
  const { data: staff, error } = await admin.rpc('validate_staff_app_session', {
    p_session_token: token, p_required_role: null,
  })
  if (error) throw new OrderingError('SESSION_UNAVAILABLE', 'Staff session verification is unavailable.', 503)
  const role = String(staff?.role || '').toLowerCase()
  if (staff?.success !== true || String(staff?.restaurantId || '').toLowerCase() !== restaurantId.toLowerCase() || !allowed.includes(role)) {
    throw new OrderingError('STAFF_ACCESS_DENIED', 'Your session cannot access this restaurant.', 403)
  }
  return { role, admin, client: null }
}
