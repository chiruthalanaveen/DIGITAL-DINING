import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ACTIVE_STATUSES = ['pending_review', 'in_review', 'approved']
const OWNER_ROLE = 'restaurant_owner'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function respond(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function getAccessToken(request) {
  const value = request.headers.get('authorization') || ''
  const match = /^Bearer\s+([^\s]+)$/i.exec(value)
  return match ? match[1] : null
}

async function authenticatedOwner(request, admin) {
  const token = getAccessToken(request)
  if (!token) return { error: respond({ success: false, message: 'Sign in to continue.' }, 401) }

  // DO NOT decode a JWT and trust its claims. Verify with Supabase Auth.
  const { data, error } = await admin.auth.getUser(token)
  const user = !error && data?.user ? data.user : null
  if (!user || !UUID_RE.test(user.id)) {
    return { error: respond({ success: false, message: 'Your session expired. Please sign in again.' }, 401) }
  }

  // Authoritative owner rule:
  // 1. owner_id=user.id is the current registration model.
  // 2. ONLY owner_id IS NULL permits the legacy restaurant.id=user.id fallback.
  // Never treat restaurant.id=user.id as ownership when owner_id names another user.
  // A restaurant ID supplied by the browser NEVER grants owner access.
  const { data: directOwned, error: directError } = await admin
    .from('restaurants')
    .select('id, owner_id')
    .eq('owner_id', user.id)
    .limit(101)

  if (directError) {
    console.error('[DELETION REQUEST] Owner lookup failed:', directError.message)
    return { error: respond({ success: false, message: 'Unable to verify restaurant ownership.' }, 500) }
  }

  const { data: legacyOwned, error: legacyError } = await admin
    .from('restaurants')
    .select('id, owner_id')
    .is('owner_id', null)
    .eq('id', user.id)
    .limit(2)

  if (legacyError) {
    console.error('[DELETION REQUEST] Legacy owner lookup failed:', legacyError.message)
    return { error: respond({ success: false, message: 'Unable to verify restaurant ownership.' }, 500) }
  }

  const owned = [...(directOwned || []), ...(legacyOwned || [])]
  const ownedIds = [...new Set(owned.map(item => item.id))].sort()
  if (!ownedIds.length) {
    return { error: respond({ success: false, message: 'Only verified restaurant owners can use this form. Other account roles should contact privacy support.' }, 403) }
  }
  if (ownedIds.length > 100 || (directOwned || []).length > 100) {
    return { error: respond({ success: false, message: 'Please contact privacy support to verify your account.' }, 409) }
  }

  return { user, ownedIds }
}

function safeRequest(row) {
  return row ? {
    id: row.id,
    status: row.status,
    requestedAt: row.requested_at,
  } : null
}

// Only returns the currently signed-in owner's request, never anyone else's.
export async function GET(request) {
  try {
    const admin = getAdminSupabase()
    const identity = await authenticatedOwner(request, admin)
    if (identity.error) return identity.error

    const { data, error } = await admin
      .from('privacy_deletion_requests')
      .select('id, status, requested_at')
      .eq('auth_user_id', identity.user.id)
      .eq('request_role', OWNER_ROLE)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return respond({ success: true, request: safeRequest(data) })
  } catch (error) {
    console.error('[DELETION REQUEST GET]', error)
    return respond({ success: false, message: 'Unable to check deletion request status. Confirm the setup SQL has been run.' }, 500)
  }
}

// Creates a request for manual review; DOES NOT erase data or revoke access.
export async function POST(request) {
  const body = await request.json().catch(() => null)
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    body.confirmationText !== 'DELETE MY ACCOUNT' ||
    body.understandsReview !== true
  ) {
    return respond({ success: false, message: 'Please read the conditions, check the box and type DELETE MY ACCOUNT.' }, 400)
  }

  try {
    const admin = getAdminSupabase()
    const identity = await authenticatedOwner(request, admin)
    if (identity.error) return identity.error

    const { data: existing, error: existingError } = await admin
      .from('privacy_deletion_requests')
      .select('id, status, requested_at')
      .eq('auth_user_id', identity.user.id)
      .eq('request_role', OWNER_ROLE)
      .in('status', ACTIVE_STATUSES)
      .maybeSingle()

    if (existingError) throw existingError
    if (existing) return respond({ success: true, alreadyRequested: true, request: safeRequest(existing) })

    const { data, error } = await admin
      .from('privacy_deletion_requests')
      .insert({
        auth_user_id: identity.user.id,
        request_role: OWNER_ROLE,
        restaurant_ids: identity.ownedIds,
        status: 'pending_review',
      })
      .select('id, status, requested_at')
      .single()

    if (error?.code === '23505') {
      // A second simultaneous request won the unique-index race.
      const { data: winner, error: winnerError } = await admin
        .from('privacy_deletion_requests')
        .select('id, status, requested_at')
        .eq('auth_user_id', identity.user.id)
        .eq('request_role', OWNER_ROLE)
        .in('status', ACTIVE_STATUSES)
        .maybeSingle()
      if (winnerError) throw winnerError
      if (winner) return respond({ success: true, alreadyRequested: true, request: safeRequest(winner) })
    }
    if (error) throw error

    return respond({ success: true, alreadyRequested: false, request: safeRequest(data) }, 201)
  } catch (error) {
    console.error('[DELETION REQUEST POST]', error)
    return respond({ success: false, message: 'Unable to submit deletion request. Confirm the setup SQL has been run.' }, 500)
  }
}