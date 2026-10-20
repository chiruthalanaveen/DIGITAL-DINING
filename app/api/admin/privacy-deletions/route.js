import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ALLOWED_STATUSES = new Set([
  'all', 'pending_review', 'in_review', 'approved', 'rejected', 'completed', 'cancelled',
])
const ACTIONS = new Set(['start_review', 'approve', 'reject'])
const PAGE_SIZE = 30

function respond(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}

function getAdminSession(request) {
  try {
    const session = requireAdmin(request)
    if (!session?.email || typeof session.email !== 'string') return null
    return session
  } catch (error) {
    console.error('[PRIVACY ADMIN] Invalid admin session:', error)
    return null
  }
}

// A browser's admin-session cookie must not be usable for a cross-origin mutation.
function validMutationOrigin(request) {
  const origin = request.headers.get('origin')
  const targetOrigin = new URL(request.url).origin
  const fetchSite = request.headers.get('sec-fetch-site')
  return Boolean(origin && origin === targetOrigin && (!fetchSite || fetchSite === 'same-origin'))
}

function summarize(row) {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    role: row.request_role,
    restaurantIds: Array.isArray(row.restaurant_ids) ? row.restaurant_ids : [],
    status: row.status,
    requestedAt: row.requested_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by_email || null,
    reviewNotes: row.outcome_notes || null,
  }
}

// ADMIN ONLY: paginated queue. No public or owner-supplied ID grants access.
export async function GET(request) {
  const session = getAdminSession(request)
  if (!session) return respond({ success: false, message: 'Super Admin sign-in required.' }, 401)

  const params = new URL(request.url).searchParams
  const historyId = params.get('history')
  if (historyId !== null) {
    if (!UUID_RE.test(historyId)) return respond({ success: false, message: 'Invalid request ID.' }, 400)
    try {
      const admin = getAdminSupabase()
      const { data, error } = await admin
        .from('privacy_deletion_review_events')
        .select('id,request_id,actor_email,action,previous_status,next_status,reason,created_at')
        .eq('request_id', historyId)
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return respond({ success: true, events: data || [] })
    } catch (error) {
      console.error('[PRIVACY ADMIN HISTORY]', error)
      return respond({ success: false, message: 'Unable to load review history.' }, 500)
    }
  }
  const status = params.get('status') || 'all'
  const pageText = params.get('page') || '0'
  if (!ALLOWED_STATUSES.has(status) || !/^(0|[1-9]\d{0,2})$/.test(pageText)) {
    return respond({ success: false, message: 'Invalid review filter.' }, 400)
  }
  const page = Number(pageText)
  if (page > 100) return respond({ success: false, message: 'Page limit exceeded.' }, 400)

  try {
    const admin = getAdminSupabase()
    let query = admin
      .from('privacy_deletion_requests')
      .select('id,auth_user_id,request_role,restaurant_ids,status,requested_at,updated_at,reviewed_at,reviewed_by_email,outcome_notes', { count: 'exact' })
      .eq('request_role', 'restaurant_owner')
      .order('requested_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (status !== 'all') query = query.eq('status', status)
    const { data, error, count } = await query
    if (error) throw error

    const items = Array.isArray(data) ? data.map(summarize) : []
    // Display names help identify the business without exposing customer data.
    const ids = [...new Set(items.flatMap(item => item.restaurantIds))].slice(0, 150)
    let restaurantNames = {}
    if (ids.length) {
      const { data: restaurants, error: restaurantError } = await admin
        .from('restaurants').select('id,name').in('id', ids)
      if (restaurantError) throw restaurantError
      restaurantNames = Object.fromEntries((restaurants || []).map(row => [row.id, row.name || 'Restaurant']))
    }

    return respond({ success: true, items, restaurantNames, count: count ?? 0, page, pageSize: PAGE_SIZE })
  } catch (error) {
    console.error('[PRIVACY ADMIN GET]', error)
    return respond({ success: false, message: 'Unable to load deletion requests. Check the privacy SQL setup.' }, 500)
  }
}

// ADMIN ONLY: records a review decision; NEVER deletes accounts or business data.
export async function POST(request) {
  const session = getAdminSession(request)
  if (!session) return respond({ success: false, message: 'Super Admin sign-in required.' }, 401)
  if (!validMutationOrigin(request)) {
    return respond({ success: false, message: 'Cross-origin admin changes are not allowed.' }, 403)
  }
  const mediaType = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (mediaType !== 'application/json') return respond({ success: false, message: 'JSON required.' }, 415)
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return respond({ success: false, message: 'Invalid review request.' }, 400)
  }
  const requestId = body.requestId
  const expectedStatus = body.expectedStatus
  const action = body.action
  const note = typeof body.note === 'string' ? body.note.trim() : ''
  const expectedConfirmation = action === 'approve' ? 'APPROVE' : action === 'reject' ? 'REJECT' : 'REVIEW'
  if (body.confirmationCode !== expectedConfirmation) {
    return respond({ success: false, message: `Type ${expectedConfirmation} to confirm your decision.` }, 400)
  }
  if (!UUID_RE.test(String(requestId || '')) ||
      !ALLOWED_STATUSES.has(expectedStatus) || expectedStatus === 'all' ||
      !ACTIONS.has(action) || note.length < 12 || note.length > 2000) {
    return respond({ success: false, message: 'Provide a valid request, action and review note (12–2,000 characters).' }, 400)
  }

  try {
    const admin = getAdminSupabase()
    const { data, error } = await admin.rpc('admin_review_privacy_deletion_request', {
      p_request_id: requestId,
      p_expected_status: expectedStatus,
      p_action: action,
      p_actor_email: session.email.trim().toLowerCase(),
      p_reason: note,
    })
    if (error) {
      if (['40001', 'P0002', '22023'].includes(error.code)) {
        return respond({ success: false, message: 'Request changed or action is not allowed. Refresh and try again.' }, 409)
      }
      throw error
    }
    return respond({ success: true, result: data, message: 'Review decision saved with an audit event. No account data was deleted.' })
  } catch (error) {
    console.error('[PRIVACY ADMIN POST]', error)
    return respond({ success: false, message: 'Unable to save decision. Verify the review RPC was installed.' }, 500)
  }
}