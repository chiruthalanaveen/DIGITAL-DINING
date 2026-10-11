
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = {
  'Cache-Control': 'no-store',
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const FIELDS = [
  'id',
  'name',
  'email',
  'phone',
  'restaurant_code',
  'business_type',
  'created_at',
  'approval_status',
  'approved_at',
  'approved_by',
  'approval_note',
].join(',')

function json(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: NO_STORE,
  })
}

function getSession(request) {
  return requireAdmin(request)
}

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max)
}

function publicRegistration(row) {
  return {
    id: row?.id || '',
    name: row?.name || '',
    email: row?.email || '',
    phone: row?.phone || '',
    restaurant_code: row?.restaurant_code || '',
    business_type: row?.business_type || '',
    created_at: row?.created_at || null,
    approval_status: row?.approval_status || 'pending',
    approved_at: row?.approved_at || null,
    approved_by: row?.approved_by || null,
    approval_note: row?.approval_note || '',
  }
}

// GET: Retrieve registrations for Super Admin.
export async function GET(request) {
  const session = getSession(request)

  if (!session) {
    return json({
      success: false,
      message: 'Super Admin authentication required.',
    }, 401)
  }

  try {
    const admin = getAdminSupabase()

    const { searchParams } = new URL(request.url)
    const status = clean(
      searchParams.get('status') || 'pending',
      30
    ).toLowerCase()

    if (!['pending', 'approved', 'rejected', 'all'].includes(status)) {
      return json({
        success: false,
        message: 'Invalid approval status filter.',
      }, 400)
    }

    let query = admin
      .from('restaurants')
      .select(FIELDS)
      .order('created_at', { ascending: false })
      .limit(200)

    if (status !== 'all') {
      query = query.eq('approval_status', status)
    }

    const { data, error } = await query

    if (error) throw error

    const registrations = (data || []).map(publicRegistration)

    return json({
      success: true,
      registrations,
      count: registrations.length,
      status,
    })
  } catch (error) {
    console.error('[ADMIN REGISTRATIONS GET]', error)

    return json({
      success: false,
      message: 'Unable to load registrations.',
    }, 500)
  }
}

// POST: Approve or reject a pending registration.
export async function POST(request) {
  const session = getSession(request)

  if (!session) {
    return json({
      success: false,
      message: 'Super Admin authentication required.',
    }, 401)
  }

  try {
    const body = await request.json().catch(() => ({}))

    const restaurantId = clean(body?.restaurantId, 100)
    const action = clean(body?.action, 30).toLowerCase()
    const note = clean(body?.note, 1000)

    if (!UUID_PATTERN.test(restaurantId)) {
      return json({
        success: false,
        message: 'Valid restaurant ID is required.',
      }, 400)
    }

    if (!['approve', 'reject'].includes(action)) {
      return json({
        success: false,
        message: 'Action must be approve or reject.',
      }, 400)
    }

    const admin = getAdminSupabase()

    const { data: before, error: findError } = await admin
      .from('restaurants')
      .select(FIELDS)
      .eq('id', restaurantId)
      .maybeSingle()

    if (findError) throw findError

    if (!before) {
      return json({
        success: false,
        message: 'Business registration not found.',
      }, 404)
    }

    if (before.approval_status !== 'pending') {
      return json({
        success: false,
        message:
          'This registration is no longer pending. Refresh the list.',
        currentStatus: before.approval_status,
      }, 409)
    }

    const isApproval = action === 'approve'

    const update = {
      approval_status: isApproval ? 'approved' : 'rejected',
      approved_at: isApproval
        ? new Date().toISOString()
        : null,
      approved_by: isApproval
        ? clean(session.email, 200)
        : null,
      approval_note: note || null,
    }

    // Only change a registration that is still pending.
    // This prevents two administrators from processing it twice.
    const { data: after, error: updateError } = await admin
      .from('restaurants')
      .update(update)
      .eq('id', restaurantId)
      .eq('approval_status', 'pending')
      .select(FIELDS)
      .maybeSingle()

    if (updateError) throw updateError

    if (!after) {
      return json({
        success: false,
        message:
          'Registration status changed. Refresh and try again.',
      }, 409)
    }

    // Best-effort audit logging.
    try {
      const { error: auditError } = await admin
        .from('admin_audit_logs')
        .insert({
          actor_email: clean(session.email, 200),
          action: isApproval
            ? 'approve_registration'
            : 'reject_registration',
          entity_type: 'restaurant',
          entity_id: restaurantId,
          before_data: {
            approval_status: before.approval_status,
          },
          after_data: {
            approval_status: after.approval_status,
            approval_note: after.approval_note,
          },
          metadata: {
            source: 'admin_registrations_api',
          },
        })

      if (auditError) {
        console.warn(
          '[REGISTRATION AUDIT]',
          auditError.message
        )
      }
    } catch (auditError) {
      console.warn('[REGISTRATION AUDIT]', auditError)
    }

    return json({
      success: true,
      message: isApproval
        ? 'Business registration approved successfully.'
        : 'Business registration rejected.',
      registration: publicRegistration(after),
    })
  } catch (error) {
    console.error('[ADMIN REGISTRATIONS POST]', error)

    return json({
      success: false,
      message: 'Unable to update business registration.',
    }, 500)
  }
}
