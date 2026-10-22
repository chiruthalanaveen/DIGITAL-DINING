import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'
import { isSameOriginAdminRequest } from '@/lib/server/adminRequestOrigin'
import { getMaintenanceSettings, setMaintenanceSettings } from '@/lib/server/maintenanceSettings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function respond(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

export async function GET(request) {
  if (!requireAdmin(request)) {
    return respond({ success: false, message: 'Admin sign-in required.' }, 401)
  }

  try {
    return respond({ success: true, ...await getMaintenanceSettings() })
  } catch {
    return respond({ success: false, message: 'Unable to load maintenance mode. Please try again.' }, 503)
  }
}

export async function POST(request) {
  const session = requireAdmin(request)
  if (!session) {
    return respond({ success: false, message: 'Admin sign-in required.' }, 401)
  }

  if (!isSameOriginAdminRequest(request)) {
    return respond({ success: false, message: 'A same-origin request is required.' }, 403)
  }

  const body = await request.json().catch(() => null)
  if (typeof body?.enabled !== 'boolean') {
    return respond({ success: false, message: 'Choose maintenance mode on or off.' }, 400)
  }

  try {
    const admin = getAdminSupabase()
    const previous = await getMaintenanceSettings(admin)
    const setting = await setMaintenanceSettings(body.enabled, admin)

    // Follow existing admin settings: retain the change even if audit logging fails.
    let auditLogged = false
    try {
      const { error } = await admin.from('admin_audit_logs').insert({
        actor_email: session.email,
        action: 'set_maintenance_mode',
        entity_type: 'platform',
        entity_id: 'website_status',
        before_data: previous,
        after_data: setting,
      }).abortSignal(AbortSignal.timeout(3000))
      auditLogged = !error
    } catch {
      auditLogged = false
    }

    return respond({
      success: true,
      ...setting,
      auditLogged,
      message: auditLogged
        ? 'Maintenance mode updated.'
        : 'Maintenance mode updated, but the audit log could not be saved.',
    })
  } catch {
    return respond({ success: false, message: 'Unable to save maintenance mode. Please refresh to check its current status.' }, 503)
  }
}
