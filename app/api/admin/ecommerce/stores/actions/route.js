// Destination: app/api/admin/ecommerce/stores/actions/route.js
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const reply = (data, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request) {
  const session = await requireAdmin(request)
  if (!session) return reply({ success: false, message: 'Super Admin login required.' }, 401)
  const origin = request.headers.get('origin')
  if (!origin || origin !== request.nextUrl.origin) return reply({ success: false, message: 'Invalid origin.' }, 403)

  let body
  try { body = await request.json() } catch { return reply({ success: false, message: 'Invalid JSON.' }, 400) }
  const storeId = String(body?.storeId || '')
  const action = String(body?.action || '')
  if (!uuid.test(storeId) || !['assign_owner', 'approve', 'activate', 'deactivate'].includes(action)) {
    return reply({ success: false, message: 'Invalid action or store ID.' }, 400)
  }

  try {
    const db = getAdminSupabase()
    const { data: before, error: readError } = await db.from('ecommerce_stores')
      .select('id,name,approval_status,is_active').eq('id', storeId).maybeSingle()
    if (readError) throw readError
    if (!before) return reply({ success: false, message: 'Store not found.' }, 404)

    let after = null
    if (action === 'assign_owner') {
      if (before.is_active) return reply({ success: false, message: 'Deactivate this store before changing ownership.' }, 409)
      const userId = String(body?.userId || '')
      if (!uuid.test(userId)) return reply({ success: false, message: 'Valid Supabase Auth user ID required.' }, 400)
      const { data: userResult, error: userError } = await db.auth.admin.getUserById(userId)
      if (userError || !userResult?.user) return reply({ success: false, message: 'Auth user not found.' }, 404)
      const { data: members, error: memberError } = await db.from('ecommerce_store_members')
        .select('store_id,user_id,role').eq('store_id', storeId)
      if (memberError) throw memberError
      const existingOwners = (members || []).filter(m => m.role === 'owner')
      if (existingOwners.some(m => m.user_id !== userId)) {
        return reply({ success: false, message: 'This store already has a different owner. Ownership transfer requires a separate audited workflow.' }, 409)
      }
      if (!(members || []).some(m => m.user_id === userId && m.role === 'owner')) {
        const membership = (members || []).find(m => m.user_id === userId)
        const query = membership
          ? db.from('ecommerce_store_members').update({ role: 'owner' }).eq('store_id', storeId).eq('user_id', userId)
          : db.from('ecommerce_store_members').insert({ store_id: storeId, user_id: userId, role: 'owner' })
        const { error } = await query
        if (error) throw error
      }
      after = { owner_user_id: userId }
    } else {
      const { data: owners, error: ownerError } = await db.from('ecommerce_store_members')
        .select('user_id').eq('store_id', storeId).eq('role', 'owner').limit(2)
      if (ownerError) throw ownerError
      if (action !== 'deactivate' && (!owners || owners.length !== 1)) {
        return reply({ success: false, message: 'Assign exactly one store owner first.' }, 409)
      }
      if (action === 'activate' && before.approval_status !== 'approved') {
        return reply({ success: false, message: 'Approve the store before activating it.' }, 409)
      }
      const update = action === 'approve'
        ? { approval_status: 'approved' }
        : { is_active: action === 'activate' }
      // Conditional update prevents changing a row whose state changed since it was read.
      const { data, error } = await db.from('ecommerce_stores').update(update)
        .eq('id', storeId).eq('approval_status', before.approval_status)
        .eq('is_active', before.is_active).select('id,name,approval_status,is_active').maybeSingle()
      if (error) throw error
      if (!data) return reply({ success: false, message: 'Store changed. Refresh and retry.' }, 409)
      after = data
    }

    const { error: auditError } = await db.from('admin_audit_logs').insert({
      actor_email: session.email || 'admin',
      action: `ecommerce_${action}`,
      entity_type: 'ecommerce_store',
      entity_id: storeId,
      before_data: before,
      after_data: after,
      metadata: { source: 'admin_ecommerce_stores' },
    })
    if (auditError) console.error('[ECOMMERCE ACTION AUDIT]', auditError)
    return reply({ success: true, store: after, auditLogged: !auditError })
  } catch (error) {
    console.error('[ECOMMERCE STORE ACTION]', error)
    return reply({ success: false, message: 'Action failed. Check database constraints and server logs.' }, 500)
  }
}