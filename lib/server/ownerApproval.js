import { getAdminSupabase } from '@/lib/server/adminSupabase'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// These checks must run on the server only. Never import this file in a client component.
// Use this helper in every owner-only API before reading/updating owner data.
export async function getOwnerApprovalAccess(request, restaurantId) {
  const id = String(restaurantId || '').trim()
  if (!UUID_RE.test(id)) {
    return { ok: false, status: 400, code: 'INVALID_RESTAURANT_ID', message: 'A valid restaurant ID is required.' }
  }

  const header = String(request.headers.get('authorization') || '')
  const bearer = /^Bearer\s+([^\s]+)$/i.exec(header)
  if (!bearer) {
    return { ok: false, status: 401, code: 'LOGIN_REQUIRED', message: 'Please sign in to your owner account.' }
  }

  const admin = getAdminSupabase()
  const { data: authData, error: authError } = await admin.auth.getUser(bearer[1])
  const user = authData?.user
  if (authError || !user?.id) {
    return { ok: false, status: 401, code: 'INVALID_SESSION', message: 'Your login session is invalid or expired.' }
  }

  const { data: restaurant, error: restaurantError } = await admin
    .from('restaurants')
    .select('id, owner_id, name, approval_status, approval_note')
    .eq('id', id)
    .maybeSingle()

  if (restaurantError) {
    console.error('[OWNER APPROVAL LOOKUP]', restaurantError.message)
    return { ok: false, status: 503, code: 'APPROVAL_LOOKUP_FAILED', message: 'Unable to verify account approval at this time.' }
  }

  // Some existing registrations use restaurants.id as the Auth user ID.
  // When owner_id is set, it takes priority. Do not trust a restaurantId
  // supplied by the browser without comparing it to the verified user.
  const expectedOwnerId = String(restaurant?.owner_id || restaurant?.id || '')
  if (!restaurant || expectedOwnerId !== String(user.id)) {
    return { ok: false, status: 403, code: 'NOT_RESTAURANT_OWNER', message: 'You are not authorized to access this business.' }
  }

  const approvalStatus = String(restaurant.approval_status || 'pending').toLowerCase()
  return {
    ok: true,
    status: 200,
    userId: user.id,
    restaurantId: restaurant.id,
    restaurantName: restaurant.name || '',
    approvalStatus,
    approvalNote: restaurant.approval_note || '',
  }
}

// Use this on all protected owner operations. A pending/rejected owner
// receives 403, while an approved owner receives the validated context.
export async function requireApprovedOwner(request, restaurantId) {
  const access = await getOwnerApprovalAccess(request, restaurantId)
  if (!access.ok) return access
  if (access.approvalStatus !== 'approved') {
    return {
      ok: false,
      status: 403,
      code: access.approvalStatus === 'rejected' ? 'REGISTRATION_REJECTED' : 'AWAITING_ADMIN_APPROVAL',
      message: access.approvalStatus === 'rejected'
        ? 'Registration not approved. Contact Super Admin.'
        : 'Your account is awaiting Super Admin approval.',
    }
  }
  return access
}
