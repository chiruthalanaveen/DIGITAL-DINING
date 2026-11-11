// Destination: app/api/admin/ecommerce/stores/route.js
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CATEGORIES = ['pickles', 'clothing', 'toys', 'groceries', 'snacks', 'gifts']
const RESERVED_SLUGS = new Set(['www', 'admin', 'api', 'app', 'delivery', 'mail', 'support', 'localhost'])
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const FIELDS = 'id,name,slug,category,theme,approval_status,is_active,currency,payment_mode,fulfillment_mode,created_at'
const reply = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })

function failure(error, operation) {
  console.error(`[ECOMMERCE ${operation}]`, { code: error?.code, message: error?.message, details: error?.details, hint: error?.hint })
  const code = error?.code || 'SERVER_ERROR'
  const messages = {
    '42P01': 'Required E-Commerce database table is missing.',
    '42703': 'An E-Commerce database column is missing.',
    '23502': 'A required store field is missing.',
    '23514': 'The submitted value violates a database constraint.',
    '23505': 'A store with this subdomain already exists.',
    '42501': 'Database permission denied.',
    'PGRST205': 'E-Commerce table is not available in the API schema.',
  }
  return reply({ success: false, message: messages[code] || 'E-Commerce database request failed.', errorCode: code }, code === '23505' ? 409 : 500)
}

async function authenticate(request) {
  try {
    const session = await requireAdmin(request)
    if (!session) return { response: reply({ success: false, message: 'Super Admin login required.' }, 401) }
    return { session }
  } catch (error) {
    console.error('[ECOMMERCE ADMIN AUTH]', error)
    return { response: reply({ success: false, message: 'Admin authentication check failed.' }, 500) }
  }
}

async function findAuthUserByEmail(db, email) {
  // Supabase Auth Admin API has no direct email lookup; paginate rather than assuming first page.
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const found = (data?.users || []).find(u => String(u.email || '').toLowerCase() === email)
    if (found) return found
    if ((data?.users || []).length < 1000) return null
  }
  throw new Error('Too many Auth users for email lookup; use the existing owner UUID assignment workflow.')
}

export async function GET(request) {
  const auth = await authenticate(request)
  if (auth.response) return auth.response
  try {
    const db = getAdminSupabase()
    const { data, error } = await db.from('ecommerce_stores').select(FIELDS).order('created_at', { ascending: false }).limit(200)
    if (error) return failure(error, 'STORES GET')
    const stores = data || []
    const ids = stores.map(s => s.id)
    let memberships = []
    if (ids.length) {
      const { data: rows, error: memberError } = await db.from('ecommerce_store_members')
        .select('store_id,user_id,role').in('store_id', ids).eq('role', 'owner')
      if (memberError) return failure(memberError, 'STORE OWNERS GET')
      memberships = rows || []
    }
    const ownerIds = [...new Set(memberships.map(m => m.user_id))]
    const emails = new Map()
    const counts = new Map()
    for (const id of ownerIds) {
      const { data: userData, error: userError } = await db.auth.admin.getUserById(id)
      if (userError) return failure(userError, 'OWNER AUTH GET')
      emails.set(id, userData?.user?.email || null)
      const { count, error: countError } = await db.from('ecommerce_store_members')
        .select('store_id', { count: 'exact', head: true }).eq('user_id', id).eq('role', 'owner')
      if (countError) return failure(countError, 'OWNER STORES COUNT')
      counts.set(id, count || 0)
    }
    return reply({ success: true, stores: stores.map(s => {
      const owners = memberships.filter(m => m.store_id === s.id)
      const ownerId = owners.length === 1 ? owners[0].user_id : null
      return { ...s, owner_user_id: ownerId, owner_email: ownerId ? emails.get(ownerId) : null,
        owner_store_count: ownerId ? counts.get(ownerId) : 0, owner_count: owners.length }
    }) })
  } catch (error) { return failure(error, 'STORES GET EXCEPTION') }
}

export async function POST(request) {
  const auth = await authenticate(request)
  if (auth.response) return auth.response
  const origin = request.headers.get('origin')
  if (!origin || origin !== request.nextUrl.origin) return reply({ success: false, message: 'Invalid request origin.' }, 403)
  const length = Number(request.headers.get('content-length') || 0)
  if (length > 8192) return reply({ success: false, message: 'Request is too large.' }, 413)
  let body
  try { body = await request.json() } catch { return reply({ success: false, message: 'Valid JSON is required.' }, 400) }
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : ''
  const category = typeof body?.category === 'string' ? body.category.trim().toLowerCase() : ''
  const ownerEmail = typeof body?.ownerEmail === 'string' ? body.ownerEmail.trim().toLowerCase() : ''
  if (name.length < 2 || name.length > 120 || slug.length > 63 || !SLUG_PATTERN.test(slug)) return reply({ success: false, message: 'Invalid store name or subdomain.' }, 400)
  if (!CATEGORIES.includes(category)) return reply({ success: false, message: `Choose a valid category: ${CATEGORIES.join(', ')}.` }, 400)
  if (RESERVED_SLUGS.has(slug)) return reply({ success: false, message: 'This subdomain is reserved.' }, 400)
  if (ownerEmail && (ownerEmail.length > 254 || !EMAIL_PATTERN.test(ownerEmail))) return reply({ success: false, message: 'Enter a valid owner login email.' }, 400)

  try {
    const db = getAdminSupabase()
    // Check existing account before creating a store, to reduce partial operations.
    let existingUser = null
    if (ownerEmail) existingUser = await findAuthUserByEmail(db, ownerEmail)
    const { data: store, error } = await db.from('ecommerce_stores').insert({
      name, slug, category, theme: 'quick', approval_status: 'pending', is_active: false,
      currency: 'INR', payment_mode: 'razorpay_cod', fulfillment_mode: 'shipping',
    }).select(FIELDS).single()
    if (error) return failure(error, 'STORES CREATE')

    let ownerId = existingUser?.id || null
    let ownerAssignmentError = null
    let invited = false
    if (ownerEmail) {
      try {
        if (!ownerId) {
          const { data: invitedData, error: inviteError } = await db.auth.admin.inviteUserByEmail(ownerEmail)
          if (inviteError) throw inviteError
          ownerId = invitedData?.user?.id
          if (!ownerId) throw new Error('Invite did not return an Auth user ID.')
          invited = true
        }
        const { error: memberError } = await db.from('ecommerce_store_members').insert({
          store_id: store.id, user_id: ownerId, role: 'owner',
        })
        if (memberError) throw memberError
      } catch (e) {
        console.error('[ECOMMERCE OWNER ASSIGN AFTER CREATE]', e)
        ownerAssignmentError = 'Website created, but owner assignment/invitation failed. Assign the owner manually before approval.'
      }
    }

    const { error: auditError } = await db.from('admin_audit_logs').insert({
      actor_email: auth.session.email ?? 'admin', action: 'ecommerce_store_created',
      entity_type: 'ecommerce_store', entity_id: String(store.id), before_data: null,
      after_data: { name: store.name, slug: store.slug, category: store.category, theme: store.theme,
        approval_status: store.approval_status, is_active: store.is_active, currency: store.currency,
        payment_mode: store.payment_mode, fulfillment_mode: store.fulfillment_mode },
      metadata: { source: 'admin_ecommerce_stores', owner_user_id: ownerAssignmentError ? null : ownerId,
        owner_email: ownerEmail || null, invited, owner_assignment_error: !!ownerAssignmentError },
    })
    if (auditError) console.error('[ECOMMERCE AUDIT FAILURE]', auditError)
    return reply({ success: true, store, auditLogged: !auditError, ownerAssigned: !!ownerId && !ownerAssignmentError,
      message: ownerAssignmentError || (ownerEmail
        ? `Website created pending and inactive. Owner ${invited ? 'invited' : 'linked'}; approve and activate separately.`
        : 'Website created pending and inactive. Assign an owner before approval.') }, 201)
  } catch (error) { return failure(error, 'STORES CREATE EXCEPTION') }
}