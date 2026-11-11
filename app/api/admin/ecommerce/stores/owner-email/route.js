// Destination: app/api/admin/ecommerce/stores/owner-email/route.js
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const reply = (data, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request) {
  let session
  try { session = await requireAdmin(request) }
  catch { return reply({ success: false, message: 'Admin authentication check failed.' }, 500) }
  if (!session) return reply({ success: false, message: 'Super Admin login required.' }, 401)
  if (request.headers.get('origin') !== request.nextUrl.origin) return reply({ success: false, message: 'Invalid origin.' }, 403)
  if (Number(request.headers.get('content-length') || 0) > 8192) return reply({ success: false, message: 'Request too large.' }, 413)
  let body
  try { body = await request.json() } catch { return reply({ success: false, message: 'Invalid JSON.' }, 400) }
  const storeId = String(body?.storeId || '')
  const newEmail = String(body?.newEmail || '').trim().toLowerCase()
  if (!UUID.test(storeId) || newEmail.length > 254 || !EMAIL.test(newEmail)) return reply({ success: false, message: 'Valid store ID and email required.' }, 400)

  try {
    const db = getAdminSupabase()
    const { data: store, error: storeError } = await db.from('ecommerce_stores')
      .select('id,name').eq('id', storeId).maybeSingle()
    if (storeError) throw storeError
    if (!store) return reply({ success: false, message: 'Store not found.' }, 404)
    const { data: owners, error: ownersError } = await db.from('ecommerce_store_members')
      .select('user_id').eq('store_id', storeId).eq('role', 'owner').limit(2)
    if (ownersError) throw ownersError
    if (owners?.length !== 1) return reply({ success: false, message: 'Exactly one owner must be assigned.' }, 409)
    const userId = owners[0].user_id
    const { data: userData, error: userError } = await db.auth.admin.getUserById(userId)
    if (userError || !userData?.user) return reply({ success: false, message: 'Owner Auth account not found.' }, 404)
    const oldEmail = String(userData.user.email || '').toLowerCase()
    if (oldEmail === newEmail) return reply({ success: false, message: 'The login email is already set to this value.' }, 409)
    const { count, error: countError } = await db.from('ecommerce_store_members')
      .select('store_id', { count: 'exact', head: true }).eq('user_id', userId).eq('role', 'owner')
    if (countError) throw countError
    if ((count || 0) > 1 && body?.confirmedSharedOwner !== true) {
      return reply({ success: false, message: `This Auth account owns ${count} stores. Confirm the shared-owner change first.`, sharedStoreCount: count }, 409)
    }
    // Supabase Auth Admin API updates auth.users and Auth identities consistently.
    // Do not edit auth.users/auth.identities directly using SQL.
    const { data: updated, error: updateError } = await db.auth.admin.updateUserById(userId, { email: newEmail })
    if (updateError) {
      console.error('[ECOMMERCE OWNER EMAIL AUTH]', { message: updateError.message, status: updateError.status })
      return reply({ success: false, message: 'Email change failed. Check whether the email is already registered or requires verification.' }, 409)
    }
    const actualEmail = updated?.user?.email || newEmail
    const { error: auditError } = await db.from('admin_audit_logs').insert({
      actor_email: session.email || 'admin', action: 'ecommerce_owner_login_email_changed',
      entity_type: 'ecommerce_store', entity_id: storeId,
      before_data: { owner_user_id: userId, owner_login_email: oldEmail },
      after_data: { owner_user_id: userId, owner_login_email: actualEmail },
      metadata: { source: 'admin_ecommerce_stores', shared_store_count: count || 0 },
    })
    if (auditError) console.error('[ECOMMERCE OWNER EMAIL AUDIT FAILED]', auditError)
    return reply({ success: true, email: actualEmail, auditLogged: !auditError,
      message: `Owner login email updated to ${actualEmail}.${auditError ? ' WARNING: Audit logging failed; review server logs.' : ''} The owner may need to sign in again.` })
  } catch (error) {
    console.error('[ECOMMERCE OWNER EMAIL CHANGE]', error)
    return reply({ success: false, message: 'Unable to update owner email. Check server logs.' }, 500)
  }
}