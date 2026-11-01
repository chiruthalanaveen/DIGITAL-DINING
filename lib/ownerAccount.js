// Browser requests use the existing server-verified identity/approval endpoints.
// Never infer ownership from user-editable metadata, email or a restaurant URL.
async function ownerRequest(client, path, { signal } = {}) {
  const { data, error } = await client.auth.getSession()
  const token = data?.session?.access_token
  if (error || !token) throw new Error('Your owner session has expired. Please sign in again.')

  const response = await fetch(path, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal,
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result?.success !== true) {
    if (response.status === 404) {
      throw new Error('No restaurant is connected to this owner account. If you already registered, contact support for an account review.')
    }
    throw new Error(result?.message || 'Unable to verify your business account. Please try again.')
  }
  return result
}

export async function findOwnerRestaurant(client, options) {
  const result = await ownerRequest(client, '/api/auth/owner-restaurant', options)
  if (typeof result.restaurant?.id !== 'string' || !result.restaurant.id) {
    throw new Error('No restaurant is connected to this owner account. If you already registered, contact support for a review.')
  }
  return result.restaurant
}

export async function getOwnerApprovalStatus(client, restaurantId, options) {
  const result = await ownerRequest(client,
    `/api/owner/approval-status?restaurantId=${encodeURIComponent(restaurantId)}`, options)
  if (result.restaurantId !== restaurantId || typeof result.approvalStatus !== 'string' ||
      result.canAccessPortal !== (result.approvalStatus === 'approved')) {
    throw new Error('Unable to verify this business account. Please sign in again.')
  }
  return result
}
